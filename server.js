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
const uploadAudio = multer({ storage: storage }).single('audio'); 
const uploadFields = multer({ storage: storage }).fields([
    { name: 'video', maxCount: 1 },
    { name: 'style', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]);
// INCREASE LIMITS FOR ANY UPLOAD TO SUPPORT LARGE PROJECT STATE
const uploadAny = multer({ 
    storage: storage,
    limits: { 
        fieldSize: 100 * 1024 * 1024, // 100MB for text fields (projectState)
        fileSize: 5 * 1024 * 1024 * 1024 // 5GB for files
    } 
}).any();


// --- Sistema de Tarefas Assíncronas ---
const jobs = {};

// --- Funções Auxiliares ---
const cleanupFiles = (files) => {
    files.forEach(file => {
        if (file && file.path && fs.existsSync(file.path)) fs.unlink(file.path, () => {});
        else if (typeof file === 'string' && fs.existsSync(file)) fs.unlink(file, () => {});
    });
};

const isImage = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'].includes(ext);
};

// --- Rotas ---
app.get('/', (req, res) => res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' }));

app.get('/api/check-ffmpeg', (req, res) => {
    exec('ffmpeg -version', (error) => {
        if (error) return res.status(500).json({ status: 'offline', error: 'FFmpeg not found' });
        res.json({ status: 'online' });
    });
});

// --- ROTA DE SCRAPING DE URL ---
app.post('/api/util/fetch-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'URL é obrigatória.' });

    try {
        console.log(`[Fetch URL] Fetching content from: ${url}`);
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            try {
                const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
                const oembedRes = await fetch(oembedUrl);
                let title = "YouTube Video";
                let author = "";
                if (oembedRes.ok) {
                    const data = await oembedRes.json();
                    title = data.title;
                    author = data.author_name;
                }
                const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
                const html = await pageRes.text();
                let description = "";
                const descMatch = html.match(/<meta name="description" content="([^"]*)"/i);
                if (descMatch) description = descMatch[1];
                const text = `Video Title: ${title}\nChannel: ${author}\n\nVideo Description/Context:\n${description}\n\n(Use this information to generate a script about the video topic)`;
                return res.json({ text });
            } catch (ytErr) {
                console.warn("YouTube Fetch partial failure, falling back to generic.", ytErr);
            }
        }
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        if (!response.ok) throw new Error(`Falha ao acessar URL: ${response.status}`);
        const html = await response.text();
        let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "").replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
        const bodyMatch = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/im);
        if (bodyMatch) text = bodyMatch[1];
        text = text.replace(/<\/div>|<\/p>|<\/h[1-6]>|<\/li>/gim, '\n').replace(/<[^>]+>/gim, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        text = text.split('\n').map(line => line.trim()).filter(line => line.length > 50).join('\n\n');
        if (text.length < 50) return res.json({ text: "Não foi possível extrair conteúdo relevante desta URL." });
        text = text.slice(0, 5000);
        res.json({ text });
    } catch (e) {
        res.status(500).json({ message: 'Erro ao buscar URL: ' + e.message });
    }
});


// --- ROTA DE EXPORTAÇÃO ---
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).json({ message: 'Dados do projeto em falta.' });
    try {
        const projectState = JSON.parse(req.body.projectState);
        jobs[jobId] = { status: 'pending', files: req.files, projectState };
        res.status(202).json({ jobId });
        processExportJob(jobId);
    } catch (e) {
        return res.status(400).json({ message: 'Dados do projeto inválidos.' });
    }
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
        const { clips, totalDuration, media, projectAspectRatio } = projectState;
        const aspectRatio = projectAspectRatio || '16:9';
        let width = 1280, height = 720;
        if (aspectRatio === '9:16') { width = 720; height = 1280; }
        else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
        
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
        } else { videoChain += ";[base]null[outv]"; }
        filterChains.push(videoChain);

        if (audioClips.length > 0) {
            const delayed = []; const mixed = [];
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
        commandArgs.push("-c:v", "libx264", "-c:a", "aac", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", "-threads", "2", "-progress", "pipe:1", "-t", totalDuration, outputPath);

        const ffmpegProcess = spawn("ffmpeg", commandArgs);
        ffmpegProcess.on("close", code => {
            if (code !== 0) { job.status = "failed"; job.error = "Falha no FFmpeg."; }
            else { job.status = "completed"; job.progress = 100; job.downloadUrl = `/api/export/download/${jobId}`; }
        });
    } catch (err) { job.status = "failed"; job.error = err.message; }
}

