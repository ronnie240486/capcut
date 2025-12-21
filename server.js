
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

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
app.use(express.json({ limit: '100mb' }));

// --- Configuração do Multer ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ 
    storage: storage,
    limits: { 
        fieldSize: 100 * 1024 * 1024, 
        fileSize: 5 * 1024 * 1024 * 1024 
    } 
}).any();

const uploadSingle = multer({ storage: storage }).single('video');
const uploadFields = multer({ storage: storage }).fields([
    { name: 'video', maxCount: 1 },
    { name: 'style', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]);

const jobs = {};

const cleanupFiles = (files) => {
    if (!files) return;
    files.forEach(file => {
        const p = typeof file === 'string' ? file : file.path;
        if (p && fs.existsSync(p)) fs.unlink(p, () => {});
    });
};

const isImage = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'].includes(ext);
};

// --- HELPER: Estilos de Imagem/Vídeo ---
const getStyleFilter = (styleId) => {
    const cartoon = "median=3,unsharp=5:5:1.0:5:5:0.0"; 
    switch (styleId) {
        case 'photorealistic': return "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.1:saturation=1.2";
        case 'hdr_vivid': return "unsharp=5:5:1.5:5:5:0.0,eq=contrast=1.3:saturation=1.5:brightness=0.05";
        case 'cinematic_4k': return "eq=contrast=1.1:saturation=0.9,curves=strong_contrast";
        case 'anime_vibrant': return `${cartoon},eq=saturation=1.8:contrast=1.2`;
        case 'cyberpunk': return "eq=contrast=1.2:saturation=1.5,colorbalance=rs=0.2:gs=-0.1:bs=0.2";
        default: return cartoon;
    }
};

// --- ROTAS BÁSICAS ---
app.get('/', (req, res) => res.json({ status: 'online', version: 'ProEdit v3 Full' }));
app.get('/api/check-ffmpeg', (req, res) => {
    exec('ffmpeg -version', (err) => res.json({ status: err ? 'offline' : 'online' }));
});

// --- EXTRAÇÃO E SCRAPING ---
app.post('/api/util/extract-frame', uploadSingle, (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    const timestamp = req.body.timestamp || 0;
    const out = path.join(uploadDir, `frame_${Date.now()}.png`);
    exec(`ffmpeg -ss ${timestamp} -i "${req.file.path}" -frames:v 1 "${out}" -y`, (err) => {
        cleanupFiles([req.file.path]);
        if (err) return res.status(500).send('Error');
        res.download(out, () => cleanupFiles([out]));
    });
});

app.post('/api/util/fetch-url', async (req, res) => {
    const { url } = req.body;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "").replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
        text = text.replace(/<[^>]+>/gim, '').replace(/\s+/g, ' ').trim();
        res.json({ text: text.slice(0, 5000) });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- MOTOR DE EXPORTAÇÃO PRO (COM MOVIMENTOS E TRANSIÇÕES) ---
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).send('No state');
    try {
        const projectState = JSON.parse(req.body.projectState);
        jobs[jobId] = { status: 'pending', progress: 0, files: req.files, projectState };
        res.status(202).json({ jobId });
        processExportJob(jobId);
    } catch (e) { res.status(400).send('Invalid JSON'); }
});

