
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ storage }).any();
const jobs = {};

// ==========================================
// MÓDULOS INTEGRADOS (PRESETS & BUILDERS)
// ==========================================

const presetGenerator = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
    ],
    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100'
    ],
    getAudioExtractArgs: () => [
        '-vn', 
        '-acodec', 'libmp3lame', 
        '-q:a', '2'
    ],
    getSafeScaleFilter: () => 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
};

const transitionBuilder = {
    buildConcatFilter: (inputs) => {
        let filterComplex = '';
        let mapStr = '';
        
        inputs.forEach((_, i) => {
            // Scale to 1280x720 fitting within box, then pad to fill.
            // Using -1:-1 for pad automatically centers the image and handles odd dimensions better than manual calc.
            filterComplex += `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1:color=black,setsar=1[v${i}];`;
            mapStr += `[v${i}]`;
        });
        
        filterComplex += `${mapStr}concat=n=${inputs.length}:v=1:a=0[outv]`;
        
        return {
            filterComplex,
            outputMap: '[outv]'
        };
    }
};

const filterBuilder = {
    build: (action, params, videoPath) => {
        let filterComplex = '';
        let mapArgs = [];
        let outputOptions = [];

        switch (action) {
            case 'interpolate-real':
                const speed = parseFloat(params.speed) || 0.5;
                const factor = 1 / speed;
                // Mininterpolate logic
                filterComplex = `[0:v]scale='min(1280,iw)':-2,pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
                mapArgs = ['-map', '[v]'];
                break;

            case 'upscale-real':
                filterComplex = `[0:v]scale=1920:1080:flags=lanczos,setsar=1[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?'];
                break;

            case 'reverse-real':
                filterComplex = `[0:v]reverse[v];[0:a]areverse[a]`;
                mapArgs = ['-map', '[v]', '-map', '[a]'];
                break;

            case 'reduce-noise-real':
                filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;

            case 'remove-silence-real':
                const stopDur = params.duration || 0.5;
                const thresh = params.threshold || -30;
                filterComplex = `[0:a]silenceremove=stop_periods=-1:stop_duration=${stopDur}:stop_threshold=${thresh}dB[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;

            case 'isolate-voice-real':
                filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;
            
            case 'voice-fx-real':
                const p = params.preset;
                let af = '';
                if(p === 'robot') af = "asetrate=44100*0.9,atempo=1.1,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3";
                else if(p === 'squirrel') af = "asetrate=44100*1.4,atempo=0.7"; 
                else if(p === 'monster') af = "asetrate=44100*0.6,atempo=1.6"; 
                else if(p === 'echo') af = "aecho=0.8:0.9:1000:0.3";
                else if(p === 'radio') af = "highpass=f=500,lowpass=f=3000,afftdn";
                else af = "anull"; 
                
                filterComplex = `[0:a]${af}[a]`;
                mapArgs = ['-map', '0:v?', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;

            default:
                filterComplex = `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:1.0:5:5:0.0[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?'];
        }

        return { filterComplex, mapArgs, outputOptions };
    }
};

// ==========================================
// SERVER LOGIC
// ==========================================

function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries stream=codec_type,duration -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ duration: 0, hasAudio: false });
            const lines = stdout.trim().split('\n');
            let duration = 0;
            let hasAudio = false;
            lines.forEach(line => {
                const parts = line.split(',');
                if (parts[0] === 'video') duration = parseFloat(parts[1]) || duration;
                if (parts[0] === 'audio') hasAudio = true;
            });
            resolve({ duration, hasAudio });
        });
    });
}

function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return (hours * 3600) + (minutes * 60) + seconds;
}