app.post('/api/process/start/:action', (req, res) => {
    const { action } = req.params;
    const uploader = (action === 'style-transfer-real' || action === 'lip-sync-real' || action === 'auto-ducking-real' || action === 'voice-clone') ? uploadFields : (action === 'script-to-video' ? uploadAny : uploadSingle);

    uploader(req, res, (err) => {
        if (err) return res.status(400).json({ message: `Erro no upload: ${err.message}` });
        
        const jobId = `${action}_${Date.now()}`;
        let files = {};
        if (action === 'script-to-video') files = { all: req.files };
        else if (action === 'style-transfer-real' || action === 'lip-sync-real' || action === 'auto-ducking-real' || action === 'voice-clone') files = req.files;
        else files = { video: [req.file] };
        
        jobs[jobId] = { status: 'pending', files, params: req.body };
        res.status(202).json({ jobId });

        if (action === 'script-to-video') processScriptToVideoJob(jobId);
        else if (action === 'viral-cuts') processViralCutsJob(jobId);
        else processSingleClipJob(jobId);
    });
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error });
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) return res.status(404).json({ message: 'Erro.' });
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath), (err) => {
        const allFiles = [];
        if (job.files.video) allFiles.push(...job.files.video);
        if (job.files.style) allFiles.push(...job.files.style);
        if (job.files.audio) allFiles.push(...job.files.audio);
        if (job.files.all) allFiles.push(...job.files.all);
        cleanupFiles([...allFiles, job.outputPath]);
        delete jobs[req.params.jobId];
    });
});

