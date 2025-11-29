

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
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage });

// --- Sistema de Tarefas Assíncronas (Simulado em Memória) ---
const jobs = {};

// --- Funções Auxiliares de Processamento ---
const processWithFfmpegStream = (req, res, ffmpegArgs, outputContentType, friendlyName) => {
    if (!req.file || !fs.existsSync(req.file.path)) {
        return res.status(400).json({ message: 'Nenhum ficheiro válido foi enviado.' });
    }
    const inputPath = req.file.path;
    const finalArgs = ['-i', inputPath, ...ffmpegArgs, 'pipe:1'];
    console.log(`[Job Iniciado] ${friendlyName} com comando: ffmpeg ${finalArgs.join(' ')}`);

    const ffmpegProcess = spawn('ffmpeg', finalArgs);
    res.setHeader('Content-Type', outputContentType);
    ffmpegProcess.stdout.pipe(res);
    ffmpegProcess.stderr.on('data', (data) => console.error(`[FFmpeg STDERR] ${friendlyName}: ${data.toString()}`));
    ffmpegProcess.on('close', (code) => {
        if (code !== 0) console.error(`[FFmpeg] Processo ${friendlyName} terminou com código de erro ${code}`);
        else console.log(`[Job Concluído] Stream para ${friendlyName} finalizado com sucesso.`);
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
    });
    ffmpegProcess.on('error', (err) => {
        console.error(`[FFmpeg] Falha ao iniciar o processo ${friendlyName}:`, err);
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
        if (!res.headersSent) res.status(500).json({ message: `Falha ao iniciar o processamento (${friendlyName}).` });
    });
    req.on('close', () => ffmpegProcess.kill());
};

const simulateAiProcess = (req, res, friendlyName) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const inputPath = req.file.path;
    console.log(`[AI Job Simulado] Iniciado para ${friendlyName} com o ficheiro ${inputPath}`);

    setTimeout(() => {
        console.log(`[AI Job Simulado] ${friendlyName} concluído. A devolver o ficheiro original como exemplo.`);
        res.sendFile(path.resolve(inputPath), (err) => {
            if (err) console.error(`Erro ao enviar ficheiro simulado de ${friendlyName}:`, err);
            fs.unlink(inputPath, (unlinkErr) => unlinkErr && console.error("Falha ao apagar ficheiro de entrada simulado:", unlinkErr));
        });
    }, 3000);
};

// --- Rotas ---
app.get('/', (req, res) => res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' }));

// --- ROTA DE DIAGNÓSTICO DO FFmpeg (CORREÇÃO ADICIONADA AQUI) ---
app.get('/api/check-ffmpeg', (req, res) => {
    exec('ffmpeg -version', (error, stdout, stderr) => {
        if (error) {
            console.error(`Erro na verificação do FFmpeg: ${error.message}`);
            return res.status(500).json({ 
                message: 'O FFmpeg não foi encontrado no servidor. É necessário instalá-lo.', 
                error: error.message 
            });
        }
        res.status(200).json({ 
            message: 'O FFmpeg está instalado com sucesso.', 
            version: stdout.split('\n')[0] 
        });
    });
});

app.post('/api/projects', (req, res) => {
  console.log('Recebido um novo projeto para salvar:', req.body.name);
  res.status(201).json({ message: `Projeto "${req.body.name}" recebido com sucesso!`, projectId: `proj_${Date.now()}` });
});

// --- ROTA DE EXPORTAÇÃO (NOVO FLUXO) ---
app.post('/api/export/start', upload.any(), (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) {
        return res.status(400).json({ message: 'Dados do projeto em falta.' });
    }
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
    if (!job || job.status !== 'completed' || !job.outputPath) {
        return res.status(404).json({ message: 'Ficheiro não encontrado ou a tarefa não está concluída.' });
    }
    res.download(path.resolve(job.outputPath), `ProEdit_Export.mp4`, (err) => {
        if (err) console.error("Erro ao fazer o download do ficheiro:", err);
        if (fs.existsSync(job.outputPath)) fs.unlink(job.outputPath, () => {});
        job.files.forEach(f => fs.existsSync(f.path) && fs.unlink(f.path, () => {}));
        delete jobs[req.params.jobId];
    });
});

