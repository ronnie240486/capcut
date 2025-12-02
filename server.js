
// Importa os módulos necessários
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// Inicializa a aplicação Express
const app = express();
const PORT = process.env.PORT || 8080;

// --- Middlewares ---
app.set('trust proxy', 1);
const corsOptions = {
  origin: '*', 
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); 

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
app.use(express.json({ limit: '50mb' }));

// --- Configuração do Multer ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});
// Middleware de upload para diferentes cenários
const uploadSingle = multer({ storage: storage }).single('video');
const uploadAudio = multer({ storage: storage }).single('audio'); // ADICIONADO: Upload específico para áudio
const uploadFields = multer({ storage: storage }).fields([
    { name: 'video', maxCount: 1 },
    { name: 'style', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]);
const uploadAny = multer({ storage: storage }).any();


// --- Sistema de Tarefas Assíncronas ---
const jobs = {};

// --- Funções Auxiliares ---
const cleanupFiles = (files) => {
    files.forEach(file => {
        if (file && file.path && fs.existsSync(file.path)) fs.unlink(file.path, () => {});
        else if (typeof file === 'string' && fs.existsSync(file)) fs.unlink(file, () => {});
    });
};

// --- Rotas ---
app.get('/', (req, res) => res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' }));

app.get('/api/check-ffmpeg', (req, res) => {
    exec('ffmpeg -version', (error) => {
        if (error) return res.status(500).json({ status: 'offline', error: 'FFmpeg not found' });
        res.json({ status: 'online' });
    });
});

// --- AI ENDPOINTS (MOVED FROM FRONTEND) ---

// 1. Analyze Script (Gemini Text)
app.post('/api/ai/analyze-script', async (req, res) => {
    const { script } = req.body;
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) return res.status(500).json({ message: 'API Key do servidor não configurada.' });
    if (!script) return res.status(400).json({ message: 'Script vazio.' });

    try {
        const prompt = `
            Analyze the following script/article and break it down into 3 to 10 visual scenes for a video.
            Return ONLY a JSON array of objects. Each object must have:
            - "id": a unique string
            - "narration": 1-2 sentences of text for the narrator to read (condensed from source)
            - "visual": a detailed image generation prompt describing what should be seen (style-agnostic, just content)
            
            Script:
            ${script}
        `;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API Error: ${await aiResponse.text()}`);
        
        const aiData = await aiResponse.json();
        let text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.json({ scenes: JSON.parse(text) });
    } catch (e) {
        console.error("Analyze Script Error:", e);
        res.status(500).json({ message: e.message });
    }
});

// 2. Generate Image (Gemini Image)
app.post('/api/ai/generate-image', async (req, res) => {
    const { prompt } = req.body;
    const apiKey = process.env.API_KEY;

    if (!apiKey) return res.status(500).json({ message: 'API Key do servidor não configurada.' });
    if (!prompt) return res.status(400).json({ message: 'Prompt vazio.' });

    try {
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API Error: ${await aiResponse.text()}`);
        
        const aiData = await aiResponse.json();
        const outputPart = aiData.candidates?.[0]?.content?.parts?.find(p => p.inline_data);
        
        if (!outputPart) throw new Error("A IA não retornou imagem.");

        const base64 = outputPart.inline_data.data;
        const buffer = Buffer.from(base64, 'base64');
        const filename = `AI_Gen_${Date.now()}_${Math.random().toString(36).substr(7)}.png`;
        const filepath = path.join(uploadDir, filename);
        
        fs.writeFileSync(filepath, buffer);
        
        // Return URL for frontend to download
        res.json({ url: `/uploads/${filename}`, filename: filename });
        
        // Serve static files logic is implicitly handled by download route usually, 
        // but let's add a specific static serve for uploads if needed or use download endpoint style
        // For simplicity, we'll use the existing /api/process/download logic structure or send file directly?
        // Let's return the URL and have a route to serve it.
        
    } catch (e) {
        console.error("Generate Image Error:", e);
        res.status(500).json({ message: e.message });
    }
});

// Route to serve generated assets
app.get('/uploads/:filename', (req, res) => {
    const filepath = path.join(uploadDir, req.params.filename);
    if(fs.existsSync(filepath)) res.sendFile(path.resolve(filepath));
    else res.status(404).send('File not found');
});

