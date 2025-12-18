const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

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

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadSingle = multer({ storage: storage }).single('video');
const uploadAudio = multer({ storage: storage }).single('audio'); 
const uploadFields = multer({ storage: storage }).fields([
    { name: 'video', maxCount: 1 },
    { name: 'style', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]);

const uploadAny = multer({ 
    storage: storage,
    limits: { 
        fieldSize: 100 * 1024 * 1024, 
        fileSize: 5 * 1024 * 1024 * 1024 
    } 
}).any();

const jobs = {};

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

const getStyleFilter = (styleId) => {
    const cartoon = "median=3,unsharp=5:5:1.0:5:5:0.0"; 
    switch (styleId) {
        case 'photorealistic': return "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.1:saturation=1.2";
        case 'hdr_vivid': return "unsharp=5:5:1.5:5:5:0.0,eq=contrast=1.3:saturation=1.5:brightness=0.05";
        case 'unreal_engine': return "unsharp=5:5:0.8:3:3:0.0,eq=contrast=1.2:saturation=1.3,vignette=PI/5";
        case 'cinematic_4k': return "eq=contrast=1.1:saturation=0.9,curves=strong_contrast";
        case 'national_geo': return "eq=saturation=1.4:contrast=1.2,unsharp=3:3:1.5";
        case 'gopro_action': return "lenscorrection=cx=0.5:cy=0.5:k1=-0.2:k2=-0.05,eq=saturation=1.5:contrast=1.3";
        case 'studio_lighting': return "eq=brightness=0.1:contrast=1.1,unsharp=5:5:0.5";
        case 'bokeh_portrait': return "boxblur=2:1,unsharp=5:5:1.5";
        case 'minecraft': return "scale=iw/16:ih/16:flags=nearest,scale=iw*16:ih*16:flags=nearest";
        case 'retro_8bit': return "scale=iw/8:ih/8:flags=nearest,scale=iw*8:ih*8:flags=nearest,format=gray,eq=contrast=1.5";
        case 'van_gogh': return "gblur=2,eq=saturation=1.5:contrast=1.2"; 
        case 'cyberpunk': return "eq=contrast=1.2:saturation=1.5,colorbalance=rs=0.2:gs=-0.1:bs=0.2";
        default: return cartoon;
    }
};

app.get('/', (req, res) => res.status(200).json({ message: 'ProEdit Backend Online' }));

app.get('/api/check-ffmpeg', (req, res) => {
    exec('ffmpeg -version', (error) => {
        if (error) return res.status(500).json({ status: 'offline', error: 'FFmpeg not found' });
        res.json({ status: 'online' });
    });
});

app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).json({ message: 'Dados do projeto em falta.' });
    try {
        const projectState = JSON.parse(req.body.projectState);
        jobs[jobId] = { status: 'pending', files: req.files, projectState };
        res.status(202).json({ jobId });
        processExportJob(jobId);
    } catch (e) { res.status(400).json({ message: 'Dados do projeto inválidos.' }); }
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
        const pathsToCleanup = [job.outputPath];
        if (job.files) job.files.forEach(f => pathsToCleanup.push(f.path));
        cleanupFiles(pathsToCleanup);
        delete jobs[req.params.jobId];
    });
});