// Viral Cuts Logic
async function processViralCutsJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing'; job.progress = 10;
    try {
        if (!job.files.video || !job.files.video[0]) throw new Error("Video file missing");
        const videoFile = job.files.video[0];
        const params = job.params || {};
        const count = parseInt(params.count) || 3;
        const style = params.style || 'blur';
        
        const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFile.path}"`;
        const duration = await new Promise((resolve, reject) => exec(durationCmd, (err, stdout) => err ? reject(err) : resolve(parseFloat(stdout))));

        const segmentDuration = 10;
        const step = Math.max(15, Math.floor(duration / (count + 1)));
        
        let verticalFilter = "";
        if (style === 'crop') verticalFilter = "scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1";
        else verticalFilter = "split[original][blur];[blur]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:(iw-720)/2:(ih-1280)/2,boxblur=20:10[bg];[original]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2";

        const segments = [];
        for(let i=1; i<=count; i++) {
            const start = step * i;
            if (start + segmentDuration < duration) segments.push({ start, duration: segmentDuration });
        }
        if (segments.length === 0) segments.push({ start: 0, duration: Math.min(duration, 30) });

        let trimChain = "";
        segments.forEach((seg, idx) => {
            trimChain += `[0:v]trim=${seg.start}:${seg.start+seg.duration},setpts=PTS-STARTPTS,${verticalFilter}[v${idx}];`;
            trimChain += `[0:a]atrim=${seg.start}:${seg.start+seg.duration},asetpts=PTS-STARTPTS[a${idx}];`;
        });
        
        const vInputs = segments.map((_, i) => `[v${i}]`).join('');
        const aInputs = segments.map((_, i) => `[a${i}]`).join('');
        
        trimChain += `${vInputs}concat=n=${segments.length}:v=1:a=0[outv];${aInputs}concat=n=${segments.length}:v=0:a=1[outa]`;

        const outputPath = path.join(uploadDir, `viral_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const cmd = `ffmpeg -i "${videoFile.path}" -filter_complex "${trimChain}" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -c:a aac "${outputPath}"`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) { job.status = 'failed'; job.error = "FFmpeg failed processing viral cuts"; } 
            else { job.status = 'completed'; job.progress = 100; job.downloadUrl = `/api/process/download/${jobId}`; }
        });
    } catch (e) { job.status = 'failed'; job.error = e.message; }
}

function processScriptToVideoJob(jobId) {
    const job = jobs[jobId];
    job.status = 'failed';
    job.error = "Script to video processing not fully implemented on server-side. Use client-side generation.";
}

// --- LÓGICA DE PROCESSAMENTO DE TAREFAS DE CLIPE ÚNICO ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing'; job.progress = 0;

    const action = jobId.split('_')[0];
    
    // FIX: Check for file existence safely
    let videoFile = (job.files.video && job.files.video[0]) ? job.files.video[0] : null;
    
    // Fallback: If voice-clone or auto-ducking and no video, check audio
    if (!videoFile && (action === 'voice-clone' || action === 'auto-ducking-real')) {
        if (job.files.audio && job.files.audio[0]) {
            videoFile = job.files.audio[0];
        }
    }

    if (!videoFile) {
        job.status = 'failed';
        job.error = "Arquivo de entrada não encontrado.";
        return;
    }

    let params = {};
    if (job.params && job.params.params) {
        try { params = typeof job.params.params === 'string' ? JSON.parse(job.params.params) : job.params.params; } catch(e) {}
    } else if (job.params) params = job.params;

    const inputIsImage = isImage(videoFile.originalname);
    let outputExtension = '.mp4';
    if (inputIsImage && ['magic-erase-real', 'video-to-cartoon-real', 'style-transfer-real', 'stickerize-real', 'retouch-real'].includes(action)) outputExtension = '.png';
    if (['extract-audio-real', 'remove-silence-real', 'reduce-noise-real', 'isolate-voice-real', 'enhance-voice-real', 'auto-ducking-real', 'voice-fx-real', 'voice-clone'].includes(action)) outputExtension = '.wav';

    const outputFilename = `${action}-${Date.now()}${outputExtension}`;
    const outputPath = path.join(uploadDir, outputFilename);
    job.outputPath = outputPath;

    const MAX_WIDTH = 1280;
    const originalW = params.originalWidth || 1920;
    let args = [];

    switch (action) {
        case 'magic-erase-real': {
             let { x, y, w, h } = params;
             let processScale = originalW > MAX_WIDTH ? `scale=${MAX_WIDTH}:-2,` : "";
             let scaleFactor = originalW > MAX_WIDTH ? MAX_WIDTH / originalW : 1;
             const dx = Math.round(x * scaleFactor); const dy = Math.round(y * scaleFactor);
             const dw = Math.max(1, Math.round(w * scaleFactor)); const dh = Math.max(1, Math.round(h * scaleFactor));
             
             if(inputIsImage && outputExtension === '.mp4') args.push('-loop', '1', '-t', '5');
             args.push('-i', videoFile.path);
             if(inputIsImage && outputExtension === '.mp4') args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             args.push('-vf', `${processScale}delogo=x=${dx}:y=${dy}:w=${dw}:h=${dh}:show=0` + (outputExtension === '.mp4' ? ",scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" : ""));
             if(inputIsImage && outputExtension === '.mp4') args.push('-map', '0:v', '-map', '1:a', '-shortest');
             if(outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
             else args.push('-y');
             args.push(outputPath);
             break;
        }

        case 'video-to-cartoon-real': {
             const cStyle = params.style || 'anime';
             let filters = [];
             if (inputIsImage && originalW > MAX_WIDTH) filters.push(`scale=${MAX_WIDTH}:-2`);
             if (cStyle === 'anime') filters.push("median=3", "unsharp=5:5:1.0:5:5:0.0", "eq=saturation=1.5:contrast=1.1");
             else if (cStyle === 'pixar') filters.push("gblur=sigma=2", "unsharp=5:5:0.8:3:3:0.0", "eq=saturation=1.3:brightness=0.05");
             else if (cStyle === 'sketch') filters.push("edgedetect=low=0.1:high=0.4", "eq=contrast=2.0"); 
             else if (cStyle === 'oil') filters.push("boxblur=3:1", "eq=saturation=1.4:contrast=1.1");
             if (outputExtension === '.mp4') filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "format=yuv420p");
             
             if(inputIsImage && outputExtension === '.mp4') args.push('-loop', '1', '-t', '5');
             args.push('-i', videoFile.path);
             if(inputIsImage && outputExtension === '.mp4') args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             args.push('-vf', filters.join(","));
             if(inputIsImage && outputExtension === '.mp4') args.push('-map', '0:v', '-map', '1:a', '-shortest');
             if(outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
             else args.push('-y');
             args.push(outputPath);
             break;
        }

        case 'interpolate-real': // Slow motion
             args.push('-i', videoFile.path);
             args.push('-vf', "minterpolate=fps=60:mi_mode=blend,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'copy');
             args.push(outputPath);
             break;
             
        case 'upscale-real':
             args.push('-i', videoFile.path);
             args.push('-vf', "scale=3840:2160:flags=lanczos,unsharp=5:5:1.0:5:5:0.0,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
             args.push('-c:v', 'libx264', '-preset', 'superfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy');
             args.push(outputPath);
             break;
             
        case 'reverse-real':
             args.push('-i', videoFile.path);
             args.push('-vf', 'reverse', '-af', 'areverse');
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
             args.push(outputPath);
             break;

        case 'stabilize-real':
             // Step 1: Detect
             const trfPath = path.join(uploadDir, `transform_${jobId}.trf`);
             const detectCmd = `ffmpeg -i "${videoFile.path}" -vf vidstabdetect=stepSize=32:shakiness=10:accuracy=15:result="${trfPath}" -f null -`;
             await new Promise((resolve, reject) => exec(detectCmd, (err) => err ? reject(err) : resolve()));
             // Step 2: Transform
             args.push('-i', videoFile.path);
             args.push('-vf', `vidstabtransform=input="${trfPath}":zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`);
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'reframe-real':
             // Reframe to 9:16 Center Crop
             args.push('-i', videoFile.path);
             args.push('-vf', 'scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1,format=yuv420p');
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'stickerize-real':
             // Remove BG (Chromakey approx for now or outline) + Stroke
             // Assuming input has green screen or using generic cut
             args.push('-i', videoFile.path);
             args.push('-vf', "split[original][copy];[copy]scale=iw+20:ih+20,drawbox=w=iw+20:h=ih+20:c=white:t=fill[outline];[outline][original]overlay=10:10");
             args.push('-y', outputPath);
             break;

        case 'remove-silence-real':
             const sThresh = params.threshold || -30;
             const sDur = params.duration || 0.5;
             args.push('-i', videoFile.path);
             args.push('-af', `silenceremove=start_periods=1:start_duration=${sDur}:start_threshold=${sThresh}dB:stop_periods=-1:stop_duration=${sDur}:stop_threshold=${sThresh}dB`);
             args.push('-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;

        case 'auto-ducking-real':
             const voiceFile = job.files.audio ? job.files.audio[0] : null;
             if (!voiceFile) { job.status = 'failed'; job.error = 'Arquivo de voz não encontrado.'; return; }
             const dThresh = params.threshold || 0.125;
             const dRatio = params.ratio || 2;
             args.push('-i', videoFile.path); // Main audio (Background)
             args.push('-i', voiceFile.path); // Control audio (Voice)
             args.push('-filter_complex', `[0][1]sidechaincompress=threshold=${dThresh}:ratio=${dRatio}:attack=20:release=300[out]`);
             args.push('-map', '[out]', '-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;

        case 'voice-clone':
             // Just pass through the recorded audio if just saving, 
             // but if we were using an AI service, we'd call it here.
             // For now, we return the audio as "cloned" to the library.
             args.push('-i', videoFile.path);
             args.push('-c', 'copy');
             args.push(outputPath);
             break;

        case 'extract-audio-real':
             args.push('-i', videoFile.path);
             args.push('-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2');
             args.push(outputPath);
             break;

        case 'reduce-noise-real':
             args.push('-i', videoFile.path);
             args.push('-af', 'afftdn', '-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;

        case 'voice-fx-real': {
             const preset = params.preset || 'robot';
             let filters = [];
             if(preset === 'robot') filters.push("asetrate=11025*0.9,aresample=44100,atempo=1.1");
             else if(preset === 'squirrel') filters.push("asetrate=44100*1.5,aresample=44100,atempo=0.7");
             else if(preset === 'monster') filters.push("asetrate=44100*0.6,aresample=44100,atempo=1.3");
             else if(preset === 'echo') filters.push("aecho=0.8:0.9:1000:0.3");
             else if(preset === 'radio') filters.push("highpass=f=200,lowpass=f=3000");
             args.push('-i', videoFile.path);
             args.push('-af', filters.join(','));
             args.push('-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;
        }

        default:
             job.status = 'failed'; job.error = "Action not supported."; return;
    }

    // SPAWN PROCESS
    console.log(`[Job ${jobId}] Spawning: ffmpeg ${args.join(' ')}`);
    
    let totalDuration = 0;
    const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFile.path}"`;
    exec(probeCmd, (err, stdout) => {
        if(!err) totalDuration = parseFloat(stdout);
        args.unshift("-progress", "pipe:1");
        const ffmpeg = spawn('ffmpeg', args);
        
        ffmpeg.stdout.on('data', (data) => {
            const str = data.toString();
            const timeMatch = str.match(/out_time_ms=(\d+)/);
            if (timeMatch && totalDuration > 0) {
                const progress = Math.min(99, (parseInt(timeMatch[1]) / 1000000 / totalDuration) * 100);
                job.progress = progress;
            }
        });

        ffmpeg.stderr.on('data', (data) => console.log(`[FFmpeg Error] ${data}`));

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                job.status = 'completed';
                job.progress = 100;
                job.downloadUrl = `/api/process/download/${jobId}`;
            } else {
                job.status = 'failed';
                job.error = "FFmpeg process failed.";
            }
        });
    });
}

app.post('/api/process/generate-music', uploadAny, (req, res) => {
    const { duration } = req.body;
    // Generate simple synth beat using lavfi
    const jobId = `music_gen_${Date.now()}`;
    const outputFilename = `ai_music_${Date.now()}.wav`;
    const outputPath = path.join(uploadDir, outputFilename);
    const dur = parseFloat(duration) || 10;
    
    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });
    
    // Simple beat generation using aedgesrc (Shepard tone equivalent or similar simple synth)
    // Note: Real AI music requires external API or complex model. This is a functional placeholder.
    const command = `ffmpeg -f lavfi -i "anoisesrc=a=0.1:c=white:d=${dur},lowpass=f=200" -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
    
    exec(command, (err) => {
        if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "Erro na síntese."; } 
        else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
    });
});

app.listen(PORT, () => { console.log(`Servidor a escutar na porta ${PORT}`); });