// 3. Generate Speech (TTS + Convert)
app.post('/api/ai/generate-speech', async (req, res) => {
    const { text, voice, speed, pitch } = req.body;
    const apiKey = process.env.API_KEY;

    if (!apiKey) return res.status(500).json({ message: 'API Key do servidor não configurada.' });
    
    try {
        // A. Call Gemini TTS
        // Voice Logic: Parse custom prompts passed from frontend or use defaults
        // The frontend sends a voiceId which might map to a base model in constants.ts
        // But here we need the "base" name (Kore, Puck, etc).
        // Since logic is in constants.ts, frontend should pass the mapped base voice or we rely on default.
        // For simplicity, we'll assume 'voice' param is the base voice name (e.g. 'Kore') 
        // OR the frontend handles mapping before sending.
        // Actually, previous code handled mapping in `getTTSPromptAndVoice`. 
        // We will accept `promptText` and `baseVoice` directly to be flexible.
        
        const promptText = req.body.promptText || text;
        const baseVoice = req.body.baseVoice || voice || 'Kore';

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: baseVoice } } } }
            })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API Error: ${await aiResponse.text()}`);
        
        const aiData = await aiResponse.json();
        const base64Audio = aiData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!base64Audio) throw new Error("No audio returned from Gemini.");

        // B. Convert PCM to WAV using FFmpeg
        const pcmBuffer = Buffer.from(base64Audio, 'base64');
        const pcmPath = path.join(uploadDir, `tts_raw_${Date.now()}.pcm`);
        const wavPath = path.join(uploadDir, `tts_${Date.now()}.wav`);
        
        fs.writeFileSync(pcmPath, pcmBuffer);

        // FFmpeg Conversion
        const speedVal = parseFloat(speed) || 1.0;
        const pitchVal = parseFloat(pitch) || 0;
        
        const filters = [];
        if (pitchVal !== 0) {
            const pitchFactor = 1 + (pitchVal / 20);
            const newRate = Math.round(24000 * pitchFactor);
            filters.push(`asetrate=${newRate}`);
            filters.push(`atempo=${1/pitchFactor}`);
        }
        if (speedVal !== 1.0) {
            filters.push(`atempo=${speedVal}`);
        }
        
        const filterArg = filters.length > 0 ? `-af "${filters.join(',')}"` : '';
        
        const cmd = `ffmpeg -f s16le -ar 24000 -ac 1 -i "${pcmPath}" ${filterArg} "${wavPath}"`;
        
        await new Promise((resolve, reject) => {
            exec(cmd, (err) => {
                fs.unlink(pcmPath, ()=>{});
                if (err) reject(err); else resolve();
            });
        });

        // C. Return URL
        const filename = path.basename(wavPath);
        res.json({ url: `/uploads/${filename}`, filename });

    } catch (e) {
        console.error("Generate Speech Error:", e);
        res.status(500).json({ message: e.message });
    }
});


// --- ROTA DE SCRAPING DE URL (NOVO) ---
app.post('/api/util/fetch-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'URL é obrigatória.' });

    try {
        console.log(`[Fetch URL] Fetching content from: ${url}`);
        
        // --- YOUTUBE SPECIAL HANDLING ---
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            try {
                // 1. Get Metadata via oEmbed (Official & Reliable for Title)
                const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
                const oembedRes = await fetch(oembedUrl);
                let title = "YouTube Video";
                let author = "";
                
                if (oembedRes.ok) {
                    const data = await oembedRes.json();
                    title = data.title;
                    author = data.author_name;
                }

                // 2. Get Description from Page HTML (Meta tags)
                const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
                const html = await pageRes.text();
                
                let description = "";
                // Try standard meta description
                const descMatch = html.match(/<meta name="description" content="([^"]*)"/i);
                if (descMatch) {
                    description = descMatch[1];
                } else {
                     // Try og:description
                     const ogDescMatch = html.match(/<meta property="og:description" content="([^"]*)"/i);
                     if (ogDescMatch) description = ogDescMatch[1];
                }

                const text = `Video Title: ${title}\nChannel: ${author}\n\nVideo Description/Context:\n${description}\n\n(Use this information to generate a script about the video topic)`;
                return res.json({ text });

            } catch (ytErr) {
                console.warn("YouTube Fetch partial failure, falling back to generic.", ytErr);
                // Fallback to generic if oembed fails
            }
        }

        // --- GENERIC WEB SCRAPER ---
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) throw new Error(`Falha ao acessar URL: ${response.status}`);
        
        const html = await response.text();
        
        // Simple HTML stripping and content extraction using Regex (since we can't add cheerio)
        // 1. Remove Scripts and Styles
        let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                       .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
        
        // 2. Extract Body content (rough approximation)
        const bodyMatch = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/im);
        if (bodyMatch) text = bodyMatch[1];

        // 3. Strip all tags, replacing block tags with newlines
        text = text.replace(/<\/div>|<\/p>|<\/h[1-6]>|<\/li>/gim, '\n');
        text = text.replace(/<[^>]+>/gim, '');
        
        // 4. Decode HTML Entities (Basic)
        text = text.replace(/&nbsp;/g, ' ')
                   .replace(/&amp;/g, '&')
                   .replace(/&quot;/g, '"')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>');

        // 5. Clean up whitespace
        text = text.split('\n')
                   .map(line => line.trim())
                   .filter(line => line.length > 50) // Filter out short lines (menus, links)
                   .join('\n\n');

        if (text.length < 50) {
             return res.json({ text: "Não foi possível extrair conteúdo relevante desta URL. O site pode estar bloqueado ou usar renderização complexa." });
        }

        // Limit length
        text = text.slice(0, 5000);

        res.json({ text });
    } catch (e) {
        console.error("URL Fetch Error:", e);
        res.status(500).json({ message: 'Erro ao buscar URL: ' + e.message });
    }
});


// --- ROTAS DE PROCESSAMENTO ASSÍNCRONO DE CLIPE ÚNICO ---

// 1. Iniciar uma tarefa de processamento
app.post('/api/process/start/:action', (req, res) => {
    const { action } = req.params;

    // Se for script-to-video, usamos uploadAny porque vem muitos arquivos dinamicos
    // Se for auto-ducking, usamos uploadFields para pegar video (musica) e audio (voz)
    const uploader = (action === 'style-transfer-real' || action === 'lip-sync-real' || action === 'auto-ducking-real') ? uploadFields : (action === 'script-to-video' ? uploadAny : uploadSingle);

    uploader(req, res, (err) => {
        if (err) return res.status(400).json({ message: `Erro no upload: ${err.message}` });
        
        const jobId = `${action}_${Date.now()}`;
        
        // Estrutura arquivos
        let files = {};
        if (action === 'script-to-video') {
             files = { all: req.files };
        } else if (action === 'style-transfer-real' || action === 'lip-sync-real' || action === 'auto-ducking-real') {
             files = req.files;
        } else {
             files = { video: [req.file] };
        }
        
        if (action !== 'script-to-video' && (!files.video || !files.video[0])) {
            return res.status(400).json({ message: 'Arquivo de vídeo principal ausente.' });
        }

        jobs[jobId] = { status: 'pending', files, params: req.body };
        res.status(202).json({ jobId });

        // Inicia o processamento em segundo plano
        if (action === 'script-to-video') {
             processScriptToVideoJob(jobId);
        } else if (action === 'video-to-cartoon-real') {
             processVideoToCartoonAIJob(jobId);
        } else {
             processSingleClipJob(jobId);
        }
    });
});

// Viral Cuts Route (Requires Special Handling for multiple steps)
app.post('/api/process/viral-cuts', uploadSingle, (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Vídeo é obrigatório.' });
    
    const jobId = `viral_cuts_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: { video: [req.file] }, params: req.body };
    res.status(202).json({ jobId });
    
    processViralCutsJob(jobId);
});

// 2. Verificar o status de uma tarefa
app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error });
});

// 3. Baixar o resultado de uma tarefa concluída
app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) {
        return res.status(404).json({ message: 'Ficheiro não encontrado ou a tarefa não está concluída.' });
    }
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath), (err) => {
        if (err) console.error("Erro ao fazer o download do ficheiro:", err);
        const allFiles = [];
        if (job.files.video) allFiles.push(...job.files.video);
        if (job.files.style) allFiles.push(...job.files.style);
        if (job.files.audio) allFiles.push(...job.files.audio);
        if (job.files.all) allFiles.push(...job.files.all);
        cleanupFiles([...allFiles, job.outputPath]);
        delete jobs[req.params.jobId];
    });
});