async function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing"; job.progress = 0;
    try {
        const { files, projectState } = job;
        const { clips, media, projectAspectRatio, currentPlayheadTime, exportConfig } = projectState;
        
        let totalDuration = 30;
        if (projectState.totalDuration !== undefined && projectState.totalDuration !== null) {
            const parsed = parseFloat(projectState.totalDuration);
            if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
                totalDuration = parsed;
            }
        }
        
        if (totalDuration <= 0) {
            if (clips && clips.length > 0) {
                totalDuration = Math.max(...clips.map(c => (Number(c.start) || 0) + (Number(c.duration) || 0)));
            }
            if (isNaN(totalDuration) || totalDuration <= 0) totalDuration = 30;
        }
        
        const config = exportConfig || { type: 'video', format: 'mp4', resolution: '1080p', fps: 30, filename: 'video' };
        
        let width = 1920, height = 1080;
        if (config.type === 'video' || config.type === 'image') {
            if (config.resolution === '4k') { width = 3840; height = 2160; }
            else if (config.resolution === '720p') { width = 1280; height = 720; }
            if (projectAspectRatio === '9:16') { [width, height] = [height, width]; }
            else if (projectAspectRatio === '1:1') { width = height; }
        }
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 2) * 2;

        const commandArgs = []; 
        const fileMap = {};
        files.forEach((file, idx) => {
            const mediaInfo = media[file.originalname];
            if (mediaInfo?.type === "image") commandArgs.push("-loop", "1");
            commandArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
        });

        const outputPath = path.join(uploadDir, `${config.filename || jobId}.${config.format}`);
        job.outputPath = outputPath;

        let filterChains = [];
        const audioClips = clips.filter(c => media[c.fileName]?.hasAudio && (c.properties.volume ?? 1) > 0);
        const videoAndLayerClips = clips.filter(c => ['video', 'camada', 'text', 'subtitle'].includes(c.track));
        
        videoAndLayerClips.forEach((clip, vIdx) => {
            if (clip.type === 'text' || clip.type === 'subtitle') return; 
            const inputIndex = fileMap[clip.fileName];
            if (inputIndex === undefined) return;
            let clipSpecificFilters = [];
            const adj = clip.properties.adjustments;
            if (adj) {
                clipSpecificFilters.push(`eq=brightness=${(adj.brightness || 1)-1}:contrast=${adj.contrast || 1}:saturation=${adj.saturate || 1}`);
                if (adj.hue) clipSpecificFilters.push(`hue=h=${adj.hue}`);
            }
            if (clip.properties.mirror) clipSpecificFilters.push('hflip');
            const speed = clip.properties.speed || 1;
            const pts = `setpts=PTS/${speed}`;
            const scaling = `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,pad=w=${width}:h=${height}:x=(ow-iw)/2:y=(oh-ih)/2:color=black,setsar=1`;
            filterChains.push(`[${inputIndex}:v]${clipSpecificFilters.length > 0 ? clipSpecificFilters.join(',')+',' : ''}${scaling},${pts}[v${vIdx}]`);
        });

        let videoChain = `color=s=${width}x${height}:c=black:d=${totalDuration.toFixed(3)}[base]`;
        let validVisuals = videoAndLayerClips.filter(c => c.type !== 'text' && c.type !== 'subtitle' && fileMap[c.fileName] !== undefined);
        if (validVisuals.length > 0) {
            let prevOverlay = "[base]";
            validVisuals.forEach((clip, idx) => {
                const isLast = idx === validVisuals.length - 1;
                const nextOverlay = isLast ? "[outv]" : `[ov${idx}]`;
                videoChain += `;${prevOverlay}[v${idx}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})'${nextOverlay}`;
                prevOverlay = nextOverlay;
            });
        } else { videoChain += ";[base]null[outv]"; }
        filterChains.push(videoChain);

        if (audioClips.length > 0) {
            const mixed = [];
            audioClips.forEach((clip, idx) => {
                const inputIndex = fileMap[clip.fileName];
                const volume = clip.properties.volume ?? 1;
                filterChains.push(`[${inputIndex}:a]volume=${volume},asetpts=PTS-STARTPTS,aresample=44100,adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${idx}]`);
                mixed.push(`[a${idx}]`);
            });
            filterChains.push(`${mixed.join("")}amix=inputs=${mixed.length}:dropout_transition=0[outa]`);
        }

        if (audioClips.length === 0 && config.type !== 'image') {
            commandArgs.push("-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration.toFixed(3)}`);
        }
        
        commandArgs.push("-filter_complex", filterChains.join(";"));
        if (config.type === 'audio') {
             if (audioClips.length > 0) commandArgs.push("-map", "[outa]");
             else commandArgs.push("-map", `${files.length}:a`);
        } else {
             commandArgs.push("-map", "[outv]");
             if (config.type !== 'image') {
                 if (audioClips.length > 0) commandArgs.push("-map", "[outa]");
                 else commandArgs.push("-map", `${files.length}:a`);
             }
        }

        if (config.type === 'image') {
            commandArgs.push("-ss", `${currentPlayheadTime || 0}`, "-frames:v", "1", "-c:v", "png");
        } else if (config.type === 'audio') {
            if (config.format === 'mp3') commandArgs.push("-c:a", "libmp3lame", "-b:a", "192k");
            else commandArgs.push("-c:a", "pcm_s16le");
            commandArgs.push("-vn");
        } else {
            commandArgs.push("-r", `${config.fps || 30}`, "-c:v", "libx264", "-c:a", "aac", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-shortest", "-t", totalDuration.toFixed(3));
        }
        commandArgs.push("-y", outputPath);

        const ffmpeg = spawn("ffmpeg", commandArgs);
        ffmpeg.stderr.on('data', (d) => console.log(`Export: ${d}`));
        ffmpeg.on("close", code => {
            if (code !== 0) { job.status = "failed"; job.error = "FFmpeg Error"; }
            else { job.status = "completed"; job.progress = 100; job.downloadUrl = `/api/export/download/${jobId}`; }
        });
    } catch (err) { job.status = "failed"; job.error = err.message; }
}

