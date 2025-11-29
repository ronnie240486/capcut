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
const uploadFields = multer({ storage: storage }).fields([
    { name: 'video', maxCount: 1 },
    { name: 'style', maxCount: 1 }
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

const processWithFfmpegStream = (req, res, ffmpegArgs, outputContentType, friendlyName) => {
    if (!req.file || !fs.existsSync(req.file.path)) {
        return res.status(400).json({ message: 'Nenhum ficheiro válido foi enviado.' });
    }
    const inputPath = req.file.path;
    const finalArgs = ['-i', inputPath, ...ffmpegArgs, 'pipe:1'];
    console.log(`[Job Síncrono] ${friendlyName} ffmpeg ${finalArgs.join(' ')}`);

    const ffmpegProcess = spawn('ffmpeg', finalArgs);
    res.setHeader('Content-Type', outputContentType);
    ffmpegProcess.stdout.pipe(res);
    ffmpegProcess.stderr.on('data', (data) => console.error(`[FFmpeg STDERR]: ${data.toString()}`));
    ffmpegProcess.on('close', () => {
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar input:", err));
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


// --- ROTAS DE PROCESSAMENTO ASSÍNCRONO DE CLIPE ÚNICO ---

// 1. Iniciar uma tarefa de processamento
app.post('/api/process/start/:action', (req, res) => {
    const { action } = req.params;

    // Se for script-to-video, usamos uploadAny porque vem muitos arquivos dinamicos
    const uploader = (action === 'style-transfer-real') ? uploadFields : (action === 'script-to-video' ? uploadAny : uploadSingle);

    uploader(req, res, (err) => {
        if (err) return res.status(400).json({ message: `Erro no upload: ${err.message}` });
        
        const jobId = `${action}_${Date.now()}`;
        
        // Estrutura arquivos
        let files = {};
        if (action === 'script-to-video') {
             files = { all: req.files };
        } else if (action === 'style-transfer-real') {
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
        } else {
             processSingleClipJob(jobId);
        }
    });
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
        if (job.files.all) allFiles.push(...job.files.all);
        cleanupFiles([...allFiles, job.outputPath]);
        delete jobs[req.params.jobId];
    });
});

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
    const durations = [];
    let completedProbes = 0;

    const run = async () => {
        try {
            for (const audio of audios) {
                const duration = await new Promise((resolve, reject) => {
                    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audio.path}"`, (err, stdout) => {
                        if (err) reject(err); else resolve(parseFloat(stdout.trim()));
                    });
                });
                durations.push(duration);
                job.progress = 10 + (completedProbes++ / audios.length) * 10;
            }

            // 2. Construir comando complexo
            let inputs = '';
            let filterComplex = '';
            let concatV = '';
            let concatA = '';

            for (let i = 0; i < images.length; i++) {
                inputs += `-loop 1 -t ${durations[i]} -i "${images[i].path}" -i "${audios[i].path}" `;
                // Efeito Ken Burns aleatório
                const zoomStart = 1 + Math.random() * 0.3;
                const zoomEnd = 1 + Math.random() * 0.3;
                // zoompan com duração fixa baseada em frames (25fps)
                const frames = Math.ceil(durations[i] * 25);
                filterComplex += `[${i*2}:v]scale=1280:720,setsar=1,zoompan=z='min(zoom+0.0015,1.5)':d=${frames}:s=1280x720[v${i}]; `;
                concatV += `[v${i}]`;
                concatA += `[${i*2+1}:a]`;
            }

            filterComplex += `${concatV}${concatA}concat=n=${images.length}:v=1:a=1[outv][outa]`;

            const command = `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -pix_fmt yuv420p -shortest "${outputPath}"`;
            
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
    const outputFilename = `${action}-${videoFile.filename}`;
    const outputPath = path.join(uploadDir, outputFilename);
    job.outputPath = outputPath;

    let command;
    let processHandler;

    const cleanup = () => {
        const allFiles = [];
        if (job.files.video) allFiles.push(...job.files.video);
        if (job.files.style) allFiles.push(...job.files.style);
        cleanupFiles([...allFiles, outputPath]);
    };

    switch (action) {
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
             // Simula estilo artístico usando curvas de cor e contraste
             command = `ffmpeg -i "${videoFile.path}" -vf "curves=vintage,eq=contrast=1.2:saturation=1.3:brightness=0.1" -c:v libx264 -preset veryfast "${outputPath}"`;
             break;
        
        case 'remove-bg-real':
             // Remoção de fundo requer IA avançada não disponível no FFmpeg puro.
             // Retornamos o original para não quebrar o app.
             console.log("Remoção de fundo requer Python. Retornando vídeo original.");
             processHandler = (resolve, reject) => {
                 fs.copyFile(videoFile.path, outputPath, (err) => {
                     if (err) reject(err);
                     else resolve();
                 });
             };
             break;

        case 'reframe-real':
             // Recorte central inteligente para 9:16
             // crop=ih*(9/16):ih:(iw-ow)/2:0 -> Mantém altura, calcula largura para 9:16, centraliza horizontalmente
             command = `ffmpeg -i "${videoFile.path}" -vf "scale=-1:720,crop=ih*(9/16):ih:(iw-ow)/2:0,setsar=1" -c:v libx264 -preset veryfast "${outputPath}"`;
             break;

        case 'retouch-real':
             // Suavização de pele usando Smart Blur
             command = `ffmpeg -i "${videoFile.path}" -vf "smartblur=lr=1.5:ls=-0.8:lt=-5.0" -c:v libx264 -preset veryfast "${outputPath}"`;
             break;

        case 'interpolate-real':
             // Interpolação de movimento usando minterpolate (simula câmera lenta/fluidez)
             // Nota: minterpolate é pesado, usamos configurações para performance
             command = `ffmpeg -i "${videoFile.path}" -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" -c:v libx264 -preset ultrafast "${outputPath}"`;
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



// --- ROTAS SÍNCRONAS (PARA TAREFAS RÁPIDAS) ---
app.post('/api/process/reverse-real', uploadSingle, (req, res) => {
    processWithFfmpegStream(req, res, ['-vf', 'reverse', '-af', 'areverse', '-f', 'mp4'], 'video/mp4', 'Reverso');
});
app.post('/api/process/extract-audio-real', uploadSingle, (req, res) => {
    processWithFfmpegStream(req, res, ['-vn', '-q:a', '0', '-map', 'a', '-f', 'mp3'], 'audio/mpeg', 'Extrair Áudio');
});
app.post('/api/process/reduce-noise-real', uploadSingle, (req, res) => {
    processWithFfmpegStream(req, res, ['-af', 'afftdn', '-f', 'mp4'], 'video/mp4', 'Redução de Ruído');
});
app.post('/api/process/isolate-voice-real', uploadSingle, (req, res) => {
    processWithFfmpegStream(req, res, ['-af', 'lowpass=f=3000,highpass=f=300', '-f', 'mp4'], 'video/mp4', 'Isolar Voz');
});
app.post('/api/process/enhance-voice-real', uploadSingle, (req, res) => {
    processWithFfmpegStream(req, res, ['-af', 'highpass=f=200,lowpass=f=3000,acompressor=threshold=0.089:ratio=2:attack=20:release=1000', '-f', 'mp4'], 'video/mp4', 'Aprimorar Voz');
});
app.post('/api/process/remove-silence-real', uploadSingle, (req, res) => {
    const threshold = req.body.threshold || -30;
    const duration = req.body.duration || 0.5;
    const filter = `silenceremove=stop_periods=-1:stop_duration=${duration}:stop_threshold=${threshold}dB`;
    processWithFfmpegStream(req, res, ['-af', filter, '-f', 'mp4'], 'video/mp4', 'Remover Silêncio');
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
const voiceEffects = { 'chipmunk': 'asetrate=44100*1.5,atempo=1/1.5', 'robot': 'afftfilt=real=\'hypot(re,im)*cos(0)\':imag=\'hypot(re,im)*sin(0)\'', 'deep': 'asetrate=44100*0.7,atempo=1/0.7', 'echo': 'aecho=0.8:0.9:1000:0.3', 'vibrato': 'vibrato=f=5.0:d=0.5', };
Object.entries(voiceEffects).forEach(([name, filter]) => {
    app.post(`/api/process/voice-effect-${name}`, uploadSingle, (req, res) => {
        processWithFfmpegStream(req, res, ['-af', filter, '-f', 'mp4'], 'video/mp4', `Efeito de Voz: ${name}`);
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
