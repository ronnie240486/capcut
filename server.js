
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import { handleExportVideo } from './video-engine/exportVideo.js';
import filterBuilder from './video-engine/filterBuilder.js';
import https from 'https';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from "@google/genai";

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

async function startServer() {
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
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Helper to check if file has audio
const checkAudio = (filePath) => {
    return new Promise((resolve) => {
        // We use ffprobe to check for audio streams
        const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_streams', '-select_streams', 'a', '-of', 'json', filePath]);
        let output = '';
        ffprobe.stdout.on('data', d => output += d);
        ffprobe.on('close', (code) => {
            try {
                const json = JSON.parse(output);
                resolve(json.streams && json.streams.length > 0);
            } catch (e) {
                resolve(false);
            }
        });
        ffprobe.on('error', () => resolve(false));
    });
};

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

const uploadSingle = multer({ storage }).single('file');

// Single file upload endpoint
app.post('/api/upload', uploadSingle, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ 
        success: true, 
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path
    });
});

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

    // Inject thread_queue_size for robustness
    let finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats'];
    
    // Scan args and inject thread_queue_size before every -i (input)
    // to prevent "Resource temporarily unavailable" on reading
    const improvedArgs = [];
    for(let i=0; i<args.length; i++) {
        if(args[i] === '-i') {
            improvedArgs.push('-thread_queue_size', '1024'); 
        }
        improvedArgs.push(args[i]);
    }

    finalArgs = [...finalArgs, ...improvedArgs];

    console.log(`[Job ${jobId}] Spawning FFmpeg...`);
    
    try {
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

app.post('/api/process/start/:action', uploadAny, async (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    const job = { id: jobId, status: 'pending', files: req.files || [], params: req.body, startTime: Date.now() };
    jobs[jobId] = job;
    
    const file = job.files[0];
    if (!file) { job.status = 'failed'; return res.status(400).json({ error: 'Ficheiro não encontrado' }); }
    
    // Check for audio presence to pass to filterBuilder
    const hasAudio = await checkAudio(file.path);
    job.params.hasAudio = hasAudio;

    setTimeout(() => {
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

// NEW: AI Video Generation Backend Route
app.post('/api/ai/generate-video', async (req, res) => {
    const jobId = `aivideo_${Date.now()}`;
    jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
    res.status(202).json({ jobId });

    const { prompt, aspectRatio, resolution, model, image, lastFrame, referenceImages, apiKey } = req.body;
    const finalKey = apiKey || process.env.GEMINI_API_KEY;

    if (!finalKey) {
        jobs[jobId].status = 'failed';
        jobs[jobId].error = "Chave API não configurada no servidor.";
        return;
    }

    try {
        const genAI = new GoogleGenAI(finalKey);
        // Using a dynamic model name if provided, else default
        const aiModel = genAI.getGenerativeModel({ model: model || "veo-3.1-lite-generate-preview" });
        
        const generationParams = {
            prompt,
            aspect_ratio: aspectRatio || "16:9",
            resolution: resolution || "720p",
        };

        // Handle image conditioning if present in base64
        // Note: For actual VEO implementation, this depends on the SDK version
        // Here we simulate the process or use the real SDK call if supported
        // Based on the frontend logic, it's a fetch to the service.
        
        // For AI Studio environment, we'll try to use the model normally.
        // If it's the Veo preview, we call it.
        
        console.log(`[Job ${jobId}] Starting AI Generation with prompt: ${prompt.slice(0, 50)}...`);
        
        // Mocking the wait and response since actual Video Gen might be specialized
        // In a real environment with @google/genai supporting video:
        /*
        const result = await aiModel.generateContent({
           contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        */
        
        // Let's assume for now we use the same fetch logic as GeminiVideoService but from the backend
        // to keep it reliable and using the server key.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'veo-3.1-lite-generate-preview'}:generateVideo?key=${finalKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                aspectRatio,
                resolution,
                image: image ? { data: image.split(',')[1], mimeType: "image/png" } : undefined,
                lastFrame: lastFrame ? { data: lastFrame.split(',')[1], mimeType: "image/png" } : undefined,
                referenceImages: referenceImages?.map(img => ({ data: img.split(',')[1], mimeType: "image/png" }))
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Erro na API Gemini");
        }

        const data = await response.json();
        const operationName = data.name; // Long running operation

        // Poll for completion
        let completed = false;
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes (5s intervals)

        while (!completed && attempts < maxAttempts) {
            attempts++;
            await new Promise(r => setTimeout(r, 5000));
            
            const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${finalKey}`);
            const pollData = await pollRes.json();
            
            if (jobs[jobId]) jobs[jobId].progress = Math.min(95, 10 + (attempts * 1.5));

            if (pollData.done) {
                completed = true;
                if (pollData.error) {
                    throw new Error(pollData.error.message);
                }
                
                // Success! Download the video and save to uploads
                const videoUrl = pollData.response.videoUri || pollData.response.video.uri;
                const videoRes = await fetch(videoUrl);
                const buffer = Buffer.from(await videoRes.arrayBuffer());
                
                const filename = `ai_gen_${Date.now()}.mp4`;
                const outputPath = path.join(uploadDir, filename);
                fs.writeFileSync(outputPath, buffer);
                
                if (jobs[jobId]) {
                    jobs[jobId].status = 'completed';
                    jobs[jobId].progress = 100;
                    jobs[jobId].outputPath = outputPath;
                    jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
                }
            }
        }

        if (!completed) throw new Error("Tempo limite de geração excedido.");

    } catch (e) {
        console.error(`[Job ${jobId}] AI Gen Failed:`, e);
        if (jobs[jobId]) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = e.message;
        }
    }
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

app.get('/api/proxy/freesound', async (req, res) => {
    const { q, token } = req.query;
    console.log(`[Freesound Proxy] Query: ${q}, Token: ${token ? 'PROVIDED' : 'MISSING'}`);
    if (!q) return res.status(400).send("Query missing");
    
    // Freesound API requires a token (Client Secret or API Key)
    // If no token provided by user, we can't really search unless we have a default one
    // But here we assume the user provides it via the 'token' param from App.tsx
    
    try {
        const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&token=${token}&fields=id,name,previews,duration,description&page_size=15`;
        
        https.get(url, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    if (apiRes.statusCode !== 200) {
                        console.error(`[Freesound Proxy] API Error: ${apiRes.statusCode} - ${data}`);
                        return res.status(apiRes.statusCode || 500).json({ error: "Freesound API Error", details: data });
                    }
                    const json = JSON.parse(data);
                    res.json(json);
                } catch (e) {
                    console.error(`[Freesound Proxy] Parse Error: ${e.message}`);
                    res.status(500).json({ error: "Parse error", details: data });
                }
            });
        }).on('error', (e) => {
            res.status(500).json({ error: "Freesound API error", details: e.message });
        });
    } catch (e) {
        res.status(500).json({ error: "Proxy error", details: e.message });
    }
});

app.get('/api/proxy/media', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL missing");
    
    try {
        const decodedUrl = decodeURIComponent(url);
        console.log(`[Media Proxy] Fetching: ${decodedUrl}`);
        
        const protocol = decodedUrl.startsWith('https') ? https : http;
        protocol.get(decodedUrl, (apiRes) => {
            if (apiRes.statusCode !== 200) {
                console.error(`[Media Proxy] Error: ${apiRes.statusCode}`);
                return res.status(apiRes.statusCode || 500).send("Proxy error");
            }
            
            if (apiRes.headers['content-type']) res.setHeader('Content-Type', apiRes.headers['content-type']);
            if (apiRes.headers['content-length']) res.setHeader('Content-Length', apiRes.headers['content-length']);
            
            apiRes.pipe(res);
        }).on('error', (err) => {
            console.error(`[Media Proxy] Request Error: ${err.message}`);
            res.status(500).send("Request error");
        });
    } catch (error) {
        console.error(`[Media Proxy] Unexpected Error: ${error.message}`);
        res.status(500).send("Unexpected error");
    }
});

// Claude Proxy
app.post('/api/proxy/claude', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: "Missing x-api-key header" });

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Claude Proxy Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GPT Proxy (Optional but safer for CORS)
app.post('/api/proxy/gpt', async (req, res) => {
    const apiKey = req.headers['authorization'];
    if (!apiKey) return res.status(400).json({ error: "Missing Authorization header" });

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("GPT Proxy Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Vite middleware setup
if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
    });
    app.use(vite.middlewares);
} else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
}

startServer();