app.post('/api/process/start/:action', uploadFields, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processSingleClipJob(jobId);
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Not found' });
    res.json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error });
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) return res.status(404).json({ message: 'Error' });
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath), () => {
        const paths = [job.outputPath];
        if (job.files) {
            Object.values(job.files).flat().forEach(f => paths.push(f.path));
        }
        cleanupFiles(paths);
        delete jobs[req.params.jobId];
    });
});

async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing';
    const action = jobId.split('_')[0];
    const videoFile = job.files.video?.[0] || job.files.audio?.[0];
    if (!videoFile) { job.status = 'failed'; job.error = "Missing file"; return; }

    const inputIsImage = isImage(videoFile.originalname);
    const outputExtension = inputIsImage ? '.png' : (action.includes('audio') ? '.wav' : '.mp4');
    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExtension}`);
    job.outputPath = outputPath;

    const probeAudio = `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${videoFile.path}"`;
    const hasAudio = await new Promise(r => exec(probeAudio, (e, stdout) => r(stdout.trim() !== "")));

    let args = ['-i', videoFile.path];
    switch(action) {
        case 'reverse-real':
            args.push('-vf', 'reverse');
            if (hasAudio) args.push('-af', 'areverse');
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
            break;
        case 'interpolate-real':
            const speed = parseFloat(job.params.speed) || 0.5;
            const factor = 1/speed;
            if (hasAudio) {
                args.push('-filter_complex', `[0:v]minterpolate=mi_mode=blend,setpts=${factor}*PTS[v];[0:a]atempo=${speed}[a]`, '-map', '[v]', '-map', '[a]');
            } else {
                args.push('-vf', `minterpolate=mi_mode=blend,setpts=${factor}*PTS`);
            }
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
            break;
        case 'upscale-real':
            args.push('-vf', "scale=3840:2160:flags=lanczos,unsharp=5:5:1.0:5:5:0.0,scale=trunc(iw/2)*2:trunc(ih/2)*2");
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
            break;
        case 'video-to-cartoon-real':
            const filter = getStyleFilter(job.params.style);
            args.push('-vf', `${filter},scale=trunc(iw/2)*2:trunc(ih/2)*2`);
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
            break;
        default:
            args.push('-c', 'copy');
    }
    args.push('-y', outputPath);

    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.on('close', code => {
        if (code === 0) { job.status = 'completed'; job.progress = 100; job.downloadUrl = `/api/export/download/${jobId}`; }
        else { job.status = 'failed'; job.error = "FFmpeg failed"; }
    });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