function createFFmpegJob(jobId, args, expectedDuration, res) {
    if (!jobs[jobId]) jobs[jobId] = {};
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;
    
    if (res) res.status(202).json({ jobId });

    const finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats', ...args];
    console.log(`Job ${jobId} starting with args:`, finalArgs.join(' '));
    
    const ffmpeg = spawn('ffmpeg', finalArgs);
    
    let stderr = '';

    ffmpeg.stderr.on('data', d => {
        const line = d.toString();
        stderr += line;
        
        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch && expectedDuration > 0) {
            const currentTime = timeToSeconds(timeMatch[1]);
            let progress = Math.round((currentTime / expectedDuration) * 100);
            if (progress >= 100) progress = 99;
            if (progress < 0) progress = 0;
            if (jobs[jobId]) jobs[jobId].progress = progress;
        }
    });

    ffmpeg.on('close', (code) => {
        if (!jobs[jobId]) return;
        if (code === 0) {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error(`[FFmpeg] Job ${jobId} falhou. Code: ${code}`, stderr);
            jobs[jobId].status = 'failed';
            const isMem = stderr.includes('Out of memory') || stderr.includes('Killed');
            jobs[jobId].error = isMem 
                ? "O vídeo é muito pesado. O servidor interrompeu o processamento por falta de memória."
                : `Erro no processamento (Code ${code}). Verifique logs do servidor.`;
        }
    });
}

async function handleExport(job, createFFmpegJob) {
    const inputs = job.files;
    
    if (!inputs || inputs.length === 0) {
        job.status = 'failed';
        job.error = "No files to export";
        return;
    }

    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    job.outputPath = outputPath;

    const args = [];
    
    inputs.forEach(f => {
        if (f.mimetype.startsWith('image/')) {
            // Loop images for 5 seconds by default
            args.push('-loop', '1', '-t', '5'); 
        }
        args.push('-i', f.path);
    });

    const { filterComplex, outputMap } = transitionBuilder.buildConcatFilter(inputs);

    const finalArgs = [
        ...args,
        '-filter_complex', filterComplex,
        '-map', outputMap,
        ...presetGenerator.getVideoArgs(),
        '-y', outputPath
    ];

    const expectedDuration = inputs.length * 5; 

    createFFmpegJob(job.id, finalArgs, expectedDuration);
}

async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    if (!job) return;

    const action = jobId.split('_')[0];
    
    if (action === 'export') {
        return handleExport(job, createFFmpegJob);
    }

    const videoFile = job.files[0];
    if (!videoFile) { 
        job.status = 'failed'; 
        job.error = "Nenhum arquivo enviado."; 
        return; 
    }

    let params = job.params || {};
    let outputPath = path.join(uploadDir, `${action}-${Date.now()}.mp4`);
    let isAudioOutput = action.includes('audio') || action.includes('voice') || action.includes('silence') || action.includes('music');
    
    if (isAudioOutput) {
        outputPath = outputPath.replace('.mp4', '.wav');
    }
    
    job.outputPath = outputPath;

    let expectedDuration = 0;
    const info = await getMediaInfo(videoFile.path);
    expectedDuration = info.duration;

    let args = [];

    if (action === 'extract-audio') {
        const finalAudioPath = outputPath.replace('.wav', '.mp3');
        job.outputPath = finalAudioPath;
        args = ['-i', videoFile.path, ...presetGenerator.getAudioExtractArgs(), '-y', finalAudioPath];
    } else {
        const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, params, videoFile.path);
        
        args = [
            '-i', videoFile.path,
            '-filter_complex', filterComplex,
            ...mapArgs,
            ...(outputOptions && outputOptions.length > 0 ? outputOptions : presetGenerator.getVideoArgs()),
            '-y', outputPath
        ];
    }

    createFFmpegJob(jobId, args, expectedDuration);
}

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body, outputPath: null, startTime: Date.now() };
    processSingleClipJob(jobId);
    res.status(202).json({ jobId });
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ status: 'not_found' });
    res.json(job);
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath || !fs.existsSync(job.outputPath)) {
        return res.status(404).send("Arquivo não encontrado.");
    }
    res.download(job.outputPath);
});

app.get('/api/check-ffmpeg', (req, res) => res.send("FFmpeg is ready"));

setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach(id => {
        if (now - jobs[id].startTime > 3600000) {
            if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) fs.unlinkSync(jobs[id].outputPath);
            delete jobs[id];
        }
    });
}, 600000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
