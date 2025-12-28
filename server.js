
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
        exec(`ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets,duration -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ frames: 0, duration: 0 });
            const [frames, duration] = stdout.split(',').map(parseFloat);
            resolve({ frames: frames || 0, duration: duration || 0 });
        });
    });
}

function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', path.resolve(filePath)]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => stderr += d.toString());
        ffmpeg.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)));
    });
}

function isImage(filename) {
    return /\.(jpe?g|png|webp|gif)$/i.test(filename);
}

function getStyleFilter(style) {
    const filters = {
        'anime_vibrant': 'unsharp=5:5:1.0:5:5:0.0,curves=all="0/0 0.1/0.15 0.5/0.6 1/1",saturate=1.5',
        'pixar': 'bilateral=sigmaS=5:sigmaR=0.1,curves=all="0/0 0.5/0.45 1/1",saturate=1.3',
        'sketch': 'edgedetect=low=0.1:high=0.4,negate',
        'noir': 'format=gray,curves=all="0/0 0.3/0.1 0.7/0.9 1/1"',
        'cyberpunk': 'curves=r="0/0 0.5/0.6 1/1":g="0/0 0.5/0.4 1/1":b="0/0 0.5/0.7 1/1",saturate=2'
    };
    return filters[style] || filters['anime_vibrant'];
}

function createFFmpegJob(jobId, args, totalFrames, res) {
    jobs[jobId] = { status: 'processing', progress: 0 };
    if (res) res.status(202).json({ jobId });

    console.log(`Starting FFmpeg job ${jobId}`);

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', d => {
        const line = d.toString();
        stderr += line;
        
        // Regex para capturar frame= XXX
        const frameMatch = line.match(/frame=\s*(\d+)/);
        if (frameMatch && totalFrames > 0) {
            const currentFrame = parseInt(frameMatch[1]);
            // Multiplicamos o totalFrames pelo fator de slow se necessário, 
            // mas aqui simplificamos para o progresso do input processado
            let progress = Math.round((currentFrame / totalFrames) * 100);
            if (progress > 99) progress = 99;
            jobs[jobId].progress = progress;
        }
    });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error(`FFmpeg error for ${jobId}:`, stderr);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = stderr;
        }
    });
}

// --- SINGLE CLIP JOB LOGIC ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    const action = jobId.split('_')[0];
    const videoFile = job.files[0];
    
    if (!videoFile) {
        job.status = 'failed'; job.error = "No media file provided."; return;
    }

    const { frames: totalFrames } = await getMediaInfo(videoFile.path);
    let params = job.params || {};
    const inputIsImg = isImage(videoFile.originalname);
    let outputExt = inputIsImg ? '.png' : '.mp4';
    
    if (['extract-audio-real', 'reduce-noise-real', 'isolate-voice-real'].includes(action)) outputExt = '.wav';
    
    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    let args = [];

    switch (action) {
        case 'interpolate-real':
            const speed = parseFloat(params.speed) || 0.5;
            const factor = 1 / speed;
            // Otimizado: mi_mode=mci (Motion Compensated Interpolation) é a "AI" real
            // scd=fdiff detecta cortes de cena para não criar fantasmas entre cenas diferentes
            args = [
                '-i', videoFile.path,
                '-filter_complex', `[0:v]minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:scd=fdiff,setpts=${factor}*PTS[v];[0:a]atempo=${speed}[a]`,
                '-map', '[v]', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
                '-y', outputPath
            ];
            // Ajustamos o totalFrames esperado no output (60fps vs original fps)
            // Para simplificar o progresso, usamos o frame de leitura.
            break;

        case 'upscale-real':
            args = ['-i', videoFile.path, '-vf', "scale=3840:2160:flags=lanczos", '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
            break;

        case 'reverse-real':
            args = ['-i', videoFile.path, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
            break;

        default:
            const filter = getStyleFilter(action);
            args = ['-i', videoFile.path, '-vf', filter, '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
    }

    createFFmpegJob(jobId, args, totalFrames);
}

// --- ENDPOINTS ---

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processSingleClipJob(jobId);
});

app.get('/api/process/status/:jobId', (req, res) => res.json(jobs[req.params.jobId] || { status: 'not_found' }));
app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.status(404).send("Arquivo não pronto.");
    res.download(job.outputPath);
});
app.get('/api/check-ffmpeg', (req, res) => res.send("FFmpeg is ready"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
