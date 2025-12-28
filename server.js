
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

// --- HELPERS ---
function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -select_streams v:0 -show_entries stream=duration,nb_read_packets -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ frames: 0, duration: 0 });
            const parts = stdout.split(',');
            const duration = parseFloat(parts[0]) || 0;
            const frames = parseInt(parts[1]) || 0;
            resolve({ frames, duration });
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
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;
    if (res) res.status(202).json({ jobId });

    console.log(`Starting FFmpeg job ${jobId}. Expected output duration: ${expectedDuration}s`);

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', d => {
        const line = d.toString();
        stderr += line;
        
        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch && expectedDuration > 0) {
            const currentTime = timeToSeconds(timeMatch[1]);
            let progress = Math.round((currentTime / expectedDuration) * 100);
            if (progress > 99) progress = 99;
            if (progress < 0) progress = 0;
            jobs[jobId].progress = progress;
        }
    });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            console.log(`Job ${jobId} completed successfully.`);
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error(`FFmpeg error for ${jobId}:`, stderr);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = "Erro no processamento de mídia.";
        }
    });
}

function getStyleFilter(style) {
    // CORREÇÃO: 'saturate' não é um filtro, usa-se 'eq=saturation=X'
    const filters = {
        'anime_vibrant': 'unsharp=5:5:1.0:5:5:0.0,curves=all="0/0 0.1/0.15 0.5/0.6 1/1",eq=saturation=1.5',
        'pixar': 'bilateral=sigmaS=5:sigmaR=0.1,curves=all="0/0 0.5/0.45 1/1",eq=saturation=1.3',
        'sketch': 'edgedetect=low=0.1:high=0.4,negate',
        'noir': 'format=gray,curves=all="0/0 0.3/0.1 0.7/0.9 1/1"',
        'cyberpunk': 'curves=r="0/0 0.5/0.6 1/1":g="0/0 0.5/0.4 1/1":b="0/0 0.5/0.7 1/1",eq=saturation=2'
    };
    return filters[style] || filters['anime_vibrant'];
}

// --- SINGLE CLIP JOB LOGIC ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    const action = jobId.split('_')[0];
    const videoFile = job.files[0];
    
    if (!videoFile) {
        job.status = 'failed'; job.error = "No media file provided."; return;
    }

    const { duration: originalDuration } = await getMediaInfo(videoFile.path);
    let params = job.params || {};
    
    // Determinar se é áudio ou vídeo
    const isAudioOnly = videoFile.mimetype.startsWith('audio/');
    let outputExt = isAudioOnly ? '.wav' : '.mp4';
    
    // Forçar extensão para certas ações
    if (action.includes('audio') || action.includes('voice') || action.includes('silence')) {
        outputExt = '.wav';
    }

    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    let args = [];
    let expectedDuration = originalDuration;

    switch (action) {
        case 'interpolate-real':
            const speed = parseFloat(params.speed) || 0.5;
            const factor = 1 / speed;
            expectedDuration = originalDuration * factor;
            args = [
                '-i', videoFile.path,
                '-filter_complex', `[0:v]minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:scd=fdiff,setpts=${factor}*PTS[v];[0:a]atempo=${speed}[a]`,
                '-map', '[v]', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
                '-y', outputPath
            ];
            break;

        case 'upscale-real':
            args = ['-i', videoFile.path, '-vf', "scale=3840:2160:flags=lanczos", '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
            break;

        case 'reverse-real':
            args = ['-i', videoFile.path, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
            break;

        case 'reduce-noise-real':
            args = ['-i', videoFile.path, '-af', 'afftdn', '-y', outputPath];
            break;

        case 'remove-silence-real':
            const silence_dur = params.duration || 0.5;
            const silence_thresh = params.threshold || -30;
            args = ['-i', videoFile.path, '-af', `silenceremove=stop_periods=-1:stop_duration=${silence_dur}:stop_threshold=${silence_thresh}dB`, '-y', outputPath];
            break;

        case 'isolate-voice-real':
            // Filtro básico de voz (passa-banda)
            args = ['-i', videoFile.path, '-af', 'highpass=f=200,lowpass=f=3000', '-y', outputPath];
            break;

        default:
            const filter = getStyleFilter(action);
            args = ['-i', videoFile.path, '-vf', filter, '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
    }

    createFFmpegJob(jobId, args, expectedDuration);
}

// --- ENDPOINTS ---

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body, outputPath: null };
    res.status(202).json({ jobId });
    processSingleClipJob(jobId);
});

app.get('/api/process/status/:jobId', (req, res) => res.json(jobs[req.params.jobId] || { status: 'not_found' }));

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).send("Trabalho não encontrado.");
    if (job.status !== 'completed') return res.status(400).send("Arquivo ainda não está pronto para download.");
    if (!job.outputPath || !fs.existsSync(job.outputPath)) return res.status(404).send("Arquivo físico não encontrado no servidor.");
    
    res.download(job.outputPath);
});

app.get('/api/check-ffmpeg', (req, res) => res.send("FFmpeg is ready"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


