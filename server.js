
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

// Improved CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-epidemic-token']
}));

// Increase limits significantly for 4K video projects
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (e) {
        console.error("Failed to create upload dir:", e);
    }
}

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Sanitization
const sanitizeFilename = (name) => {
    return name.replace(/[^a-z0-9.]/gi, '_').replace(/_{2,}/g, '_');
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
});

const uploadAny = multer({ 
    storage,
    limits: {
        fieldSize: 100 * 1024 * 1024, // 100MB json state
        fileSize: 2048 * 1024 * 1024 // 2GB files
    }
}).any();

// Job Store
const jobs = {};

// Cleanup old jobs periodically (every hour)
setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach(id => {
        if (now - jobs[id].startTime > 3600000) { // 1 hour
            // Optional: delete files
            if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) {
                try { fs.unlinkSync(jobs[id].outputPath); } catch(e) {}
            }
            delete jobs[id];
        }
    });
}, 3600000);

// Fallbacks
const REAL_MUSIC_FALLBACKS = [
    { id: 'fb_m1', name: 'Cinematic Epic', artist: 'Gregor', duration: 120, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/audio/2022/03/09/audio_a7e2311438.mp3'} }
];

const REAL_SFX_FALLBACKS = [
    { id: 'fb_s1', name: 'Whoosh', artist: 'SFX', duration: 2, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/audio/2022/03/10/audio_c36c1e54c2.mp3'} }
];

function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
}

function createFFmpegJob(jobId, args, expectedDuration, res) {
    if (!jobs[jobId]) jobs[jobId] = { id: jobId, startTime: Date.now() };
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;
    
    if (res && !res.headersSent) res.status(202).json({ jobId });

    const finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats', ...args];
    console.log(`[Job ${jobId}] Spawning FFmpeg:`, finalArgs.join(' '));
    
    try {
        const ffmpeg = spawn('ffmpeg', finalArgs);
        
        let stderr = '';
        ffmpeg.stderr.on('data', d => {
            const line = d.toString();
            stderr += line;
            // Parse duration
            const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
            if (timeMatch && expectedDuration > 0) {
                const t = timeToSeconds(timeMatch[1]);
                const p = Math.round((t / expectedDuration) * 100);
                if (jobs[jobId]) jobs[jobId].progress = Math.min(99, Math.max(0, p));
            }
        });

        ffmpeg.on('error', (err) => {
            console.error(`[Job ${jobId}] Spawn Error:`, err);
            if (jobs[jobId]) {
                jobs[jobId].status = 'failed';
                jobs[jobId].error = err.message;
            }
        });

        ffmpeg.on('close', (code) => {
            if (!jobs[jobId]) return;
            if (code === 0) {
                console.log(`[Job ${jobId}] Completed`);
                jobs[jobId].status = 'completed';
                jobs[jobId].progress = 100;
                jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
            } else {
                console.error(`[Job ${jobId}] Failed code ${code}`, stderr);
                jobs[jobId].status = 'failed';
                jobs[jobId].error = stderr.includes('memory') ? "Out of Memory (Server)" : "Processing Failed";
            }
        });
    } catch (e) {
        console.error(`[Job ${jobId}] Exception:`, e);
        if(jobs[jobId]) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = "Internal Server Error";
        }
    }
}

// Routes
app.get('/api/proxy/pixabay', (req, res) => {
    const { q, type, token } = req.query;
    if (!token || token === 'undefined') return res.json({ hits: [] });
    const url = type === 'video' 
        ? `https://pixabay.com/api/videos/?key=${token}&q=${encodeURIComponent(q)}`
        : `https://pixabay.com/api/?key=${token}&q=${encodeURIComponent(q)}`;
    
    const apiReq = https.get(url, (apiRes) => apiRes.pipe(res));
    apiReq.on('error', (e) => {
        console.error("Pixabay Proxy Error:", e);
        res.status(500).json({ hits: [] });
    });
});

