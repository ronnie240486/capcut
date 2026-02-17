import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { handleExportVideo } from './exportVideo.js';
import filterBuilder from './video-engine/filterBuilder.js';
import https from 'https';

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-epidemic-token']
}));

app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Global Error Handlers
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

// Filename sanitization
const sanitizeFilename = (name) => name.replace(/[^a-z0-9.]/gi, '_').replace(/_{2,}/g, '_');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
});

const uploadAny = multer({
    storage,
    limits: { fieldSize: 100 * 1024 * 1024, fileSize: 2048 * 1024 * 1024 }
}).any();

const jobs = {};

// Cleanup old jobs
setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach(id => {
        if (now - jobs[id].startTime > 3600000) {
            if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) {
                try { fs.unlinkSync(jobs[id].outputPath); } catch {}
            }
            delete jobs[id];
        }
    });
}, 3600000);

// Convert HH:MM:SS to seconds
function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

// Spawn FFmpeg job
function createFFmpegJob(jobId, args, expectedDuration, res) {
    if (!jobs[jobId]) jobs[jobId] = { id: jobId, startTime: Date.now() };
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;

    if (res && !res.headersSent) res.status(202).json({ jobId });

    const finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats', ...args];
    console.log(`[Job ${jobId}] Spawning FFmpeg...`);

    try {
        const ffmpeg = spawn('ffmpeg', finalArgs);
        let stderr = '';

        ffmpeg.stderr.on('data', d => {
            const line = d.toString();
            stderr += line;
            const match = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
            if (match && expectedDuration > 0) {
                const t = timeToSeconds(match[1]);
                jobs[jobId].progress = Math.min(99, Math.round((t / expectedDuration) * 100));
            }
        });

        ffmpeg.on('error', (err) => {
            console.error(`[Job ${jobId}] FFmpeg error:`, err);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = err.message;
        });

        ffmpeg.on('close', (code) => {
            const fileExists = jobs[jobId].outputPath && fs.existsSync(jobs[jobId].outputPath);
            const fileSize = fileExists ? fs.statSync(jobs[jobId].outputPath).size : 0;
            const success = (code === 0 && fileSize > 100);

            if (success) {
                console.log(`[Job ${jobId}] Completed. Size: ${fileSize}`);
                jobs[jobId].status = 'completed';
                jobs[jobId].progress = 100;
                jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
            } else {
                console.error(`[Job ${jobId}] Failed. Code: ${code}`, stderr.slice(-200));
                jobs[jobId].status = 'failed';
                jobs[jobId].error = `Erro FFmpeg: código ${code}`;
                if (fileExists) try { fs.unlinkSync(jobs[jobId].outputPath); } catch {}
            }
        });
    } catch (e) {
        console.error(`[Job ${jobId}] Exception:`, e);
        jobs[jobId].status = 'failed';
        jobs[jobId].error = "Erro crítico no servidor";
    }
}

// Single clip processing
app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files || [], params: req.body, startTime: Date.now() };

    setTimeout(() => {
        const job = jobs[jobId];
        const file = job.files[0];
        if (!file) { job.status = 'failed'; return; }

        let ext = '.mp4';
        if (file.mimetype.startsWith('audio') || action.includes('audio') || action.includes('voice')) ext = '.mp3';

        const outputPath = path.join(uploadDir, `${action}-${Date.now()}${ext}`);
        job.outputPath = outputPath;

        let args = [];
        if (action.includes('audio')) {
            args = ['-i', file.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
            createFFmpegJob(jobId, args, 10, res);
        } else {
            const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, job.params, file.path);
            args = ['-i', file.path];
            if (filterComplex) args.push('-filter_complex', filterComplex);
            if (mapArgs?.length) args.push(...mapArgs);
            if (outputOptions?.length) args.push(...outputOptions);
            args.push('-y', outputPath);
            createFFmpegJob(jobId, args, 10, res);
        }
    }, 100);
});

// Export multiple videos + audios
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files || [], params: req.body, startTime: Date.now() };
    res.status(202).json({ jobId });

    setTimeout(() => {
        handleExportVideo(jobs[jobId], uploadDir, (id, args, dur) => {
            const safeArgs = [...args, '-max_muxing_queue_size', '4096'];
            createFFmpegJob(id, safeArgs, dur);
        }).catch(err => {
            if (jobs[jobId]) {
                jobs[jobId].status = 'failed';
                jobs[jobId].error = "Export falhou: " + err.message;
            }
        });
    }, 100);
});

// Job status
app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ status: 'not_found' });
    res.json(job);
});

// Download file
app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (job?.outputPath && fs.existsSync(job.outputPath) && fs.statSync(job.outputPath).size > 0) {
        res.setHeader('Content-Disposition', `attachment; filename="proedit_export_${Date.now()}.mp4"`);
        res.download(job.outputPath);
    } else {
        res.status(404).send("Arquivo indisponível ou vazio.");
    }
});

// FFmpeg check
app.get('/api/check-ffmpeg', (req, res) => {
    const check = spawn('ffmpeg', ['-version']);
    check.on('error', () => res.status(500).send("FFmpeg Missing"));
    check.on('close', (code) => code === 0 ? res.send("OK") : res.status(500).send("FFmpeg Error"));
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