// --- LÓGICA DE PROCESSAMENTO DA TAREFA DE EXPORTAÇÃO (VERSÃO CORRIGIDA) ---
function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing";
    job.progress = 0;

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

        const commandArgs = [];
        const fileMap = {};
        files.forEach(file => {
            const mediaInfo = media[file.originalname];
            if (mediaInfo?.type === "image") commandArgs.push("-loop", "1");
            commandArgs.push("-i", file.path);
            fileMap[file.originalname] = commandArgs.filter(arg => arg === "-i").length - 1;
        });

        let filterChains = [];
        const audioClips = clips.filter(c => media[c.fileName]?.hasAudio && (c.properties.volume ?? 1) > 0);
        
        clips.filter(c => c.track === 'video' || c.track === 'camada').forEach((clip, vIdx) => {
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
            const speedCurve = clip.properties.speedCurve;
            let speedFilter = `setpts=PTS/${speed}`;

            const preFilter = `[${inputIndex}:v]${clipSpecificFilters.length > 0 ? clipSpecificFilters.join(',')+',' : ''}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
            filterChains.push(`${preFilter}[vpre${vIdx}]`);
            filterChains.push(`[vpre${vIdx}]${speedFilter}[v${vIdx}]`);
        });

        let videoChain = `color=s=${width}x${height}:c=black:d=${totalDuration}[base]`;
        const videoClipsToOverlay = clips.filter(c => c.track === 'video' || c.track === 'camada');
        if (videoClipsToOverlay.length > 0) {
            let prevOverlay = "[base]";
            videoClipsToOverlay.forEach((clip, idx) => {
                const isLast = idx === videoClipsToOverlay.length - 1;
                const nextOverlay = isLast ? "[outv]" : `[ov${idx}]`;
                const vIdx = clips.filter(c => c.track === 'video' || c.track === 'camada').indexOf(clip);
                videoChain += `;${prevOverlay}[v${vIdx}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})'${nextOverlay}`;
                prevOverlay = nextOverlay;
            });
        } else {
            videoChain += ";[base]null[outv]";
        }
        filterChains.push(videoChain);

        if (audioClips.length > 0) {
            const delayed = [], mixed = [];
            audioClips.forEach((clip, idx) => {
                const inputIndex = fileMap[clip.fileName];
                if (inputIndex === undefined) return;
                const volume = clip.properties.volume ?? 1;
                const speed = clip.properties.speed || 1;
                let atempoFilter = '';
                let currentSpeed = speed;
                while(currentSpeed > 2.0) { atempoFilter += 'atempo=2.0,'; currentSpeed /= 2.0; }
                while(currentSpeed < 0.5) { atempoFilter += 'atempo=0.5,'; currentSpeed /= 0.5; }
                if(currentSpeed !== 1.0) atempoFilter += `atempo=${currentSpeed}`;
                if (atempoFilter.endsWith(',')) atempoFilter = atempoFilter.slice(0, -1);

                const volFilter = volume !== 1 ? `volume=${volume}` : "anull";
                delayed.push(`[${inputIndex}:a]${volFilter},asetpts=PTS-STARTPTS${atempoFilter ? ',' + atempoFilter : ''},aresample=44100[a${idx}_pre]`);
                delayed.push(`[a${idx}_pre]adelay=${clip.start * 1000}|${clip.start * 1000}[a${idx}]`);
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

app.post('/api/process/scene-detect', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath } = req.file;
    const command = `ffmpeg -i "${inputPath}" -vf "select='gt(scene,0.4)',showinfo" -f null - 2>&1`;
    exec(command, (err, stdout, stderr) => {
        fs.unlink(inputPath, () => {});
        if (err) { console.error('Scene Detect Error:', stderr); return res.status(500).send('Falha ao detectar cenas.'); }
        const timestamps = (stderr.match(/pts_time:([\d.]+)/g) || []).map(s => parseFloat(s.split(':')[1]));
        res.json(timestamps);
    });
});

app.post('/api/process/normalize-audio', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `normalized-${filename}`);
    const command = `ffmpeg -i "${inputPath}" -af loudnorm -y "${outputPath}"`;
    exec(command, (err, stdout, stderr) => {
        fs.unlink(inputPath, () => {});
        if (err) { console.error('Normalize Error:', stderr); fs.existsSync(outputPath) && fs.unlink(outputPath, () => {}); return res.status(500).send('Falha ao normalizar áudio.'); }
        res.sendFile(path.resolve(outputPath), (sendErr) => { if (sendErr) console.error('Erro ao enviar ficheiro normalizado:', sendErr); fs.unlink(outputPath, () => {}); });
    });
});

const voiceEffects = {
    'chipmunk': 'asetrate=44100*1.5,atempo=1/1.5',
    'robot': 'afftfilt=real=\'hypot(re,im)*cos(0)\':imag=\'hypot(re,im)*sin(0)\'',
    'deep': 'asetrate=44100*0.7,atempo=1/0.7',
    'echo': 'aecho=0.8:0.9:1000:0.3',
    'vibrato': 'vibrato=f=5.0:d=0.5',
};