async function processViralCutsJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing';
    job.progress = 0;
    
    const videoFile = job.files.video[0];
    const apiKey = job.params.apiKey || process.env.API_KEY; 
    const count = parseInt(job.params.count) || 3;
    const style = job.params.style || 'crop';
    
    const outputFilename = `viral_cuts_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, outputFilename);
    const audioPath = path.join(uploadDir, `temp_audio_${jobId}.mp3`);
    job.outputPath = outputPath;

    try {
        // Step 1: Extract Audio (Low Bitrate to save bandwidth)
        console.log(`[Job ${jobId}] Extracting Audio...`);
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i "${videoFile.path}" -vn -ar 16000 -ac 1 -ab 32k "${audioPath}"`, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        job.progress = 20;

        // Step 2: Send Audio to Gemini for Analysis
        if (!apiKey) throw new Error("API Key is required for analysis (Check server .env or client settings).");
        
        console.log(`[Job ${jobId}] Analyzing with Gemini...`);
        const stats = fs.statSync(audioPath);
        const audioBuffer = fs.readFileSync(audioPath);
        const base64Audio = audioBuffer.toString('base64');

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: `Analyze this audio file. Identify exactly ${count} of the most viral, funny, or engaging segments suitable for a TikTok highlight reel. Return strictly a JSON array of objects with 'start' and 'end' times in seconds. Example: [{"start": 10, "end": 45}, ...]. Do not wrap in markdown.` },
                        { inline_data: { mime_type: "audio/mp3", data: base64Audio } }
                    ]
                }]
            })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API Error: ${await aiResponse.text()}`);
        
        const aiData = await aiResponse.json();
        const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No analysis received from AI.");
        
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const segments = JSON.parse(cleanJson);
        job.progress = 50;

        // Step 3: Cut and Concat Segments
        console.log(`[Job ${jobId}] Cutting ${segments.length} segments...`);
        
        const segmentFiles = [];
        
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const segPath = path.join(uploadDir, `seg_${jobId}_${i}.mp4`);
            const duration = seg.end - seg.start;
            
            // Reframe Filter based on style
            let vf = '';
            if (style === 'crop') {
                vf = `scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1`;
            } else {
                vf = `split[original][blur];[blur]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:(iw-720)/2:(ih-1280)/2,boxblur=20:10[bg];[original]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
            }

            // Cut & Reframe each segment
            await new Promise((resolve, reject) => {
                const cmd = `ffmpeg -ss ${seg.start} -t ${duration} -i "${videoFile.path}" -vf "${vf}" -c:v libx264 -preset ultrafast -c:a aac "${segPath}"`;
                exec(cmd, (err) => {
                    if (err) reject(err); else resolve();
                });
            });
            segmentFiles.push(segPath);
        }
        
        job.progress = 80;

        // Step 4: Concatenate
        const concatListPath = path.join(uploadDir, `concat_${jobId}.txt`);
        const fileContent = segmentFiles.map(f => `file '${path.resolve(f)}'`).join('\n');
        fs.writeFileSync(concatListPath, fileContent);

        await new Promise((resolve, reject) => {
            exec(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`, (err) => {
                if (err) reject(err); else resolve();
            });
        });

        // Cleanup intermediate
        fs.unlink(audioPath, ()=>{});
        fs.unlink(concatListPath, ()=>{});
        segmentFiles.forEach(f => fs.unlink(f, ()=>{}));

        job.status = 'completed';
        job.progress = 100;
        job.downloadUrl = `/api/process/download/${jobId}`;

    } catch (e) {
        console.error(`[Viral Cuts Error]`, e);
        job.status = 'failed';
        job.error = e.message;
        // Try cleanup
        if(fs.existsSync(audioPath)) fs.unlink(audioPath, ()=>{});
    }
}

async function processVideoToCartoonAIJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing';
    job.progress = 0;
    
    const videoFile = job.files.video[0];
    const apiKey = job.params.apiKey || process.env.API_KEY; 
    const style = job.params.style || 'anime';
    
    // Parse params object if it came as string
    let params = {};
    if (job.params && job.params.params) {
        try { params = JSON.parse(job.params.params); } catch(e) {}
    }
    const safeStyle = params.style || style;

    const outputFilename = `cartoon_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, outputFilename);
    const framePath = path.join(uploadDir, `frame_${jobId}.jpg`);
    const genImagePath = path.join(uploadDir, `gen_${jobId}.png`);
    
    job.outputPath = outputPath;

    try {
        if (!apiKey) throw new Error("API Key ausente. Configure no frontend ou no .env do servidor.");

        // 1. Extract a reference frame (at 1 second or middle)
        console.log(`[Job ${jobId}] Extracting Frame...`);
        await new Promise((resolve, reject) => {
            // Using -y to force overwrite
            const cmd1 = `ffmpeg -y -ss 00:00:01 -i "${videoFile.path}" -vframes 1 -q:v 2 "${framePath}"`;
            exec(cmd1, (err, stdout, stderr) => {
                // If error OR file doesn't exist (ffmpeg might not return error code on seek fail sometimes)
                if (err || !fs.existsSync(framePath)) {
                    console.warn(`[Job ${jobId}] 1s seek failed or file missing, trying 0s. Error: ${err?.message}`);
                    // Try at 0s if 1s fails (short video)
                    const cmd2 = `ffmpeg -y -i "${videoFile.path}" -vframes 1 -q:v 2 "${framePath}"`;
                    exec(cmd2, (err2, stdout2, stderr2) => {
                       if (err2) reject(new Error(`FFmpeg Error: ${stderr2}`)); 
                       else if (!fs.existsSync(framePath)) reject(new Error("Failed to create frame file even at 0s."));
                       else resolve();
                    });
                } else resolve();
            });
        });
        
        // Double check existence
        if (!fs.existsSync(framePath)) {
            throw new Error("Frame file not found after extraction.");
        }
        
        job.progress = 20;

        // 2. Generate Image using Gemini 2.5 Flash Image
        console.log(`[Job ${jobId}] Generating AI Cartoon (${safeStyle})...`);
        const imageBuffer = fs.readFileSync(framePath);
        const base64Image = imageBuffer.toString('base64');

        let prompt = "";
        if (safeStyle === 'anime') prompt = "Transform this image into a high-quality Anime style illustration. Vibrant colors, cel shading, anime character design. Maintain the composition.";
        else if (safeStyle === 'pixar') prompt = "Transform this image into a 3D Pixar/Disney style render. Cute, smooth textures, warm lighting, 3D character design.";
        else if (safeStyle === 'sketch') prompt = "Transform this image into a charcoal sketch or pencil drawing. Black and white, artistic strokes, high contrast.";
        else if (safeStyle === 'oil') prompt = "Transform this image into a classic Oil Painting. Visible brush strokes, textured, artistic.";
        else prompt = "Turn this into a cartoon.";

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                    ]
                }]
            })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API Error: ${await aiResponse.text()}`);
        
        const aiData = await aiResponse.json();
        const outputPart = aiData.candidates?.[0]?.content?.parts?.find(p => p.inline_data);
        
        if (!outputPart) {
             console.error("AI Response:", JSON.stringify(aiData));
             throw new Error("A IA não retornou uma imagem. (Bloqueio de segurança ou erro)");
        }

        const genImageBuffer = Buffer.from(outputPart.inline_data.data, 'base64');
        fs.writeFileSync(genImagePath, genImageBuffer);
        job.progress = 60;

        // 3. Create Video (Loop Image + Original Audio)
        console.log(`[Job ${jobId}] Rendering Final Video...`);
        // -shortest ensures the video ends when the audio ends
        // If audio is missing, it creates a 5s static video
        await new Promise((resolve, reject) => {
            const cmd = `ffmpeg -loop 1 -i "${genImagePath}" -i "${videoFile.path}" -map 0:v -map 1:a? -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest "${outputPath}"`;
            exec(cmd, (err) => {
                if (err) reject(err); else resolve();
            });
        });

        // Cleanup
        fs.unlink(framePath, ()=>{});
        fs.unlink(genImagePath, ()=>{});

        job.status = 'completed';
        job.progress = 100;
        job.downloadUrl = `/api/process/download/${jobId}`;

    } catch (e) {
        console.error(`[Video-to-Cartoon Error]`, e);
        job.status = 'failed';
        job.error = e.message;
        if (fs.existsSync(framePath)) fs.unlink(framePath, ()=>{});
    }
}

function processScriptToVideoJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing';
    job.progress = 0;
    const outputFilename = `script_video_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, outputFilename);
    job.outputPath = outputPath;

    // Organizar pares imagem/audio
    const images = job.files.all.filter(f => f.fieldname.startsWith('image_')).sort((a,b) => a.fieldname.localeCompare(b.fieldname));
    const audios = job.files.all.filter(f => f.fieldname.startsWith('audio_')).sort((a,b) => a.fieldname.localeCompare(b.fieldname));

    if (images.length === 0 || audios.length === 0 || images.length !== audios.length) {
        job.status = 'failed'; job.error = "Desequilíbrio entre imagens e áudios."; return;
    }

    // 1. Obter duração dos áudios
    const run = async () => {
        try {
            const durationPromises = audios.map(audio => new Promise((resolve, reject) => {
                exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audio.path}"`, (err, stdout) => {
                    if (err) reject(err); else resolve(parseFloat(stdout.trim()));
                });
            }));

            const durations = await Promise.all(durationPromises);
            job.progress = 20;

            // 2. Construir comando complexo
            let inputs = '';
            let filterComplex = '';
            let concatSegments = '';

            for (let i = 0; i < images.length; i++) {
                inputs += `-loop 1 -t ${durations[i]} -i "${images[i].path}" -i "${audios[i].path}" `;
                // Efeito Ken Burns aleatório
                // zoompan com duração fixa baseada em frames (25fps)
                const frames = Math.ceil(durations[i] * 25);
                filterComplex += `[${i*2}:v]scale=1280:720,setsar=1,zoompan=z='min(zoom+0.0015,1.5)':d=${frames}:s=1280x720[v${i}]; `;
                
                // IMPORTANTE: Intercalar Video e Audio para o filtro concat (V, A, V, A...)
                // Usar aresample para garantir sincronia
                filterComplex += `[${i*2+1}:a]aresample=async=1[a${i}]; `;
                concatSegments += `[v${i}][a${i}]`;
            }

            filterComplex += `${concatSegments}concat=n=${images.length}:v=1:a=1[outv][outa]`;

            // Adicionado -preset superfast para renderização mais rápida
            const command = `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset superfast -pix_fmt yuv420p -c:a aac "${outputPath}"`;
            
            console.log(`[Job ${jobId}] Rendering Script Video...`);
            
            exec(command, (err) => {
                if (err) {
                    console.error(err);
                    job.status = 'failed'; job.error = "Erro no FFmpeg: " + err.message;
                } else {
                    job.status = 'completed'; job.progress = 100; job.downloadUrl = `/api/process/download/${jobId}`;
                }
            });

        } catch (e) {
            job.status = 'failed'; job.error = e.message;
        }
    };
    run();
}


