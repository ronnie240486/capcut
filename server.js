import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, exec, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality, Type } from "@google/genai";

// Engine Imports
import { handleExportVideo } from './video-engine/export-video.js';
import filterBuilder from './video-engine/filter-logic.js';
import voiceAutomation from './video-engine/voice-automation.js';

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

async function startServer() {
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-epidemic-token', 'x-pexels-api-key', 'x-pixabay-api-key', 'x-unsplash-api-key']
    }));

    app.use(express.json({ limit: '1gb' }));
    app.use(express.urlencoded({ extended: true, limit: '1gb' }));

    // Helper for safe JSON parsing in Node environment
    async function safeJson(response: any) {
        try {
            const text = await response.text();
            if (!text || text.trim() === "") return null;
            return JSON.parse(text);
        } catch (e) {
            console.error("[safeJson Server] Parse Error:", e);
            return null;
        }
    }

    // Proxy para Freesound para evitar CORS
    app.get('/api/sound-search', async (req: any, res: any) => {
        const { q, key, page = 1 } = req.query;
        const token = key; 
        
        if (!q || !token) {
            console.error('[Sound Search] Missing q or key');
            return res.status(400).json({ error: 'Missing query or key. Verifique sua chave API nas configurações.' });
        }
        
        console.log(`[Sound Search] Received request for: ${q} with key length: ${token.length} page: ${page}`);
        
        try {
            const endpoint = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q as string)}&token=${token}&fields=id,name,previews,duration,username&page=${page}&page_size=6`;
            console.log(`[Sound Search] Requesting Freesound: ${endpoint}`);
            
            const searchRes = await fetch(endpoint, {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });

            const contentType = searchRes.headers.get('content-type') || '';
            console.log(`[Sound Search] Freesound status: ${searchRes.status}, Content-Type: ${contentType}`);

            if (!searchRes.ok) {
                const text = await searchRes.text();
                console.error(`[Sound Search] Error from Freesound: ${searchRes.status}. Body: ${text.substring(0, 500)}`);
                
                // Return a 200 with an error object to avoid triggering "safeJson" 403 warning on client if we can
                // but let's stick to correct status for now but ensure it's JSON
                return res.status(searchRes.status === 403 ? 403 : 500).json({ 
                    error: `Freesound Error ${searchRes.status}`, 
                    details: text.includes('<html>') ? 'Access Blocked by Freesound Firewall (403)' : text.substring(0, 200),
                    isFreesoundBlocking: searchRes.status === 403
                });
            }

            if (!contentType.includes('application/json')) {
                const text = await searchRes.text();
                console.error(`[Sound Search] Expected JSON but got: ${contentType}`);
                return res.status(500).json({ error: 'Freesound returned non-JSON response' });
            }

            const data = await safeJson(searchRes);
            if (!data) {
                return res.status(500).json({ error: 'Failed to parse Freesound JSON' });
            }
            
            res.json(data);
        } catch (e: any) {
            console.error('[Sound Search] Critical Failure:', e);
            res.status(500).json({ error: 'Search failed in proxy', details: e.message });
        }
    });

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
        // 1. Header Priority (from Frontend - AI Studio selected keys)
        const headerKey = (req?.headers['x-gemini-api-key'] || req?.headers['authorization']?.toString().replace('Bearer ', '') || "").toString().trim();
        
        const isPlaceholder = (v: string) => {
            const up = (v || "").toUpperCase();
            return !v || up.includes("YOUR_") || up.includes("REPLACE") || up === "UNDEFINED" || up === "NULL";
        };

        if (headerKey && !isPlaceholder(headerKey)) {
            return headerKey;
        }

        // 2. Direct Env Variable (Priority)
        const directKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || "").trim();
        if (directKey && !isPlaceholder(directKey)) {
            return directKey;
        }

        // 3. Scan all Env Variables for anything starting with AIza
        const envKeys = Object.keys(process.env);
        for (const k of envKeys) {
            const val = (process.env[k] || "").trim();
            if (val.startsWith("AIza") && val.length >= 35) {
                return val;
            }
        }

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
                    details: "Para resolver: 1. No AI Studio, clique no ícone de engrenagem e selecione uma chave API. 2. Se estiver rodando localmente/firebase, defina a variável de ambiente GEMINI_API_KEY com sua chave do Google AI Studio."
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
                            script: { type: Type.STRING, description: "Full narration script" },
                            nuance: { type: Type.STRING, description: "Selected human nuance ID" },
                            scenes: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        duration: { type: Type.NUMBER, description: "Duration in seconds" },
                                        action: { type: Type.STRING, description: "Description of visuals" },
                                        fileIndex: { type: Type.NUMBER, description: "Index of user file to use" },
                                        filter: { type: Type.STRING, description: "Visual filter to apply" },
                                        transition: { type: Type.STRING, description: "Transition type (fade, zoom, none)" },
                                        movement: { type: Type.STRING, description: "Movement type (zoom_in, zoom_out, pan_left, pan_right, static)" },
                                        subtitle: { type: Type.STRING, description: "The EXACT text from the 'script' spoken during this scene. Do not summarize." },
                                        sfx: { type: Type.STRING, description: "Sound effect description" },
                                        stockTopic: { type: Type.STRING, description: "Topic for stock footage if user clip is missing" }
                                    },
                                    required: ["duration", "action", "subtitle"]
                                }
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
            const { text: ttsText, voice, accentPrompt, nuance, emotion } = req.body;
            const apiKey = getGeminiKey(req);
            
            // Nuance mapping
            const NUANCES: Record<string, string> = {
                'breath': 'Include deep natural breaths between sentences.',
                'cough': 'Add occasional light throat clears.',
                'throat': 'Clear your throat slightly before starting.',
                'chuckle': 'Include subtle chuckles when appropriate.',
                'sigh': 'Add audible weary sighs.',
                'hesitate': 'Add natural "um" or slight pauses as if thinking.',
                'smack': 'Add subtle lip smacking.',
                'mutter': 'Slightly mutter at the ends of sentences.',
                'panting': 'Speak as if out of breath.',
                'stutter': 'Add very light occasional stuttering.',
                'whisper': 'Speak in a very low, quiet whisper.',
                'shout': 'Speak loudly, with high energy and intensity.',
                'cry': 'Speak with a trembling, tearful voice.',
                'laugh': 'Speak with constant joyful laughter embedded.',
                'scared': 'Speak with a fearful, trembling tone.',
                'angry': 'Speak with a sharp, aggressive, angry tone.',
                'serious': 'Speak with a very deep, professional, serious tone.',
                'friendly': 'Speak with a warm, welcoming, friendly tone.',
                'robotic': 'Speak with a monotone, rhythmic robotic cadence.',
                'childish': 'Speak with a high-pitched, playful childish voice.'
            };

            const EMOTIONS: Record<string, string> = {
                'neutral': 'Natural and balanced tone.',
                'happy': 'Cheerful, upbeat, and joyful tone.',
                'sad': 'Melancholic, low-energy, and sorrowful tone.',
                'angry': 'Aggressive, sharp, and forceful tone.',
                'surprised': 'Shocked, high-pitch, and wide-eyed tone.',
                'fearful': 'Trembling, fast-paced, and scared tone.',
                'disgusted': 'Repelled, sharp, and negative tone.',
                'calm': 'Peaceful, steady, and relaxing tone.'
            };

            const selectedNuance = nuance && NUANCES[nuance] ? NUANCES[nuance] : "";
            const selectedEmotion = emotion && EMOTIONS[emotion] ? ` Emotion/Style: ${EMOTIONS[emotion]}` : "";
            const finalPrompt = `Prompt: ${accentPrompt}. ${selectedEmotion} ${selectedNuance}\nText to say: ${ttsText}`;

            if (!apiKey) {
                return res.status(401).json({ 
                    error: "Nenhuma chave Gemini válida encontrada.",
                    details: "Para resolver: 1. No AI Studio, clique no ícone de engrenagem e selecione uma chave API. 2. Se estiver rodando localmente/firebase, defina a variável de ambiente GEMINI_API_KEY com sua chave do Google AI Studio."
                });
            }
            const ai = new GoogleGenAI({ apiKey });

            console.log(`[Autopilot TTS] Calling Gemini 3.1 Flash for TTS: ${voice}`);
            const ttsResponse = await ai.models.generateContent({
                model: "gemini-3.1-flash-tts-preview",
                contents: [{
                    role: 'user',
                    parts: [{ text: finalPrompt }]
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

    // ─── CHUNKED UPLOAD TO BYPASS CLOUD RUN 32MB LIMIT ──────────────────────
    app.post('/api/upload-chunk', uploadAny, (req: any, res: any) => {
        try {
            const file = req.files && req.files.length > 0 ? req.files[0] : null;
            const filename = sanitizeFilename(req.body.filename);
            const index = parseInt(req.body.index);
            const total = parseInt(req.body.total);
            
            if (!file || !filename || isNaN(index) || isNaN(total)) {
                return res.status(400).json({ error: 'Missing parameters' });
            }

            const targetPath = path.join(uploadDir, filename);
            const chunkBuffer = fs.readFileSync(file.path);
            
            if (index === 0 && fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath); // Clear existing on first chunk
            }

            fs.appendFileSync(targetPath, chunkBuffer);
            fs.unlinkSync(file.path); // Remove temp chunk

            res.json({ success: true, index, total, complete: index === total - 1 });
        } catch (e: any) {
            console.error('[Chunk Upload] Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/check-file/:name', (req, res) => {
        const filePath = path.join(uploadDir, sanitizeFilename(req.params.name));
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            res.json({ exists: true, size: stats.size });
        } else {
            res.json({ exists: false, size: 0 });
        }
    });

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

        // Optimization: Use filter_complex_script if the filter is too long to avoid ARG_MAX issues
        // Limitation: Limit threads for Cloud Run stability
        // Adding probe limits to prevent runaway memory
        let finalArgs = [
            '-hide_banner', '-loglevel', 'error', '-stats', 
            '-threads', '1', 
            '-probesize', '1M', 
            '-analyzeduration', '1M',
            '-reinit_filter', '0', 
            '-hwaccel', 'none'
        ];
        const processedArgs: string[] = [];
        let filterScriptPath: string | null = null;

        for (let i = 0; i < args.length; i++) {
            // Lower threshold to 100 characters to ensure stability even with moderate filters
            if (args[i] === '-filter_complex' && args[i+1] && args[i+1].length > 100) {
                const filterContent = args[i+1];
                filterScriptPath = path.join(uploadDir, `filter_${jobId}_${Date.now()}.txt`);
                fs.writeFileSync(filterScriptPath, filterContent);
                processedArgs.push('-filter_complex_script', filterScriptPath);
                i++; // Skip the next arg as we handled it
            } else if (args[i] === '-i') {
                // Higher queue size to handle many inputs without blocking
                processedArgs.push('-thread_queue_size', '512', '-i');
            } else {
                processedArgs.push(args[i]);
            }
        }
        finalArgs = [...finalArgs, ...processedArgs];

        console.log(`[Job ${jobId}] Spawning FFmpeg (Args: ${finalArgs.length})...`);

        try {
            const ffmpeg = spawn('ffmpeg', finalArgs);
            let stderr = '';
            
            ffmpeg.stderr.on('data', (d: Buffer) => {
                const line = d.toString();
                // Limit stderr size to last 4KB to prevent OOM
                stderr = (stderr + line).slice(-4096);
                
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
                if (filterScriptPath && fs.existsSync(filterScriptPath)) fs.unlinkSync(filterScriptPath);
            });

            ffmpeg.on('close', (code: number, signal: string) => {
                if (filterScriptPath && fs.existsSync(filterScriptPath)) {
                    try { fs.unlinkSync(filterScriptPath); } catch(e) {}
                }
                
                if (!jobs[jobId]) return;
                const fileExists = jobs[jobId].outputPath && fs.existsSync(jobs[jobId].outputPath);
                const fileSize = fileExists ? fs.statSync(jobs[jobId].outputPath).size : 0;
                const hasValidContent = fileSize > 100;
                
                // If code is null and signal is present, it means the process was terminated (often SIGKILL/OOM)
                const wasKilled = code === null && !!signal;
                const isSuccess = (code === 0 && hasValidContent) || (fileSize > 1024 && hasValidContent && !wasKilled);

                if (isSuccess) {
                    console.log(`[Job ${jobId}] Success. Size: ${fileSize} bytes`);
                    jobs[jobId].status = 'completed';
                    jobs[jobId].progress = 100;
                    jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
                } else {
                    const errorMsg = wasKilled ? `Processo encerrado pelo sistema (${signal}). Tente reduzir a complexidade do vídeo.` : stderr.trim();
                    console.error(`[Job ${jobId}] Failed. Code: ${code}. Signal: ${signal}. File Size: ${fileSize}`, errorMsg);
                    jobs[jobId].status = 'failed';
                    jobs[jobId].error = `Erro ao renderizar. ` + (errorMsg.slice(-300) || 'Verifique sua timeline.');
                    if (fileExists) try { fs.unlinkSync(jobs[jobId].outputPath); } catch(e) {}
                }
            });
        } catch (e: any) {
            console.error(`[Job ${jobId}] Fatal Error:`, e);
            if (filterScriptPath && fs.existsSync(filterScriptPath)) try { fs.unlinkSync(filterScriptPath); } catch(ex) {}
            if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = 'Erro crítico no servidor: ' + e.message; }
        }
    }

    // ─── AUDIO MERGE ──────────────────────────────────────────────────────────
    app.post('/api/process/start/audio-merge-real', uploadAny, async (req: any, res: any) => {
        const jobId = `audiomerge_${Date.now()}`;
        const params = req.body;
        const job: any = { id: jobId, status: 'processing', progress: 0, startTime: Date.now(), friendlyName: 'Unificação de Áudio' };
        jobs[jobId] = job;
        res.status(202).json({ jobId });

        try {
            const uploadedFiles = (req as any).files || [];
            const clipsInfo = params.clips ? JSON.parse(params.clips) : [];
            const outputPath = path.join(uploadDir, `sonora_${Date.now()}.wav`);
            job.outputPath = outputPath;

            const inputs: string[] = [];
            const filterItems: string[] = [];
            let validInputs = 0;
            
            for (let i = 0; i < clipsInfo.length; i++) {
                const clip = clipsInfo[i];
                let filePath = '';
                
                const upFile = uploadedFiles.find((f: any) => f.originalname === clip.fileName);
                if (upFile) {
                    filePath = upFile.path;
                } else {
                    const existingPath = path.join(uploadDir, sanitizeFilename(clip.fileName));
                    if (fs.existsSync(existingPath)) {
                        filePath = existingPath;
                    }
                }

                if (!filePath) {
                    console.warn(`[AudioMerge] File not found: ${clip.fileName}`);
                    continue;
                }

                inputs.push('-i', filePath);
                const delayMs = Math.round((clip.start || 0) * 1000);
                const volume = clip.volume !== undefined ? clip.volume : 1;
                const trimStart = clip.mediaStartOffset || 0;
                const trimDur = clip.duration || 10;
                
                // Use validInputs as the index for the filter
                filterItems.push(`[${validInputs}:a]atrim=start=${trimStart}:duration=${trimDur},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[a${validInputs}]`);
                validInputs++;
            }

            if (validInputs === 0) throw new Error('Nenhum arquivo válido encontrado para mixagem.');

            let args: string[] = [];
            if (validInputs === 1) {
                // Single input, just apply filters without amix
                const filterComplex = `${filterItems[0]}`;
                args = [...inputs, '-filter_complex', filterComplex, '-map', '[a0]', '-c:a', 'pcm_s16le', '-ar', '44100', '-y', outputPath];
            } else {
                const filterComplex = `${filterItems.join(';')};${filterItems.map((_, i) => `[a${i}]`).join('')}amix=inputs=${validInputs}:duration=longest:dropout_transition=0:normalize=0[out]`;
                args = [...inputs, '-filter_complex', filterComplex, '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '44100', '-y', outputPath];
            }
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

        let file = job.files[0];
        if (!file && job.params.targetFileName) {
            const preUploadedPath = path.join(uploadDir, job.params.targetFileName);
            if (fs.existsSync(preUploadedPath)) {
                let ext = path.extname(job.params.targetFileName).toLowerCase();
                let mimetype = 'video/mp4';
                if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) mimetype = 'audio/mp3';
                else if (['.jpg', '.jpeg', '.png'].includes(ext)) mimetype = 'image/jpeg';
                
                file = {
                    path: preUploadedPath,
                    filename: job.params.targetFileName,
                    originalname: job.params.targetFileName,
                    mimetype: mimetype
                };
                job.files.push(file);
            }
        }

        if (!job.files.length && !action.includes('export') && !action.includes('unify-real')) {
             job.status = 'failed'; 
             return res.status(400).json({ error: 'Ficheiro não encontrado: ' + job.params.targetFileName }); 
        }

        let streamInfo = { hasAudio: false, hasVideo: false };
        if (file && !action.includes('export') && !action.includes('unify-real')) {
            const si = await getStreamInfo(file.path);
            streamInfo.hasAudio = si.hasAudio;
            streamInfo.hasVideo = si.hasVideo;
            job.params.hasAudio = streamInfo.hasAudio;
            job.params.hasVideo = streamInfo.hasVideo;
        }

        setTimeout(() => {
            let ext = '.mp4';
            const isAudioAction = action === 'extract-audio' || action.includes('voice') || action.includes('noise') || action.includes('silence');
            if ((file && file.mimetype && file.mimetype.startsWith('audio')) || (isAudioAction && !streamInfo.hasVideo)) ext = '.mp3';
            const outputPath = path.join(uploadDir, `${action}-${Date.now()}${ext}`);
            job.outputPath = outputPath;

            let args: string[] = [];
            const { filterComplex: fc, mapArgs, outputOptions } = filterBuilder.build(action, job.params, file.path);

            if (ext === '.mp3') {
                // Completely rebuild args for MP3 to avoid mapping errors
                const mp3Args = ['-i', file.path];
                if (fc) {
                    mp3Args.push('-filter_complex', fc, '-map', '[a]');
                } else {
                    mp3Args.push('-map', '0:a?');
                }
                mp3Args.push('-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath);
                createFFmpegJob(jobId, mp3Args, 10, res);
            } else {
                args = ['-i', file.path];
                if (fc) args.push('-filter_complex', fc);
                if (mapArgs && mapArgs.length) args.push(...mapArgs);
                else {
                    if (streamInfo.hasVideo) args.push('-c:v', 'copy');
                    if (streamInfo.hasAudio) args.push('-c:a', 'copy');
                }
                if (outputOptions && outputOptions.length) args.push(...outputOptions);
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
            const payload: any = {
                prompt,
                config: {
                    aspectRatio,
                    resolution,
                    numberOfVideos: 1
                }
            };

            if (image) {
                payload.image = { imageBytes: image.split(',')[1], mimeType: 'image/png' };
            }
            if (lastFrame) {
                payload.lastFrame = { imageBytes: lastFrame.split(',')[1], mimeType: 'image/png' };
            }
            if (referenceImages && referenceImages.length > 0) {
                payload.referenceImages = referenceImages.map((img: string) => ({ 
                    image: {
                        imageBytes: img.split(',')[1], 
                        mimeType: 'image/png' 
                    },
                    referenceType: 'ASSET'
                }));
            }

            console.log(`[Job ${jobId}] Starting AI Generation with model: ${model || 'veo-3.1-lite-generate-preview'}...`);
            let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'veo-3.1-lite-generate-preview'}:generateVideos?key=${finalKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // FALLBACK logic if 404 (Model Not Found)
            if (response.status === 404 && (!model || model === 'veo-3.1-lite-generate-preview')) {
                console.warn(`[Job ${jobId}] primary model 404-ed, trying fallback 'veo-lite-preview-001'...`);
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-lite-preview-001:generateVideos?key=${finalKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.status === 404) {
                    console.warn(`[Job ${jobId}] fallback 1 404-ed, trying fallback 'veo-lite-preview-012'...`);
                    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-lite-preview-012:generateVideos?key=${finalKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
            } else if (response.status === 404 && model === 'veo-3.1-generate-preview') {
                 console.warn(`[Job ${jobId}] pro model 404-ed, trying fallback 'veo-pro-preview-001'...`);
                 response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-pro-preview-001:generateVideos?key=${finalKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) {
                const errText = await response.text();
                console.error(`[Job ${jobId}] Gemini API Error (${response.status}):`, errText);
                let errMsg = 'Erro na API Gemini';
                try {
                    const err = JSON.parse(errText);
                    errMsg = err?.error?.message || err?.message || `${errMsg} (${response.status})`;
                } catch (e) {
                    errMsg = `${errMsg} (${response.status}: ${errText.substring(0, 150)})`;
                }
                throw new Error(errMsg);
            }

            const dataContent = await response.text();
            let data: any = null;
            try {
                data = JSON.parse(dataContent);
            } catch (e) {
                console.error(`[Job ${jobId}] Failed to parse successful response:`, dataContent);
                throw new Error('Falha ao processar resposta de sucesso da API Gemini (JSON inválido)');
            }

            if (!data || !data.name) {
                console.error(`[Job ${jobId}] Unexpected response structure:`, data);
                throw new Error('Resposta inesperada da API Gemini (operation name missing)');
            }

            const operationName = data.name;
            let completed = false;
            let attempts = 0;
            const maxAttempts = 60;

            while (!completed && attempts < maxAttempts) {
                attempts++;
                await new Promise(r => setTimeout(r, 5000));
                const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${finalKey}`);
                const pollData = await safeJson(pollRes);
                if (!pollData) {
                    attempts++;
                    continue;
                }
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

                if (!filePath || !fs.existsSync(filePath)) {
                    // Fallback se o arquivo não existir: usar um fundo colorido com o tema da cena
                    const duration = scene.duration || 3;
                    const sceneLabel = `scene_v${i}`;
                    const colors = ['darkblue', 'darkgreen', 'darkred', 'purple', 'black'];
                    const color = colors[i % colors.length];
                    
                    let filterChain = `color=c=${color}:s=1280x720:d=${duration}[vbg${i}];[vbg${i}]setsar=1`;
                    
                    // Se tiver subtitle, já colocamos aqui também para não ficar totalmente vazio
                    if (scene.subtitle) {
                        const cleanSub = scene.subtitle
                            .replace(/\\/g, '\\\\\\\\')
                            .replace(/'/g, "'\\''")
                            .replace(/:/g, '\\:')
                            .toUpperCase();
                        const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
                        const fontArg = fs.existsSync(fontPath) ? `:fontfile='${fontPath}'` : '';
                        filterChain += `,drawtext=text='${cleanSub}'${fontArg}:fontcolor=white:fontsize=44:box=1:boxcolor=black@0.6:boxborderw=15:line_spacing=5:x=(w-text_w)/2:y=h-text_h-100:fix_bounds=1`;
                    }
                    
                    filterParts.push(`${filterChain},fps=30,format=yuv420p[${sceneLabel}]`);
                    videoLabels.push(`[${sceneLabel}]`);
                    continue;
                }

                const streamInfo = await getStreamInfo(filePath);
                const isImage = ['.jpg', '.jpeg', '.png', '.webp'].some(ext => filePath.toLowerCase().endsWith(ext));
                const duration = scene.duration || 3;

                if (isImage) {
                    // Imagens estáticas precisam de loop e tempo definido na entrada
                    inputs.push('-loop', '1', '-t', duration.toString(), '-i', filePath);
                } else {
                    inputs.push('-i', filePath);
                }
                const vIdx = inputIdx++;

                const startTime = scene.startTime || 0;
                const sceneLabel = `scene_v${i}`;

                // Aplicar trim, scale, efeito e formato
                let filterChain = "";
                if (isImage) {
                    filterChain = `[${vIdx}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1:color=black`;
                } else if (streamInfo.hasVideo) {
                    filterChain = `[${vIdx}:v]trim=start=${startTime}:duration=${duration},setpts=PTS-STARTPTS`;
                } else {
                    // Fallback para áudio-only ou arquivos sem vídeo: fundo preto de 1280x720
                    filterChain = `color=c=black:s=1280x720:d=${duration}[vbg${i}];[vbg${i}]setsar=1`;
                }

                // Movimentos Cinematográficos (Zoom/Pan)
                if (scene.movement === 'zoom_in') {
                    filterChain += `,scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720`;
                } else if (scene.movement === 'zoom_out') {
                    filterChain += `,scale=8000:-1,zoompan=z='max(1.5-0.0015*on,1)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720`;
                } else if (scene.movement === 'pan_left') {
                    filterChain += `,scale=8000:-1,zoompan=z=1.3:x='(iw-iw/zoom)-(on/125)*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d=125:s=1280x720`;
                } else if (scene.movement === 'pan_right') {
                    filterChain += `,scale=8000:-1,zoompan=z=1.3:x='(on/125)*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d=125:s=1280x720`;
                } else {
                    filterChain += `,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1:color=black`;
                }

                filterChain += `,setsar=1,fps=30,format=yuv420p`;

                // Aplicar filtro de efeito se existir
                const effectMap: Record<string, string> = {
                    'vivid': 'eq=saturation=1.5:contrast=1.1',
                    'noir': 'hue=s=0,eq=contrast=1.5',
                    'warm': 'colorbalance=rs=0.1:bs=-0.1',
                    'cool': 'colorbalance=bs=0.1:rs=-0.1',
                    'vintage': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=0.9',
                    'dreamy': 'boxblur=luma_radius=2:luma_power=1',
                    'sharp': 'unsharp=5:5:1.5:5:5:0.0'
                };
                if (scene.filter && effectMap[scene.filter]) {
                    filterChain += `,${effectMap[scene.filter]}`;
                }

                // Legendas (Subtitles) - Burn-in
                if (scene.subtitle) {
                    // Robust escaping for FFmpeg drawtext
                    const cleanSub = scene.subtitle
                        .replace(/\\/g, '\\\\\\\\') // Escape \
                        .replace(/'/g, "'\\''")      // Escape '
                        .replace(/:/g, '\\:')       // Escape :
                        .toUpperCase();
                    
                    // fontfile fallback - common paths in Linux
                    const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
                    const fontArg = fs.existsSync(fontPath) ? `:fontfile='${fontPath}'` : '';
                    
                    // Subtitle at bottom with a robust box
                    filterChain += `,drawtext=text='${cleanSub}'${fontArg}:fontcolor=white:fontsize=44:box=1:boxcolor=black@0.6:boxborderw=15:line_spacing=5:x=(w-text_w)/2:y=h-text_h-100:fix_bounds=1`;
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

            let totalDuration = plan.scenes.reduce((s: number, sc: any) => s + (sc.duration || 3), 0);

            // Se existir narração, garantir que a duração total do vídeo coincida com a narração para não cortar o final
            if (narrationPath && fs.existsSync(narrationPath)) {
                try {
                    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${narrationPath}"`).toString().trim();
                    const audioDuration = parseFloat(durationStr);
                    if (!isNaN(audioDuration) && audioDuration > 0) {
                        console.log(`[Autopilot] Narration duration detected: ${audioDuration}s (Plan was ${totalDuration}s)`);
                        totalDuration = Math.max(audioDuration, totalDuration);
                    }
                } catch (err) {
                    console.error("[Autopilot] Failed to probe narration duration:", err);
                }
            }

            const args = [
                ...inputs,
                '-filter_complex', filterComplex,
                ...mapArgs,
                '-t', totalDuration.toFixed(2),
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

            createFFmpegJob(jobId, args, totalDuration);

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
    // API for resolving media from landing pages (metadata extraction)
    app.get('/api/resolve-media', async (req: any, res: any) => {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL missing');
        const decodedUrl = decodeURIComponent(url as string);

        try {
            const protocol = decodedUrl.startsWith('https') ? https : http;
            protocol.get(decodedUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
            }, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => {
                    // Try to find direct MP3 links or JSON metadata
                    const mp3Match = data.match(/https?:\/\/[^"']+\.mp3\?[^"']+/i) || 
                                   data.match(/https?:\/\/[^"']+\.mp3(?=["'])/i) ||
                                   data.match(/canonical_url":"(https?:\/\/[^"]+\.mp3)"/i);
                    
                    const titleMatch = data.match(/<title>(.*?)<\/title>/i) || 
                                     data.match(/"name":"([^"]+)"/i);
                    
                    const thumbMatch = data.match(/"thumbnailUrl":"([^"]+)"/i) ||
                                     data.match(/"image":"([^"]+)"/i);

                    if (mp3Match) {
                        let finalUrl = mp3Match[0];
                        // If it's a JSON match, it might have escapes
                        if (mp3Match[1]) finalUrl = mp3Match[1].replace(/\\/g, '');
                        
                        res.json({
                            url: finalUrl,
                            name: titleMatch ? (titleMatch[1] || titleMatch[0]).split('|')[0].trim() : 'Áudio Importado',
                            thumbnail: thumbMatch ? (thumbMatch[1] || thumbMatch[0]).replace(/\\/g, '') : null,
                            type: 'audio'
                        });
                    } else {
                        // Fallback: check if it's a Pexels video or similar
                        const videoMatch = data.match(/https?:\/\/[^"']+\.mp4\?[^"']+/i) || data.match(/https?:\/\/[^"']+\.mp4(?=["'])/i);
                        if (videoMatch) {
                             res.json({
                                url: videoMatch[0],
                                name: 'Vídeo Importado',
                                type: 'video'
                            });
                        } else {
                            res.status(404).json({ error: 'Nenhum áudio encontrado nesta página.' });
                        }
                    }
                });
            }).on('error', () => res.status(500).send('Erro ao acessar URL'));
        } catch (err) {
            res.status(500).send('Falha na resolução');
        }
    });

    app.get('/api/download-external', async (req: any, res: any) => {
        const { url, filename } = req.query;
        if (!url) return res.status(400).send('URL missing');
        const decodedUrl = decodeURIComponent(url as string);
        const name = filename ? sanitizeFilename(filename as string) : `audio_${Date.now()}.mp3`;

        console.log(`[DownloadProxy] Attempting to proxy: ${decodedUrl}`);

        const options: any = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': new URL(decodedUrl).origin
            },
            timeout: 30000
        };

        const fetchWithRedirect = (currentUrl: string, depth = 0) => {
            if (depth > 5) return res.status(500).send('Too many redirects');
            
            try {
                const protocol = currentUrl.startsWith('https') ? https : http;
                protocol.get(currentUrl, options, (apiRes: any) => {
                    // Handle Redirects
                    if (apiRes.statusCode >= 300 && apiRes.statusCode < 400 && apiRes.headers.location) {
                        let redirUrl = apiRes.headers.location;
                        if (!redirUrl.startsWith('http')) {
                            const origin = new URL(currentUrl).origin;
                            redirUrl = origin + redirUrl;
                        }
                        return fetchWithRedirect(redirUrl, depth + 1);
                    }

                    if (apiRes.statusCode !== 200) {
                        return res.status(apiRes.statusCode).send(`Original server returned status ${apiRes.statusCode}`);
                    }

                    // Forward content-type or force octet-stream for download
                    const contentType = apiRes.headers['content-type'] || 'application/octet-stream';
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
                    
                    // Pipe the stream
                    apiRes.pipe(res);
                }).on('error', (err) => {
                    console.error("[DownloadProxy] Error:", err);
                    if (!res.headersSent) res.status(500).send('Download failure');
                });
            } catch (err: any) {
                console.error("[DownloadProxy] Exception:", err);
                if (!res.headersSent) res.status(500).send('Download failure: ' + err.message);
            }
        };

        fetchWithRedirect(decodedUrl);
    });

    app.get('/api/proxy/media', async (req: any, res: any) => {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL missing');
        const decodedUrl = decodeURIComponent(url as string);
        
        const options: any = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'https://pixabay.com/',
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            timeout: 30000
        };

        // Forward Range headers for audio seeking
        if (req.headers.range) {
            options.headers.range = req.headers.range;
        }

        const fetchWithRedirect = (currentUrl: string, depth = 0) => {
            if (depth > 5) return res.status(500).send('Too many redirects');
            
            try {
                const protocol = currentUrl.startsWith('https') ? https : http;
                const request = protocol.get(currentUrl, options, (apiRes: any) => {
                    // Handle Redirects
                    if (apiRes.statusCode >= 300 && apiRes.statusCode < 400 && apiRes.headers.location) {
                        let redirUrl = apiRes.headers.location;
                        if (!redirUrl.startsWith('http')) {
                            const origin = new URL(currentUrl).origin;
                            redirUrl = origin + redirUrl;
                        }
                        return fetchWithRedirect(redirUrl, depth + 1);
                    }

                    // Forward headers
                    res.statusCode = apiRes.statusCode || 200;
                    if (apiRes.headers['content-type']) res.setHeader('Content-Type', apiRes.headers['content-type']);
                    if (apiRes.headers['content-length']) res.setHeader('Content-Length', apiRes.headers['content-length']);
                    if (apiRes.headers['content-range']) res.setHeader('Content-Range', apiRes.headers['content-range']);
                    if (apiRes.headers['accept-ranges']) res.setHeader('Accept-Ranges', apiRes.headers['accept-ranges']);
                    if (apiRes.headers['content-encoding']) res.setHeader('Content-Encoding', apiRes.headers['content-encoding']);
                    
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
                    
                    // Handle errors during streaming
                    apiRes.on('error', (err: any) => {
                        console.error('[Proxy] Stream error:', err);
                        if (!res.headersSent) res.status(502).send('Stream error');
                    });
                    
                    apiRes.pipe(res);
                });

                request.on('error', (err) => {
                    console.error('[Proxy] Request error:', err);
                    if (!res.headersSent) res.status(500).send('Proxy failure');
                });
                
                request.on('timeout', () => {
                    console.error('[Proxy] Request timeout');
                    request.destroy();
                    if (!res.headersSent) res.status(504).send('Gateway timeout');
                });
            } catch (err) {
                console.error('[Proxy] Critical exception:', err);
                if (!res.headersSent) res.status(500).send('Critical proxy failure');
            }
        };

        fetchWithRedirect(decodedUrl);
    });

    // Proxy para Jamendo
    app.get('/api/stock/jamendo', async (req: any, res: any) => {
        const { q, page = 1 } = req.query;
        const key = req.headers['x-jamendo-api-key'] || process.env.JAMENDO_API_KEY || '56d30cce';
        const limit = 6;
        const offset = (Number(page) - 1) * limit;
        
        const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${key}&format=jsonfull&search=${encodeURIComponent(q as string)}&limit=${limit}&offset=${offset}&audioformat=mp32`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });
            const contentType = response.headers.get('content-type') || '';
            if (!response.ok) {
                const text = await response.text();
                return res.status(response.status).json({ error: `Jamendo Error ${response.status}`, details: text.substring(0, 200) });
            }
            const data = await safeJson(response);
            res.json(data);
        } catch (e: any) {
            res.status(500).json({ error: 'Jamendo Proxy Failure', details: e.message });
        }
    });

    // Proxy para FMA (Free Music Archive)
    app.get('/api/stock/fma', async (req: any, res: any) => {
        const { q, page = 1 } = req.query;
        const key = req.headers['x-fma-api-key'] || process.env.FMA_API_KEY || '';
        const limit = 6;
        
        const url = `https://freemusicarchive.org/api/get/tracks.json?api_key=${key}&q=${encodeURIComponent(q as string)}&limit=${limit}&page=${page}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                const text = await response.text();
                return res.status(response.status).json({ error: `FMA Error ${response.status}`, details: text.substring(0, 200) });
            }
            const data = await safeJson(response);
            res.json(data);
        } catch (e: any) {
            res.status(500).json({ error: 'FMA Proxy Failure', details: e.message });
        }
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
            const data = await safeJson(searchRes);
            if (!data) throw new Error('Falha ao obter dados do Pexels');

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

    // ─── STOCK SEARCH PROXIES ────────────────────────────────────────────────
    app.get('/api/stock/pexels', async (req: any, res: any) => {
        const { type = 'videos', q, ...otherParams } = req.query;
        // Clean up params - don't pass 'type' or 'q' to Pexels if they are just our internal routing
        const queryParams = new URLSearchParams();
        if (q) queryParams.set('query', q as string);
        
        // Copy other allowed params
        const allowed = ['per_page', 'page', 'orientation', 'size', 'color', 'locale'];
        for (const key of allowed) {
            if (req.query[key]) queryParams.set(key, req.query[key] as string);
        }
        
        if (!queryParams.has('per_page')) queryParams.set('per_page', '6');
        
        const baseUrl = type === 'videos' 
            ? 'https://api.pexels.com/videos/search'
            : 'https://api.pexels.com/v1/search';
        
        const url = `${baseUrl}?${queryParams.toString()}`;
        
        try {
            const key = req.headers['x-pexels-api-key'] || process.env.PEXELS_API_KEY || '563492ad6f917000010000010c2834b1509b4db78907865c1920263f';
            console.log(`[Pexels Proxy] Searching ${type}: ${url}`);

            const response = await fetch(url, {
                headers: { 
                    'Authorization': String(key),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await safeJson(response);
                if (data) res.json(data);
                else res.status(500).json({ error: 'Failed to parse JSON response from Pexels' });
            } else {
                const text = await response.text();
                console.error(`[Pexels Proxy] Non-JSON response (status ${response.status}):`, text.substring(0, 500));
                res.status(response.status).json({ 
                    error: 'Invalid response from Pexels', 
                    status: response.status,
                    preview: text.substring(0, 100)
                });
            }
        } catch (e: any) {
            console.error('[Pexels Proxy] Exception:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/stock/pixabay', async (req: any, res: any) => {
        const { type = 'video', q, ...otherParams } = req.query;
        const key = req.headers['x-pixabay-api-key'] || process.env.PIXABAY_API_KEY || '21114562-b9e7fa6996d9ccca39ee3ecc9';
        
        const queryParams = new URLSearchParams();
        queryParams.set('key', key as string);
        if (q) queryParams.set('q', q as string);
        
        // Copy other allowed params
        const allowed = ['lang', 'id', 'image_type', 'orientation', 'category', 'min_width', 'min_height', 'colors', 'editors_choice', 'safesearch', 'order', 'page', 'per_page', 'video_type'];
        for (const k of allowed) {
            if (req.query[k]) queryParams.set(k, req.query[k] as string);
        }
        
        if (!queryParams.has('per_page')) queryParams.set('per_page', '6');

        let baseUrl = 'https://pixabay.com/api/';
        
        if (type === 'video' || type === 'videos') {
            baseUrl = 'https://pixabay.com/api/videos/';
        } else if (type === 'music') {
            queryParams.set('media_type', 'music');
        }

        const fetchWithFallback = async (targetUrl: string): Promise<Response> => {
            return fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                }
            });
        };

        try {
            const url = `${baseUrl}?${queryParams.toString()}`;
            console.log(`[Pixabay Proxy] Searching ${type}: ${url.replace(/key=[^&]+/, 'key=REDACTED')}`);
            let response = await fetchWithFallback(url);

            // Music Fallback Endpoint
            if (type === 'music' && response.status === 403) {
                 const musicUrl = `https://pixabay.com/api/audio/?${queryParams.toString()}`;
                 console.warn(`[Pixabay Proxy] 403 on root endpoint for music, trying /api/audio/: ${musicUrl.replace(/key=[^&]+/, 'key=REDACTED')}`);
                 response = await fetchWithFallback(musicUrl);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await safeJson(response);
                if (data) res.json(data);
                else res.status(500).json({ error: 'Failed to parse JSON response from Pixabay' });
            } else {
                const text = await response.text();
                console.error(`[Pixabay Proxy] Non-JSON response for ${type} (status ${response.status}):`, text.substring(0, 500));
                res.status(response.status).json({ 
                    error: 'Invalid response from Pixabay', 
                    status: response.status,
                    preview: text.substring(0, 100) 
                });
            }
        } catch (e: any) {
            console.error('[Pixabay Proxy] Exception:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/stock/unsplash', async (req: any, res: any) => {
        const { q, page = 1 } = req.query;
        const key = req.headers['x-unsplash-api-key'] || process.env.UNSPLASH_API_KEY || 'R0XN_0yCHG5v6N8l296f8XG3Gv-_D7P7x5TqC_8w-Ew';
        const query = encodeURIComponent(q as string);
        const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=6&page=${page}&client_id=${key}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await safeJson(response);
                if (data) res.json(data);
                else res.status(500).json({ error: 'Failed to parse JSON response from Unsplash' });
            } else {
                const text = await response.text();
                console.error(`[Unsplash Proxy] Non-JSON response (status ${response.status}):`, text.substring(0, 500));
                res.status(response.status).json({ 
                    error: 'Invalid response from Unsplash', 
                    status: response.status,
                    preview: text.substring(0, 100) 
                });
            }
        } catch (e: any) {
            console.error('[Unsplash Proxy] Exception:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // API Fallback for missing routes (to prevent SPA mismatch returning HTML)
    app.use('/api/*', (req: any, res: any) => {
        res.status(404).json({ status: 'error', error: 'API route not found' });
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

    // ─── UTILS & CLEANER ──────────────────────────────────────────────────────
    setInterval(() => {
        const now = Date.now();
        Object.keys(jobs).forEach(id => {
            if (now - (jobs[id].startTime || 0) > 30 * 60 * 1000) { 
                console.log(`[Cleaner] Removing expired job: ${id}`);
                const outputPath = jobs[id].outputPath;
                if (outputPath && fs.existsSync(outputPath)) {
                    try { fs.unlinkSync(outputPath); } catch(e) {}
                }
                delete jobs[id];
            }
        });
    }, 15 * 60 * 1000);
}

startServer();