Object.entries(voiceEffects).forEach(([name, filter]) => {
    app.post(`/api/process/voice-effect-${name}`, upload.single('video'), (req, res) => {
        processWithFfmpegStream(req, res, ['-af', filter, '-f', 'mp4'], 'video/mp4', `Efeito de Voz: ${name}`);
    });
});


// --- Rota de Transcodificação ---
app.post('/api/process/transcode', upload.single('video'), (req, res) => {
    const args = ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-f', 'mp4'];
    processWithFfmpegStream(req, res, args, 'video/mp4', 'Transcodificar');
});

// --- Rotas de Processamento FFmpeg ---
app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-vf', 'reverse', '-af', 'areverse', '-f', 'mp4'], 'video/mp4', 'Reverso');
});
app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-vn', '-q:a', '0', '-map', 'a', '-f', 'mp3'], 'audio/mpeg', 'Extrair Áudio');
});
app.post('/api/process/reduce-noise-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-af', 'afftdn', '-f', 'mp4'], 'video/mp4', 'Redução de Ruído');
});
app.post('/api/process/isolate-voice-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-af', 'lowpass=f=3000,highpass=f=300', '-f', 'mp4'], 'video/mp4', 'Isolar Voz');
});
app.post('/api/process/enhance-voice-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-af', 'highpass=f=200,lowpass=f=3000,acompressor=threshold=0.089:ratio=2:attack=20:release=1000', '-f', 'mp4'], 'video/mp4', 'Aprimorar Voz');
});
app.post('/api/process/mask-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-vf', "format=rgba,geq=r='r(X,Y)':a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/3,2)),255,0)'", '-f', 'mp4'], 'video/mp4', 'Mascarar');
});
app.post('/api/process/remove-silence-real', upload.single('video'), (req, res) => {
    const threshold = req.body.threshold || -30;
    const duration = req.body.duration || 0.5;
    const filter = `silenceremove=stop_periods=-1:stop_duration=${duration}:stop_threshold=${threshold}dB`;
    const ffmpegArgs = ['-af', filter, '-f', 'mp4'];
    processWithFfmpegStream(req, res, ffmpegArgs, 'video/mp4', 'Remover Silêncio');
});

// --- NOVA ROTA: Extrair Frame ---
app.post('/api/process/extract-frame', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    
    const { path: inputPath, filename } = req.file;
    const timestamp = req.body.timestamp || '0';
    const outputFilename = `frame-${path.parse(filename).name}-${Date.now()}.png`;
    const outputPath = path.join(uploadDir, outputFilename);

    const cleanup = () => { [inputPath, outputPath].forEach(f => fs.existsSync(f) && fs.unlink(f, () => {})); };

    // Comando FFmpeg para extrair um único frame como PNG
    const command = `ffmpeg -i "${inputPath}" -ss ${timestamp} -vframes 1 -f image2 "${outputPath}"`;

    console.log('[Extract Frame] Comando:', command);

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error('[Extract Frame] Falha:', stderr);
            cleanup();
            return res.status(500).json({ message: 'Falha ao extrair o frame do vídeo.' });
        }
        
        console.log('[Extract Frame] Concluído.');
        res.sendFile(path.resolve(outputPath), (sendErr) => {
            if (sendErr) console.error('Erro ao enviar frame:', sendErr);
            cleanup();
        });
    });
});