// --- LÓGICA DE PROCESSAMENTO DE TAREFAS DE CLIPE ÚNICO ---
function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing';
    job.progress = 0;

    const action = jobId.split('_')[0];
    const videoFile = job.files.video[0];
    
    // Parse params if sent as string (FormData)
    let params = {};
    if (job.params && job.params.params) {
        try {
            params = typeof job.params.params === 'string' ? JSON.parse(job.params.params) : job.params.params;
        } catch(e) { console.error("Error parsing params", e); }
    } else if (job.params) {
        params = job.params;
    }

    let outputExtension = '.mp4';
    // Use .wav for pure audio processing to ensure quality and prevent video container errors
    if (['extract-audio-real', 'remove-silence-real', 'reduce-noise-real', 'isolate-voice-real', 'enhance-voice-real', 'auto-ducking-real'].includes(action)) {
        outputExtension = '.wav';
    }
    // Use .png for stickers to support transparency
    if (action === 'stickerize-real') {
        outputExtension = '.png';
    }

    const outputFilename = `${action}-${Date.now()}${outputExtension}`;
    const outputPath = path.join(uploadDir, outputFilename);
    job.outputPath = outputPath;

    let command;
    let processHandler;

    const cleanup = () => {
        const allFiles = [];
        if (job.files.video) allFiles.push(...job.files.video);
        if (job.files.style) allFiles.push(...job.files.style);
        if (job.files.audio) allFiles.push(...job.files.audio);
        cleanupFiles([...allFiles, outputPath]);
    };

    // Filtros FFmpeg para substituir os scripts Python
    switch (action) {
        // --- VIDEO TOOLS ---
        case 'stabilize-real':
            const transformsFile = path.join(uploadDir, `${videoFile.filename}.trf`);
            const detectCommand = `ffmpeg -i "${videoFile.path}" -vf vidstabdetect=result="${transformsFile}" -f null -`;
            const transformCommand = `ffmpeg -i "${videoFile.path}" -vf vidstabtransform=input="${transformsFile}":zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4 -vcodec libx264 -preset fast "${outputPath}"`;
            
            processHandler = (resolve, reject) => {
                job.progress = 10;
                exec(detectCommand, (err, stdout, stderr) => {
                    if (err) return reject(stderr);
                    job.progress = 50;
                    exec(transformCommand, (err2, stdout2, stderr2) => {
                        fs.unlink(transformsFile, () => {});
                        if (err2) return reject(stderr2);
                        job.progress = 100;
                        resolve();
                    });
                });
            };
            break;

        case 'style-transfer-real':
             command = `ffmpeg -i "${videoFile.path}" -vf "curves=vintage,eq=contrast=1.2:saturation=1.3:brightness=0.1" -c:v libx264 -preset veryfast "${outputPath}"`;
             break;
        
        case 'remove-bg-real':
             // Simulação simples pois requer IA
             console.log("Remoção de fundo requer Python. Retornando vídeo original.");
             processHandler = (resolve, reject) => {
                 fs.copyFile(videoFile.path, outputPath, (err) => {
                     if (err) reject(err);
                     else resolve();
                 });
             };
             break;

        case 'reframe-real':
             // Auto Reframe to 9:16 (Vertical)
             // Mode 'crop': Center Crop (scales height to 1280, crops width to 720 center)
             // Mode 'blur': Stacked blurred background + scaled original foreground
             const reframeMode = params.mode || 'crop';
             
             if (reframeMode === 'crop') {
                 // Scale height to 1280 (HD Vertical height), maintain aspect ratio, then crop center 720 width
                 command = `ffmpeg -i "${videoFile.path}" -vf "scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1" -c:v libx264 -preset veryfast "${outputPath}"`;
             } else {
                 // Blur Mode: Background is scaled to fill 9:16 (blurred), Foreground is scaled to fit width (centered)
                 command = `ffmpeg -i "${videoFile.path}" -vf "split[original][blur];[blur]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:(iw-720)/2:(ih-1280)/2,boxblur=20:10[bg];[original]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" -c:v libx264 -preset veryfast "${outputPath}"`;
             }
             break;

        case 'retouch-real':
             command = `ffmpeg -i "${videoFile.path}" -vf "smartblur=lr=1.5:ls=-0.8:lt=-5.0" -c:v libx264 -preset veryfast "${outputPath}"`;
             break;

        case 'interpolate-real':
             command = `ffmpeg -i "${videoFile.path}" -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" -c:v libx264 -preset ultrafast "${outputPath}"`;
             break;
        
        case 'reverse-real':
             command = `ffmpeg -i "${videoFile.path}" -vf reverse -af areverse -c:v libx264 -preset veryfast "${outputPath}"`;
             break;
             
        case 'upscale-real':
             // Upscaling to 4K (3840x2160)
             // uses lanczos scaling algorithm + unsharp mask to simulate detail enhancement
             // CRF 18 for high quality
             command = `ffmpeg -i "${videoFile.path}" -vf "scale=3840:2160:flags=lanczos,unsharp=5:5:1.0:5:5:0.0" -c:v libx264 -preset superfast -crf 18 "${outputPath}"`;
             break;
             
        case 'magic-erase-real':
             const { x, y, w, h } = params;
             // Use delogo to remove object in the bounding box
             // ensure dimensions are valid
             const dx = Math.round(x);
             const dy = Math.round(y);
             const dw = Math.round(w);
             const dh = Math.round(h);
             command = `ffmpeg -i "${videoFile.path}" -vf "delogo=x=${dx}:y=${dy}:w=${dw}:h=${dh}:show=0" -c:v libx264 -preset veryfast "${outputPath}"`;
             break;
             
        case 'video-to-cartoon-real':
             // This case is deprecated/replaced by the AI handler, but kept as fallback or for older calls
             const style = params.style || 'anime';
             if (style === 'anime') {
                 command = `ffmpeg -i "${videoFile.path}" -vf "median=3,unsharp=5:5:1.0:5:5:0.0,eq=saturation=1.5:contrast=1.1" -c:a copy -c:v libx264 -preset veryfast "${outputPath}"`;
             } else {
                 command = `ffmpeg -i "${videoFile.path}" -vf "eq=saturation=1.3" -c:a copy -c:v libx264 -preset veryfast "${outputPath}"`;
             }
             break;
             
        case 'face-zoom-real':
             const mode = params.mode || 'punch';
             const intensity = parseFloat(params.intensity) || 1.3;
             const interval = parseInt(params.interval) || 5;
             
             // Dynamic Zoom / Face Zoom Logic
             if (mode === 'punch') {
                 // Punch Cut: Hard cut to zoomed version every interval
                 const zoomW = `iw/${intensity}`;
                 const zoomH = `ih/${intensity}`;
                 const cropX = `(iw-ow)/2`;
                 const cropY = `(ih-oh)/2`;
                 const zoomStart = interval * 0.6;
                 
                 command = `ffmpeg -i "${videoFile.path}" -filter_complex "[0:v]split[v1][v2];[v2]crop=w=${zoomW}:h=${zoomH}:x=${cropX}:y=${cropY},scale=iw:ih[v2scaled];[v1][v2scaled]overlay=0:0:enable='between(mod(t,${interval}),${zoomStart},${interval})'" -c:v libx264 -preset veryfast "${outputPath}"`;
             } else {
                 // Smooth Zoom: Continuous slow movement using zoompan
                 const durationFrames = 30 * interval;
                 command = `ffmpeg -i "${videoFile.path}" -vf "zoompan=z='min(zoom+0.0015,${intensity})':d=${durationFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=30" -c:v libx264 -preset veryfast "${outputPath}"`;
             }
             break;
             
        case 'lip-sync-real':
             // Dubbing/Lip Sync Simulation: Replace audio of video with new audio file.
             // Input 0: Video, Input 1: Audio
             if (!job.files.audio || !job.files.audio[0]) {
                 job.status = 'failed'; job.error = "Arquivo de áudio para Lip Sync não encontrado."; cleanup(); return;
             }
             const audioPath = job.files.audio[0].path;
             // Map video from 0, audio from 1. Copy video codec (fast), re-encode audio if needed (aac).
             // -shortest: cut video to audio length or vice versa (usually audio dictates length in dubbing).
             command = `ffmpeg -i "${videoFile.path}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${outputPath}"`;
             break;
             
        case 'stickerize-real':
             // Remove Chroma Key Green (#00FF00) to create transparency
             // colorkey=color:similarity:blend
             // Output to PNG (-c:v png)
             command = `ffmpeg -i "${videoFile.path}" -vf "colorkey=0x00FF00:0.35:0.1" -c:v png -compression_level 0 "${outputPath}"`;
             break;

        // --- AUDIO TOOLS ---
        case 'extract-audio-real':
             // Extract audio as WAV
             command = `ffmpeg -i "${videoFile.path}" -vn -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
             break;
        
        case 'remove-silence-real':
             const silThreshold = params.threshold || -30;
             const silDuration = params.duration || 0.5;
             // Use -vn to ignore video stream (prevents errors if input is audio-only OR prevents desync if input is video)
             // Returns cleaned audio file.
             command = `ffmpeg -i "${videoFile.path}" -vn -af "silenceremove=start_periods=1:start_duration=${silDuration}:start_threshold=${silThreshold}dB:stop_periods=-1:stop_duration=${silDuration}:stop_threshold=${silThreshold}dB" -acodec pcm_s16le "${outputPath}"`;
             break;

        case 'reduce-noise-real':
             const noiseIntensity = params.intensity || 50; 
             command = `ffmpeg -i "${videoFile.path}" -vn -af "afftdn" -acodec pcm_s16le "${outputPath}"`;
             break;
             
        case 'isolate-voice-real':
             const isoMode = params.mode || 'voice';
             const isoFilter = isoMode === 'voice' ? 'lowpass=f=3000,highpass=f=300' : 'bandreject=f=1000:width_type=h:w=2000';
             command = `ffmpeg -i "${videoFile.path}" -vn -af "${isoFilter}" -acodec pcm_s16le "${outputPath}"`;
             break;

        case 'enhance-voice-real':
             command = `ffmpeg -i "${videoFile.path}" -vn -af "highpass=f=200,lowpass=f=3000,acompressor=threshold=0.089:ratio=2:attack=20:release=1000" -acodec pcm_s16le "${outputPath}"`;
             break;
             
        case 'auto-ducking-real':
             // Input 0: Music (Video/Audio File)
             // Input 1: Voice Control (Audio File)
             // Use sidechaincompress to compress Input 0 based on Input 1
             if (!job.files.audio || !job.files.audio[0]) {
                 job.status = 'failed'; job.error = "Arquivo de voz para Auto-Ducking não encontrado."; cleanup(); return;
             }
             const voicePath = job.files.audio[0].path;
             const th = params.threshold || 0.125; // 0-1 amplitude (default 0.125 ~ -18dB)
             const ratio = params.ratio || 2; // Ratio (default 2)
             
             // [0:a] is main, [1:a] is sidechain. Output [outa].
             // Use -vn to output just audio (safer for "fixing" music track)
             command = `ffmpeg -i "${videoFile.path}" -i "${voicePath}" -filter_complex "[0:a][1:a]sidechaincompress=threshold=${th}:ratio=${ratio}:attack=20:release=300[outa]" -map "[outa]" -acodec pcm_s16le "${outputPath}"`;
             break;
        
        default:
            job.status = 'failed';
            job.error = `Ação desconhecida: ${action}`;
            cleanup();
            return;
    }

    const executeJob = () => {
        const promise = processHandler ? new Promise(processHandler) : new Promise((resolve, reject) => {
            console.log(`[Job ${jobId}] Executando FFmpeg: ${command}`);
            const process = exec(command, (err, stdout, stderr) => {
                if (err) {
                    console.error(`[Job ${jobId}] Erro:`, stderr);
                    return reject(stderr || err.message);
                }
                resolve(stdout);
            });
        });

        promise.then(() => {
            job.status = 'completed';
            job.progress = 100;
            job.downloadUrl = `/api/process/download/${jobId}`;
        }).catch(error => {
            job.status = 'failed';
            job.error = `Falha no processamento: ${error.toString().slice(-300)}`;
            console.error(`[Job ${jobId} Falhou]:`, error);
        });
    };
    
    executeJob();
}

// --- ROTA DE GERAÇÃO DE MÚSICA IA (DSP SYNTHESIS) ---
app.post('/api/process/generate-music', uploadAny, (req, res) => {
    const { filter, duration } = req.body;
    
    if (!filter) return res.status(400).json({ message: 'Filtro FFmpeg ausente.' });
    
    const jobId = `music_gen_${Date.now()}`;
    const outputFilename = `ai_music_${Date.now()}.wav`;
    const outputPath = path.join(uploadDir, outputFilename);
    const dur = parseFloat(duration) || 10;

    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });

    // Use lavfi source to generate audio based on filter graph
    // -f lavfi -i "FILTER" -t DURATION ...
    // Note: complex filters might require explicit null input sometimes, but lavfi source works well.
    const command = `ffmpeg -f lavfi -i "${filter}" -t ${dur} -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
    
    console.log(`[Music Gen] Generating with filter: ${filter}`);

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`[Music Gen Error]`, stderr);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = "Erro na síntese de áudio.";
        } else {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        }
    });
});

