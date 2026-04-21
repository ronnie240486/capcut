import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality, Type } from "@google/genai";

// Engine Imports
import { handleExportVideo } from './video-engine/export-video.js';
import filterBuilder from './video-engine/filter-logic.js';

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

async function startServer() {
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-epidemic-token']
    }));

    app.use(express.json({ limit: '1gb' }));
    app.use(express.urlencoded({ extended: true, limit: '1gb' }));

    // Diagnostic to see if the autopilot routes are actually reached
    app.all('/api/autopilot/*', (req, res, next) => {
        console.log(`[Autopilot Route Debug] ${req.method} ${req.url} from ${req.ip}`);
        next();
    });

    const uploadDir = path.resolve(__dirname, 'uploads');
    const proxyDir = path.resolve(__dirname, 'uploads', 'proxies');

    if (!fs.existsSync(uploadDir)) {
        try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) { console.error("Failed to create upload dir:", e); }
    }
    if (!fs.existsSync(proxyDir)) {
        try { fs.mkdirSync(proxyDir, { recursive: true }); } catch (e) { console.error("Failed to create proxy dir:", e); }
    }

    process.on('uncaughtException', (err) => { console.error('CRITICAL ERROR (Uncaught Exception):', err); });
    process.on('unhandledRejection', (reason) => { console.error('CRITICAL ERROR (Unhandled Rejection):', reason); });

    // ─── UTILS ────────────────────────────────────────────────────────────────
    const getGeminiKey = (req?: express.Request) => {
        const isPlaceholder = (v: string) => {
            const up = (v || "").toUpperCase();
            return (
                !v ||
                up.includes("YOUR_") || 
                up.includes("REPLACE") || 
                (up.includes("API_KEY") && up.length < 20) || 
                up.includes("/") || 
                up.endsWith("_KEY") ||
                up === "UNDEFINED" ||
                up === "NULL"
            );
        };

        // 1. Header Priority (from Frontend - AI Studio selected keys)
        const headerKey = (req?.headers['x-gemini-api-key'] || req?.headers['authorization']?.toString().replace('Bearer ', '') || "").toString().trim();
        if (headerKey && !isPlaceholder(headerKey)) {
            const hint = headerKey.length > 8 ? `${headerKey.slice(0, 4)}...${headerKey.slice(-4)}` : "too short";
            console.log(`[Key Diagnostic] Using key from headers: ${hint}`);
            return headerKey;
        }

        // 2. Env priority
        const envKeys = Object.keys(process.env);
        for (const k of envKeys) {
            const val = (process.env[k] || "").trim();
            if (val.startsWith("AIza") && val.length >= 35) {
                console.log(`[Key Diagnostic] Using real Google key from env: ${k}`);
                return val;
            }
        }

        // 3. Fallback
        const fallback = (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || "").trim();
        if (fallback && !isPlaceholder(fallback)) {
            console.log(`[Key Diagnostic] Using fallback env key: ${fallback.slice(0, 4)}...${fallback.slice(-4)}`);
            return fallback;
        }

        console.log(`[Key Diagnostic] No valid key found. Headers had: ${headerKey ? "present" : "empty"}`);
        return "";
    };

    // ─── HEALTH ────────────────────────────────────────────────────────────────
    app.get('/api/health', (req, res) => {
        const key = getGeminiKey();
        res.json({ 
            status: 'ok', 
            hasKey: key.length > 0,
            keyNamesChecked: ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY'],
            uptime: process.uptime(),
            env: process.env.NODE_ENV
        });
    });

    // ─── AUTOPILOT ROUTES ──────────────────────────────────────────────────────
    // Diagnostic - already at line 35
    
    app.post('/api/autopilot/generate-plan', async (req: any, res: any) => {
        console.log("[Autopilot] generate-plan request received");
        try {
            const { prompt, images, viralMode } = req.body;
            const apiKey = getGeminiKey(req);
            
            if (!apiKey) {
                return res.status(401).json({ 
                    error: "Nenhuma chave Gemini válida encontrada.",
                    details: "Se você estiver no AI Studio, selecione uma chave no menu de configurações (ícone de engrenagem). No servidor, as chaves detectadas parecem ser placeholders."
                });
            }
            
            const ai = new GoogleGenAI({ apiKey });
            const imageParts = images ? images.map((f: string) => ({
                inlineData: { mimeType: 'image/jpeg', data: f }
            })) : [];

            console.log(`[Autopilot Plan] Calling Gemini 3 Flash Preview`);
            const scriptResponse = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        ...imageParts
                    ]
                }],
                config: { 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            script: { type: Type.STRING },
                            scenes: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        time: { type: Type.STRING },
                                        action: { type: Type.STRING },
                                        stockTopic: { type: Type.STRING }
                                    },
                                    required: ["time", "action"]
                                }
                            },
                            sfx: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        },
                        required: ["script", "scenes"]
                    }
                }
            });

            const text = scriptResponse.text;
            if (!text) throw new Error("A IA retornou uma resposta vazia.");
            
            const jsonStr = text.replace(/```json\n?|```/g, '').trim();
            
            try {
                res.json(JSON.parse(jsonStr));
            } catch (err) {
                console.error("[Autopilot Plan] JSON Parse Error. Raw Text:", text);
                res.status(500).json({ 
                    error: "A resposta da IA não está em um formato válido.", 
                    details: err instanceof Error ? err.message : String(err),
                    raw: text.slice(0, 500) 
                });
            }
        } catch (e: any) {
            console.error('[Autopilot Plan] Failed:', e);
            // If e contains a JSON error from Google, try to parse it to make it more readable
            let errorMsg = e.message;
            try {
                if (errorMsg.startsWith('{')) {
                    const parsed = JSON.parse(errorMsg);
                    if (parsed.error?.message) errorMsg = parsed.error.message;
                }
            } catch(ex) {}
            res.status(500).json({ error: errorMsg });
        }
    });

    app.post('/api/autopilot/generate-tts', async (req: any, res: any) => {
        console.log("[Autopilot] generate-tts request received");
        try {
            const { text: ttsText, voice, accentPrompt } = req.body;
            const apiKey = getGeminiKey(req);
            
            if (!apiKey) {
                return res.status(401).json({ 
                    error: "Chave Gemini não encontrada para narração.",
                    details: "Certifique-se de que uma Chave de API válida esteja selecionada ou configurada."
                });
            }
            const ai = new GoogleGenAI({ apiKey });

            console.log(`[Autopilot TTS] Calling Gemini 3.1 Flash for TTS: ${voice}`);
            const ttsResponse = await ai.models.generateContent({
                model: "gemini-3.1-flash-tts-preview",
                contents: [{
                    role: 'user',
                    parts: [{ text: `Say with ${accentPrompt}: ${ttsText}` }]
                }],
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voice || 'live' },
                        },
                    },
                },
            });

            const audioPart = ttsResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            const audioBase64 = audioPart?.inlineData?.data;

            if (!audioBase64) throw new Error("A IA gerou uma narração vazia.");

            res.json({ audioBase64 });
        } catch (e: any) {
            console.error('[Autopilot TTS] Failed:', e);
            let errorMsg = e.message;
            try {
                if (errorMsg.startsWith('{')) {
                    const parsed = JSON.parse(errorMsg);
                    if (parsed.error?.message) errorMsg = parsed.error.message;
                }
            } catch(ex) {}
            res.status(500).json({ error: errorMsg });
        }
    });

    // ─── FFPROBE HELPER ────────────────────────────────────────────────────────
    const getStreamInfo = (filePath: string): Promise<{ hasAudio: boolean; hasVideo: boolean }> => {
        return new Promise((resolve) => {
            const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', filePath]);
            let output = '';
            ffprobe.stdout.on('data', (d: Buffer) => output += d);
            ffprobe.on('close', () => {
                try {
                    const json = JSON.parse(output);
                    resolve({
                        hasAudio: json.streams?.some((s: any) => s.codec_type === 'audio') ?? false,
                        hasVideo: json.streams?.some((s: any) => s.codec_type === 'video') ?? false
                    });
                } catch { resolve({ hasAudio: false, hasVideo: false }); }
            });
            ffprobe.on('error', () => resolve({ hasAudio: false, hasVideo: false }));
        });
    };

    const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9._-]/gi, '_');

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
    });

    const uploadAny = multer({
        storage,
        limits: { fieldSize: 100 * 1024 * 1024, fileSize: 2048 * 1024 * 1024 }
    }).any();

    const uploadSingle = multer({ storage }).single('file');

    // ─── PROXY VIDEO GENERATOR ─────────────────────────────────────────────────
    // Gera uma versão 360p comprimida do vídeo para uso no preview (como CapCut)
    const generateVideoProxy = async (inputPath: string, proxyPath: string): Promise<boolean> => {
        const streamInfo = await getStreamInfo(inputPath);
        if (!streamInfo.hasVideo) {
            console.log(`[Proxy] Skipping proxy for ${path.basename(inputPath)}: No video stream found.`);
            return false;
        }

        return new Promise((resolve) => {
            const args = [
                '-i', inputPath,
                '-vf', 'scale=trunc(oh*a/2)*2:360',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-c:a', 'aac',
                '-b:a', '64k',
                '-movflags', '+faststart',
                '-y', proxyPath
            ];
            const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'warning', ...args]);
            let stderr = '';
            ffmpeg.stderr.on('data', (d) => stderr += d.toString());
            
            ffmpeg.on('close', (code) => {
                if (code === 0 && fs.existsSync(proxyPath) && fs.statSync(proxyPath).size > 100) {
                    console.log(`[Proxy] Generated: ${path.basename(proxyPath)}`);
                    resolve(true);
                } else {
                    console.warn(`[Proxy] Failed to generate for ${path.basename(inputPath)}. Code: ${code}. Error: ${stderr}`);
                    if (fs.existsSync(proxyPath)) fs.unlinkSync(proxyPath);
                    resolve(false);
                }
            });
            ffmpeg.on('error', (err) => {
                console.error("[Proxy] FFmpeg spawn error:", err);
                resolve(false);
            });
        });
    };

    // ─── UPLOAD COM PROXY ──────────────────────────────────────────────────────
    // Nova rota: faz upload e gera proxy automaticamente para vídeos
    app.post('/api/upload', uploadSingle, async (req: any, res: any) => {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const result: any = {
            success: true,
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path,
            proxyUrl: null
        };

        // Gerar proxy apenas para vídeos
        const isVideo = req.file.mimetype.startsWith('video/');
        if (isVideo) {
            const proxyFilename = `proxy_${req.file.filename}`;
            const proxyPath = path.join(proxyDir, proxyFilename);
            try {
                const success = await generateVideoProxy(req.file.path, proxyPath);
                if (success) {
                    result.proxyUrl = `/api/proxy/video/${proxyFilename}`;
                    result.proxyPath = proxyPath;
                }
            } catch (e) {
                console.warn('[Proxy] Generation skipped (non-critical):', e);
            }
        }

        res.json(result);
    });

    // ─── SERVIR PROXY VIDEOS ───────────────────────────────────────────────────
    app.get('/api/proxy/video/:filename', (req: any, res: any) => {
        const filename = sanitizeFilename(req.params.filename);
        const proxyPath = path.join(proxyDir, filename);

        if (!fs.existsSync(proxyPath)) {
            return res.status(404).send('Proxy not found');
        }

        // res.sendFile lida automaticamente com Accept-Ranges: bytes e compressão
        const stats = fs.statSync(proxyPath);
        res.sendFile(proxyPath, {
            maxAge: 3600000, // cache 1h
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': stats.size,
                'Access-Control-Allow-Origin': '*',
                'Accept-Ranges': 'bytes'
            }
        }, (err) => {
            if (err) {
                console.error(`[Proxy] Erro ao enviar proxy ${filename}:`, err);
            }
        });
    });

    // ─── GERAR PROXY PARA ARQUIVO JÁ EXISTENTE ────────────────────────────────
    app.post('/api/proxy/generate', uploadAny, async (req: any, res: any) => {
        const files = (req as any).files || [];
        const file = files[0];
        if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

        const isVideo = file.mimetype.startsWith('video/');
        if (!isVideo) return res.json({ proxyUrl: null, message: 'Não é vídeo, proxy não necessário' });

        const proxyFilename = `proxy_${file.filename}`;
        const proxyPath = path.join(proxyDir, proxyFilename);

        try {
            const success = await generateVideoProxy(file.path, proxyPath);
            // Cleanup temp file uploaded for proxy generation
            try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch(e) {}
            
            if (success) {
                res.json({ proxyUrl: `/api/proxy/video/${proxyFilename}`, success: true });
            } else {
                res.json({ proxyUrl: null, success: false, message: 'Falha na geração do proxy' });
            }
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── JOB STORE ────────────────────────────────────────────────────────────
    const jobs: Record<string, any> = {};

    setInterval(() => {
        const now = Date.now();
        Object.keys(jobs).forEach(id => {
            if (now - jobs[id].startTime > 3600000) {
                if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) {
                    try { fs.unlinkSync(jobs[id].outputPath); } catch(e) {}
                }
                delete jobs[id];
            }
        });
    }, 3600000);

    function timeToSeconds(timeStr: string): number {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        if (parts.length !== 3) return 0;
        return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
    }

    function createFFmpegJob(jobId: string, args: string[], expectedDuration: number, res?: any) {
        if (!jobs[jobId]) jobs[jobId] = { id: jobId, startTime: Date.now() };
        jobs[jobId].status = 'processing';
        jobs[jobId].progress = 0;

        if (res && !res.headersSent) res.status(202).json({ jobId });

        let finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats'];
        const improvedArgs: string[] = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '-i') improvedArgs.push('-thread_queue_size', '1024');
            improvedArgs.push(args[i]);
        }
        finalArgs = [...finalArgs, ...improvedArgs];

        console.log(`[Job ${jobId}] Spawning FFmpeg...`);

        try {
            const ffmpeg = spawn('ffmpeg', finalArgs);
            let stderr = '';
            ffmpeg.stderr.on('data', (d: Buffer) => {
                const line = d.toString();
                stderr += line;
                const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                if (timeMatch && expectedDuration > 0) {
                    const t = timeToSeconds(timeMatch[1]);
                    const p = Math.round((t / expectedDuration) * 100);
                    if (jobs[jobId]) jobs[jobId].progress = Math.min(99, Math.max(0, p));
                }
            });

            ffmpeg.on('error', (err: Error) => {
                console.error(`[Job ${jobId}] Spawn Error:`, err);
                if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = err.message; }
            });

            ffmpeg.on('close', (code: number) => {
                if (!jobs[jobId]) return;
                const fileExists = jobs[jobId].outputPath && fs.existsSync(jobs[jobId].outputPath);
                const fileSize = fileExists ? fs.statSync(jobs[jobId].outputPath).size : 0;
                const hasValidContent = fileSize > 100;
                const isSuccess = (code === 0 && hasValidContent) || (fileSize > 1024 && hasValidContent);

                if (isSuccess) {
                    console.log(`[Job ${jobId}] Success. Size: ${fileSize} bytes`);
                    jobs[jobId].status = 'completed';
                    jobs[jobId].progress = 100;
                    jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
                } else {
                    console.error(`[Job ${jobId}] Failed. Code: ${code}. File Size: ${fileSize}`, stderr);
                    jobs[jobId].status = 'failed';
                    jobs[jobId].error = `Erro ao renderizar. Código: ${code}. ` + (stderr.slice(-100) || 'Verifique logs.');
                    if (fileExists) try { fs.unlinkSync(jobs[jobId].outputPath); } catch(e) {}
                }
            });
        } catch (e: any) {
            console.error(`[Job ${jobId}] Fatal Error:`, e);
            if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = 'Erro crítico no servidor: ' + e.message; }
        }
    }

    // ─── AUDIO MERGE ──────────────────────────────────────────────────────────
    app.post('/api/process/start/audio-merge-real', uploadAny, async (req: any, res: any) => {
        const jobId = `audiomerge_${Date.now()}`;
        const params = req.body;
        const job: any = { id: jobId, status: 'processing', progress: 0, startTime: Date.now() };
        jobs[jobId] = job;
        res.status(202).json({ jobId });

        try {
            const files = (req as any).files || [];
            if (files.length === 0) throw new Error('Nenhum arquivo enviado para mixagem.');
            const outputPath = path.join(uploadDir, `sonora_${Date.now()}.wav`);
            job.outputPath = outputPath;

            const inputs: string[] = [];
            const filterItems: string[] = [];
            const clipsInfo = params.clips ? JSON.parse(params.clips) : [];

            files.forEach((file: any, i: number) => {
                inputs.push('-i', file.path);
                const clipData = clipsInfo.find((c: any) => c.fileName === file.originalname) || {};
                const delayMs = Math.round((clipData.start || 0) * 1000);
                const volume = clipData.volume !== undefined ? clipData.volume : 1;
                const trimStart = clipData.mediaStartOffset || 0;
                const trimDur = clipData.duration || 10;
                filterItems.push(`[${i}:a]atrim=start=${trimStart}:duration=${trimDur},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
            });

            const filterComplex = `${filterItems.join(';')};${filterItems.map((_: any, i: number) => `[a${i}]`).join('')}amix=inputs=${files.length}:duration=longest:dropout_transition=0:normalize=0[out]`;
            const args = [...inputs, '-filter_complex', filterComplex, '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '44100', '-y', outputPath];
            const totalDuration = clipsInfo.reduce((max: number, c: any) => Math.max(max, (c.start || 0) + (c.duration || 0)), 10);
            createFFmpegJob(jobId, args, totalDuration);
        } catch (e: any) {
            console.error('[Audio Merge] Failed:', e);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = e.message;
        }
    });

    // ─── PROCESS ACTIONS ──────────────────────────────────────────────────────
    app.post('/api/process/start/:action', uploadAny, async (req: any, res: any) => {
        const action = req.params.action;
        const jobId = `${action}_${Date.now()}`;
        const job: any = { id: jobId, status: 'pending', files: (req as any).files || [], params: req.body, startTime: Date.now() };
        jobs[jobId] = job;

        const file = job.files[0];
        if (!file) { job.status = 'failed'; return res.status(400).json({ error: 'Ficheiro não encontrado' }); }

        const streamInfo = await getStreamInfo(file.path);
        job.params.hasAudio = streamInfo.hasAudio;
        job.params.hasVideo = streamInfo.hasVideo;

        setTimeout(() => {
            let ext = '.mp4';
            const isAudioAction = action === 'extract-audio' || action.includes('voice') || action.includes('noise') || action.includes('silence');
            if (file.mimetype.startsWith('audio') || (isAudioAction && !streamInfo.hasVideo)) ext = '.mp3';
            const outputPath = path.join(uploadDir, `${action}-${Date.now()}${ext}`);
            job.outputPath = outputPath;

            let args: string[] = [];
            if (action.includes('extract-audio')) {
                args = ['-i', file.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
                createFFmpegJob(jobId, args, 10, res);
            } else {
                const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, job.params, file.path);
                args = ['-i', file.path];
                if (filterComplex) args.push('-filter_complex', filterComplex);
                if (mapArgs && mapArgs.length) args.push(...mapArgs);
                else if (!filterComplex) {
                    if (streamInfo.hasVideo) args.push('-c:v', 'copy');
                    if (streamInfo.hasAudio) args.push('-c:a', 'copy');
                }
                if (outputOptions && outputOptions.length) args.push(...outputOptions);
                if (ext === '.mp3') {
                    args = args.filter((a: string) => a !== '0:v' && a !== '-map');
                    if (filterComplex && !args.includes('-map')) args.push('-map', '[a]');
                    args.push('-vn');
                }
                args.push('-y', outputPath);
                createFFmpegJob(jobId, args, 10, res);
            }
        }, 100);
    });

    // ─── AI VIDEO GENERATION ──────────────────────────────────────────────────
    app.post('/api/ai/generate-video', async (req: any, res: any) => {
        const jobId = `aivideo_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
        res.status(202).json({ jobId });

        const { prompt, aspectRatio, resolution, model, image, lastFrame, referenceImages, apiKey } = req.body;
        const finalKey = apiKey || getGeminiKey();

        if (!finalKey) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = 'Chave API não configurada no servidor.';
            return;
        }

        try {
            console.log(`[Job ${jobId}] Starting AI Generation...`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'veo-3.1-lite-generate-preview'}:generateVideo?key=${finalKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt, aspectRatio, resolution,
                    image: image ? { data: image.split(',')[1], mimeType: 'image/png' } : undefined,
                    lastFrame: lastFrame ? { data: lastFrame.split(',')[1], mimeType: 'image/png' } : undefined,
                    referenceImages: referenceImages ? referenceImages.map((img: string) => ({ data: img.split(',')[1], mimeType: 'image/png' })) : undefined
                })
            });

            if (!response.ok) {
                const err = await response.json() as any;
                throw new Error(err.error?.message || 'Erro na API Gemini');
            }

            const data = await response.json() as any;
            const operationName = data.name;
            let completed = false;
            let attempts = 0;
            const maxAttempts = 60;

            while (!completed && attempts < maxAttempts) {
                attempts++;
                await new Promise(r => setTimeout(r, 5000));
                const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${finalKey}`);
                const pollData = await pollRes.json() as any;
                if (jobs[jobId]) jobs[jobId].progress = Math.min(95, 10 + (attempts * 1.5));

                if (pollData.done) {
                    completed = true;
                    if (pollData.error) throw new Error(pollData.error.message);
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
            if (!completed) throw new Error('Tempo limite de geração excedido.');
        } catch (e: any) {
            console.error(`[Job ${jobId}] AI Gen Failed:`, e);
            if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = e.message; }
        }
    });

    // Recebe os arquivos do usuário + plano gerado pela IA e monta o vídeo final
    app.post('/api/autopilot/render', uploadAny, async (req: any, res: any) => {
        const jobId = `autopilot_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
        res.status(202).json({ jobId });

        try {
            const files: any[] = (req as any).files || [];
            const plan = JSON.parse(req.body.plan || '{}');
            const stockFiles = JSON.parse(req.body.stockFiles || '[]');
            const narrationFile = req.body.narrationFile; // filename salvo em uploads/

            if (!plan.scenes || plan.scenes.length === 0) {
                throw new Error('Plano de cenas inválido ou vazio.');
            }

            const uploadedDir = uploadDir;
            const outputPath = path.join(uploadedDir, `autopilot_${Date.now()}.mp4`);
            jobs[jobId].outputPath = outputPath;

            // Mapear arquivos enviados pelo index
            const fileMap: Record<number, string> = {};
            files.forEach((f: any, i: number) => { fileMap[i] = f.path; });

            // Mapear stock files pelo nome
            const stockMap: Record<string, string> = {};
            stockFiles.forEach((s: any) => {
                if (s && s.filename) {
                    stockMap[s.originalname || s.filename] = path.join(uploadedDir, s.filename);
                }
            });

            // Narração
            const narrationPath = narrationFile ? path.join(uploadedDir, narrationFile) : null;

            // Construir inputs e filter_complex para o FFmpeg
            const inputs: string[] = [];
            const filterParts: string[] = [];
            const videoLabels: string[] = [];
            let inputIdx = 0;

            // Adicionar narração primeiro se existir
            let narrationInputIdx = -1;
            if (narrationPath && fs.existsSync(narrationPath)) {
                inputs.push('-i', narrationPath);
                narrationInputIdx = inputIdx++;
            }

            // Processar cada cena do plano
            for (let i = 0; i < plan.scenes.length; i++) {
                const scene = plan.scenes[i];
                let filePath = '';

                // Tentar usar arquivo do usuário pelo índice
                if (scene.fileIndex !== undefined && fileMap[scene.fileIndex]) {
                    filePath = fileMap[scene.fileIndex];
                }
                // Fallback: tentar stock file pelo tópico
                if (!filePath && scene.stockTopic) {
                    const stockKey = Object.keys(stockMap).find(k =>
                        k.toLowerCase().includes(scene.stockTopic?.toLowerCase() || '')
                    );
                    if (stockKey) filePath = stockMap[stockKey];
                }
                // Fallback: qualquer arquivo disponível
                if (!filePath && Object.keys(fileMap).length > 0) {
                    filePath = fileMap[i % Object.keys(fileMap).length];
                }

                if (!filePath || !fs.existsSync(filePath)) continue;

                inputs.push('-i', filePath);
                const vIdx = inputIdx++;

                const startTime = scene.startTime || 0;
                const duration = scene.duration || 3;
                const sceneLabel = `scene_v${i}`;

                // Aplicar trim, scale, efeito e formato
                let filterChain = `[${vIdx}:v]trim=start=${startTime}:duration=${duration},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1:color=black,setsar=1,fps=30,format=yuv420p`;

                // Aplicar filtro de efeito se existir
                if (scene.filter) {
                    const effectMap: Record<string, string> = {
                        'vivid': 'eq=saturation=1.5:contrast=1.1',
                        'noir': 'hue=s=0,eq=contrast=1.5',
                        'warm': 'colorbalance=rs=0.1:bs=-0.1',
                        'cool': 'colorbalance=bs=0.1:rs=-0.1',
                        'vintage': 'sepia=0.6,eq=contrast=0.9',
                        'dreamy': 'boxblur=luma_radius=2:luma_power=1',
                        'sharp': 'unsharp=5:5:1.5:5:5:0.0'
                    };
                    if (effectMap[scene.filter]) filterChain += `,${effectMap[scene.filter]}`;
                }

                filterParts.push(`${filterChain}[${sceneLabel}]`);
                videoLabels.push(`[${sceneLabel}]`);
            }

            if (videoLabels.length === 0) throw new Error('Nenhuma cena válida para renderizar.');

            jobs[jobId].progress = 30;

            // Concatenar todas as cenas
            const concatLabel = '[final_v]';
            filterParts.push(`${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0${concatLabel}`);

            let filterComplex = filterParts.join(';');
            const mapArgs: string[] = ['-map', concatLabel];

            // Adicionar narração se disponível
            if (narrationInputIdx >= 0) {
                mapArgs.push('-map', `${narrationInputIdx}:a`);
            }

            const args = [
                ...inputs,
                '-filter_complex', filterComplex,
                ...mapArgs,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-r', '30',
                '-vsync', '1',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-ac', '2',
                '-ar', '44100',
                '-movflags', '+faststart',
                '-max_muxing_queue_size', '4096',
                '-y', outputPath
            ];

            createFFmpegJob(jobId, args, plan.scenes.reduce((s: number, sc: any) => s + (sc.duration || 3), 0));

        } catch (e: any) {
            console.error('[Autopilot] Failed:', e);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = e.message;
        }
    });

    // ─── EXPORT ───────────────────────────────────────────────────────────────
    app.post('/api/export/start', uploadAny, (req: any, res: any) => {
        const jobId = `export_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'pending', files: (req as any).files || [], params: req.body, startTime: Date.now() };
        res.status(202).json({ jobId });

        setTimeout(() => {
            handleExportVideo(jobs[jobId], uploadDir, (id: string, args: string[], dur: number) => {
                const safeArgs = [...args, '-max_muxing_queue_size', '4096'];
                createFFmpegJob(id, safeArgs, dur);
            }).catch((err: Error) => {
                if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = 'Configuração do Export falhou: ' + err.message; }
            });
        }, 100);
    });

    // ─── STATUS / DOWNLOAD ────────────────────────────────────────────────────
    app.get('/api/process/status/:jobId', (req: any, res: any) => {
        const job = jobs[req.params.jobId];
        if (!job) return res.status(404).json({ status: 'not_found' });
        res.json(job);
    });

    app.get('/api/process/download/:jobId', (req: any, res: any) => {
        const job = jobs[req.params.jobId];
        if (job && job.outputPath && fs.existsSync(job.outputPath) && fs.statSync(job.outputPath).size > 0) {
            res.setHeader('Content-Disposition', `attachment; filename="proedit_export_${Date.now()}.mp4"`);
            res.download(job.outputPath);
        } else {
            res.status(404).send('Arquivo indisponível ou vazio.');
        }
    });

    // ─── PROXY MEDIA (externo) ────────────────────────────────────────────────
    app.get('/api/proxy/media', async (req: any, res: any) => {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL missing');
        const decodedUrl = decodeURIComponent(url as string);
        const protocol = decodedUrl.startsWith('https') ? https : http;
        protocol.get(decodedUrl, (apiRes: any) => {
            if (apiRes.statusCode !== 200) return res.status(apiRes.statusCode || 500).send('Proxy error');
            if (apiRes.headers['content-type']) res.setHeader('Content-Type', apiRes.headers['content-type']);
            apiRes.pipe(res);
        }).on('error', () => res.status(500).send('Request error'));
    });

    // ─── STOCK DOWNLOAD ───────────────────────────────────────────────────────
    app.get('/api/stock/download', async (req: any, res: any) => {
        const { query, type = 'video' } = req.query;
        const pexelsKey = process.env.PEXELS_API_KEY;
        if (!pexelsKey) return res.status(500).json({ error: 'Pexels API Key not configured' });

        try {
            const endpoint = type === 'video'
                ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query as string)}&per_page=1&orientation=landscape`
                : `https://api.pexels.com/v1/search?query=${encodeURIComponent(query as string)}&per_page=1`;

            const searchRes = await fetch(endpoint, { headers: { Authorization: pexelsKey } });
            const data = await searchRes.json() as any;

            let mediaUrl = '';
            let originalName = '';

            if (type === 'video' && data.videos?.[0]) {
                const video = data.videos[0];
                const file = video.video_files.find((f: any) => f.quality === 'hd' || f.quality === 'sd') || video.video_files[0];
                mediaUrl = file.link;
                originalName = `pexels_${video.id}.mp4`;
            } else if (type === 'image' && data.photos?.[0]) {
                const photo = data.photos[0];
                mediaUrl = photo.src.large2x || photo.src.large;
                originalName = `pexels_${photo.id}.jpg`;
            }

            if (!mediaUrl) return res.status(404).json({ error: 'No media found' });

            const filename = `stock_${Date.now()}_${originalName}`;
            const filePath = path.join(uploadDir, filename);
            const fileRes = await fetch(mediaUrl);
            const buffer = Buffer.from(await fileRes.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            res.json({ success: true, filename, originalname: originalName, path: filePath });
        } catch (e: any) {
            console.error('[Stock Download] Failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // ─── SAVE AUDIO ───────────────────────────────────────────────────────────
    app.post('/api/save-audio', express.json({ limit: '50mb' }), (req: any, res: any) => {
        const { audioData, filename } = req.body;
        if (!audioData) return res.status(400).send('No audio data');
        const filePath = path.join(uploadDir, filename || `tts_${Date.now()}.wav`);

        try {
            let buffer = Buffer.from(audioData, 'base64');
            if (filePath.endsWith('.wav') && buffer.length > 0 && buffer.slice(0, 4).toString() !== 'RIFF') {
                const sampleRate = 24000;
                const numChannels = 1;
                const bitsPerSample = 16;
                const header = Buffer.alloc(44);
                header.write('RIFF', 0);
                header.writeUInt32LE(36 + buffer.length, 4);
                header.write('WAVE', 8);
                header.write('fmt ', 12);
                header.writeUInt32LE(16, 16);
                header.writeUInt16LE(1, 20);
                header.writeUInt16LE(numChannels, 22);
                header.writeUInt32LE(sampleRate, 24);
                header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
                header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
                header.writeUInt16LE(bitsPerSample, 34);
                header.write('data', 36);
                header.writeUInt32LE(buffer.length, 40);
                buffer = Buffer.concat([header, buffer]);
            }
            fs.writeFileSync(filePath, buffer);
            res.json({ success: true, path: filePath, filename: path.basename(filePath), size: buffer.length });
        } catch (e: any) {
            console.error('[Audio] Save failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // ─── CHECK FFMPEG ─────────────────────────────────────────────────────────
    app.get('/api/check-ffmpeg', (req: any, res: any) => {
        const check = spawn('ffmpeg', ['-version']);
        check.on('error', () => res.status(500).send('FFmpeg Missing'));
        check.on('close', (code: number) => { if (code === 0) res.send('OK'); else res.status(500).send('FFmpeg Error'); });
    });

    // ─── FRONTEND ─────────────────────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req: any, res: any) => res.sendFile(path.join(distPath, 'index.html')));
    }

    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
