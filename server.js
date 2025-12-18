

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
    } catch (e) { 
        console.error("Erro ao parsear projectState:", e);
        res.status(400).json({ message: 'Dados do projeto inválidos.' }); 
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
        
        const totalDuration = parseFloat(projectState.totalDuration) || 5;
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

        // Mapear entradas e identificar imagens para loop
        files.forEach((file, idx) => {
            // Verifica se é imagem tanto pela extensão quanto pelos metadados enviados
            const isImg = isImage(file.originalname) || media[file.originalname]?.type === 'image';
            if (isImg) {
                commandArgs.push("-loop", "1");
            }
            commandArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
        });

        const outputPath = path.join(uploadDir, `${config.filename || jobId}.${config.format || 'mp4'}`);
        job.outputPath = outputPath;

        let filterChains = [];
        
        // 1. Processar Clipes Visuais (Vídeo e Camadas)
        const validVisuals = clips.filter(c => 
            (c.type === 'video' || c.type === 'image') && 
            fileMap[c.fileName] !== undefined &&
            ['video', 'camada'].includes(c.track)
        );

        validVisuals.forEach((clip, idx) => {
            const inputIndex = fileMap[clip.fileName];
            let clipFilters = [];
            const speed = clip.properties?.speed || 1;
            
            // Ajuste de tempo/velocidade
            clipFilters.push(`setpts=PTS/${speed}`);
            
            // Redimensionamento e preenchimento (Letterbox)
            clipFilters.push(`scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease,pad=w=${width}:h=${height}:x=(ow-iw)/2:y=(oh-ih)/2:color=black@0,setsar=1`);
            
            // Filtros de cor básicos se existirem
            const adj = clip.properties?.adjustments;
            if (adj) {
                clipFilters.push(`eq=brightness=${(adj.brightness || 1)-1}:contrast=${adj.contrast || 1}:saturation=${adj.saturate || 1}`);
            }

            filterChains.push(`[${inputIndex}:v]${clipFilters.join(',')}[v${idx}]`);
        });

        // Montar a composição visual sobre um fundo preto
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

        // 2. Processar Áudio (Músicas, SFX e Áudio Original dos Vídeos)
        const audioMixInputs = [];
        
        // Base de silêncio para garantir que sempre haja uma trilha de áudio
        filterChains.push(`anullsrc=r=44100:cl=stereo:d=${totalDuration}[asilence]`);
        audioMixInputs.push("[asilence]");

        clips.forEach((clip, idx) => {
            const inputIndex = fileMap[clip.fileName];
            if (inputIndex === undefined) return;

            // Inclui se for trilha de áudio ou se for vídeo com áudio habilitado
            const isAudioTrack = ['audio', 'narration', 'music', 'sfx'].includes(clip.track);
            const isVideoWithAudio = clip.type === 'video' && clip.track === 'video';

            if (isAudioTrack || isVideoWithAudio) {
                const volume = clip.properties?.volume ?? 1;
                const delay = Math.round(clip.start * 1000);
                const speed = clip.properties?.speed || 1;
                
                // Filtros de áudio com tratamento de velocidade (atempo)
                let aFilters = [`volume=${volume}`, `aresample=44100`, `adelay=${delay}|${delay}`];
                if (speed !== 1) aFilters.unshift(`atempo=${speed}`);
                
                // Usamos amovie ou tentamos mapear o stream de áudio com fallback
                // Para simplificar e evitar erros de stream inexistente, tentamos mapear [inputIndex:a]
                filterChains.push(`[${inputIndex}:a]${aFilters.join(',')}[a${idx}]`);
                audioMixInputs.push(`[a${idx}]`);
            }
        });

        if (audioMixInputs.length > 1) {
            filterChains.push(`${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0[outa]`);
        } else {
            filterChains.push(`[asilence]copy[outa]`);
        }

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

        console.log("Iniciando FFmpeg com argumentos:", commandArgs.join(" "));

        const ffmpeg = spawn("ffmpeg", commandArgs);
        
        ffmpeg.stderr.on('data', (d) => {
            const msg = d.toString();
            if (msg.includes('time=')) {
                // Tentar extrair progresso se necessário
            }
        });
        
        ffmpeg.on("close", code => {
            if (code !== 0) { 
                console.error(`FFmpeg falhou com código ${code}`);
                job.status = "failed"; 
                job.error = "Erro na renderização do vídeo. Verifique se todos os arquivos são válidos."; 
            } else { 
                job.status = "completed"; 
                job.progress = 100; 
                job.downloadUrl = `/api/export/download/${jobId}`; 
            }
        });
    } catch (err) { 
        console.error("Erro em processExportJob:", err);
        job.status = "failed"; 
        job.error = err.message; 
    }
}

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processSingleClipJob(jobId);
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error });
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) return res.status(404).json({ message: 'Ficheiro não encontrado.' });
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath), () => {
        const paths = [job.outputPath];
        if (job.files) job.files.forEach(f => paths.push(f.path));
        cleanupFiles(paths);
        delete jobs[req.params.jobId];
    });
});

async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing';
    const action = jobId.split('_')[0];
    
    let videoFile = (job.files && job.files.length > 0) ? job.files[0] : null;
    
    if (!videoFile) { 
        job.status = 'failed'; 
        job.error = "Arquivo de mídia ausente."; 
        return; 
    }

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
        else { job.status = 'failed'; job.error = "FFmpeg falhou no processamento individual."; }
    });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