// --- ROTA DE CLONAGEM DE VOZ ---
app.post('/api/process/voice-clone', uploadAudio, async (req, res) => {
    const audioFile = req.file;
    const text = req.body.text;
    const apiKey = req.body.apiKey; // Passed from frontend

    if (!audioFile || !text) {
        return res.status(400).json({ message: 'Áudio e texto são obrigatórios.' });
    }

    const jobId = `clone_voice_${Date.now()}`;
    const outputFilename = `cloned_voice_${Date.now()}.wav`;
    const outputPath = path.join(uploadDir, outputFilename);
    const tempWavInput = path.join(uploadDir, `input_${Date.now()}.wav`);

    jobs[jobId] = { status: 'processing', progress: 0 };
    res.status(202).json({ jobId });

    try {
        // 1. Convert input to standard WAV (for compatibility)
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i "${audioFile.path}" -vn -acodec pcm_s16le -ar 44100 -ac 1 "${tempWavInput}"`, (err) => {
                if(err) reject(err); else resolve();
            });
        });

        if (apiKey && apiKey.length > 10) {
            // --- REAL CLONING (ELEVENLABS) ---
            console.log(`[Voice Clone] Using ElevenLabs API...`);
            
            // Note: Since I cannot assume 'axios' or 'form-data' packages are installed in the user's environment based on the rules,
            // I must use the built-in 'fetch' (available in Node 18+) or fallback to 'https' module.
            // Assuming modern Node environment.
            
            // Step A: Add the voice
            const formData = new FormData();
            const fileData = fs.readFileSync(tempWavInput);
            const fileBlob = new Blob([fileData], { type: 'audio/wav' });
            formData.append('files', fileBlob, 'sample.wav');
            formData.append('name', `Clone-${Date.now()}`);
            formData.append('description', 'User cloned voice from ProEdit');

            const addVoiceRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                method: 'POST',
                headers: { 'xi-api-key': apiKey },
                body: formData
            });

            if (!addVoiceRes.ok) {
                const errText = await addVoiceRes.text();
                throw new Error(`ElevenLabs Error (Add Voice): ${errText}`);
            }

            const voiceData = await addVoiceRes.json();
            const voiceId = voiceData.voice_id;

            // Step B: Generate Audio (TTS)
            const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: { 
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (!ttsRes.ok) {
                throw new Error(`ElevenLabs Error (TTS): ${await ttsRes.text()}`);
            }

            const arrayBuffer = await ttsRes.arrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

            // Optional: Delete voice to clean up slot (skipping for now to avoid complexity)

        } else {
            // --- FALLBACK SIMULATION (FFMPEG + GEMINI BASE) ---
            // If no key, return generic error or fallback message as per user request context
            // But we already implemented this fallback logic before
            throw new Error("Chave da API ElevenLabs não fornecida. Configure em Configurações > API.");
        }

        jobs[jobId] = {
            status: 'completed',
            progress: 100,
            downloadUrl: `/api/process/download/${jobId}`,
            outputPath: outputPath
        };

        // Cleanup temp
        fs.unlink(audioFile.path, ()=>{});
        if (fs.existsSync(tempWavInput)) fs.unlink(tempWavInput, ()=>{});

    } catch (e) {
        console.error("Voice Clone Error:", e);
        jobs[jobId] = { status: 'failed', error: e.message };
        fs.unlink(audioFile.path, ()=>{});
    }
});

   // --- Inject API Key if needed for Viral Cuts or other AI tasks ---
            if (endpoint.includes('viral-cuts') || endpoint.includes('video-to-cartoon')) {
                // IMPORTANT: Ensure the key is sent to backend for Gemini REST API usage
                // Only inject if not provided in options AND if it exists in env
                if (!options?.apiKey && process.env.API_KEY) {
                    formData.append('apiKey', process.env.API_KEY);
                }
            }

            if (params) formData.append('params', JSON.stringify(params));
            if (options?.extraFile) formData.append(options.extraFieldName || 'file', options.extraFile);
            
            // Append explicit option key if provided (overrides env)
            if (options?.apiKey) formData.append('apiKey', options.apiKey);
            
            const res = await fetch(`${BACKEND_URL}${endpoint}`, { method: 'POST', body: formData });
            
            if (res.ok) {


// --- ROTA DE CONVERSÃO DE ÁUDIO BRUTO (TTS) ---
app.post('/api/util/convert-raw-audio', uploadAudio, (req, res) => {
    if (!req.file || !fs.existsSync(req.file.path)) {
        return res.status(400).json({ message: 'Nenhum arquivo de áudio enviado.' });
    }

    const inputPath = req.file.path;
    const speed = parseFloat(req.body.speed) || 1.0;
    const pitch = parseFloat(req.body.pitch) || 0;

    const args = [
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        '-i', inputPath
    ];

    // Build FFmpeg filter chain for Speed and Pitch
    const filters = [];
    
    if (pitch !== 0) {
        const pitchFactor = 1 + (pitch / 20); // -10 -> 0.5, +10 -> 1.5
        const newRate = Math.round(24000 * pitchFactor);
        filters.push(`asetrate=${newRate}`);
        filters.push(`atempo=${1/pitchFactor}`);
    }

    if (speed !== 1.0) {
        filters.push(`atempo=${speed}`);
    }

    if (filters.length > 0) {
        args.push('-af', filters.join(','));
    }

    args.push('-f', 'wav', 'pipe:1');

    console.log(`[TTS Convert] Converting Raw PCM to WAV with filters: ${filters.join(', ')}`);
    
    const ffmpeg = spawn('ffmpeg', args);

    res.setHeader('Content-Type', 'audio/wav');
    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on('data', d => console.error(`[FFmpeg TTS]: ${d.toString()}`));
    
    ffmpeg.on('close', () => {
        fs.unlink(inputPath, () => {});
    });
});

app.post('/api/process/extract-frame', uploadSingle, (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const timestamp = req.body.timestamp || '0';
    const outputFilename = `frame-${path.parse(filename).name}.png`;
    const outputPath = path.join(uploadDir, outputFilename);
    const command = `ffmpeg -ss ${timestamp} -i "${inputPath}" -vframes 1 -f image2 "${outputPath}"`;
    exec(command, (err, stdout, stderr) => {
        cleanupFiles([inputPath]);
        if (err) {
            console.error('[Extract Frame] Falha:', stderr);
            cleanupFiles([outputPath]);
            return res.status(500).json({ message: 'Falha ao extrair o frame.' });
        }
        res.sendFile(path.resolve(outputPath), (sendErr) => {
            if (sendErr) console.error('Erro ao enviar frame:', sendErr);
            cleanupFiles([outputPath]);
        });
    });
});

app.post('/api/process/scene-detect', uploadSingle, (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath } = req.file;
    const command = `ffmpeg -i "${inputPath}" -vf "select='gt(scene,0.4)',showinfo" -f null - 2>&1`;
    exec(command, (err, stdout, stderr) => {
        cleanupFiles([inputPath]);
        if (err) { console.error('Scene Detect Error:', stderr); return res.status(500).send('Falha ao detectar cenas.'); }
        const timestamps = (stderr.match(/pts_time:([\d.]+)/g) || []).map(s => parseFloat(s.split(':')[1]));
        res.json(timestamps);
    });
});


// --- ROTA DE EXPORTAÇÃO COMPLETA ---
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).json({ message: 'Dados do projeto em falta.' });
    jobs[jobId] = { status: 'pending', files: req.files, projectState: JSON.parse(req.body.projectState) };
    res.status(202).json({ jobId });
    processExportJob(jobId);
});
app.get('/api/export/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error });
});
app.get('/api/export/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) return res.status(404).json({ message: 'Ficheiro não encontrado.' });
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath), (err) => {
        if (err) console.error("Erro no download:", err);
        cleanupFiles([job.outputPath, ...job.files]);
        delete jobs[req.params.jobId];
    });
});
function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing"; job.progress = 0;
    try {
        const { files, projectState } = job;
        if (!projectState || typeof projectState !== 'object') throw new Error("Os dados do projeto (projectState) estão inválidos ou em falta.");
        const { clips, totalDuration, media, projectAspectRatio } = projectState;
        if (!clips || !media || totalDuration === undefined) throw new Error("Dados essenciais (clips, media, totalDuration) em falta no projectState.");

        const aspectRatio = projectAspectRatio || '16:9';
        let width = 1280, height = 720;
        if (aspectRatio === '9:16') { width = 720; height = 1280; }
        else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
        else if (aspectRatio === '4:3') { width = 1280; height = 960; }
        
        if (files.length === 0 && totalDuration > 0) { job.status = "failed"; job.error = "Não foram enviados ficheiros para um projeto com duração."; return; }

        const commandArgs = []; const fileMap = {};
        files.forEach(file => {
            const mediaInfo = media[file.originalname];
            if (mediaInfo?.type === "image") commandArgs.push("-loop", "1");
            commandArgs.push("-i", file.path);
            fileMap[file.originalname] = commandArgs.filter(arg => arg === "-i").length - 1;
        });

        let filterChains = [];
        const audioClips = clips.filter(c => media[c.fileName]?.hasAudio && (c.properties.volume ?? 1) > 0);
        
        const videoAndLayerClips = clips.filter(c => c.track === 'video' || c.track === 'camada');
        
        videoAndLayerClips.forEach((clip, vIdx) => {
            const inputIndex = fileMap[clip.fileName];
            if (inputIndex === undefined) return;

            let clipSpecificFilters = [];
            const adj = clip.properties.adjustments;
            if (adj) {
                const ffmpegBrightness = (adj.brightness || 1.0) - 1.0;
                clipSpecificFilters.push(`eq=brightness=${ffmpegBrightness}:contrast=${adj.contrast || 1.0}:saturation=${adj.saturate || 1.0}:hue=${(adj.hue || 0) * (Math.PI/180)}`);
            }
            if (clip.properties.mirror) clipSpecificFilters.push('hflip');

            const speed = clip.properties.speed || 1;
            let speedFilter = `setpts=PTS/${speed}`;

            const preFilter = `[${inputIndex}:v]${clipSpecificFilters.length > 0 ? clipSpecificFilters.join(',')+',' : ''}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
            filterChains.push(`${preFilter}[vpre${vIdx}]`);
            filterChains.push(`[vpre${vIdx}]${speedFilter}[v${vIdx}]`);
        });

        let videoChain = `color=s=${width}x${height}:c=black:d=${totalDuration}[base]`;
        if (videoAndLayerClips.length > 0) {
            let prevOverlay = "[base]";
            videoAndLayerClips.forEach((clip, idx) => {
                const isLast = idx === videoAndLayerClips.length - 1;
                const nextOverlay = isLast ? "[outv]" : `[ov${idx}]`;
                const vIdx = videoAndLayerClips.indexOf(clip);
                videoChain += `;${prevOverlay}[v${vIdx}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})'${nextOverlay}`;
                prevOverlay = nextOverlay;
            });
        } else {
            videoChain += ";[base]null[outv]";
        }
        filterChains.push(videoChain);

        if (audioClips.length > 0) {
            const delayed = [];
            const mixed = [];
            audioClips.forEach((clip, idx) => {
                const inputIndex = fileMap[clip.fileName];
                if (inputIndex === undefined) return;
                const volume = clip.properties.volume ?? 1;
                const volFilter = volume !== 1 ? `volume=${volume}` : "anull";
                delayed.push(`[${inputIndex}:a]${volFilter},asetpts=PTS-STARTPTS,aresample=44100[a${idx}_pre]`, `[a${idx}_pre]adelay=${clip.start * 1000}|${clip.start * 1000}[a${idx}]`);
                mixed.push(`[a${idx}]`);
            });
            filterChains.push(...delayed);
            filterChains.push(`${mixed.join("")}amix=inputs=${mixed.length}:dropout_transition=3[outa]`);
        }

        const outputPath = path.join(uploadDir, `${jobId}.mp4`);
        job.outputPath = outputPath;
        if (audioClips.length === 0) commandArgs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
        commandArgs.push("-filter_complex", filterChains.join(";"), "-map", "[outv]");
        if (audioClips.length > 0) commandArgs.push("-map", "[outa]");
        else { const silentIndex = files.length; commandArgs.push("-map", `${silentIndex}:a`); }
        commandArgs.push("-c:v", "libx264", "-c:a", "aac", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", "-progress", "pipe:1", "-t", totalDuration, outputPath);

        console.log(`[Export Job] FFmpeg: ffmpeg ${commandArgs.join(" ")}`);
        const ffmpegProcess = spawn("ffmpeg", commandArgs);
        ffmpegProcess.stdout.on("data", data => { const match = data.toString().match(/out_time_ms=(\d+)/); if (match) { const processed = parseInt(match[1], 10) / 1e6; job.progress = Math.min(100, (processed / totalDuration) * 100); } });
        let ffmpegErrors = "";
        ffmpegProcess.stderr.on("data", data => { ffmpegErrors += data.toString(); console.error(`[FFmpeg STDERR]: ${data}`); });
        ffmpegProcess.on("close", code => {
            if (code !== 0) { job.status = "failed"; job.error = "Falha no FFmpeg. " + ffmpegErrors.slice(-800); }
            else { job.status = "completed"; job.progress = 100; job.downloadUrl = `/api/export/download/${jobId}`; }
        });
        ffmpegProcess.on("error", err => { job.status = "failed"; job.error = "Falha ao iniciar o processo FFmpeg."; });
    } catch (err) { job.status = "failed"; job.error = "Ocorreu um erro inesperado no servidor: " + err.message; console.error("[Export Job] Erro catastrófico:", err); }
}


// Iniciar o Servidor
app.listen(PORT, () => {
  console.log(`Servidor a escutar na porta ${PORT}`);
});
