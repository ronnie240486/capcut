
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

// --- HELPER: Get Style Filter Chain (EXPANDED) ---
const getStyleFilter = (styleId) => {
    // Common building blocks
    const edge = "edgedetect=mode=colormix:high=0"; 
    const cartoon = "median=3,unsharp=5:5:1.0:5:5:0.0"; 
    const paint = "avgblur=3,unsharp=5:5:2"; 
    
    switch (styleId) {
        // --- REALISMO & HDR ---
        case 'photorealistic': return "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.1:saturation=1.2";
        case 'hdr_vivid': return "unsharp=5:5:1.5:5:5:0.0,eq=contrast=1.3:saturation=1.5:brightness=0.05";
        case 'unreal_engine': return "unsharp=5:5:0.8:3:3:0.0,eq=contrast=1.2:saturation=1.3,vignette=PI/5";
        case 'cinematic_4k': return "eq=contrast=1.1:saturation=0.9,curves=strong_contrast";
        case 'national_geo': return "eq=saturation=1.4:contrast=1.2,unsharp=3:3:1.5";
        case 'gopro_action': return "lenscorrection=cx=0.5:cy=0.5:k1=-0.2:k2=-0.05,eq=saturation=1.5:contrast=1.3";
        case 'studio_lighting': return "eq=brightness=0.1:contrast=1.1,unsharp=5:5:0.5";
        case 'bokeh_portrait': return "boxblur=2:1,unsharp=5:5:1.5";

        // --- DESENHO & SIMPLES ---
        case 'stick_figure': return "edgedetect=mode=colormix:high=0,extractplanes=y,threshold=0,negate"; // White BG, Black Lines
        case 'doodle_notebook': return "edgedetect=mode=colormix:high=0,extractplanes=y,negate,noise=alls=10:allf=t";
        case 'blueprint': return "edgedetect=mode=colormix:high=0,extractplanes=y,negate,colorchannelmixer=0:0:0:0:0:0:0:0:1:1:1:0"; // White on Blue
        case 'line_art': return "edgedetect=mode=colormix:high=0,extractplanes=y,negate"; 
        case 'chalkboard': return "edgedetect=mode=colormix:high=0,extractplanes=y,colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3:0"; // White on Greenish
        case 'minimal_flat': return "median=7,eq=saturation=1.5:contrast=1.2";
        case 'storyboard': return "format=gray,median=3,unsharp=5:5:1.0";
        case 'manga_bw': return "format=gray,eq=contrast=2,unsharp=5:5:1.5";

        // --- JOGOS & POP CULTURE ---
        case 'gta_style': return "unsharp=5:5:1.5,eq=saturation=2.0:contrast=1.3";
        case 'minecraft': return "scale=iw/16:ih/16:flags=nearest,scale=iw*16:ih*16:flags=nearest"; // Pixelate
        case 'cyber_game': return "eq=contrast=1.3:saturation=1.5,colorbalance=rs=0.1:gs=-0.1:bs=0.2,unsharp=5:5:1.0";
        case 'retro_8bit': return "scale=iw/8:ih/8:flags=nearest,scale=iw*8:ih*8:flags=nearest,format=gray,eq=contrast=1.5";
        case 'low_poly': return "median=9,unsharp=5:5:1.0"; // Approximation
        case 'sims_3d': return "gblur=1,unsharp=5:5:1.5,eq=saturation=1.3:brightness=0.1";
        case 'barbie_world': return "colorchannelmixer=1:0:0:0:0:1:0:0:0:0:1:0,eq=saturation=1.5:brightness=0.1,colorbalance=rm=0.2:gm=-0.1:bm=0.2"; // Pink tint
        case 'comic_hero': return "format=gray,unsharp=5:5:1.5,histeq,eq=contrast=1.5";

        // --- TERROR & DARK ---
        case 'horror_movie': return "curves=vintage,noise=alls=20:allf=t+u,eq=contrast=1.3:saturation=0.5";
        case 'night_vision': return "format=gray,colorchannelmixer=0:0:0:0:0:1:0:0:0:0:0:0,noise=alls=30:allf=t,eq=contrast=2:brightness=-0.1";
        case 'zombie_apocalypse': return "colorchannelmixer=.3:.4:.3:0:.2:.3:.2:0:.2:.3:.2:0,eq=contrast=1.3"; // Sick green
        case 'security_cam': return "format=gray,noise=alls=10:allf=t,eq=contrast=1.5";
        case 'sin_city': return "colorhold=color=red:similarity=0.3:blend=0.0"; // Fallback to grayscale with red pass if colorhold fails: "format=gray"
        case 'gothic_noir': return "format=gray,eq=contrast=1.8:brightness=-0.2,vignette";
        case 'broken_vhs': return "noise=alls=10:allf=t+u,eq=saturation=0.5,chromashift=cb=5:cr=-5";
        case 'xray': return "format=gray,negate,eq=contrast=1.5";

        // --- ANIME & CARTOON ---
        case 'anime_vibrant': return `${cartoon},eq=saturation=1.8:contrast=1.2,unsharp=5:5:0.5`;
        case 'anime_soft': return "gblur=sigma=1,unsharp=5:5:0.8:3:3:0.0,eq=saturation=1.2:brightness=0.05";
        case 'anime_dark': return `${cartoon},eq=saturation=0.8:contrast=1.3:gamma=0.8`;
        case 'pixar_glossy': return "gblur=sigma=2,unsharp=5:5:0.8:3:3:0.0,eq=saturation=1.3:brightness=0.05";
        case 'disney_classic': return "median=5,unsharp=3:3:1.5,eq=saturation=1.4";
        case 'comic_book': return "format=gray,unsharp=5:5:1.5,histeq,eq=contrast=1.5";
        case 'simpsons': return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=saturation=2.5"; // Yellow tint approx
        case 'webtoon': return "boxblur=2:1,unsharp=5:5:1.5,eq=saturation=1.3";

        // --- ARTÍSTICO ---
        case 'oil_heavy': return "gblur=5,unsharp=5:5:3,eq=saturation=1.5";
        case 'oil_detail': return "avgblur=2,unsharp=5:5:1.5,eq=contrast=1.2";
        case 'watercolor': return "gblur=8,unsharp=5:5:1,eq=saturation=1.6:brightness=0.1";
        case 'van_gogh': return "swirl,gblur=2,eq=saturation=1.5:contrast=1.2"; // Swirl gives a bit of that feel
        case 'sketch_pencil': return "edgedetect=mode=colormix:high=0,format=gray,negate";
        case 'sketch_charcoal': return "edgedetect=mode=colormix:high=0,format=gray,eq=contrast=2";
        case 'ink_wash': return "gblur=2,edgedetect=mode=colormix,format=gray";
        case 'pastel': return "boxblur=4:2,eq=saturation=0.8:brightness=1.2";

        // --- CLAY & STOP MOTION ---
        case 'clay_basic': return "fps=12,median=5,unsharp=5:5:1.0,eq=saturation=1.4";
        case 'clay_retro': return "fps=8,boxblur=2:1,eq=saturation=1.2";
        case 'wallace': return "fps=12,gblur=2,unsharp=5:5:2,eq=contrast=1.1";
        case 'lego': return "scale=iw/10:ih/10:flags=nearest,scale=iw*10:ih*10:flags=nearest"; // Pixelate/Voxel
        case 'plastic': return "gblur=1,unsharp=5:5:2,eq=saturation=1.8";

        // --- RETRO & VINTAGE ---
        case 'vhs_glitch': return "noise=alls=10:allf=t+u,eq=saturation=0.5";
        case 'crt_tv': return "vignette,gblur=1,eq=saturation=1.2";
        case '8mm_film': return "sepia,noise=alls=20:allf=t+u,vignette=PI/4";
        case '16mm_film': return "noise=alls=15:allf=t+u,eq=saturation=0.8";
        case 'gameboy': return "format=gray,colorchannelmixer=0:0:0:0:1:1:1:0:0:0:0:0"; // Green tint
        case 'pixel_art': return "scale=iw/8:ih/8:flags=nearest,scale=iw*8:ih*8:flags=nearest";
        case 'bw_noir': return "format=gray,eq=contrast=1.5:brightness=-0.1,vignette";

        // --- CYBER & GLITCH ---
        case 'cyberpunk': return "eq=contrast=1.2:saturation=1.5,colorbalance=rs=0.2:gs=-0.1:bs=0.2";
        case 'matrix': return "colorchannelmixer=0:0:0:0:0:1:0:0:0:0:0:0,eq=contrast=1.5"; // Green channel
        case 'glitch_art': return "chromashift=cb=10:cr=-10,noise=alls=10:allf=t";
        case 'rgb_split': return "chromashift=cb=20:cr=-20";
        case 'thermal': return "format=gray,eq=contrast=2,pseudo_palette"; // Approx
        case 'hacker': return "format=gray,colorchannelmixer=0:0:0:0:1:1:1:0:0:0:0:0,noise=alls=5:allf=t"; // Green mono

        default: return cartoon;
    }
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
    // Handle 'ai-dubbing-real' with uploadFields if it might upload audio in the future, but currently it just uploads video
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
    const videoFile = job.files.video ? job.files.video[0] : (job.files.audio ? job.files.audio[0] : null);
    if (!videoFile && action !== 'voice-clone') { // voice-clone might pass file differently or we handle it inside
         job.status = 'failed'; job.error = "No media file provided."; return;
    }

    let params = {};
    if (job.params && job.params.params) {
        try { params = typeof job.params.params === 'string' ? JSON.parse(job.params.params) : job.params.params; } catch(e) {}
    } else if (job.params) params = job.params;

    const inputIsImage = videoFile ? isImage(videoFile.originalname) : false;
    let outputExtension = '.mp4';
    if (inputIsImage && ['magic-erase-real', 'video-to-cartoon-real', 'style-transfer-real', 'stickerize-real', 'retouch-real'].includes(action)) outputExtension = '.png';
    if (['extract-audio-real', 'reduce-noise-real', 'isolate-voice-real', 'enhance-voice-real', 'auto-ducking-real', 'voice-fx-real', 'voice-clone'].includes(action)) outputExtension = '.wav';
    
    // WebM for transparency support
    if (action === 'rotoscope-real') outputExtension = '.webm';

    const outputFilename = `${action}-${Date.now()}${outputExtension}`;
    const outputPath = path.join(uploadDir, outputFilename);
    job.outputPath = outputPath;

    const MAX_WIDTH = 1280;
    const originalW = params.originalWidth || 1920;
    let args = [];

    // CRITICAL FIX: IF OUTPUT IS IMAGE, USE -frames:v 1 to avoid sequence error
    if (outputExtension === '.png' || outputExtension === '.jpg') {
        // We will insert this at the end of arg construction
    }

    switch (action) {
        case 'rotoscope-real': {
             // Auto Rotoscope (Smart Cutout)
             const color = (params.color || '#00FF00').replace('#', '0x');
             const similarity = params.similarity || 0.3;
             const smoothness = params.smoothness || 0.1;
             
             args.push('-i', videoFile.path);
             args.push('-vf', `chromakey=${color}:${similarity}:${smoothness}`);
             args.push('-c:v', 'libvpx-vp9', '-b:v', '2M'); 
             args.push('-auto-alt-ref', '0');
             args.push('-c:a', 'libvorbis');
             args.push(outputPath);
             break;
        }

        case 'lip-sync-real': {
             // Lip Sync (Dubbing)
             // Replaces video audio with new voice file
             const voiceFile = job.files.audio ? job.files.audio[0] : null;
             if (!voiceFile) { job.status = 'failed'; job.error = "Audio file required for Lip Sync."; return; }
             
             // Map video stream from input 0, audio stream from input 1
             // -shortest cuts video to match audio length if audio is shorter (common in dubbing)
             args.push('-i', videoFile.path);
             args.push('-i', voiceFile.path);
             args.push('-map', '0:v:0');
             args.push('-map', '1:a:0');
             args.push('-c:v', 'copy'); // Copy video stream (fast) or re-encode if needed for precision
             args.push('-c:a', 'aac');
             args.push('-shortest');
             args.push(outputPath);
             break;
        }

        case 'ai-dubbing': {
            // AI Dubbing Pipeline: Extract -> Translate (Gemini) -> Clone+TTS (ElevenLabs) -> Merge
            const targetLang = params.targetLanguage || 'English';
            const apiKeyEleven = job.params.apiKey;
            const geminiKey = process.env.API_KEY;

            if (!apiKeyEleven) { job.status = 'failed'; job.error = "ElevenLabs API Key required."; return; }
            if (!geminiKey) { job.status = 'failed'; job.error = "Gemini API Key missing."; return; }

            try {
                // 1. Extract Audio
                const extractedAudioPath = path.join(uploadDir, `temp_extract_${jobId}.mp3`);
                await new Promise((resolve, reject) => {
                    exec(`ffmpeg -i "${videoFile.path}" -vn -acodec libmp3lame "${extractedAudioPath}"`, (err) => err ? reject(err) : resolve());
                });

                // 2. Transcribe & Translate (Gemini)
                console.log(`[Job ${jobId}] Transcribing & Translating...`);
                // Read audio as base64 for Gemini
                const audioBuffer = fs.readFileSync(extractedAudioPath);
                const audioBase64 = audioBuffer.toString('base64');
                
                const geminiPayload = {
                    contents: [{
                        parts: [
                            { inline_data: { mime_type: "audio/mp3", data: audioBase64 } },
                            { text: `Transcribe the spoken audio and translate it to ${targetLang}. Return ONLY the translated text.` }
                        ]
                    }]
                };

                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiPayload)
                });
                
                if (!geminiRes.ok) throw new Error(`Gemini Translation Failed: ${geminiRes.status}`);
                const geminiData = await geminiRes.json();
                const translatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!translatedText) throw new Error("No translation returned.");
                console.log(`[Job ${jobId}] Translated: ${translatedText.substring(0, 50)}...`);

                // 3. Instant Voice Clone & TTS (ElevenLabs)
                console.log(`[Job ${jobId}] Cloning Voice & Generating Speech...`);
                
                // Add Voice
                const addVoiceForm = new FormData();
                addVoiceForm.append('name', `Dubbing_Temp_${jobId}`);
                addVoiceForm.append('files', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'sample.mp3');
                
                const addVoiceRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKeyEleven },
                    body: addVoiceForm
                });
                if (!addVoiceRes.ok) throw new Error(`Voice Clone Failed: ${await addVoiceRes.text()}`);
                const voiceData = await addVoiceRes.json();
                const voiceId = voiceData.voice_id;

                // Generate TTS
                const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKeyEleven, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: translatedText, model_id: "eleven_multilingual_v2" })
                });
                if (!ttsRes.ok) throw new Error(`TTS Generation Failed`);
                
                const ttsBuffer = await ttsRes.arrayBuffer();
                const dubbedAudioPath = path.join(uploadDir, `dubbed_audio_${jobId}.mp3`);
                fs.writeFileSync(dubbedAudioPath, Buffer.from(ttsBuffer));

                // Cleanup Voice
                await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
                    method: 'DELETE',
                    headers: { 'xi-api-key': apiKeyEleven }
                });

                // 4. Merge
                args.push('-i', videoFile.path);
                args.push('-i', dubbedAudioPath);
                args.push('-map', '0:v');
                args.push('-map', '1:a');
                args.push('-c:v', 'copy');
                args.push('-c:a', 'aac');
                args.push('-shortest'); // Ensure video doesn't run longer than audio (or vice versa logic needed?) Usually we want full video but audio might differ.
                // Standard dubbing keeps video length. If audio is shorter, silent end. If longer, cut.
                args.push(outputPath);

            } catch (e) {
                job.status = 'failed'; job.error = e.message; return;
            }
            break;
        }

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
             const cStyle = params.style || 'anime_vibrant';
             const styleFilter = getStyleFilter(cStyle);
             let filters = [];
             
             if (inputIsImage && originalW > MAX_WIDTH) filters.push(`scale=${MAX_WIDTH}:-2`);
             
             filters.push(styleFilter);
             
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

        case 'interpolate-real': {
             const speed = params.speed || 0.5;
             const mode = params.mode || 'blend';
             const factor = 1 / speed;
             const targetFps = Math.round(30 * factor);
             let miFilter = `fps=${targetFps}`;
             if (mode === 'optical') miFilter += `:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
             else miFilter += `:mi_mode=blend`;

             let audioFilter = "";
             let remainingSpeed = speed;
             const atempoChain = [];
             while (remainingSpeed < 0.5) { atempoChain.push("atempo=0.5"); remainingSpeed *= 2; }
             atempoChain.push(`atempo=${remainingSpeed}`);
             audioFilter = atempoChain.join(",");

             args.push('-i', videoFile.path);
             args.push('-filter_complex', `[0:v]minterpolate=${miFilter},setpts=${factor}*PTS[v];[0:a]${audioFilter}[a]`);
             args.push('-map', '[v]', '-map', '[a]');
             args.push('-r', '30');
             args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p');
             args.push('-c:a', 'aac', '-b:a', '128k');
             args.push(outputPath);
             break;
        }
             
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
             const trfPath = path.join(uploadDir, `transform_${jobId}.trf`);
             const detectCmd = `ffmpeg -i "${videoFile.path}" -vf vidstabdetect=stepSize=32:shakiness=10:accuracy=15:result="${trfPath}" -f null -`;
             await new Promise((resolve, reject) => exec(detectCmd, (err) => err ? reject(err) : resolve()));
             args.push('-i', videoFile.path);
             args.push('-vf', `vidstabtransform=input="${trfPath}":zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`);
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'reframe-real':
             args.push('-i', videoFile.path);
             args.push('-vf', 'scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1,format=yuv420p');
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'stickerize-real':
             args.push('-i', videoFile.path);
             args.push('-vf', "split[original][copy];[copy]scale=iw+20:ih+20,drawbox=w=iw+20:h=ih+20:c=white:t=fill[outline];[outline][original]overlay=10:10");
             args.push('-y', outputPath);
             break;

        case 'remove-silence-real':
             const sThresh = params.threshold || -30;
             const sDur = params.duration || 0.5;
             const isAudioOnly = !videoFile.mimetype || videoFile.mimetype.startsWith('audio');

             if (isAudioOnly) {
                 // Simple audio filter
                 args.push('-i', videoFile.path);
                 args.push('-af', `silenceremove=start_periods=1:start_duration=${sDur}:start_threshold=${sThresh}dB:stop_periods=-1:stop_duration=${sDur}:stop_threshold=${sThresh}dB`);
                 args.push('-vn', '-acodec', 'pcm_s16le');
                 args.push(outputPath);
             } else {
                 // Smart Video Jump Cuts (Complex)
                 // 1. Detect silence
                 const detectCmd = `ffmpeg -i "${videoFile.path}" -af silencedetect=noise=${sThresh}dB:d=${sDur} -f null -`;
                 console.log(`[Job ${jobId}] Detecting silence: ${detectCmd}`);
                 
                 let stderrLog = "";
                 try {
                     stderrLog = await new Promise((resolve, reject) => {
                         exec(detectCmd, (error, stdout, stderr) => {
                             // silencedetect writes to stderr
                             resolve(stderr);
                         });
                     });
                 } catch (e) {
                     job.status = 'failed'; job.error = "Silence detection failed."; return;
                 }

                 // 2. Parse silence logs
                 const silenceSegments = [];
                 const regex = /silence_start: (\d+(\.\d+)?)|silence_end: (\d+(\.\d+)?)/g;
                 let match;
                 let currentStart = null;
                 
                 while ((match = regex.exec(stderrLog)) !== null) {
                     if (match[1]) { // start
                         currentStart = parseFloat(match[1]);
                     } else if (match[3] && currentStart !== null) { // end
                         silenceSegments.push({ start: currentStart, end: parseFloat(match[3]) });
                         currentStart = null;
                     }
                 }

                 // Get total duration
                 let duration = 0;
                 const durMatch = stderrLog.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                 if (durMatch) {
                     duration = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                 }

                 if (silenceSegments.length === 0) {
                     // No silence found, copy
                     args.push('-i', videoFile.path);
                     args.push('-c', 'copy');
                     args.push(outputPath);
                 } else {
                     // 3. Construct Keep Segments (Invert silence)
                     const keepSegments = [];
                     let lastEnd = 0;
                     silenceSegments.forEach(seg => {
                         if (seg.start > lastEnd) {
                             keepSegments.push({ start: lastEnd, end: seg.start });
                         }
                         lastEnd = seg.end;
                     });
                     if (lastEnd < duration) {
                         keepSegments.push({ start: lastEnd, end: duration });
                     }

                     // 4. Construct Filter Complex
                     let filterComplex = "";
                     keepSegments.forEach((seg, i) => {
                         filterComplex += `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}];`;
                         filterComplex += `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}];`;
                     });
                     
                     keepSegments.forEach((_, i) => {
                         filterComplex += `[v${i}][a${i}]`;
                     });
                     filterComplex += `concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`;

                     args.push('-i', videoFile.path);
                     args.push('-filter_complex', filterComplex);
                     args.push('-map', '[outv]', '-map', '[outa]');
                     args.push('-c:v', 'libx264', '-preset', 'superfast', '-c:a', 'aac');
                     args.push(outputPath);
                 }
             }
             break;

        case 'auto-ducking-real':
             const voiceFile = job.files.audio ? job.files.audio[0] : null;
             if (!voiceFile) { job.status = 'failed'; job.error = 'Arquivo de voz não encontrado.'; return; }
             const dThresh = params.threshold || 0.125;
             const dRatio = params.ratio || 2;
             args.push('-i', videoFile.path); // Main audio
             args.push('-i', voiceFile.path); // Control audio
             args.push('-filter_complex', `[0][1]sidechaincompress=threshold=${dThresh}:ratio=${dRatio}:attack=20:release=300[out]`);
             args.push('-map', '[out]', '-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;

        case 'voice-clone': {
             // If apiKey provided, use ElevenLabs Instant Cloning logic
             // Otherwise, fallback to "save recording"
             const apiKey = job.params.apiKey;
             
             if (apiKey && apiKey.length > 5) {
                 try {
                     console.log(`[Job ${jobId}] Starting ElevenLabs Instant Clone...`);
                     const textToSpeak = params.text || "Hello, this is my cloned voice.";
                     
                     // 1. Add Voice
                     const addVoiceFormData = new FormData();
                     addVoiceFormData.append('name', `Clone ${Date.now()}`);
                     // We must read the file to append to FormData
                     const fileBuffer = fs.readFileSync(videoFile.path);
                     const blob = new Blob([fileBuffer], { type: 'audio/mpeg' }); // Use Blob polyfill or native if available in Node 18+
                     addVoiceFormData.append('files', blob, 'sample.mp3');
                     addVoiceFormData.append('description', 'Instant Clone from ProEdit');

                     const addRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                         method: 'POST',
                         headers: { 'xi-api-key': apiKey },
                         body: addVoiceFormData
                     });

                     if (!addRes.ok) {
                         const err = await addRes.text();
                         throw new Error(`ElevenLabs Add Voice failed: ${err}`);
                     }
                     const addData = await addRes.json();
                     const voiceId = addData.voice_id;
                     console.log(`[Job ${jobId}] Voice created: ${voiceId}`);

                     // 2. Generate Audio (TTS)
                     const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                         method: 'POST',
                         headers: { 
                             'xi-api-key': apiKey,
                             'Content-Type': 'application/json'
                         },
                         body: JSON.stringify({
                             text: textToSpeak,
                             model_id: "eleven_multilingual_v2",
                             voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                         })
                     });

                     if (!ttsRes.ok) {
                         throw new Error(`ElevenLabs TTS failed: ${await ttsRes.text()}`);
                     }

                     const arrayBuffer = await ttsRes.arrayBuffer();
                     fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
                     
                     // Skip ffmpeg, done
                     job.status = 'completed';
                     job.progress = 100;
                     job.downloadUrl = `/api/process/download/${jobId}`;
                     return;

                 } catch (e) {
                     console.error(`[Job ${jobId}] Clone Error:`, e);
                     // Fallback to simple copy if API fails
                     job.error = "Cloning API failed, saving original recording.";
                     // Proceed to ffmpeg copy below
                 }
             }
           // --- FIX FOR SINGLE IMAGE OUTPUT ---
    if (outputExtension === '.png' || outputExtension === '.jpg') {
        // Fix for "does not contain an image sequence pattern" error.
        // We must use -update 1 when writing to a static filename with image2 muxer if not already present.
        if (!args.includes('-update')) {
            // Insert before output path (last arg)
            const out = args.pop();
            args.push('-update', '1');
            // Also ensure frames:v 1 is present
            if (!args.includes('-frames:v')) {
                args.push('-frames:v', '1');
            }
            args.push(out);
        }
    }

    // SPAWN PROCESS
    console.log(`[Job ${jobId}] Spawning: ffmpeg ${args.join(' ')}`);

          
             // Fallback: Just copy/convert the recorded audio
             args.push('-i', videoFile.path);
             args.push('-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;
        }

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

    // --- FIX FOR SINGLE IMAGE OUTPUT ---
    if (outputExtension === '.png' || outputExtension === '.jpg') {
        // If args don't already have -frames:v or -update, add one to prevent infinite loop or sequence error
        // The most compatible way for single image out is -frames:v 1
        if (!args.includes('-frames:v') && !args.includes('-update')) {
            // Insert before output path (last arg)
            const out = args.pop();
            args.push('-frames:v', '1');
            args.push(out);
        }
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

app.post('/api/process/generate-music', uploadAny, async (req, res) => {
    const { prompt, duration, hfToken, pixabayKey } = req.body;
    const jobId = `music_gen_${Date.now()}`;
    const outputFilename = `ai_music_${Date.now()}.wav`; // Using .wav for safety
    const outputPath = path.join(uploadDir, outputFilename);
    const dur = parseFloat(duration) || 10;
    
    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });

    try {
        // Priority 1: Hugging Face MusicGen
        if (hfToken && hfToken.length > 5) {
            console.log(`[Job ${jobId}] Using MusicGen (HF)`);
            const hfRes = await fetch("https://api-inference.huggingface.co/models/facebook/musicgen-small", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${hfToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ inputs: prompt }),
            });

            if (hfRes.ok) {
                const arrayBuffer = await hfRes.arrayBuffer();
                // MusicGen API returns raw bytes, usually FLAC or WAV
                const tempPath = path.join(uploadDir, `temp_musicgen_${Date.now()}.flac`);
                fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));

                // Loop/Trim to desired duration using FFmpeg
                // -stream_loop -1 with -t works for looping input
                const cmd = `ffmpeg -stream_loop -1 -i "${tempPath}" -t ${dur} -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
                exec(cmd, (err) => {
                    if(fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "FFmpeg loop failed."; }
                    else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
                });
                return;
            } else {
                console.warn("MusicGen API failed, falling back to Pixabay/Procedural.");
            }
        }

        // Priority 2: Pixabay Audio Search (Royalty Free)
        if (pixabayKey && pixabayKey.length > 5) {
            console.log(`[Job ${jobId}] Using Pixabay Audio`);
            const searchRes = await fetch(`https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(prompt)}&per_page=3&category=music`); 
            // Note: Pixabay Audio API endpoint is slightly different or requires scraping if strictly audio not supported by video key?
            // Actually Pixabay has a separate Audio API but usually uses the same key structure. 
            // Let's assume standard Pixabay key works for audio if documented, otherwise we might need fallback.
            // Documentation: https://pixabay.com/api/docs/#api_search_audio (Wait, Pixabay Audio API is separate? No, same key usually works).
            // Endpoint: https://pixabay.com/api/?key=... is images. 
            // Correct Audio Endpoint is not public in the same way? 
            // Actually, let's use the Image/Video key on the video endpoint and look for "music" category if possible, OR fallback to procedural.
            
            // Correction: Pixabay Audio API is beta/restricted? Let's check Freesound/Stock logic.
            // If pixabayKey is provided, we can try to fetch from a known public search or just fallback.
            // Let's fallback to procedural to be safe if we can't guarantee API access.
        }

        // Priority 3: Procedural Generation (FFmpeg Synth)
        // Advanced Drone/Ambient Generator based on prompt keywords
        console.log(`[Job ${jobId}] Using Procedural Generation`);
        let filter = "anoisesrc=a=0.1:c=pink:d=" + dur + ",lowpass=f=200"; // Default Drone
        
        const lowerPrompt = (prompt || "").toLowerCase();
        if (lowerPrompt.includes("techno") || lowerPrompt.includes("beat")) {
             // Simple beat: noise + gate or similar. Hard in pure lavfi without complex graph.
             // We'll stick to an abstract glitched beat.
             filter = `aevalsrc='0.1*sin(2*PI*t*120/60)*tan(2*PI*t*60)':d=${dur},lowpass=f=400`; 
        } else if (lowerPrompt.includes("piano") || lowerPrompt.includes("sad")) {
             // Sine tones (organ-like)
             filter = `sine=f=440:d=${dur},tremolo=f=5:d=0.5`;
        } else if (lowerPrompt.includes("sci-fi") || lowerPrompt.includes("space")) {
             // Space drone
             filter = `anoisesrc=d=${dur}:c=brown,lowpass=f=100,flanger`;
        }

        const command = `ffmpeg -f lavfi -i "${filter}" -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
        exec(command, (err) => {
            if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "Erro na síntese."; } 
            else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
        });

    } catch (e) {
        jobs[jobId].status = 'failed'; 
        jobs[jobId].error = e.message;
    }
});

app.listen(PORT, () => { console.log(`Servidor a escutar na porta ${PORT}`); });
