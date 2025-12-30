
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// --- IMPORT MODULES ---
const exportVideo = require('./exportVideo');
const filterBuilder = require('./filterBuilder');
const presetGenerator = require('./presetGenerator');

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
                : `Erro no processamento (Code ${code}).`;
        }
    });
}

async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    if (!job) return;

    const action = jobId.split('_')[0];
    
    // --- DELEGATE TO EXPORT MODULE ---
    if (action === 'export') {
        return exportVideo(job, uploadDir, createFFmpegJob);
    }

    // --- SINGLE FILE PROCESSING ---
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

    // Get Duration for Progress
    let expectedDuration = 0;
    const info = await getMediaInfo(videoFile.path);
    expectedDuration = info.duration;

    let args = [];

    if (action === 'extract-audio') {
        const finalAudioPath = outputPath.replace('.wav', '.mp3');
        job.outputPath = finalAudioPath;
        args = ['-i', videoFile.path, ...presetGenerator.getAudioExtractArgs(), '-y', finalAudioPath];
    } else {
        // Build Complex Filters using filterBuilder
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
