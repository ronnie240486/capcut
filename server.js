
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { handleExportVideo } from './exportVideo.js';
import filterBuilder from './video-engine/filterBuilder.js';

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
            if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) {
                try { fs.unlinkSync(jobs[id].outputPath); } catch(e) {}
            }
            delete jobs[id];
        }
    });
}, 3600000);

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

    // Inject thread_queue_size and threads for robustness
    let finalArgs = ['-hide_banner', '-loglevel', 'info', '-stats', '-threads', '1'];
    
    // Scan args and inject thread_queue_size before every -i (input)
    // to prevent "Resource temporarily unavailable" on reading
    const improvedArgs = [];
    for(let i=0; i<args.length; i++) {
        if(args[i] === '-i') {
            improvedArgs.push('-thread_queue_size', '64'); 
        }
        improvedArgs.push(args[i]);
    }

    finalArgs = [...finalArgs, ...improvedArgs];

    console.log(`[Job ${jobId}] Spawning FFmpeg with args:`, finalArgs.join(' '));
    
    try {
        const ffmpeg = spawn('ffmpeg', finalArgs);
        
        let stderr = '';
        ffmpeg.stderr.on('data', d => {
            const line = d.toString();
            stderr += line;
            // Also log to console for visibility in logs
            process.stdout.write(line);
            
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
            
            // Validate File Existence & Size
            const fileExists = jobs[jobId].outputPath && fs.existsSync(jobs[jobId].outputPath);
            const fileSize = fileExists ? fs.statSync(jobs[jobId].outputPath).size : 0;
            const hasValidContent = fileSize > 100; // Minimum size for a valid header

            // Success Condition: Code 0 AND File exists with content
            // OR if Code != 0 but file seems valid (resilient check for mobile streams)
            const isSuccess = (code === 0 && hasValidContent) || (fileSize > 1024 && hasValidContent);

            if (isSuccess) {
                console.log(`[Job ${jobId}] Success. Size: ${fileSize} bytes`);
                jobs[jobId].status = 'completed';
                jobs[jobId].progress = 100;
                jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
            } else {
                console.error(`[Job ${jobId}] Failed. Code: ${code}. File Size: ${fileSize}`, stderr);
                jobs[jobId].status = 'failed';
                jobs[jobId].error = `Erro ao renderizar. Código: ${code}. ` + (stderr.slice(-100) || "Verifique logs.");
                // Cleanup partial file
                if (fileExists) try { fs.unlinkSync(jobs[jobId].outputPath); } catch(e) {}
            }
        });
    } catch (e) {
        console.error(`[Job ${jobId}] Fatal Exception:`, e);
        if(jobs[jobId]) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = "Erro crítico no servidor.";
        }
    }
}

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files || [], params: req.body, startTime: Date.now() };
    
    setTimeout(() => {
        const job = jobs[jobId];
        const file = job.files[0];
        if (!file) { job.status = 'failed'; return; }
        
        let ext = '.mp4';
        if (file.mimetype.startsWith('audio') || action === 'extract-audio' || action.includes('voice')) ext = '.mp3';
        
        const outputPath = path.join(uploadDir, `${action}-${Date.now()}${ext}`);
        job.outputPath = outputPath;
        
        let args = [];
        if (action.includes('extract-audio')) {
            args = ['-i', file.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
            createFFmpegJob(jobId, args, 10, res);
        } else {
            const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, job.params, file.path);
            args = ['-i', file.path];
            if (filterComplex) args.push('-filter_complex', filterComplex);
            if (mapArgs?.length) args.push(...mapArgs);
            else if (!filterComplex) args.push('-c', 'copy');
            if (outputOptions?.length) args.push(...outputOptions);
            args.push('-y', outputPath);
            createFFmpegJob(jobId, args, 10, res);
        }
    }, 100);
});

app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'pending', files: req.files || [], params: req.body, startTime: Date.now() };
    res.status(202).json({ jobId });
    
    setTimeout(() => {
        handleExportVideo(jobs[jobId], uploadDir, (id, args, dur) => {
            // Buffer de segurança para evitar corrupção de áudio em conexões lentas
            const safeArgs = [...args, '-max_muxing_queue_size', '4096'];
            createFFmpegJob(id, safeArgs, dur);
        }).catch(err => {
            if (jobs[jobId]) {
                jobs[jobId].status = 'failed';
                jobs[jobId].error = "Configuração do Export falhou: " + err.message;
            }
        });
    }, 100);
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ status: 'not_found' });
    res.json(job);
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (job && job.outputPath && fs.existsSync(job.outputPath) && fs.statSync(job.outputPath).size > 0) {
        res.setHeader('Content-Disposition', `attachment; filename="proedit_export_${Date.now()}.mp4"`);
        res.download(job.outputPath);
    } else {
        res.status(404).send("Arquivo indisponível ou vazio.");
    }
});

app.get('/api/check-ffmpeg', (req, res) => {
    const check = spawn('ffmpeg', ['-version']);
    check.on('error', () => res.status(500).send("FFmpeg Missing"));
    check.on('close', (code) => {
        if (code === 0) res.send("OK");
        else res.status(500).send("FFmpeg Error");
    });
});

async function startServer() {
    // Vite middleware for development
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    if (process.env.NODE_ENV !== 'production') {
        console.log('[Server] Starting Vite in middleware mode...');
        try {
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use(vite.middlewares);
            console.log('[Server] Vite middleware integrated.');
        } catch (e) {
            console.error('[Server] Failed to start Vite:', e);
        }
    } else {
        // Serve static files in production
        console.log('[Server] Serving static files from dist/');
        app.use(express.static(path.resolve(__dirname, 'dist')));
        app.get('*', (req, res) => {
            res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
    });
}

startServer();
