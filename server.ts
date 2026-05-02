import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, exec, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { Readable } from 'stream';
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

    app.use(express.json({ limit: '5gb' }));
    app.use(express.urlencoded({ extended: true, limit: '5gb' }));

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

    const getDeapiKey = (req?: express.Request) => {
        const headerKey = (req?.headers['x-deapi-api-key'] || "").toString().trim();
        let key = headerKey || (process.env.DEAPI_API_KEY || "").trim();
        if (key.toLowerCase().startsWith("bearer ")) {
            return key.substring(7).trim();
        }
        return key;
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
                'calm': 'Peaceful, steady, and relaxing tone.',
                'excited': 'Enthusiastic, high-energy, and ebullient tone.',
                'scared': 'Trembling, fast-paced, and terrified tone.',
                'whisper': 'Spoken in a very low, quiet whisper.',
                'shout': 'Spoken loudly, with high energy and intensity.',
                'deep': 'Spoken with a very deep, resonant voice.',
                'high_pitch': 'Spoken with a high-pitched, childish or nervous voice.',
                'anxious': 'Spoken with a trembling, fast-paced, anxious breath.',
                'sarcastic': 'Spoken with a dry, ironic, sarcastic inflection.',
                'romantic': 'Spoken with a soft, warm, romantic and affectionate tone.'
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
        limits: { fieldSize: 100 * 1024 * 1024, fileSize: 10240 * 1024 * 1024 } // 10GB for chunked assembly
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

        const deapi_key = process.env.DEAPI_API_KEY || '';
        if (!deapi_key) {
           console.error("[Backend] CRITICAL: DEAPI_API_KEY IS NOT CONFIGURED!");
        }

        // Optimization: Use filter_complex_script if the filter is too long to avoid ARG_MAX issues
        // Limitation: Limit threads for Cloud Run stability
        // Adding probe limits to prevent runaway memory
        let finalArgs = [
            '-hide_banner', '-loglevel', 'info', '-stats', 
            '-threads', '4', 
            '-probesize', '500M', 
            '-analyzeduration', '500M',
            '-reinit_filter', '0', 
            '-hwaccel', 'none',
            '-max_muxing_queue_size', '4096'
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
                // Higher queue size to handle many inputs without blocking,
                // but avoid it for lavfi/virtual devices which can be sensitive to option placement
                const isLavfi = i > 0 && args[i-1] === 'lavfi';
                if (!isLavfi) {
                    processedArgs.push('-thread_queue_size', '512');
                }
                processedArgs.push('-i');
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

        const { prompt, aspectRatio, resolution, model, image, lastFrame, referenceImages, apiKey, frames, fps, format, sample_rate, speed } = req.body;
        
        if (model && model.startsWith('deapi-')) {
            const deapiModel = model.replace('deapi-', '');
            const deapiKey = apiKey || getDeapiKey(req);

            if (!deapiKey) {
                jobs[jobId].status = 'failed';
                jobs[jobId].error = 'Chave API Deapi não configurada no servidor.';
                return;
            }

            console.log(`[Job ${jobId}] Starting Deapi Video Generation with model: ${deapiModel}...`);
            console.log(`[Job ${jobId}] Key check: ${deapiKey ? (deapiKey.substring(0, 4) + "..." + deapiKey.substring(deapiKey.length - 4)) : "MISSING"}`);
            
            try {
                // Determine base URL (api.deapi.ai is standard for API access)
                const baseUrl = "https://api.deapi.ai";
                
                const isImageToVideo = !!image;
                
                // Mapeamento exato baseado no painel Deapi (Imagem do usuário)
                const modelMap: Record<string, string> = {
                    "ltx-2.3-22b": "ltx-video-v2.3",
                    "ltx-video-13b": "ltx-video-v1.3",
                    "ltx-2-19b-fp8": "ltx-video-v2.0",
                    "ltx-video": "ltx-video-v1.3",
                    "animate-diff": "animate-diff-v3",
                    "svd": "svd-xt-1.1"
                };
                
                let mappedModel = modelMap[deapiModel] || deapiModel;
                
                // Fallback dinâmico caso o mapeamento estático falhe
                try {
                    console.log(`[Job ${jobId}] Verificando modelos disponíveis na Deapi...`);
                    const modelsRes = await fetch(`${baseUrl}/api/v2/models?filter[inference_types]=img2video,txt2video`, {
                        headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                    });
                    if (modelsRes.ok) {
                        const modelsData = await modelsRes.json();
                        const availableModels = modelsData.data || [];
                        const slugs = availableModels.map((m: any) => m.slug);
                        
                        // Se o modelo mapeado não estiver na lista, tenta o melhor match
                        if (!slugs.includes(mappedModel)) {
                            const bestMatch = availableModels.find((m: any) => 
                                m.slug.toLowerCase().includes(deapiModel.split('-')[0])
                            );
                            if (bestMatch) mappedModel = bestMatch.slug;
                        }
                    }
                } catch (e) {}
                // A documentação atualizada indica que para animação (img2video) 
                // devemos usar /animations, e para texto puro /generations.
                const endpoint = isImageToVideo 
                    ? `${baseUrl}/api/v2/videos/animations`
                    : `${baseUrl}/api/v2/videos/generations`;

                console.log(`[Job ${jobId}] Deapi Endpoint: ${endpoint} (Model: ${mappedModel}, Animation: ${isImageToVideo})`);
                
                let response;
                let fetchAttempts = 0;
                let lastFetchError = "";
                const randomSeed = Math.floor(Math.random() * 2147483647).toString();

                // Limite de 5 tentativas com backoff linear de 30s para não saturar a fila
                const MAX_SUBMIT_ATTEMPTS = 5;
                while (fetchAttempts < MAX_SUBMIT_ATTEMPTS) {
                    fetchAttempts++;
                    
                    // Ajuste de limites conforme imagem do painel e erros anteriores
                    const payload: any = {
                        prompt: prompt || 'cinematic video generation',
                        model: mappedModel,
                        width: aspectRatio === '9:16' ? 432 : (aspectRatio === '16:9' ? 768 : 768),
                        height: aspectRatio === '9:16' ? 768 : (aspectRatio === '16:9' ? 432 : 768),
                        frames: frames || 121, 
                        fps: fps || 24,
                        steps: 1,   
                        seed: parseInt(randomSeed),
                        include_audio: mappedModel.includes('ltx-video-v2.0') || mappedModel.includes('ltx-2-19b') || !!format,
                        audio_format: format || 'mp3',
                        audio_sample_rate: sample_rate || 24000,
                        audio_speed: speed || 1.0
                    };

                    if (isImageToVideo) {
                        // Deapi v2 Animation payload (JSON) - Updated for LTX Video requirements
                        payload.image = image; 
                        payload.image_url = image; 
                        payload.input_image = image;
                        payload.first_frame_image = image; // Novo campo obrigatório reportado no erro 422
                    }

                    if (isImageToVideo) {
                        // Envio via FormData para suportar arquivo real (exigência da API Deapi v2)
                        const formData = new FormData();
                        formData.append('prompt', payload.prompt);
                        formData.append('model', mappedModel); 
                        formData.append('width', payload.width.toString());
                        formData.append('height', payload.height.toString());
                        formData.append('frames', payload.frames.toString());
                        formData.append('fps', payload.fps.toString());
                        formData.append('steps', payload.steps.toString());
                        formData.append('seed', payload.seed.toString());
                        formData.append('include_audio', payload.include_audio ? 'true' : 'false');
                        if (payload.audio_format) formData.append('audio_format', payload.audio_format);
                        if (payload.audio_sample_rate) formData.append('audio_sample_rate', payload.audio_sample_rate.toString());
                        if (payload.audio_speed) formData.append('audio_speed', payload.audio_speed.toString());

                        // Converter base64 para Blob para enviar como arquivo
                        const base64Data = image.split(',')[1] || image;
                        const byteCharacters = Buffer.from(base64Data, 'base64');
                        const blob = new Blob([byteCharacters], { type: 'image/png' });
                        
                        // Para animação (img2video), a documentação v2 e o erro 422 anterior
                        // confirmaram que "input_image" e "first_frame_image" são os campos chave.
                        // Enviamos a imagem selecionada pelo usuário nesses campos.
                        formData.append('input_image', blob, 'input.png');
                        formData.append('first_frame_image', blob, 'first_frame.png');
                        formData.append('image', blob, 'image.png');

                        response = await fetch(endpoint, {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Authorization': `Bearer ${deapiKey}`,
                                'x-api-key': deapiKey
                            },
                            body: formData
                        });
                    } else {
                        response = await fetch(endpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'Authorization': `Bearer ${deapiKey}`,
                                'x-api-key': deapiKey
                            },
                            body: JSON.stringify(payload)
                        });
                    }

                    if (response.status === 429) {
                        // Backoff linear: 30s fixos entre tentativas (não exponencial)
                        const waitTime = 30000;
                        const seconds = waitTime / 1000;
                        console.warn(`[Job ${jobId}] Deapi 429 (Rate Limit). Tentativa ${fetchAttempts}/${MAX_SUBMIT_ATTEMPTS}. Aguardando ${seconds}s...`);
                        if (jobs[jobId]) {
                            jobs[jobId].message = `API Temporariamente Ocupada (429). Tentat. ${fetchAttempts}/${MAX_SUBMIT_ATTEMPTS} - Retentando em ${seconds}s...`;
                        }
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }

                    if (!response.ok) {
                        const errText = await response.text();
                        lastFetchError = `Deapi API error (${response.status}): ${errText.substring(0, 500)}`;
                        break; // Stop retrying on non-429 errors
                    }

                    break; // Success
                }

                if (!response || !response.ok) {
                    const finalError = lastFetchError || (fetchAttempts >= 5 ? "Limite de tentativas excedido (A API Deapi permaneceu ocupada). Tente novamente em alguns minutos." : "Falha na comunicação com Deapi após retentativas.");
                    throw new Error(finalError);
                }

                const data: any = await response.json();
                console.log(`[Job ${jobId}] Deapi Response Data:`, JSON.stringify(data));
                
                // Busca exaustiva por qualquer campo que possa ser o ID da tarefa
                const taskId = data.id || data.task_id || data.job_id || data.request_id || 
                               data.data?.id || data.data?.task_id || data.data?.job_id || data.data?.request_id ||
                               data.result?.id || data.result?.job_id;

                if (!taskId) {
                    const directUrl = data.url || data.video_url || data.result_url || 
                                     data.data?.url || data.data?.video_url || data.data?.result_url ||
                                     data.result?.url || data.result?.video_url;
                                     
                    if (directUrl) {
                        jobs[jobId].status = 'completed';
                        jobs[jobId].result = [directUrl];
                        jobs[jobId].downloadUrl = directUrl;
                        jobs[jobId].progress = 100;
                        return;
                    }
                    throw new Error(`Deapi não retornou ID de tarefa. Resposta: ${JSON.stringify(data).substring(0, 100)}`);
                }

                console.log(`[Job ${jobId}] Deapi Job ID: ${taskId}`);
                if (jobs[jobId]) {
                    jobs[jobId].message = ""; 
                }

                // Polling Deapi Task (Jobs v2)
                let completed = false;
                let attempts = 0;
                let pollFailures = 0;
                const maxAttempts = 150; 

                while (!completed && attempts < maxAttempts && jobs[jobId]) {
                    attempts++;
                    const pollWait = 20000 + (Math.random() * 5000); 
                    await new Promise(r => setTimeout(r, pollWait));
                    
                    if (!jobs[jobId]) break; // Job was cancelled or removed

                    try {
                        const pollRes = await fetch(`${baseUrl}/api/v2/jobs/${taskId}`, {
                            headers: { 
                                'Authorization': `Bearer ${deapiKey}`,
                                'x-api-key': deapiKey
                            }
                        });
                        
                        if (!pollRes.ok) {
                            if (pollRes.status === 429) {
                                console.warn(`[Job ${jobId}] Deapi Poll 429. Aguardando ciclo mais longo (50s)...`);
                                if (jobs[jobId]) jobs[jobId].message = "Verificando status... (API Ocupada, aguardando)";
                                await new Promise(r => setTimeout(r, 50000));
                                continue;
                            }
                            pollFailures++;
                            console.error(`[Job ${jobId}] Poll HTTP Error ${pollRes.status} (Failure ${pollFailures}/5)`);
                            if (pollFailures > 5) break; 
                            continue;
                        }

                        pollFailures = 0; // Reset failures on success
                        const taskData: any = await pollRes.json();
                        const result = taskData.data || taskData;
                        const status = (result.status || "").toLowerCase();
                        
                        console.log(`[Job ${jobId}] Deapi Job Status: ${status}`);
                        
                        if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'done') {
                            const videoUrl = result.result_url || result.video_url || result.url || result.data?.url || result.data?.result_url;
                            if (videoUrl && jobs[jobId]) {
                                // Baixar o vídeo para o servidor local e expor via downloadUrl
                                // para que o frontend possa buscar sem problemas de CORS/autenticação
                                try {
                                    console.log(`[Job ${jobId}] Baixando vídeo Deapi de: ${videoUrl}`);
                                    const dlRes = await fetch(videoUrl);
                                    if (dlRes.ok) {
                                        const buffer = Buffer.from(await dlRes.arrayBuffer());
                                        const contentType = dlRes.headers.get('content-type') || '';
                                        let fileExt = '.mp4';
                                        if (contentType.includes('audio')) fileExt = '.mp3';
                                        else if (contentType.includes('image')) fileExt = '.png';
                                        else if (videoUrl.toLowerCase().includes('.mp3')) fileExt = '.mp3';
                                        else if (videoUrl.toLowerCase().includes('.png')) fileExt = '.png';
                                        else if (videoUrl.toLowerCase().includes('.jpg') || videoUrl.toLowerCase().includes('.jpeg')) fileExt = '.jpg';
                                        
                                        const filename = `ai_gen_${jobId}${fileExt}`;
                                        const outputPath = path.join(uploadDir, filename);
                                        fs.writeFileSync(outputPath, buffer);
                                        jobs[jobId].status = 'completed';
                                        jobs[jobId].progress = 100;
                                        jobs[jobId].outputPath = outputPath;
                                        jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
                                        jobs[jobId].result = [videoUrl];
                                        console.log(`[Job ${jobId}] Deapi asset saved locally (${fileExt}): ${outputPath}`);
                                    } else {
                                        // Fallback: expor URL externa diretamente
                                        console.warn(`[Job ${jobId}] Falha ao baixar vídeo (${dlRes.status}), usando URL externa como fallback.`);
                                        jobs[jobId].status = 'completed';
                                        jobs[jobId].progress = 100;
                                        jobs[jobId].result = [videoUrl];
                                        jobs[jobId].downloadUrl = videoUrl; // URL externa como fallback
                                    }
                                } catch (dlErr: any) {
                                    console.warn(`[Job ${jobId}] Erro ao baixar vídeo Deapi:`, dlErr.message);
                                    // Fallback: expor URL externa
                                    jobs[jobId].status = 'completed';
                                    jobs[jobId].progress = 100;
                                    jobs[jobId].result = [videoUrl];
                                    jobs[jobId].downloadUrl = videoUrl;
                                }
                                completed = true;
                            }
                        } else if (status === 'failed' || status === 'error') {
                            throw new Error(`Deapi task failed: ${result.error || result.message || 'Unknown error'}`);
                        } else if (jobs[jobId]) {
                            jobs[jobId].message = `Processando vídeo... (${status})`;
                            jobs[jobId].progress = Math.min(95, 5 + (attempts * 0.8));
                        }
                    } catch (pollErr: any) {
                        console.warn(`[Job ${jobId}] Poll error:`, pollErr);
                        if (pollErr.message?.includes("failed")) throw pollErr;
                    }
                }

                if (!completed && jobs[jobId]) {
                    throw new Error(pollFailures > 5 ? "Muitas falhas na verificação de status. A API pode estar indisponível." : "Tempo esgotado aguardando geração do Deapi.");
                }

            } catch (err: any) {
                console.error(`[Job ${jobId}] Deapi Error:`, err);
                if (jobs[jobId]) {
                    jobs[jobId].status = 'failed';
                    jobs[jobId].error = err.message || String(err);
                }
            }
            return;
        }

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
                // O SDK @google/genai espera `imageBytes` (camelCase); ele converte internamente
                // para `bytesBase64Encoded` ao serializar para a API REST. Usar `bytesBase64Encoded`
                // diretamente aqui faz o SDK enviar um objeto `image` vazio, causando erro 400.
                payload.image = { 
                    imageBytes: image.split(',')[1] || image, 
                    mimeType: req.body.imageMimeType || 'image/png' 
                };
            }
            if (lastFrame) {
                payload.config.lastFrame = { imageBytes: lastFrame.split(',')[1] || lastFrame, mimeType: 'image/png' };
            }
            if (referenceImages && referenceImages.length > 0) {
                payload.config.referenceImages = referenceImages.map((img: string) => ({ 
                    image: {
                        imageBytes: img.split(',')[1] || img, 
                        mimeType: 'image/png' 
                    },
                    referenceType: 'ASSET'
                }));
            }

            console.log(`[Job ${jobId}] Starting AI Generation with model: ${model || 'veo-3.1-lite-generate-preview'}...`);
            
            // Fallback chain: tenta o modelo solicitado primeiro; se 404, tenta os outros
            const defaultModels = [
                'models/veo-generate-preview-001',
                'models/veo-lite-preview-001',
                'veo-3.1-generate-preview', 
                'veo-3.1-lite-generate-preview', 
                'veo-2.0-preview-001', 
                'veo-lite-preview-001'
            ];
            
            const modelsToTry = model ? [model, ...defaultModels.filter(m => m !== model)] : defaultModels;

            const ai = new GoogleGenAI({ apiKey: finalKey });
            let operation: any;
            let successModel = '';

            for (const currentModel of modelsToTry) {
                console.log(`[Job ${jobId}] Trying model: ${currentModel}...`);
                try {
                    // Mapeia o payload para o formato esperado pelo SDK
                    const sdkPayload: any = {
                        model: currentModel,
                        prompt: payload.prompt,
                        config: payload.config
                    };
                    if (payload.image) sdkPayload.image = payload.image;

                    operation = await ai.models.generateVideos(sdkPayload);
                    successModel = currentModel;
                    break;
                } catch (e: any) {
                    const errorMsg = e.message || String(e);
                    if (errorMsg.includes('404') || errorMsg.includes('not found')) {
                        console.warn(`[Job ${jobId}] Model ${currentModel} not found (404).`);
                        continue;
                    }
                    console.error(`[Job ${jobId}] Error with model ${currentModel}:`, errorMsg);
                    throw e; 
                }
            }

            if (!operation) {
                throw new Error('Nenhum modelo de vídeo disponível (404 em todos os modelos testados).');
            }

            console.log(`[Job ${jobId}] Operation started with model ${successModel}: ${operation.name}`);
            const operationName = operation.name;
            let completed = false;
            let attempts = 0;
            const maxAttempts = 60;

            while (!completed && attempts < maxAttempts) {
                attempts++;
                await new Promise(r => setTimeout(r, 5000));
                
                // Polling using the SDK
                const pollRes = await ai.operations.getVideosOperation({ 
                    operation: operation 
                });
                
                if (jobs[jobId]) jobs[jobId].progress = Math.min(95, 10 + (attempts * 1.5));

                if (pollRes.done) {
                    completed = true;
                    if (pollRes.error) throw new Error(String(pollRes.error.message || 'Erro deconhecido na geração do vídeo'));
                    
                    const videoUrl = pollRes.response?.generatedVideos?.[0]?.video?.uri;
                    if (!videoUrl) throw new Error('Video URI not found in successful operation');
                    
                    // Download do vídeo final com a chave API (alguns endpoints exigem)
                    const separator = videoUrl.includes('?') ? '&' : '?';
                    const videoRes = await fetch(`${videoUrl}${separator}key=${finalKey}`);
                    
                    if (!videoRes.ok) {
                        throw new Error(`Falha ao baixar vídeo gerado: ${videoRes.status}`);
                    }

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

    // ─── DEAPI IMAGE GENERATION & TOOLS ──────────────────────────────────────
    app.post('/api/ai/generate-image', async (req: any, res: any) => {
        const { prompt, aspectRatio, model, imageUrl, action, apiKey } = req.body;
        const jobId = `deapi_image_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
        res.status(202).json({ jobId });

        const deapiKey = apiKey || getDeapiKey(req);
        if (!deapiKey) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = 'Chave API Deapi não configurada.';
            return;
        }

        try {
            const baseUrl = "https://api.deapi.ai";
            let endpoint = `${baseUrl}/api/v2/images/generations`;
            
            // Map actions to v2 endpoints
            if (action === 'ocr') endpoint = `${baseUrl}/api/v2/images/ocr`;
            else if (action === 'remove-bg') endpoint = `${baseUrl}/api/v2/images/background-removals`;
            else if (action === 'upscale') endpoint = `${baseUrl}/api/v2/images/upscales`;
            else if (action === 'edit') endpoint = `${baseUrl}/api/v2/images/edits`;

            const width = aspectRatio === '16:9' ? 1792 : (aspectRatio === '9:16' ? 1024 : 1024);
            const height = aspectRatio === '16:9' ? 1024 : (aspectRatio === '9:16' ? 1792 : 1024);

            const payload: any = {
                prompt: prompt || '',
                model: model || 'Flux1schnell',
                width,
                height,
                guidance: 1,
                steps: 4,
                seed: -1
            };

            if (imageUrl) {
                payload.image = imageUrl;
                payload.image_url = imageUrl;
                payload.input_image = imageUrl;
            }

            console.log(`[Deapi Image] Action: ${action || 'generation'} -> ${endpoint}`);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deapiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data: any = await response.json();
                handleDeapiTask(jobId, data, deapiKey, baseUrl);
            } else {
                const text = await response.text();
                throw new Error(`Status ${response.status}: ${text.substring(0, 200)}`);
            }
        } catch (e: any) {
            console.error(`[Job ${jobId}] Deapi Image Error:`, e);
            if (jobs[jobId]) {
                jobs[jobId].status = 'failed';
                jobs[jobId].error = e.message;
            }
        }
    });

    // ─── DEAPI AUDIO GENERATION ────────────────────────────────────────────────
    // Doc: POST /api/v2/audio/speech — Content-Type: multipart/form-data
    // Params: text (req), model (req), lang (req), speed (req), format (req),
    //         sample_rate (req), mode (opt), voice (opt), ref_audio (file,opt),
    //         ref_text (opt), instruct (opt), webhook_url (opt)
    // Response: { "data": { "request_id": "UUID" } }
    
    // Cache for model lists to prevent 429 from Deapi
    let deapiModelCache: Record<string, { data: any[], timestamp: number }> = {};
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    
    app.get('/api/ai/deapi-models', async (req: any, res: any) => {
        const deapiKey = getDeapiKey(req);
        if (!deapiKey) return res.status(401).json({ error: 'API key missing' });
        
        const type = req.query.type || 'txt2audio';
        const cacheKey = `models_${type}`;
        
        if (deapiModelCache[cacheKey] && (Date.now() - deapiModelCache[cacheKey].timestamp < CACHE_TTL)) {
            return res.json(deapiModelCache[cacheKey].data);
        }
        
        try {
            const mRes = await fetch(`https://api.deapi.ai/api/v2/models?filter[inference_types]=${type}`, {
                headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
            });
            if (mRes.ok) {
                const mData = await mRes.json();
                const availableModels = mData.data || [];
                deapiModelCache[cacheKey] = { data: availableModels, timestamp: Date.now() };
                return res.json(availableModels);
            }
            res.status(mRes.status).json({ error: 'Failed to fetch' });
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    app.post('/api/ai/generate-audio', async (req: any, res: any) => {
        const jobId = `aiaudio_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
        res.status(202).json({ jobId });

        const { prompt, model, type, audioUrl, audioFile, voiceBase64, apiKey, text, targetLanguage, voice, voiceDescription, refText, ref_text } = req.body;
        const deapiKey = apiKey || getDeapiKey(req);
        const resolvedType = type || 'speech';
        const resolvedLang = text || targetLanguage || 'pt-br';
        const selectedVoice = voice || '';
        const selectedVoiceDescription = voiceDescription || '';

        if (!deapiKey) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = 'Chave API Deapi não configurada.';
            return;
        }

        try {
            const baseUrl = "https://api.deapi.ai";

            // PRIORIDADE PARA O ENDPOINT V1 CONFORME SOLICITADO (CURL DO PLAYGROUND)
            const ENDPOINTS = [
                { url: `${baseUrl}/api/v1/client/txt2audio`, version: 'v1' }
            ];
            
            if (resolvedType !== 'clone') {
                let deapiV2Path = '/api/v2/audio/speech';
                if (resolvedType === 'sfx') deapiV2Path = '/api/v2/audio/sfx';
                ENDPOINTS.push({ url: `${baseUrl}${deapiV2Path}`, version: 'v2' });
            }

            // Resolve model slug dynamically — never hardcode
            let mappedModel = model || '';
            // Normalize legacy/internal aliases to real Deapi slugs.
            const LEGACY_ALIASES: Record<string, string> = {
                'cloning': '',        // resolved dynamically to a voice_clone capable model
                'cloning-v1': '',     // same
                'txt2audio': 'Kokoro',
                'sfx': 'F5-TTS',      // Reasonable fallback if sfx-specific model not selected
                'kokoro': 'Kokoro'    // normalize lowercase to canonical
            };
            if (mappedModel in LEGACY_ALIASES) {
                mappedModel = LEGACY_ALIASES[mappedModel];
            }
            if (!mappedModel) {
                if (resolvedType === 'sfx') mappedModel = 'F5-TTS';
                else mappedModel = 'Kokoro';
            }

            // Fetch live model list — resolve model + capabilities + default voice
            const filterType = resolvedType === 'sfx' ? 'txt2sfx' : 'txt2audio';
            const hasRefAudio = !!(voiceBase64 && voiceBase64.length > 10);
            const hasAudioFile = !!(audioFile && audioFile.length > 10);
            const hasAudioUrl  = !!(audioUrl  && typeof audioUrl === 'string' && audioUrl.startsWith('http'));
            const hasAnyRefAudio = hasRefAudio || hasAudioFile || hasAudioUrl;
            const needsVoiceClone = resolvedType === 'clone' && hasAnyRefAudio;
            const needsVoiceDesign = (resolvedType === 'design' || selectedVoiceDescription.length > 0);

            let defaultVoiceSlug: string | undefined;
            let mode: string = 'custom_voice';
            if (mappedModel.toLowerCase().includes('qwen')) {
                mode = mappedModel.toLowerCase().includes('design') ? 'voice_design' : 'voice_clone';
            } else if (mappedModel === 'Chatterbox') {
                mode = 'custom_voice';
            } else if (needsVoiceClone) {
                mode = 'voice_clone';
            } else if (needsVoiceDesign) {
                mode = 'voice_design';
            }

            let availableModels: any[] = [];
            const cacheKey = `audio_${filterType}`;
            const cached = deapiModelCache[cacheKey];

            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                availableModels = cached.data;
            } else {
                try {
                    const mRes = await fetch(`${baseUrl}/api/v2/models?filter[inference_types]=${filterType}`, {
                        headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                    });
                    if (mRes.ok) {
                        const mData = await mRes.json();
                        availableModels = mData.data || [];
                        deapiModelCache[cacheKey] = { data: availableModels, timestamp: Date.now() };
                    }
                } catch (e) {
                    console.error("[Deapi Audio] Could not fetch model list:", e);
                }
            }

            try {
                if (availableModels.length > 0) {
                    const slugs: string[] = availableModels.map((m: any) => m.slug);
                    console.log(`[Deapi Audio] Available ${filterType} models: ${slugs.join(', ')}`);

                        if (needsVoiceClone) {
                            // Procurar modelo que suporta clonagem (Chatterbox e Qwen3 suportam)
                            const cloneCapable = availableModels.find((m: any) =>
                                m.slug === 'Chatterbox' ||
                                m.slug.toLowerCase().includes('qwen') ||
                                m.info?.features?.supports_voice_clone === true
                            );
                            if (cloneCapable) {
                                mappedModel = cloneCapable.slug;
                                mode = 'voice_clone';
                                console.log(`[Deapi Audio] Usando modelo com suporte a clonagem: ${mappedModel}`);
                            } else {
                                // Se nenhum modelo de clonagem encontrado, usar Chatterbox como fallback
                                const chatterbox = availableModels.find((m: any) => m.slug === 'Chatterbox');
                                if (chatterbox) {
                                    mappedModel = 'Chatterbox';
                                    mode = 'voice_clone';
                                    console.log(`[Deapi Audio] Usando Chatterbox para clonagem (fallback)`);
                                } else {
                                    // Último recurso: usar o primeiro modelo disponível
                                    mappedModel = slugs[0];
                                    mode = 'custom_voice';
                                    console.warn('[Deapi Audio] Nenhum modelo com suporte a clonagem encontrado, usando custom_voice');
                                }
                            }
                        } else if (!slugs.includes(mappedModel)) {
                            mappedModel = slugs[0];
                        }

                        const modelInfo = availableModels.find((m: any) => m.slug === mappedModel);
                        const voices = modelInfo?.languages?.[0]?.voices;
                        if (voices && voices.length > 0) {
                            defaultVoiceSlug = voices[0].slug;
                        }
                    }
                } catch (e) {
                    console.error("[Deapi Audio] Could not fetch model list:", e);
                }

            let response: any;
            let success = false;
            let lastError = "";

            for (const ep of ENDPOINTS) {
                console.log(`[Deapi Audio] Attempting ${ep.url} | type=${resolvedType} model=${mappedModel}`);
                try {
                    let fetchOptions: any;

                    if (ep.version === 'v2') {
                        const form = new FormData();
                        // SFX v2 uses 'caption', Speech v2 uses 'text'
                        if (resolvedType === 'sfx') {
                            form.append('caption', prompt || '');
                        } else {
                            form.append('text', prompt || '');
                        }
                        
                        form.append('model', mappedModel);
                        form.append('format', req.body.format || 'mp3');
                        
                        if (resolvedType === 'sfx') {
                            form.append('duration', String(req.body.duration || 10));
                        } else {
                            // Garantir campos obrigatórios para evitar erro 422 no Deapi (especialmente Kokoro)
                            // Normalizar idioma para valores aceitos pela deAPI
                            const langMap: Record<string, string> = {
                                'pt-br': 'pt-br',
                                'portuguese': 'pt-br',
                                'pt': 'pt-br',
                                'en-us': 'en-us',
                                'en-gb': 'en-gb',
                                'english': 'en-us',
                                'es': 'es',
                                'spanish': 'es',
                                'fr-fr': 'fr-fr',
                                'french': 'fr-fr',
                                'hi': 'hi',
                                'hindi': 'hi',
                                'it': 'it',
                                'italian': 'it'
                            };
                            const normalizedLang = (req.body.lang || resolvedLang || 'pt-br').toLowerCase();
                            let finalLang = langMap[normalizedLang] || 'pt-br';

                            if (mappedModel.toLowerCase().includes('qwen')) {
                                const qwenLangMap: Record<string, string> = {
                                    'pt-br': 'Portuguese', 'portuguese': 'Portuguese', 'en-us': 'English', 'english': 'English',
                                    'es': 'Spanish', 'spanish': 'Spanish', 'fr-fr': 'French', 'french': 'French',
                                    'it': 'Italian', 'italian': 'Italian', 'ja': 'Japanese', 'japanese': 'Japanese',
                                    'ko': 'Korean', 'korean': 'Korean', 'ru': 'Russian', 'russian': 'Russian',
                                    'de': 'German', 'german': 'German'
                                };
                                finalLang = qwenLangMap[normalizedLang] || qwenLangMap[finalLang] || 'Portuguese';
                            }

                            const finalSpeed = String(req.body.speed || '1.0');
                            const finalSampleRate = String(req.body.sample_rate || '24000');
                            const finalVoice = req.body.voice || selectedVoice || defaultVoiceSlug || 'af_bella';

                            form.append('lang', finalLang);
                            form.append('speed', finalSpeed);
                            form.append('sample_rate', finalSampleRate);
                            
                            let finalMode = 'custom_voice';
                            if (mappedModel.toLowerCase().includes('qwen')) {
                                finalMode = mappedModel.toLowerCase().includes('design') ? 'voice_design' : 'voice_clone';
                            } else if (mappedModel === 'Chatterbox') {
                                finalMode = 'custom_voice';
                            } else if (resolvedType === 'clone' || needsVoiceClone) {
                                finalMode = 'voice_clone';
                            } else if (selectedVoiceDescription || mappedModel.toLowerCase().includes('design')) {
                                finalMode = 'voice_design';
                            }
                            form.append('mode', finalMode);

                            // Remover parâmetro voice se for clone ou design para evitar conflitos (conforme playground Deapi)
                            if (finalMode === 'custom_voice') {
                                form.append('voice', finalVoice);
                            }

                            const voiceDesc = selectedVoiceDescription || req.body.voice_description || req.body.voiceDescription || "";
                            if (voiceDesc) {
                                form.append('voice_description', voiceDesc);
                            }
                            // Forçar instruct se for modo design ou modelo design
                            if (finalMode === 'voice_design' || mappedModel.toLowerCase().includes('design')) {
                                form.append('instruct', voiceDesc || "A clear natural voice");
                            }
                            
                            const finalRefText = ref_text || refText || req.body.refText || req.body.ref_text;
                            if (finalRefText) {
                                form.append('ref_text', finalRefText);
                            }
                        }

                        if (hasRefAudio && resolvedType !== 'sfx') {
                            try {
                                const base64Data = voiceBase64.replace(/^data:[^;]+;base64,/, '');
                                const buffer = Buffer.from(base64Data, 'base64');
                                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                                form.append('ref_audio', blob, 'ref.mp3');
                            } catch (blobErr) {
                                console.warn('[Deapi Audio] Ref audio attach failed:', blobErr);
                            }
                        }

                        if (hasAudioFile && resolvedType === 'dubbing') {
                             try {
                                const base64Data = audioFile.replace(/^data:[^;]+;base64,/, '');
                                const buffer = Buffer.from(base64Data, 'base64');
                                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                                form.append('audio_file', blob, 'dub.mp3');
                            } catch (blobErr) {
                                console.warn('[Deapi Audio] Dub file attach failed:', blobErr);
                            }
                        }
                        fetchOptions = {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' },
                            body: form
                        };
                    } else {
                        // v1 implementation (Multipart) - Required for ref_audio as file
                        const form = new FormData();
                        form.append('text', prompt || req.body.text || '');
                        form.append('model', mappedModel);
                        
                        const normalizedLang = (req.body.lang || resolvedLang || 'pt-br').toLowerCase();
                        let finalLang = normalizedLang;
                        if (mappedModel.toLowerCase().includes('qwen')) {
                            const qwenLangMap: Record<string, string> = {
                                'pt-br': 'Portuguese', 'portuguese': 'Portuguese', 'en-us': 'English', 'english': 'English',
                                'es': 'Spanish', 'spanish': 'Spanish', 'fr-fr': 'French', 'french': 'French',
                                'it': 'Italian', 'italian': 'Italian', 'ja': 'Japanese', 'japanese': 'Japanese',
                                'ko': 'Korean', 'korean': 'Korean', 'ru': 'Russian', 'russian': 'Russian',
                                'de': 'German', 'german': 'German'
                            };
                            finalLang = qwenLangMap[normalizedLang] || 'Portuguese';
                        }

                        form.append('lang', finalLang);
                        
                        let finalMode = 'custom_voice';
                        if (mappedModel.toLowerCase().includes('qwen')) {
                            finalMode = mappedModel.toLowerCase().includes('design') ? 'voice_design' : 'voice_clone';
                        } else if (mappedModel === 'Chatterbox') {
                            finalMode = 'custom_voice';
                        } else if (resolvedType === 'clone' || needsVoiceClone) {
                            finalMode = 'voice_clone';
                        } else if (selectedVoiceDescription || mappedModel.toLowerCase().includes('design')) {
                            finalMode = 'voice_design';
                        }
                        form.append('mode', finalMode);

                        // Remover parâmetro voice se for clone ou design para evitar conflitos (conforme playground Deapi)
                        if (finalMode === 'custom_voice') {
                            form.append('voice', finalVoice);
                        }

                        const voiceDescV1 = selectedVoiceDescription || req.body.voice_description || req.body.voiceDescription || "";
                        if (voiceDescV1) {
                            form.append('voice_description', voiceDescV1);
                        }
                        // Forçar instruct se for modo design ou modelo design
                        if (finalMode === 'voice_design' || mappedModel.toLowerCase().includes('design')) {
                            form.append('instruct', voiceDescV1 || "A clear natural voice");
                        }
                        
                        form.append('speed', String(req.body.speed || 1));
                        form.append('format', req.body.format || 'mp3');
                        form.append('sample_rate', String(req.body.sample_rate || 24000));

                        if (resolvedType === 'clone' || needsVoiceClone) {
                            if (hasRefAudio) {
                                try {
                                    const base64Data = voiceBase64.replace(/^data:[^;]+;base64,/, '');
                                    const buffer = Buffer.from(base64Data, 'base64');
                                    const blob = new (await import('node:buffer')).Blob([buffer], { type: 'audio/mpeg' });
                                    form.append('ref_audio', blob, 'ref.mp3');
                                } catch (e) {
                                    console.warn('[Deapi Audio] Failed to attach ref_audio file:', e);
                                }
                            }
                            const finalRefText = ref_text || refText || req.body.refText || req.body.ref_text;
                            if (finalRefText) form.append('ref_text', finalRefText);
                        } else if (resolvedType === 'design' || req.body.type === 'design') {
                            const voiceDescription = req.body.voice_description || req.body.voiceDescription;
                            if (voiceDescription) {
                                form.append('voice_description', voiceDescription);
                                console.log('[Deapi Audio] Voice Design Mode: Usando descricao de voz customizada');
                            }
                        } else {
                            form.append('voice', req.body.voice || selectedVoice || defaultVoiceSlug || 'af_bella');
                        }

                        fetchOptions = {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${deapiKey}` },
                            body: form
                        };
                    }

                    response = await fetch(ep.url, fetchOptions);

                    if (response.ok) {
                        const data: any = await response.json();
                        console.log(`[Deapi Audio] Success Response from ${ep.url}:`, JSON.stringify(data));
                        
                        // TENTAR CAPTURAR URL DIRETA (Para modelos rápidos como Qwen3 com pouco texto)
                        const result = data.data || data;
                        const directUrl = result.output_file_url || result.url || result.audio_url || result.download_url || (result.output && result.output[0]);
                        
                        if (directUrl) {
                            console.log(`[Job ${jobId}] URL direta encontrada na resposta inicial.`);
                            jobs[jobId].status = 'completed'; jobs[jobId].downloadUrl = directUrl; jobs[jobId].progress = 100;
                            success = true;
                            break;
                        }
                        
                        console.log(`[Job ${jobId}] Iniciando monitoramento da tarefa Deapi: ${taskId}`);
                        handleDeapiTask(jobId, data, deapiKey, baseUrl).catch(err => {
                            console.error(`[Job ${jobId}] Erro no monitoramento em segundo plano:`, err);
                        });
                        success = true;
                        break;
                    } else {
                        const text = await response.text();
                        lastError = `Status ${response.status}: ${text.substring(0, 200)}`;
                        console.warn(`[Deapi Audio] Failed ${ep.url}: ${lastError}`);
                    }
                } catch (e: any) {
                    lastError = e.message;
                    console.warn(`[Deapi Audio] Fetch error on ${ep.url}: ${e.message}`);
                }
            }

            if (!success) {
                throw new Error(`Deapi Audio falhou em todos os endpoints tentados. Último erro: ${lastError}`);
            }

        } catch (e: any) {
            console.error(`[Job ${jobId}] Deapi Audio Error:`, e);
            if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = e.message; }
        }
    });

    // Helper to handle Deapi task/job response
    const handleDeapiTask = async (jobId: string, data: any, deapiKey: string, baseUrl: string) => {
        console.log(`[Job ${jobId}] handleDeapiTask chamado com dados:`, JSON.stringify(data));
        // Captura agressiva de ID ou URL direta
        const taskId = data.data?.request_id || data.request_id || data.id || data.task_id || data.data?.id || data.job_id || data.data?.job_id;
        const directUrl = data.url || data.audio_url || data.data?.url || data.result_url || data.data?.result_url || data.data?.audio_url || (data.output && data.output[0]);
        
        if (directUrl) {
            console.log(`[Job ${jobId}] URL direta encontrada na resposta inicial.`);
            jobs[jobId].status = 'completed'; jobs[jobId].downloadUrl = directUrl; jobs[jobId].progress = 100;
            return;
        }

        if (!taskId) {
            console.error(`[Job ${jobId}] Resposta da Deapi sem ID:`, JSON.stringify(data));
            throw new Error('Deapi não retornou request_id nem URL direta.');
        }

        let completed = false;
        let attempts = 0;
        let rateLimitCount = 0;
        await new Promise(r => setTimeout(r, 3000));

        while (!completed && attempts < 60 && jobs[jobId]) {
            attempts++;
            try {
                // Tentar múltiplos endpoints de status para garantir compatibilidade
                let pollRes = await fetch(`${baseUrl}/api/v1/client/request-status/${taskId}`, {
                    headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                });
                
                if (!pollRes.ok) {
                    pollRes = await fetch(`${baseUrl}/api/v1/client/task_status?request_id=${taskId}`, {
                        headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                    });
                }
                
                if (!pollRes.ok) {
                    pollRes = await fetch(`${baseUrl}/api/v2/jobs/${taskId}`, {
                        headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                    });
                }

                if (pollRes.ok) {
                    rateLimitCount = 0;
                    const taskData: any = await pollRes.json();
                    const result = taskData.data || taskData;
                    const status = (result.status || result.state || result.task_status || "").toLowerCase();
                    console.log(`[Job ${jobId}] Polling status: ${status}`, JSON.stringify(result));
                    
                    if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'done' || status === 'finished') {
                        const resultUrl = result.result_url || result.audio_url || result.url || result.download_url || result.data?.result_url || result.data?.audio_url || (result.output && result.output[0]) || result.file_url;
                        if (resultUrl) {
                            console.log(`[Job ${jobId}] Áudio pronto! URL: ${resultUrl}`);
                            jobs[jobId].status = 'completed'; jobs[jobId].downloadUrl = resultUrl; jobs[jobId].progress = 100;
                            completed = true;
                        }
                    } else if (status === 'failed' || status === 'error') {
                        throw new Error(result.error || result.message || 'Deapi processing failed');
                    }
                } else if (pollRes.status === 429) {
                    rateLimitCount++;
                    await new Promise(r => setTimeout(r, 10000));
                }
            } catch (e) { console.warn(`[Job ${jobId}] Polling error:`, e); }
            if (!completed) await new Promise(r => setTimeout(r, 5000));
        }
        if (!completed && jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = 'Timeout na deAPI.'; }
    };

    // ─── DEAPI MUSIC GENERATION ────────────────────────────────────────────────
    // Doc: POST /api/v2/audio/music — Content-Type: multipart/form-data
    // Required: caption, model, lyrics, duration, inference_steps, guidance_scale, seed, format
    // v1 fallback: POST /api/v1/client/txt2music — Content-Type: application/json
    // Response: { "data": { "request_id": "UUID" } }
    app.post('/api/ai/generate-music', async (req: any, res: any) => {
        const jobId = `aimusic_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
        res.status(202).json({ jobId });

        const { 
            prompt, model, duration, apiKey, 
            lyrics, vocalLanguage, 
            steps, seed, guidanceScale: userGuidance, 
            outputFormat, referenceAudio 
        } = req.body;
        const deapiKey = apiKey || getDeapiKey(req);

        if (!deapiKey) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = 'Chave API Deapi não configurada.';
            return;
        }

        try {
            const baseUrl = "https://api.deapi.ai";

            const ENDPOINTS = [
                { url: `${baseUrl}/api/v2/audio/music`, version: 'v2' },
                { url: `${baseUrl}/api/v1/client/txt2music`, version: 'v1' }
            ];

            let mappedModel = model || 'ACE-Step-v1.5-turbo';
            
            // ... Logic for availableModels and modelLimits stays here (I'll keep the existing structure but add the mapping)

            // Track model limits so we stay within per-model caps (e.g. guidance_scale max varies)
            let modelLimits: any = {};

            let availableModels: any[] = [];
            const cacheKey = 'music_txt2music';
            const cached = deapiModelCache[cacheKey];

            if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                availableModels = cached.data;
            } else {
                try {
                    const mRes = await fetch(`${baseUrl}/api/v2/models?filter[inference_types]=txt2music`, {
                        headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                    });
                    if (mRes.ok) {
                        const mData = await mRes.json();
                        availableModels = mData.data || [];
                        deapiModelCache[cacheKey] = { data: availableModels, timestamp: Date.now() };
                    }
                } catch (e) {
                    console.error("[Deapi Music] Could not fetch model list:", e);
                }
            }

            try {
                if (availableModels.length > 0) {
                    const slugs: string[] = availableModels.map((m: any) => m.slug);
                    console.log(`[Deapi Music] Available models: ${slugs.join(', ')}`);
                    if (!slugs.includes(mappedModel)) {
                        const fallback = slugs.find(s => s.toLowerCase().includes('ace')) || slugs[0];
                        console.log(`[Deapi Music] Model "${mappedModel}" not found, using "${fallback}"`);
                        mappedModel = fallback;
                    }
                    // Capture this model's limits for clamping parameters
                    const modelInfo = availableModels.find((m: any) => m.slug === mappedModel);
                    if (modelInfo?.info?.limits) modelLimits = modelInfo.info.limits;
                    console.log(`[Deapi Music] Model limits:`, JSON.stringify(modelLimits));
                }
            } catch (e) {
                console.error("[Deapi Music] Error processing model list:", e);
            }

            // Clamp guidance_scale to model limits
            // ACE-Step: max=1 (<=1 valid). Unknown models: default to 5.
            const maxGuidance = modelLimits.max_guidance_scale ?? modelLimits.max_guidance ?? 10;
            const minGuidance = modelLimits.min_guidance_scale ?? modelLimits.min_guidance ?? 0;
            
            // Sensible defaults if model limits are unknown or specifically for ACE/Turbo models
            const defaultTarget = mappedModel.toLowerCase().includes('ace') ? 0.7 : 5;
            const guidanceScale = Math.min(Math.max(defaultTarget, minGuidance), maxGuidance);

            const resolvedDuration = duration || 30;
            console.log(`[Deapi Music] model=${mappedModel} duration=${resolvedDuration}s guidance_scale=${guidanceScale.toFixed(1)}`);

            let response: any;
            let success = false;
            let lastError = "";

            for (const ep of ENDPOINTS) {
                console.log(`[Deapi Music] Attempting ${ep.url}`);
                try {
                    let fetchOptions: any;

                    if (ep.version === 'v2') {
                        // v2 requires multipart/form-data
                        const form = new FormData();
                        form.append('caption', prompt || '');
                        form.append('model', mappedModel);
                        form.append('lyrics', lyrics || '[Instrumental]');
                        form.append('duration', String(resolvedDuration));
                        form.append('inference_steps', String(steps || 8));
                        form.append('guidance_scale', String(userGuidance || guidanceScale));
                        form.append('seed', String(seed || -1));
                        form.append('format', outputFormat || 'mp3');
                        if (vocalLanguage) form.append('vocal_language', vocalLanguage);
                        
                        if (referenceAudio && referenceAudio.length > 50) {
                             try {
                                const base64Data = referenceAudio.replace(/^data:[^;]+;base64,/, '');
                                const buffer = Buffer.from(base64Data, 'base64');
                                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                                form.append('reference_audio', blob, 'reference.mp3');
                            } catch (blobErr) {
                                console.warn('[Deapi Music] Ref audio attach failed:', blobErr);
                            }
                        }

                        fetchOptions = {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' },
                            body: form
                        };
                    } else {
                        // v1 fallback — JSON body
                        fetchOptions = {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${deapiKey}`,
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({
                                caption: prompt || '',
                                prompt: prompt || '',
                                lyrics: lyrics || '[Instrumental]',
                                model: mappedModel,
                                duration: resolvedDuration,
                                vocal_language: vocalLanguage,
                                inference_steps: steps || 8,
                                guidance_scale: userGuidance || guidanceScale,
                                seed: seed || -1,
                                format: outputFormat || 'mp3'
                            })
                        };
                    }

                    response = await fetch(ep.url, fetchOptions);

                    if (response.ok) {
                        const data: any = await response.json();
                        handleDeapiTask(jobId, data, deapiKey, baseUrl);
                        success = true;
                        break;
                    } else {
                        const text = await response.text();
                        lastError = `Status ${response.status}: ${text.substring(0, 200)}`;
                        console.warn(`[Deapi Music] Failed ${ep.url}: ${lastError}`);
                    }
                } catch (e: any) {
                    lastError = e.message;
                    console.warn(`[Deapi Music] Fetch error on ${ep.url}: ${e.message}`);
                }
            }

            if (!success) {
                throw new Error(`Deapi Music falhou em todos os endpoints tentados. Último erro: ${lastError}`);
            }

        } catch (e: any) {
            console.error(`[Job ${jobId}] Deapi Music Error:`, e);
            if (jobs[jobId]) { jobs[jobId].status = 'failed'; jobs[jobId].error = e.message; }
        }
    });


    // ─── DEAPI TRANSCRIBE ─────────────────────────────────────────────────────
    // Doc: POST /api/v2/audio/transcriptions — Content-Type: multipart/form-data
    // Required: (source_url XOR source_file), include_ts, model
    // source_url: YouTube, X/Twitter, Twitch, Kick, TikTok, X Spaces
    // source_file: AAC, MPEG, OGG, WAV, WebM, FLAC, MP4, AVI, WMV, QuickTime
    // v1 fallback: POST /api/v1/client/transcribe — JSON body
    // Response: { "data": { "request_id": "UUID" } }
    app.post('/api/ai/transcribe', async (req: any, res: any) => {
        const jobId = `transcribe_${Date.now()}`;
        jobs[jobId] = { id: jobId, status: 'processing', progress: 5, startTime: Date.now() };
        res.status(202).json({ jobId });

        const { url, file, audioUrl, audioFile, apiKey } = req.body;
        const deapiKey = apiKey || getDeapiKey(req);

        if (!deapiKey) {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = 'Chave API Deapi não configurada.';
            return;
        }

        try {
            const baseUrl = "https://api.deapi.ai";

            // Only one v2 endpoint for all transcription types (unified)
            const ENDPOINTS = [
                { url: `${baseUrl}/api/v2/audio/transcriptions`, version: 'v2' },
                { url: `${baseUrl}/api/v1/client/transcribe`,    version: 'v1' }
            ];

            // Resolve model dynamically
            let transcribeModel = 'WhisperLargeV3';
            try {
                const mRes = await fetch(`${baseUrl}/api/v2/models?filter[inference_types]=audio2text`, {
                    headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' }
                });
                if (mRes.ok) {
                    const mData = await mRes.json();
                    const slugs: string[] = (mData.data || []).map((m: any) => m.slug);
                    if (slugs.length > 0) {
                        console.log(`[Deapi Transcribe] Available models: ${slugs.join(', ')}`);
                        if (!slugs.includes(transcribeModel)) {
                            transcribeModel = slugs.find(s => s.toLowerCase().includes('whisper')) || slugs[0];
                            console.log(`[Deapi Transcribe] Using model: ${transcribeModel}`);
                        }
                    }
                }
            } catch (e) {
                console.error("[Deapi Transcribe] Could not fetch model list, using:", transcribeModel);
            }

            // Resolve source — exactly one of source_url or source_file must be provided
            const sourceUrl  = (url  && typeof url  === 'string' && url.startsWith('http'))  ? url  :
                               (audioUrl && typeof audioUrl === 'string' && audioUrl.startsWith('http')) ? audioUrl : null;
            const sourceFile = file || audioFile || null;

            if (!sourceUrl && !sourceFile) {
                throw new Error("Nenhuma mídia fornecida para transcrição (source_url ou source_file obrigatório).");
            }

            console.log(`[Deapi Transcribe] model=${transcribeModel} source=${sourceUrl || '[file]'}`);

            let response: any;
            let success = false;
            let lastError = "";

            for (const ep of ENDPOINTS) {
                console.log(`[Deapi Transcribe] Attempting ${ep.url}`);
                try {
                    let fetchOptions: any;

                    if (ep.version === 'v2') {
                        // v2 requires multipart/form-data
                        const form = new FormData();
                        form.append('model', transcribeModel);
                        form.append('include_ts', 'true');
                        if (sourceUrl) {
                            form.append('source_url', sourceUrl);
                        } else if (sourceFile) {
                            // sourceFile may be base64 or a path — handle base64
                            if (typeof sourceFile === 'string' && sourceFile.includes('base64,')) {
                                const base64Data = sourceFile.replace(/^data:[^;]+;base64,/, '');
                                const buffer = Buffer.from(base64Data, 'base64');
                                const blob = new Blob([buffer], { type: 'audio/mpeg' });
                                form.append('source_file', blob, 'audio.mp3');
                            } else {
                                form.append('source_file', sourceFile);
                            }
                        }
                        fetchOptions = {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${deapiKey}`, 'Accept': 'application/json' },
                            body: form
                        };
                    } else {
                        // v1 fallback — JSON body
                        const v1Payload: any = {
                            model: transcribeModel,
                            include_ts: true
                        };
                        if (sourceUrl)  v1Payload.source_url  = sourceUrl;
                        if (sourceFile) v1Payload.source_file = sourceFile;
                        fetchOptions = {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${deapiKey}`,
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(v1Payload)
                        };
                    }

                    response = await fetch(ep.url, fetchOptions);

                    if (response.ok) {
                        const data: any = await response.json();
                        handleDeapiTask(jobId, data, deapiKey, baseUrl);
                        success = true;
                        break;
                    } else {
                        const text = await response.text();
                        lastError = `Status ${response.status}: ${text.substring(0, 200)}`;
                        console.warn(`[Deapi Transcribe] Failed ${ep.url}: ${lastError}`);
                    }
                } catch (e: any) {
                    lastError = e.message;
                    console.warn(`[Deapi Transcribe] Fetch error on ${ep.url}: ${e.message}`);
                }
            }

            if (!success) {
                throw new Error(`Deapi Transcribe falhou em todos os endpoints tentados. Último erro: ${lastError}`);
            }

        } catch (e: any) {
            console.error(`[Job ${jobId}] Deapi Transcribe Error:`, e);
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
        
        try {
            console.log(`[Proxy] Fetching: ${decodedUrl}`);
            const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'https://pixabay.com/'
            };

            if (req.headers.range) {
                headers.range = req.headers.range;
            }

            const response = await fetch(decodedUrl, { 
                headers,
                // @ts-ignore
                duplex: 'half'
            });
            
            if (!response.ok && response.status !== 206) {
                console.error(`[Proxy] Upstream failed: ${response.status} ${response.statusText}`);
                return res.status(response.status).send(`Upstream failed: ${response.statusText}`);
            }

            // Propagate headers
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
                const lowerKey = key.toLowerCase();
                if (!['content-encoding', 'transfer-encoding', 'connection', 'access-control-allow-origin'].includes(lowerKey)) {
                    res.setHeader(key, value);
                }
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

            if (response.body) {
                // @ts-ignore
                const nodeStream = Readable.fromWeb(response.body);
                nodeStream.pipe(res);
                
                nodeStream.on('error', (err: any) => {
                    // Ignore common client-side disconnect errors
                    if (err.code === 'ECONNRESET' || err.message?.includes('aborted')) {
                        return;
                    }
                    console.error('[Proxy] Stream error:', err);
                    if (!res.headersSent) res.end();
                });

                // Clean up when client disconnects
                req.on('close', () => {
                    nodeStream.destroy();
                });
            } else {
                res.end();
            }
        } catch (err: any) {
            console.error('[Proxy] Error:', err);
            if (!res.headersSent) {
                res.status(500).send(`Proxy failure: ${err.message}`);
            }
        }
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
            baseUrl = 'https://pixabay.com/api/audio/';
        }

        const fetchWithFallback = async (targetUrl: string, method: string = 'GET'): Promise<Response> => {
            return fetch(targetUrl, {
                method,
                headers: {
                    'User-Agent': 'PixabayProxy/1.0',
                    'Accept': 'application/json',
                }
            });
        };

        try {
            const url = `${baseUrl}?${queryParams.toString()}`;
            console.log(`[Pixabay Proxy] Searching ${type}: ${url.replace(/key=[^&]+/, 'key=REDACTED')}`);
            let response = await fetchWithFallback(url);

            // Music Fallback: If /api/audio/ fails, try main endpoint with media_type=music
            if (response.status === 403 && type === 'music' && baseUrl.includes('/audio/')) {
                 const mainUrl = `https://pixabay.com/api/?${queryParams.toString()}&media_type=music`;
                 console.warn(`[Pixabay Proxy] 403 on /api/audio/, trying fallback to main endpoint...`);
                 response = await fetchWithFallback(mainUrl);
            }
            
            // Reverse Fallback: If main endpoint with media_type=music was tried (unlikely given logic above) and failed
            if (response.status === 403 && type === 'music' && !baseUrl.includes('/audio/')) {
                const audioUrl = `https://pixabay.com/api/audio/?${queryParams.toString().replace('media_type=music', '')}`;
                console.warn(`[Pixabay Proxy] 403 on main endpoint, trying fallback to /api/audio/...`);
                response = await fetchWithFallback(audioUrl);
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
