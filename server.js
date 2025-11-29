
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

        // VERIFICAÇÃO ESSENCIAL: Garante que projectState existe e é um objeto.
        if (!projectState || typeof projectState !== 'object') {
            throw new Error("Os dados do projeto (projectState) estão inválidos ou em falta.");
        }

        // AGORA, desestruturamos o objeto com segurança.
        const { clips, totalDuration, media, projectAspectRatio } = projectState;

        // Se alguma destas propriedades essenciais estiver em falta, a exportação falha.
        if (!clips || !media || totalDuration === undefined) {
             throw new Error("Dados essenciais (clips, media, totalDuration) em falta no projectState.");
        }

        // --- ATUALIZAÇÃO: Lógica de Proporção (Aspect Ratio) ---
        // Esta secção define a resolução de saída do vídeo com base na proporção enviada pelo editor.
        const aspectRatio = projectAspectRatio || '16:9';
        let width = 1280;
        let height = 720;

        if (aspectRatio === '9:16') { width = 720; height = 1280; }
        else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
        else if (aspectRatio === '4:3') { width = 1280; height = 960; }
        // O padrão é 16:9 (1280x720)

        // --- Continuação da Lógica Original ---
        if (files.length === 0 && totalDuration > 0) {
            job.status = "failed";
            job.error = "Não foram enviados ficheiros para um projeto com duração.";
            return;
        }

        const commandArgs = [];
        const fileMap = {};
        files.forEach(file => {
            const mediaInfo = media[file.originalname];
            if (mediaInfo?.type === "image") {
                commandArgs.push("-loop", "1");
            }
            commandArgs.push("-i", file.path);
            fileMap[file.originalname] = commandArgs.filter(arg => arg === "-i").length - 1;
        });

        const filterChains = [];
        const videoClips = clips.filter(c => c.track === "video");
        const audioClips = clips.filter(
            c => media[c.fileName]?.hasAudio && (c.properties.volume ?? 1) > 0
        );

        // --- ATUALIZAÇÃO: Lógica de Filtros e Efeitos ---
        videoClips.forEach((clip, idx) => {
            const inputIndex = fileMap[clip.fileName];
            if (inputIndex === undefined) return;

            // --- INÍCIO DA LÓGICA DE FILTROS ADICIONADA ---
            const clipSpecificFilters = [];

            // 1. Ajustes manuais (Brilho, Contraste, etc.) do inspetor
            const adj = clip.properties.adjustments;
            if (adj) {
                // O brilho no FFmpeg vai de -1.0 a 1.0. O editor envia de 0.0 a 2.0, por isso ajustamos.
                const ffmpegBrightness = (adj.brightness || 1.0) - 1.0;
                const eqFilter = `eq=brightness=${ffmpegBrightness}:contrast=${adj.contrast || 1.0}:saturation=${adj.saturate || 1.0}`;
                clipSpecificFilters.push(eqFilter);

                if (adj.hue && adj.hue !== 0) {
                    clipSpecificFilters.push(`hue=h=${adj.hue}`);
                }
            }

            // 2. Efeitos predefinidos (Vintage, Noir, etc.)
            const effectId = clip.effect;
            if (effectId && effectId !== 'none') {
                let effectFFmpegFilter = '';
                // Este 'switch' traduz o nome do efeito do editor para um comando de filtro do FFmpeg
                switch (effectId) {
                    case 'vintage':
                        effectFFmpegFilter = 'vignette,gblur=sigma=0.2,eq=contrast=0.8:saturation=1.2';
                        break;
                    case 'noir':
                        effectFFmpegFilter = 'format=gray,eq=contrast=1.3';
                        break;
                    case 'grayscale':
                        effectFFmpegFilter = 'format=gray';
                        break;
                    case 'vivid':
                        effectFFmpegFilter = 'eq=saturation=1.8';
                        break;
                    case 'cool':
                        effectFFmpegFilter = 'hue=s=1.1:H=-15';
                        break;
                    case 'warm':
                        effectFFmpegFilter = 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'; // Simulação de Sépia
                        break;
                    // --- IMPORTANTE: Adicione um 'case' para cada um dos seus efeitos aqui ---
                }
                if (effectFFmpegFilter) {
                    clipSpecificFilters.push(effectFFmpegFilter);
                }
            }
            
            const effectsString = clipSpecificFilters.length > 0 ? `,${clipSpecificFilters.join(',')}` : '';
            // --- FIM DA LÓGICA DE FILTROS ADICIONADA ---

            // Monta a cadeia de filtros final para este clipe, incluindo proporção e efeitos
            // A parte 'scale' e 'pad' lida com a PROPORÇÃO do vídeo.
            filterChains.push(
                `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2${effectsString},setsar=1,setpts=PTS-STARTPTS[v${idx}]`
            );
        });

        // Usa as novas dimensões de largura e altura
        let videoChain = `color=s=${width}x${height}:c=black:d=${totalDuration}[base]`;
        if (videoClips.length > 0) {
            let prevOverlay = "[base]";
            videoClips.forEach((clip, idx) => {
                const isLast = idx === videoClips.length - 1;
                const nextOverlay = isLast ? "[outv]" : `[ov${idx}]`;
                videoChain += `;${prevOverlay}[v${idx}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})'${nextOverlay}`;
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
                delayed.push(
                    `[${inputIndex}:a]${volFilter},asetpts=PTS-STARTPTS,aresample=44100[a${idx}_pre]`,
                    `[a${idx}_pre]adelay=${clip.start * 1000}|${clip.start * 1000}[a${idx}]`
                );
                mixed.push(`[a${idx}]`);
            });
            filterChains.push(...delayed);
            filterChains.push(
                `${mixed.join("")}amix=inputs=${mixed.length}:dropout_transition=3[outa]`
            );
        }

        const outputPath = path.join(uploadDir, `${jobId}.mp4`);
        job.outputPath = outputPath;
        if (audioClips.length === 0) {
            commandArgs.push(
                "-f", "lavfi",
                "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"
            );
        }

        commandArgs.push(
            "-filter_complex", filterChains.join(";"),
            "-map", "[outv]"
        );

        if (audioClips.length > 0) {
            commandArgs.push("-map", "[outa]");
        } else {
            const silentIndex = files.length;
            commandArgs.push("-map", `${silentIndex}:a`);
        }

        commandArgs.push(
            "-c:v", "libx264",
            "-c:a", "aac",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            // "-shortest", // REMOVIDO PARA CORRIGIR PROBLEMA DE ÁUDIO
            "-progress", "pipe:1",
            "-t", totalDuration,
            outputPath
        );

        console.log(`[Export Job] FFmpeg: ffmpeg ${commandArgs.join(" ")}`);
        const ffmpegProcess = spawn("ffmpeg", commandArgs);

        ffmpegProcess.stdout.on("data", data => {
            const match = data.toString().match(/out_time_ms=(\d+)/);
            if (match) {
                const processed = parseInt(match[1], 10) / 1e6;
                job.progress = Math.min(100, (processed / totalDuration) * 100);
            }
        });

        let ffmpegErrors = "";
        ffmpegProcess.stderr.on("data", data => {
            ffmpegErrors += data.toString();
            console.error(`[FFmpeg STDERR]: ${data}`);
        });

        ffmpegProcess.on("close", code => {
            if (code !== 0) {
                job.status = "failed";
                job.error = "Falha no FFmpeg. " + ffmpegErrors.slice(-800);
                console.error(`[Export Job] FFmpeg terminou com erro ${code}`);
            } else {
                job.status = "completed";
                job.progress = 100;
                job.downloadUrl = `/api/export/download/${jobId}`;
                console.log("[Export Job] Exportação concluída com sucesso.");
            }
        });

        ffmpegProcess.on("error", err => {
            job.status = "failed";
            job.error = "Falha ao iniciar o processo FFmpeg.";
            console.error("[Export Job] Erro ao iniciar FFmpeg:", err);
        });

    } catch (err) {
        job.status = "failed";
        job.error = "Ocorreu um erro inesperado no servidor: " + err.message;
        console.error("[Export Job] Erro catastrófico:", err);
    }
}


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

// --- Rotas de Simulação de IA ---
app.post('/api/process/reframe', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Reenquadramento IA'));
app.post('/api/process/remove-bg', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Remoção de Fundo IA'));
app.post('/api/process/auto-captions', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Legendas Automáticas IA'));
app.post('/api/process/retouch', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Retoque IA'));
app.post('/api/process/ai-removal', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Remoção de Objeto IA'));
app.post('/api/process/ai-expand', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Expansão IA'));
app.post('/api/process/lip-sync', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Sincronização Labial IA'));
app.post('/api/process/camera-track', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Rastreio de Câmera IA'));
app.post('/api/process/video-translate', upload.single('video'), (req, res) => simulateAiProcess(req, res, 'Tradução de Vídeo IA'));

// --- Iniciar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor a escutar na porta ${PORT}`);
});