async function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing";
    try {
        const { files, projectState } = job;
        const { clips, totalDuration, projectAspectRatio } = projectState;
        const duration = parseFloat(totalDuration) || 5;
        
        let width = 1920, height = 1080;
        if (projectAspectRatio === '9:16') { width = 1080; height = 1920; }
        else if (projectAspectRatio === '1:1') { width = 1080; height = 1080; }

        const fileMap = {};
        const inputArgs = [];
        files.forEach((file, idx) => {
            if (isImage(file.originalname)) inputArgs.push("-loop", "1");
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
        });

        const outputPath = path.join(uploadDir, `export_${jobId}.mp4`);
        job.outputPath = outputPath;

        let filterComplex = `color=s=${width}x${height}:c=black:d=${duration}[bg]`;
        let lastVideo = "[bg]";

        const visualClips = clips.filter(c => ['video', 'camada', 'text', 'image'].includes(c.track) || ['video', 'image', 'text'].includes(c.type));
        
        visualClips.forEach((clip, i) => {
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined && clip.type !== 'text') return;

            let clipFilter = "";
            const procLabel = `v_proc${i}`;
            const clipDur = clip.duration;

            if (clip.type === 'text') {
                clipFilter = `color=s=${width}x${height}:c=black@0:d=${clipDur},drawtext=text='${clip.properties.text || ' '}' :fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2`;
            } else {
                clipFilter = `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
            }

            // --- MOVIMENTOS NO EXPORT ---
            const mov = clip.properties.movement?.type;
            if (mov === 'zoom-slow-in' || mov === 'kenBurns') {
                clipFilter += `,zoompan=z='min(zoom+0.0015,1.5)':d=${Math.round(clipDur * 30)}:s=${width}x${height}`;
            } else if (mov === 'shake-hard') {
                clipFilter += `,crop=w=iw-40:h=ih-40:x='20+15*sin(2*pi*8*t)':y='20+15*cos(2*pi*8*t)',scale=${width}:${height}`;
            }

            // --- TRANSIÇÕES NO EXPORT ---
            if (clip.transition?.id) {
                clipFilter += `,fade=t=in:st=0:d=${clip.transition.duration || 1}:alpha=1`;
            }

            if (clip.properties.opacity < 1) {
                clipFilter += `,format=rgba,colorchannelmixer=aa=${clip.properties.opacity}`;
            }

            filterComplex += `;${clipFilter}[${procLabel}]`;
            let x = clip.properties.transform?.x || 0;
            let y = clip.properties.transform?.y || 0;
            filterComplex += `;${lastVideo}[${procLabel}]overlay=x='${x}':y='${y}':enable='between(t,${clip.start},${clip.start + clip.duration})'[v_stage${i}]`;
            lastVideo = `[v_stage${i}]`;
        });

        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track));
        const audioInputs = [];
        audioClips.forEach((clip, i) => {
            const idx = fileMap[clip.fileName];
            if (idx === undefined) return;
            filterComplex += `;[${idx}:a]volume=${clip.properties.volume || 1},adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${i}]`;
            audioInputs.push(`[a${i}]`);
        });

        if (audioInputs.length > 0) {
            filterComplex += `;${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[outa]`;
        } else {
            filterComplex += `;anullsrc=r=44100:cl=stereo:d=${duration}[outa]`;
        }

        const args = [
            "-progress", "pipe:1",
            ...inputArgs,
            "-filter_complex", filterComplex,
            "-map", lastVideo,
            "-map", "[outa]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
            "-t", duration.toString(), "-y", outputPath
        ];

        const ffmpeg = spawn("ffmpeg", args);
        ffmpeg.stdout.on('data', (data) => {
            const out = data.toString();
            const timeMatch = out.match(/out_time_ms=(\d+)/);
            if (timeMatch) job.progress = Math.min(99, Math.round((parseInt(timeMatch[1]) / (duration * 1000000)) * 100));
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                job.status = "completed"; job.progress = 100;
                job.downloadUrl = `/api/process/download/${jobId}`;
            } else { job.status = "failed"; }
        });
    } catch (err) { job.status = "failed"; }
}

// --- ROTAS DE PROCESSAMENTO INDIVIDUAL (IA E EFEITOS) ---
app.post('/api/process/start/:action', uploadFields, async (req, res) => {
    const { action } = req.params;
    const jobId = `${action}_${Date.now()}`;
    const videoFile = req.files.video ? req.files.video[0] : (req.files.audio ? req.files.audio[0] : null);
    
    if (!videoFile && action !== 'voice-clone') return res.status(400).send('Missing file');

    jobs[jobId] = { status: 'pending', progress: 0, files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processSingleAction(jobId, action);
});

async function processSingleAction(jobId, action) {
    const job = jobs[jobId];
    job.status = 'processing';
    const videoFile = job.files.video ? job.files.video[0] : (job.files.audio ? job.files.audio[0] : null);
    const out = path.join(uploadDir, `proc_${jobId}${isImage(videoFile?.originalname || '') ? '.png' : '.mp4'}`);
    job.outputPath = out;

    let args = ['-i', videoFile.path];
    const params = job.params.params ? JSON.parse(job.params.params) : job.params;

    switch (action) {
        case 'rotoscope-real':
            args.push('-vf', `chromakey=${(params.color || '#00FF00').replace('#', '0x')}:0.1:0.1`, '-c:v', 'libvpx-vp9', '-auto-alt-ref', '0');
            break;
        case 'upscale-real':
            args.push('-vf', 'scale=3840:2160:flags=lanczos');
            break;
        case 'remove-silence-real':
            args.push('-af', `silenceremove=start_periods=1:start_threshold=${params.threshold || -30}dB:stop_periods=-1:stop_duration=0.5`);
            break;
        case 'voice-fx-real':
            const map = { robot: "asetrate=11025*0.9,aresample=44100", squirrel: "asetrate=44100*1.5,aresample=44100" };
            args.push('-af', map[params.preset] || "anull");
            break;
        default: args.push('-c', 'copy');
    }

    args.push('-y', out);
    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.on('close', (code) => {
        job.status = code === 0 ? 'completed' : 'failed';
        job.progress = 100;
        job.downloadUrl = `/api/process/download/${jobId}`;
    });
}

// --- MUSIC GEN ---
app.post('/api/process/generate-music', uploadAny, async (req, res) => {
    const { prompt, duration } = req.body;
    const jobId = `music_${Date.now()}`;
    const out = path.join(uploadDir, `${jobId}.wav`);
    jobs[jobId] = { status: 'processing', progress: 0, outputPath: out };
    res.status(202).json({ jobId });

    const filter = `aevalsrc='0.1*sin(2*PI*t*120/60)':d=${duration || 10}`;
    exec(`ffmpeg -f lavfi -i "${filter}" -acodec pcm_s16le -ar 44100 -ac 2 "${out}" -y`, (err) => {
        job.status = err ? 'failed' : 'completed';
        job.progress = 100;
        job.downloadUrl = `/api/process/download/${jobId}`;
    });
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).send();
    res.json(job);
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.status(404).send();
    res.download(path.resolve(job.outputPath));
});

app.listen(PORT, () => console.log(`Backend Pro Ativo: ${PORT}`));
