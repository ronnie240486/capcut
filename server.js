// Importa os módulos necessários
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Inicializa a aplicação Express
const app = express();

// Define a porta
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

app.use((req, res, next) => {
  console.log(`[Request Received] Method: ${req.method}, URL: ${req.originalUrl}`);
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

// --- Funções Auxiliares de Processamento ---
const processWithFfmpegStream = (req, res, ffmpegArgs, outputContentType, friendlyName) => {
    if (!req.file || !fs.existsSync(req.file.path)) {
        return res.status(400).json({ message: 'Nenhum ficheiro válido foi enviado.' });
    }
    const inputPath = req.file.path;
    const finalArgs = ['-i', inputPath, ...ffmpegArgs, 'pipe:1'];
    console.log(`[Job Iniciado] ${friendlyName} com comando: ${ffmpegPath} ${finalArgs.join(' ')}`);
    
    const ffmpegProcess = spawn(ffmpegPath, finalArgs);
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
    
    // Simula um tempo de processamento de 3 segundos
    setTimeout(() => {
        console.log(`[AI Job Simulado] ${friendlyName} concluído. A devolver o ficheiro original como exemplo.`);
        res.sendFile(path.resolve(inputPath), (err) => {
            if (err) console.error(`Erro ao enviar ficheiro simulado de ${friendlyName}:`, err);
            // Limpa o ficheiro após o envio
            fs.unlink(inputPath, (unlinkErr) => unlinkErr && console.error("Falha ao apagar ficheiro de entrada simulado:", unlinkErr));
        });
    }, 3000);
};

// --- Rotas ---

app.get('/', (req, res) => res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' }));
app.post('/api/projects', (req, res) => {
  console.log('Recebido um novo projeto para salvar:', req.body.name);
  res.status(201).json({ message: `Projeto "${req.body.name}" recebido com sucesso!`, projectId: `proj_${Date.now()}` });
});

// --- Rota de Exportação ---
// (Código de exportação robusto omitido por brevidade, mas está aqui no seu ficheiro)
app.post('/api/export', upload.any(), (req, res) => {
    // ... (A sua lógica de exportação completa está aqui) ...
    try {
        console.log('[Export Job] Recebidos ficheiros:', req.files.map(f => f.originalname).join(', '));
        const projectState = JSON.parse(req.body.projectState);
        const { clips, totalDuration, media } = projectState;
        
        const cleanupFiles = [];
        const inputs = [];
        const fileMap = {};
        
        req.files.forEach(file => {
            inputs.push('-i', file.path);
            fileMap[file.originalname] = inputs.length / 2 - 1;
            cleanupFiles.push(file.path);
        });

        if (inputs.length === 0 && totalDuration > 0) {
             const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
             const commandArgs = [ '-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=${totalDuration}`, '-f', 'lavfi', '-i', 'anullsrc=r=44100', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-shortest', outputPath ];
             const ffmpegProcess = spawn(ffmpegPath, commandArgs);
             ffmpegProcess.on('close', code => {
                 if (code !== 0) return res.status(500).json({ message: "Falha ao criar vídeo vazio." });
                 res.sendFile(path.resolve(outputPath), (err) => {
                     if (err) console.error('Erro ao enviar ficheiro exportado:', err);
                     fs.unlink(outputPath, ()=>{});
                 });
             });
             return;
        }

        let filterComplex = '';
        const videoStreamsToOverlay = [];
        const audioStreamsToMix = [];

        clips.forEach((clip, index) => {
            const inputIndex = fileMap[clip.fileName];
            const mediaInfo = media[clip.fileName];
            if (inputIndex === undefined || !mediaInfo) return;

            if (clip.track === 'video') {
                const streamName = `[v${index}]`;
                let filters = `scale=1280:720,setsar=1,setpts=PTS-STARTPTS`;
                filterComplex += `[${inputIndex}:v]${filters}${streamName}; `;
                videoStreamsToOverlay.push({ stream: streamName, clip: clip });
            }

            if (mediaInfo.hasAudio && (clip.properties.volume === undefined || clip.properties.volume > 0)) {
                 const streamName = `[a${index}]`;
                 const volume = clip.properties.volume ?? 1;
                 const volumeFilter = (volume !== 1) ? `volume=${volume},` : '';
                 filterComplex += `[${inputIndex}:a]${volumeFilter}asetpts=PTS-STARTPTS,aresample=44100${streamName}; `;
                 audioStreamsToMix.push({ stream: streamName, clip: clip });
            }
        });

        filterComplex += `color=s=1280x720:c=black:d=${totalDuration}[base];`;
        let lastOverlay = '[base]';
        videoStreamsToOverlay.forEach((vs, index) => {
            const nextOverlay = (index === videoStreamsToOverlay.length - 1) ? '[outv]' : `[ov${index}]`;
            filterComplex += `${lastOverlay}${vs.stream}overlay=enable='between(t,${vs.clip.start},${vs.clip.start + vs.clip.duration})'${nextOverlay};`;
            lastOverlay = nextOverlay;
        });
        if (videoStreamsToOverlay.length === 0) {
            filterComplex += `[base]null[outv];`;
        }

        if (audioStreamsToMix.length > 0) {
            const delayedAudioStreams = [];
            audioStreamsToMix.forEach((as, index) => {
                const delayedStream = `[ad${index}]`;
                const delayMs = as.clip.start * 1000;
                filterComplex += `${as.stream}adelay=${delayMs}|${delayMs}${delayedStream}; `;
                delayedAudioStreams.push(delayedStream);
            });
            filterComplex += `${delayedAudioStreams.join('')}amix=inputs=${delayedAudioStreams.length}:dropout_transition=3[outa];`;
        }

        const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
        cleanupFiles.push(outputPath);

        const commandArgs = [ ...inputs, '-filter_complex', filterComplex, '-map', '[outv]' ];
        if (audioStreamsToMix.length > 0) {
            commandArgs.push('-map', '[outa]');
        } else {
            commandArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest');
        }
        commandArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-t', totalDuration, outputPath);

        console.log('[Export Job] Comando FFmpeg:', ffmpegPath, commandArgs.join(' '));
        const ffmpegProcess = spawn(ffmpegPath, commandArgs);
        
        ffmpegProcess.stderr.on('data', (data) => console.error(`[FFmpeg Export STDERR]: ${data.toString()}`));

        ffmpegProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`[Export Job] FFmpeg terminou com código de erro ${code}`);
                cleanupFiles.forEach(f => fs.unlink(f, () => {}));
                if(!res.headersSent) {
                    return res.status(500).json({ message: "Falha na exportação do vídeo. Verifique os logs do servidor." });
                }
                return;
            }
            console.log('[Export Job] Exportação concluída com sucesso.');
            res.sendFile(path.resolve(outputPath), (err) => {
                if (err) console.error('Erro ao enviar ficheiro exportado:', err);
                cleanupFiles.forEach(f => fs.unlink(f, () => {}));
            });
        });

         ffmpegProcess.on('error', (err) => {
            console.error(`[Export Job] Falha ao iniciar FFmpeg:`, err);
            cleanupFiles.forEach(f => fs.unlink(f, () => {}));
            if (!res.headersSent) {
                res.status(500).json({ message: `Falha ao iniciar a exportação.` });
            }
        });
    } catch (e) {
        console.error('[Export Job] Erro catastrófico:', e);
        res.status(500).json({ message: "Ocorreu um erro inesperado no servidor." });
    }
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

// --- Rotas FFmpeg (Não-Streaming para Processos Pesados) ---
app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const transformsFile = path.join(uploadDir, `${filename}.trf`);
    const outputPath = path.join(uploadDir, `stabilized-${filename}`);
    const cleanup = () => { [inputPath, transformsFile, outputPath].forEach(f => fs.existsSync(f) && fs.unlink(f, () => {})); };
    const detectCommand = `${ffmpegPath} -i ${inputPath} -vf vidstabdetect=result=${transformsFile} -f null -`;
    console.log('[Stabilize Job] Passagem 1:', detectCommand);
    exec(detectCommand, (err, stdout, stderr) => {
        if (err) {
            console.error('[Stabilize Job] Falha na Passagem 1:', stderr);
            cleanup();
            return res.status(500).json({ message: 'Falha na análise do vídeo para estabilização.' });
        }
        console.log('[Stabilize Job] Passagem 1 concluída.');
        const transformCommand = `${ffmpegPath} -i ${inputPath} -vf vidstabtransform=input=${transformsFile}:zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4 -vcodec libx264 -preset fast ${outputPath}`;
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
    const command = `${ffmpegPath} -i ${inputPath} -vf "minterpolate='fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',tblend=all_mode=average,framestep=2" -preset veryfast ${outputPath}`;
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

### Passo 2: Atualizar o Editor (`editor_de_texto.html`)
                                  ^^^^^^^^^^^^^^^

SyntaxError: Unexpected identifier
    at internalCompileFunction (node:internal/vm:76:18)

Agora, vamos ligar todos os botões que faltavam às novas rotas que criámos.

1.  No seu ficheiro `editor_de_texto.html`, dentro da função `setupEventListeners()`, encontre o objeto `placeholderButtons`.
2.  **Substitua o bloco de código que define `fileUploadButtons` e `placeholderButtons`** pelo seguinte bloco completo. Ele move todos os botões de IA para a lista correta (`fileUploadButtons`), para que eles enviem o ficheiro ao servidor para a simulação.

    ```javascript
    // Bloco de código para substituir os antigos
    const fileUploadButtons = {
        'edit-extract-audio-btn': { endpoint: '/api/process/extract-audio-real', name: 'Extrair Áudio' },
        'edit-stabilize-btn': { endpoint: '/api/process/stabilize-real', name: 'Estabilização' },
        'edit-isolate-voice-btn': { endpoint: '/api/process/isolate-voice-real', name: 'Isolar Voz' },
        'edit-reduce-noise-btn': { endpoint: '/api/process/reduce-noise-real', name: 'Redução de Ruído' },
        'edit-enhance-voice-btn': { endpoint: '/api/process/enhance-voice-real', name: 'Aprimorar Voz' },
        'edit-mask-btn': { endpoint: '/api/process/mask-real', name: 'Mascarar' },
        'edit-motionblur-btn': { endpoint: '/api/process/motionblur-real', name: 'Borrão de Mov.' },
        // Botões de IA agora enviam ficheiros para simulação
        'edit-reframe-btn': { endpoint: '/api/process/reframe', name: 'Reenquadramento IA' },
        'edit-retouch-btn': { endpoint: '/api/process/retouch', name: 'Retoque IA' },
        'edit-remove-bg-btn': { endpoint: '/api/process/remove-bg', name: 'Remover Fundo IA' },
        'edit-ai-removal-btn': { endpoint: '/api/process/ai-removal', name: 'Remoção IA' },
        'edit-ai-expand-btn': { endpoint: '/api/process/ai-expand', name: 'Expansão IA' },
        'edit-lip-sync-btn': { endpoint: '/api/process/lip-sync', name: 'Sinc. Labial IA' },
        'edit-camera-track-btn': { endpoint: '/api/process/camera-track', name: 'Rastreio IA' },
        'edit-video-translate-btn': { endpoint: '/api/process/video-translate', name: 'Tradução IA' },
        'legendas-auto-btn': { endpoint: '/api/process/auto-captions', name: 'Legendas IA' }
    };
    Object.entries(fileUploadButtons).forEach(([btnId, data]) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.dataset.endpoint = data.endpoint;
            btn.addEventListener('click', () => processClipWithFileUpload(data.endpoint, data.name));
        }
    });

    // A lista de placeholders fica vazia por agora
    const placeholderButtons = {};
    Object.entries(placeholderButtons).forEach(([btnId, data]) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => callBackendProcess(data.endpoint, {}));
        }
    });
    

