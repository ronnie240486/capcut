// Importa os módulos necessários
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process'); // Adiciona 'exec'
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; // binário portátil do ffmpeg

// Inicializa a aplicação Express
const app = express();

// Define a porta. Railway fornecerá a porta através de process.env.PORT
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

// Aumenta o limite do corpo da requisição para JSON (útil para salvar projetos grandes)
app.use(express.json({ limit: '50mb' }));

// --- Configuração do Multer para Upload de Ficheiros ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage });

// --- Função Auxiliar Otimizada para Processamento com FFmpeg via Streaming ---
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
    ffmpegProcess.stderr.on('data', (data) => {
        console.error(`[FFmpeg STDERR] ${friendlyName}: ${data.toString()}`);
    });
    ffmpegProcess.on('close', (code) => {
        if (code !== 0) console.error(`[FFmpeg] Processo ${friendlyName} terminou com código de erro ${code}`);
        else console.log(`[Job Concluído] Stream para ${friendlyName} finalizado com sucesso.`);
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
    });
    ffmpegProcess.on('error', (err) => {
        console.error(`[FFmpeg] Falha ao iniciar o processo ${friendlyName}:`, err);
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
        if (!res.headersSent) {
            res.status(500).json({ message: `Falha ao iniciar o processamento (${friendlyName}).` });
        }
    });
    req.on('close', () => {
        ffmpegProcess.kill();
    });
};

// --- Rotas ---

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' });
});

app.post('/api/projects', (req, res) => {
  const projectData = req.body;
  console.log('Recebido um novo projeto para salvar:', projectData.name);
  res.status(201).json({ message: `Projeto "${projectData.name}" recebido com sucesso!`, projectId: `proj_${Date.now()}` });
});

// --- ROTA DE EXPORTAÇÃO NO SERVIDOR (VERSÃO ROBUSTA) ---
app.post('/api/export', upload.any(), (req, res) => {
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


// --- Rotas de Processamento REAL ---

app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    const args = ['-vf', 'reverse', '-af', 'areverse', '-f', 'mp4'];
    processWithFfmpegStream(req, res, args, 'video/mp4', 'Reverso');
});

app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
    const args = ['-vn', '-q:a', '0', '-map', 'a', '-f', 'mp3'];
    processWithFfmpegStream(req, res, args, 'audio/mpeg', 'Extrair Áudio');
});

app.post('/api/process/reduce-noise-real', upload.single('video'), (req, res) => {
    const args = ['-af', 'afftdn', '-f', 'mp4'];
    processWithFfmpegStream(req, res, args, 'video/mp4', 'Redução de Ruído');
});

app.post('/api/process/isolate-voice-real', upload.single('video'), (req, res) => {
    const args = ['-af', 'lowpass=f=3000,highpass=f=300', '-f', 'mp4'];
    processWithFfmpegStream(req, res, args, 'video/mp4', 'Isolar Voz');
});

app.post('/api/process/mask-real', upload.single('video'), (req, res) => {
    // Aplica uma máscara circular ao vídeo
    const args = ['-vf', "format=rgba,geq=r='r(X,Y)':a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/3,2)),255,0)'", '-f', 'mp4'];
    processWithFfmpegStream(req, res, args, 'video/mp4', 'Mascarar');
});

app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    }
    const { path: inputPath, filename } = req.file;
    const transformsFile = path.join(uploadDir, `${filename}.trf`);
    const outputPath = path.join(uploadDir, `stabilized-${filename}`);
    
    const cleanup = () => {
        [inputPath, transformsFile, outputPath].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlink(file, (err) => err && console.error(`Falha ao apagar ficheiro temporário ${file}:`, err));
            }
        });
    };

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
                if (sendErr) {
                    console.error('Erro ao enviar ficheiro estabilizado:', sendErr);
                }
                cleanup();
            });
        });
    });
});


// --- Rotas de Placeholders (Funcionalidades Futuras) ---
const placeholderRoutes = [
    '/api/process/motionblur-real', // Motion blur real é muito lento, mantido como placeholder
    '/api/process/reframe',
    '/api/process/enhance-voice', '/api/process/remove-bg',
    '/api/process/auto-captions', '/api/process/retouch',
    '/api/process/ai-removal', '/api/process/ai-expand',
    '/api/process/lip-sync', '/api/process/camera-track',
    '/api/process/video-translate'
];

placeholderRoutes.forEach(route => {
    app.post(route, (req, res) => {
        const functionality = route.split('/').pop();
        console.log(`[Placeholder] Recebido pedido para ${functionality}.`);
        res.status(501).json({ message: `A funcionalidade '${functionality}' ainda não foi implementada.` });
    });
});

// --- Iniciar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor a escutar na porta ${PORT}`);
});
```

---

### Passo 2: Atualizar o Editor (`editor_de_texto.html`)

Agora, vamos ligar o botão "Mascarar" à nova rota que criámos.

1.  No seu ficheiro `editor_de_texto.html`, dentro da função `setupEventListeners()`, encontre o objeto `placeholderButtons`.
    ```javascript
    // Linha a encontrar
    const placeholderButtons = {
        'edit-mask-btn': { endpoint: '/api/process/mask' },
        'edit-reframe-btn': { endpoint: '/api/process/reframe' },
        'edit-enhance-voice-btn': { endpoint: '/api/process/enhance-voice' }
    };
    ```
2.  **Mova a linha `'edit-mask-btn'`** de dentro do objeto `placeholderButtons` para o objeto `fileUploadButtons` que está logo acima.

    **Como vai ficar:**
    ```javascript
    // Bloco fileUploadButtons ATUALIZADO
    const fileUploadButtons = {
        'edit-extract-audio-btn': { endpoint: '/api/process/extract-audio-real', name: 'Extrair Áudio' },
        'edit-stabilize-btn': { endpoint: '/api/process/stabilize-real', name: 'Estabilização' },
        'edit-isolate-voice-btn': { endpoint: '/api/process/isolate-voice-real', name: 'Isolar Voz' },
        'edit-reduce-noise-btn': { endpoint: '/api/process/reduce-noise-real', name: 'Redução de Ruído' },
        'edit-mask-btn': { endpoint: '/api/process/mask-real', name: 'Mascarar' }, // <- Linha movida e atualizada
    };

    // Bloco placeholderButtons ATUALIZADO
    const placeholderButtons = {
        'edit-reframe-btn': { endpoint: '/api/process/reframe' },
        'edit-enhance-voice-btn': { endpoint: '/api/process/enhance-voice' }
    };
    

