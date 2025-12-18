
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

// RESTORED ENDPOINT: Check if FFmpeg is installed and accessible
app.get('/api/check-ffmpeg', (req, res) => {
    exec('ffmpeg -version', (error, stdout, stderr) => {
        if (error) {
            console.error('FFmpeg check failed:', error);
            return res.status(500).json({ status: 'offline', error: 'FFmpeg not found on system path' });
        }
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
        const { clips, media, projectAspectRatio, exportConfig } = projectState;
        
        let totalDuration = projectState.totalDuration || 5;
        if (isNaN(totalDuration) || totalDuration <= 0) totalDuration = 5;

        const config = exportConfig || { type: 'video', format: 'mp4', resolution: '1080p', fps: 30, filename: 'video' };
        let width = 1920, height = 1080;
        if (config.resolution === '4k') { width = 3840; height = 2160; }
        else if (config.resolution === '720p') { width = 1280; height = 720; }
        
        if (projectAspectRatio === '9:16') { [width, height] = [height, width]; }
        else if (projectAspectRatio === '1:1') { width = height; }
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

        const outputPath = path.join(uploadDir, `${config.filename || jobId}.${config.format || 'mp4'}`);
        job.outputPath = outputPath;

        let filterChains = [];
        
        // 1. Coletar e processar clipes VISUAIS
        const validVisuals = clips.filter(c => 
            (c.type === 'video' || c.type === 'image') && 
            fileMap[c.fileName] !== undefined &&
            ['video', 'camada'].includes(c.track)
        );

        validVisuals.forEach((clip, idx) => {
            const inputIndex = fileMap[clip.fileName];
            let clipFilters = [];
            const speed = clip.properties?.speed || 1;
            clipFilters.push(`setpts=PTS/${speed}`);
            clipFilters.push(`scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,pad=w=${width}:h=${height}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0,setsar=1`);
            filterChains.push(`[${inputIndex}:v]${clipFilters.join(',')}[v${idx}]`);
        });

        let videoLayer = `color=s=${width}x${height}:c=black:d=${totalDuration}[base]`;
        if (validVisuals.length > 0) {
            let lastOutput = "[base]";
            validVisuals.forEach((clip, idx) => {
                const currentOutput = idx === validVisuals.length - 1 ? "[outv]" : `[ov${idx}]`;
                videoLayer += `;${lastOutput}[v${idx}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})':x=0:y=0${currentOutput}`;
                lastOutput = currentOutput;
            });
        } else {
            videoLayer += ";[base]null[outv]";
        }
        filterChains.push(videoLayer);

        // 2. Coletar e processar clipes de ÁUDIO (Incluindo som dos vídeos)
        const validAudioClips = clips.filter(c => 
            fileMap[c.fileName] !== undefined && 
            (
                ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
                (c.track === 'video' && media[c.fileName]?.type === 'video')
            )
        );

        const audioMixInputs = [];
        // Adicionar um canal de silêncio base para garantir que amix funcione e o áudio tenha a duração certa
        filterChains.push(`anullsrc=r=44100:cl=stereo:d=${totalDuration}[asilence]`);
        audioMixInputs.push("[asilence]");

        validAudioClips.forEach((clip, idx) => {
            const inputIndex = fileMap[clip.fileName];
            const volume = clip.properties?.volume ?? 1;
            const delay = Math.round(clip.start * 1000);
            const speed = clip.properties?.speed || 1;
            
            // Filtros de áudio: velocidade (atempo), volume e atraso (adelay)
            let afilters = [`volume=${volume}`];
            if (speed !== 1) afilters.push(`atempo=${speed}`);
            afilters.push("aresample=44100");
            afilters.push(`adelay=${delay}|${delay}`);
            
            // Usamos o stream de áudio do arquivo (inputIndex:a)
            filterChains.push(`[${inputIndex}:a]${afilters.join(',')}[a${idx}]`);
            audioMixInputs.push(`[a${idx}]`);
        });

        // Mixar todas as fontes de áudio
        filterChains.push(`${audioMixInputs.join("")}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0[outa]`);

        commandArgs.push("-filter_complex", filterChains.join(";"));
        commandArgs.push("-map", "[outv]", "-map", "[outa]");
        
        commandArgs.push(
            "-c:v", "libx264", 
            "-preset", "ultrafast", 
            "-pix_fmt", "yuv420p", 
            "-c:a", "aac",
            "-b:a", "192k",
            "-r", `${config.fps || 30}`,
            "-t", totalDuration.toFixed(3),
            "-y", outputPath
        );

        const ffmpeg = spawn("ffmpeg", commandArgs);
        ffmpeg.stderr.on('data', (d) => {
            const line = d.toString();
            console.log(`Export FFmpeg: ${line}`);
        });
        
        ffmpeg.on("close", code => {
            if (code !== 0) { 
                job.status = "failed"; 
                job.error = "Erro na renderização do FFmpeg."; 
            } else { 
                job.status = "completed"; 
                job.progress = 100; 
                job.downloadUrl = `/api/export/download/${jobId}`; 
            }
        });
    } catch (err) { 
        console.error("Erro processExportJob:", err);
        job.status = "failed"; job.error = err.message; 
    }
}

app.post('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Not found' });
    res.json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error });
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
    // This is for single clip actions, need to handle both possible structures
    let videoFile;
    if (Array.isArray(job.files)) {
        videoFile = job.files[0];
    } else {
        videoFile = job.files.video?.[0] || job.files.audio?.[0];
    }
    
    if (!videoFile) { job.status = 'failed'; job.error = "Missing file"; return; }

    const inputIsImage = isImage(videoFile.originalname);
    const outputExtension = inputIsImage ? '.png' : (action.includes('audio') ? '.wav' : '.mp4');
    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExtension}`);
    job.outputPath = outputPath;

    let args = ['-i', videoFile.path];
    switch(action) {
        case 'reverse-real':
            args.push('-vf', 'reverse', '-af', 'areverse');
            break;
        case 'upscale-real':
            args.push('-vf', "scale=3840:2160:flags=lanczos");
            break;
        default:
            args.push('-c', 'copy');
    }
    args.push('-y', outputPath);

    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.on('close', code => {
        if (code === 0) { 
            job.status = 'completed'; 
            job.progress = 100;
            job.downloadUrl = `/api/process/download/${jobId}`; 
        }
        else { job.status = 'failed'; job.error = "FFmpeg failed"; }
    });
}

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processSingleClipJob(jobId);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