app.get('/api/proxy/freesound', (req, res) => {
    const { token, q } = req.query;
    if (!token) return res.json({ results: REAL_SFX_FALLBACKS });
    const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&fields=id,name,previews,duration&token=${token}`;
    
    const apiReq = https.get(url, (apiRes) => apiRes.pipe(res));
    apiReq.on('error', (e) => {
        console.error("Freesound Proxy Error:", e);
        res.json({ results: REAL_SFX_FALLBACKS });
    });
});

// Single Clip Processing (with Filter Builder)
const processSingleClipJob = (jobId) => {
    const job = jobs[jobId];
    if (!job) return;
    
    try {
        const action = jobId.split('_')[0]; 
        const file = job.files[0];
        if (!file) { job.status = 'failed'; job.error = "No file uploaded"; return; }
        
        let ext = '.mp4';
        if (file.mimetype.startsWith('audio') || action === 'extract-audio' || action.includes('voice') || action.includes('music')) {
            ext = '.mp3';
        }
        
        const outputPath = path.join(uploadDir, `${action}-${Date.now()}${ext}`);
        job.outputPath = outputPath;
        
        let args = [];
        
        if (action.includes('extract-audio')) {
            args = ['-i', file.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
        } else {
            const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, job.params, file.path);
            args = ['-i', file.path];
            if (filterComplex) args.push('-filter_complex', filterComplex);
            if (mapArgs && mapArgs.length > 0) args.push(...mapArgs);
            else if (!filterComplex) args.push('-c', 'copy');
            if (outputOptions && outputOptions.length > 0) args.push(...outputOptions);
            else if (filterComplex) {
                if (ext === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac');
                if (ext === '.mp3') args.push('-c:a', 'libmp3lame');
            }
            args.push('-y', outputPath);
        }
        
        createFFmpegJob(jobId, args, 10);
    } catch (e) {
        console.error(`Process Single Clip Error [${jobId}]:`, e);
        job.status = 'failed';
        job.error = e.message;
    }
};

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files || [], params: req.body, startTime: Date.now() };
    
    // Defer processing
    setTimeout(() => processSingleClipJob(jobId), 100);
    
    res.status(202).json({ jobId });
});

// Export Route
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    const jobFiles = req.files || [];
    const jobParams = req.body || {};

    jobs[jobId] = { id: jobId, status: 'pending', files: jobFiles, params: jobParams, startTime: Date.now() };
    res.status(202).json({ jobId });

    setTimeout(() => {
        try {
            const job = jobs[jobId];

            // Cria arrays para handleExportVideo
            const videoInputs = job.files
                .filter(f => f.mimetype.startsWith('video'))
                .map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 }));

            const audioInputs = job.files
                .filter(f => f.mimetype.startsWith('audio'))
                .map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 }));

           setTimeout(() => {
    handleExportVideo(jobs[jobId], uploadDir, (id, args, dur) => {
        const safeArgs = [...args, '-max_muxing_queue_size', '4096'];
        createFFmpegJob(id, safeArgs, dur);
    }).catch(err => {
        console.error(`Export Job Failed [${jobId}]:`, err);
        if (jobs[jobId]) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = "Export Initialization Failed: " + err.message;
        }
    });
}, 100);

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) {
        // If not found, log it for debugging
        console.warn(`[404] Job not found: ${req.params.jobId}`);
        return res.status(404).json({ status: 'not_found' });
    }
    res.json(job);
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (job && job.outputPath && fs.existsSync(job.outputPath)) {
        res.download(job.outputPath);
    } else {
        res.status(404).send("File not found");
    }
});

app.get('/api/check-ffmpeg', (req, res) => {
    // Also verify we can spawn ffmpeg
    const check = spawn('ffmpeg', ['-version']);
    check.on('error', () => res.status(500).send("FFmpeg Missing"));
    check.on('close', (code) => {
        if (code === 0) res.send("OK");
        else res.status(500).send("FFmpeg Error");
    });
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
