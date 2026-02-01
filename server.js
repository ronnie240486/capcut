
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

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Melhor sanitização de nomes de arquivo para evitar erros de ZIP e FS
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
        fieldSize: 50 * 1024 * 1024,
        fileSize: 500 * 1024 * 1024
    }
}).any();

const jobs = {};

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
    if (!jobs[jobId]) jobs[jobId] = {};
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;
    
    if (res) res.status(202).json({ jobId });

    const finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats', ...args];
    console.log(`[Job ${jobId}] Spawning FFmpeg:`, finalArgs.join(' '));
    
    const ffmpeg = spawn('ffmpeg', finalArgs);
    
    let stderr = '';
    ffmpeg.stderr.on('data', d => {
        const line = d.toString();
        stderr += line;
        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch && expectedDuration > 0) {
            const t = timeToSeconds(timeMatch[1]);
            const p = Math.round((t / expectedDuration) * 100);
            if (jobs[jobId]) jobs[jobId].progress = Math.min(99, Math.max(0, p));
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
            jobs[jobId].error = stderr.includes('memory') ? "Out of Memory" : "Processing Failed";
        }
    });
}

// Routes
app.get('/api/proxy/pixabay', (req, res) => {
    const { q, type, token } = req.query;
    if (!token || token === 'undefined') return res.json({ hits: [] });
    const url = type === 'video' 
        ? `https://pixabay.com/api/videos/?key=${token}&q=${encodeURIComponent(q)}`
        : `https://pixabay.com/api/?key=${token}&q=${encodeURIComponent(q)}`;
    https.get(url, (apiRes) => apiRes.pipe(res)).on('error', () => res.json({ hits: [] }));
});

app.get('/api/proxy/freesound', (req, res) => {
    const { token, q } = req.query;
    if (!token) return res.json({ results: REAL_SFX_FALLBACKS });
    const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&fields=id,name,previews,duration&token=${token}`;
    https.get(url, (apiRes) => apiRes.pipe(res)).on('error', () => res.json({ results: REAL_SFX_FALLBACKS }));
});

// Single Clip Processing (with Filter Builder)
const processSingleClipJob = (jobId) => {
    const job = jobs[jobId];
    if (!job) return;
    const action = jobId.split('_')[0]; // Extract action from 'action_timestamp'
    const file = job.files[0];
    if (!file) { job.status = 'failed'; return; }
    
    // Determine Output Filename
    let ext = '.mp4';
    if (file.mimetype.startsWith('audio') || action === 'extract-audio' || action.includes('voice') || action.includes('music')) {
        ext = '.mp3';
    }
    
    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${ext}`);
    job.outputPath = outputPath;
    
    let args = [];
    
    // 1. Special Case: Audio Extraction
    if (action.includes('extract-audio')) {
        args = ['-i', file.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
    } 
    // 2. Use Filter Builder for complex ops
    else {
        try {
            const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, job.params, file.path);
            
            args = ['-i', file.path];
            
            if (filterComplex) {
                args.push('-filter_complex', filterComplex);
            }
            
            if (mapArgs && mapArgs.length > 0) {
                args.push(...mapArgs);
            } else if (!filterComplex) {
                // If no filter and no map, just copy (fallback)
                args.push('-c', 'copy');
            }
            
            if (outputOptions && outputOptions.length > 0) {
                args.push(...outputOptions);
            } else {
                // Default re-encode if filters are used
                if (filterComplex) {
                    if (ext === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac');
                    if (ext === '.mp3') args.push('-c:a', 'libmp3lame');
                }
            }
            
            args.push('-y', outputPath);
            
        } catch (e) {
            console.error(`Error building filters for ${action}:`, e);
            // Fallback to copy if builder fails
            args = ['-i', file.path, '-c', 'copy', '-y', outputPath];
        }
    }
    
    createFFmpegJob(jobId, args, 10); // Dummy duration for single clips
};

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files, params: req.body, startTime: Date.now() };
    
    // Defer processing to next tick to return ID immediately
    setTimeout(() => processSingleClipJob(jobId), 0);
    
    res.status(202).json({ jobId });
});

// Export Route
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files, params: req.body, startTime: Date.now() };
    res.status(202).json({ jobId });
    
    // Call the export handler
    setTimeout(() => {
        handleExportVideo(jobs[jobId], uploadDir, (id, args, dur) => {
            // Fix output path position or ensure safety
            // The handler already constructs args ending with output path
            // We just inject standard flags if needed
            const safeArgs = [...args, '-max_muxing_queue_size', '4096'];
            createFFmpegJob(id, safeArgs, dur);
        });
    }, 0);
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ status: 'not_found' });
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

app.get('/api/check-ffmpeg', (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