// --- Rotas FFmpeg (Não-Streaming para Processos Pesados) ---
app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const transformsFile = path.join(uploadDir, `${filename}.trf`);
    const outputPath = path.join(uploadDir, `stabilized-${filename}`);
    const cleanup = () => { [inputPath, transformsFile, outputPath].forEach(f => fs.existsSync(f) && fs.unlink(f, () => {})); };
    const detectCommand = `ffmpeg -i ${inputPath} -vf vidstabdetect=result=${transformsFile} -f null -`;
    console.log('[Stabilize Job] Passagem 1:', detectCommand);
    exec(detectCommand, (err, stdout, stderr) => {
        if (err) {
            console.error('[Stabilize Job] Falha na Passagem 1:', stderr);
            cleanup();
            return res.status(500).json({ message: 'Falha na análise do vídeo para estabilização.' });
        }
        console.log('[Stabilize Job] Passagem 1 concluída.');
        const transformCommand = `ffmpeg -i ${inputPath} -vf vidstabtransform=input=${transformsFile}:zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4 -vcodec libx264 -preset fast ${outputPath}`;
        console.log('[Stabilize Job] Passagem 2:', transformCommand);
        exec(transformCommand, (err2, stdout2, stderr2) => {
            if (err2) {
                console.error('[Stabilize Job] Falha na Passagem 2:', stderr2);
                cleanup();
                return res.status(500).json({ message: 'Falha ao aplicar a estabilização.' });
            }
            console.log('[Stabilize Job] Passagem 2 concluída.');
            res.sendFile(path.resolve(outputPath), (sendErr) => {
                if (sendErr) console.error('Erro ao enviar ficheiro estabilizado:', sendErr);
                cleanup();
            });
        });
    });
});
app.post('/api/process/motionblur-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `motionblur-${filename}`);
    const cleanup = () => { [inputPath, outputPath].forEach(f => fs.existsSync(f) && fs.unlink(f, () => {})); };
    const command = `ffmpeg -i ${inputPath} -vf "minterpolate='fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',tblend=all_mode=average,framestep=2" -preset veryfast ${outputPath}`;
    console.log('[MotionBlur Job] Comando:', command);
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error('[MotionBlur Job] Falha:', stderr);
            cleanup();
            return res.status(500).json({ message: 'Falha ao aplicar o borrão de movimento.' });
        }
        console.log('[MotionBlur Job] Concluído.');
        res.sendFile(path.resolve(outputPath), (sendErr) => {
            if (sendErr) console.error('Erro ao enviar ficheiro:', sendErr);
            cleanup();
        });
    });
});

// --- Rotas de IA (REAIS e NÃO IMPLEMENTADAS) ---
app.post('/api/process/remove-bg-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputFilename = `bg-removed-${path.parse(filename).name}.webm`;
    const outputPath = path.join(uploadDir, outputFilename);
    const cleanup = () => { [inputPath, outputPath].forEach(f => fs.existsSync(f) && fs.unlink(f, () => {})); };
    console.log('[Remove-BG] Chamando script Python...');
    const pythonProcess = spawn('python', ['remove_background.py', inputPath, outputPath]);
    pythonProcess.stdout.on('data', (data) => console.log(`[Python STDOUT]: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`[Python STDERR]: ${data}`));
    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            cleanup();
            return res.status(500).json({ message: 'O script de remoção de fundo falhou. Verifique se Python, moviepy e rembg estão instalados no servidor.' });
        }
        console.log('[Remove-BG] Concluído! Enviando vídeo...');
        res.sendFile(path.resolve(outputPath), (sendErr) => {
            if (sendErr) console.error('Erro ao enviar vídeo com fundo removido:', sendErr);
            cleanup();
        });
    });
});

// --- NOVA ROTA: Câmera Lenta Mágica (AI Frame Interpolation) ---
app.post('/api/process/interpolate-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    
    const { path: inputPath, filename } = req.file;
    const outputFilename = `interpolated-${path.parse(filename).name}.mp4`;
    const outputPath = path.join(uploadDir, outputFilename);
    
    const cleanup = () => { [inputPath, outputPath].forEach(f => fs.existsSync(f) && fs.unlink(f, () => {})); };

    console.log('[AI Interpolation] Chamando script Python...');
    
    // Chama o script Python, passando o arquivo de entrada e o de saída como argumentos
    const pythonProcess = spawn('python', ['interpolate_video.py', inputPath, outputPath]);

    pythonProcess.stdout.on('data', (data) => console.log(`[Python STDOUT]: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`[Python STDERR]: ${data}`));

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            cleanup();
            return res.status(500).json({ message: 'O script de interpolação de frames falhou. Verifique as dependências de IA no servidor.' });
        }
        
        console.log('[AI Interpolation] Concluído! Enviando vídeo...');
        res.sendFile(path.resolve(outputPath), (sendErr) => {
            if (sendErr) console.error('Erro ao enviar vídeo interpolado:', sendErr);
            cleanup();
        });
    });
});


const notImplemented = (req, res) => {
    if (req.file && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(501).json({ message: 'Funcionalidade ainda não implementada no servidor.' });
};
app.post('/api/process/reframe', upload.single('video'), notImplemented);
app.post('/api/process/remove-bg', upload.single('video'), notImplemented); // Rota antiga simulada
app.post('/api/process/auto-captions', upload.single('video'), simulateAiProcess); // Mantendo simulação por enquanto
app.post('/api/process/retouch', upload.single('video'), notImplemented);
app.post('/api/process/ai-removal', upload.single('video'), notImplemented);
app.post('/api/process/ai-expand', upload.single('video'), notImplemented);
app.post('/api/process/lip-sync', upload.single('video'), notImplemented);
app.post('/api/process/camera-track', upload.single('video'), notImplemented);
app.post('/api/process/video-translate', upload.single('video'), notImplemented);

// --- Iniciar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor a escutar na porta ${PORT}`);
});
