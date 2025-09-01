// --- Módulos ---
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// --- Inicialização ---
const app = express();
const PORT = process.env.PORT || 8080;

// --- Middlewares ---
app.set('trust proxy', 1);
app.use(cors({ origin: '*', methods: "GET,HEAD,PUT,PATCH,POST,DELETE" }));
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    console.log(`[Request Received] ${req.method} ${req.originalUrl}`);
    next();
});

// --- Upload ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- Função genérica FFmpeg streaming ---
const processWithFfmpegStream = (req, res, ffmpegArgs, contentType, friendlyName) => {
    if (!req.file || !fs.existsSync(req.file.path)) return res.status(400).json({ message: 'Nenhum ficheiro válido enviado.' });
    const inputPath = req.file.path;
    const ffmpegProcess = spawn(ffmpegPath, ['-i', inputPath, ...ffmpegArgs, 'pipe:1']);
    res.setHeader('Content-Type', contentType);
    ffmpegProcess.stdout.pipe(res);
    ffmpegProcess.stderr.on('data', d => console.error(`[${friendlyName} STDERR]`, d.toString()));
    ffmpegProcess.on('close', code => {
        fs.unlink(inputPath, () => {});
        if (code !== 0 && !res.headersSent) res.status(500).json({ message: `Erro no processamento ${friendlyName}` });
    });
    req.on('close', () => ffmpegProcess.kill());
};

// --- Rotas básicas ---
app.get('/', (req, res) => res.status(200).json({ message: 'Servidor ProEdit funcionando!' }));
app.post('/api/projects', (req, res) => {
    const project = req.body;
    console.log('Novo projeto:', project.name);
    res.status(201).json({ message: `Projeto "${project.name}" recebido.`, projectId: `proj_${Date.now()}` });
});

// --- ROTA DE EXPORTAÇÃO NO SERVIDOR (ROBUSTA E COM LOGS) ---
app.post('/api/export', upload.any(), (req, res) => {
    try {
        console.log('[Export Job] Body recebido:', req.body);
        console.log('[Export Job] Files recebidos:', req.files?.map(f => f.originalname) || []);

        // --- Validação do projectState ---
        let projectState;
        try {
            if (!req.body.projectState) {
                return res.status(400).json({ message: "projectState não fornecido no corpo da requisição." });
            }
            projectState = typeof req.body.projectState === 'string'
                ? JSON.parse(req.body.projectState)
                : req.body.projectState;
        } catch (err) {
            console.error('[Export Job] JSON inválido em projectState:', req.body.projectState);
            return res.status(400).json({ message: "projectState inválido ou malformado." });
        }

        const { clips, totalDuration, media } = projectState || {};
        if (!clips || !Array.isArray(clips) || typeof totalDuration !== 'number') {
            return res.status(400).json({ message: "Estrutura de projectState inválida ou incompleta." });
        }

        const cleanupFiles = [];
        const inputs = [];
        const fileMap = {};

        // --- Mapear arquivos enviados ---
        req.files.forEach(file => {
            inputs.push('-i', file.path);
            fileMap[file.originalname] = inputs.length / 2 - 1;
            cleanupFiles.push(file.path);
        });

        // --- Caso nenhum arquivo enviado, mas há duração ---
        if (inputs.length === 0 && totalDuration > 0) {
            const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
            const commandArgs = [
                '-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=${totalDuration}`,
                '-f', 'lavfi', '-i', 'anullsrc=r=44100',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
                '-shortest', outputPath
            ];

            console.log('[Export Job] Nenhum arquivo enviado, criando vídeo vazio...');
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

        // --- Montagem do filter_complex e export normal ---
        let filterComplex = '';
        const videoStreamsToOverlay = [];
        const audioStreamsToMix = [];

        clips.forEach((clip, index) => {
            const inputIndex = fileMap[clip.fileName];
            const mediaInfo = media?.[clip.fileName];
            if (inputIndex === undefined || !mediaInfo) return;

            if (clip.track === 'video') {
                const streamName = `[v${index}]`;
                let filters = `scale=1280:720,setsar=1,setpts=PTS-STARTPTS`;
                filterComplex += `[${inputIndex}:v]${filters}${streamName}; `;
                videoStreamsToOverlay.push({ stream: streamName, clip });
            }

            if (mediaInfo.hasAudio && (clip.properties.volume === undefined || clip.properties.volume > 0)) {
                const streamName = `[a${index}]`;
                const volume = clip.properties.volume ?? 1;
                const volumeFilter = (volume !== 1) ? `volume=${volume},` : '';
                filterComplex += `[${inputIndex}:a]${volumeFilter}asetpts=PTS-STARTPTS,aresample=44100${streamName}; `;
                audioStreamsToMix.push({ stream: streamName, clip });
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


// --- Rotas FFmpeg reais ---
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
app.post('/api/process/mask-real', upload.single('video'), (req, res) => {
    processWithFfmpegStream(req, res, ['-vf', "format=rgba,geq=r='r(X,Y)':a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/3,2)),255,0)'", '-f', 'mp4'], 'video/mp4', 'Máscara');
});
app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum vídeo enviado.' });
    const input = req.file.path;
    const output = path.join(uploadDir, `stabilized-${Date.now()}.mp4`);

    const detect = `${ffmpegPath} -i ${input} -vf vidstabdetect=shakiness=5:accuracy=15 -f null -`;
    exec(detect, (err) => {
        if (err) return res.status(500).json({ message: 'Falha na análise do vídeo para estabilização.' });
        const transform = `${ffmpegPath} -i ${input} -vf vidstabtransform=smoothing=30 -c:v libx264 -preset fast ${output}`;
        exec(transform, (err2) => {
            fs.unlink(input, () => {});
            if (err2) return res.status(500).json({ message: 'Falha na estabilização.' });
            res.sendFile(output, () => fs.unlink(output, () => {}));
        });
    });
});

// --- Rotas placeholders avançadas ---
const advancedRoutes = [
    'motionblur-real', 'reframe', 'enhance-voice', 'remove-bg',
    'auto-captions', 'retouch', 'ai-removal', 'ai-expand',
    'lip-sync', 'camera-track', 'video-translate'
];
advancedRoutes.forEach(func => {
    app.post(`/api/process/${func}`, upload.single('video'), (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Nenhum vídeo enviado.' });
        const input = req.file.path;
        const output = path.join(uploadDir, `${func}-${Date.now()}.mp4`);
        console.log(`[${func}] Processando vídeo: ${input}`);
        const args = ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', output];
        const ffmpegProcess = spawn(ffmpegPath, ['-i', input, ...args]);
        ffmpegProcess.stderr.on('data', d => console.error(`[${func} STDERR]`, d.toString()));
        ffmpegProcess.on('close', code => {
            fs.unlink(input, () => {});
            if (code !== 0) return res.status(500).json({ message: `Falha no processamento ${func}` });
            res.sendFile(output, () => fs.unlink(output, () => {}));
        });
    });
});

// --- Iniciar servidor ---
app.listen(PORT, () => console.log(`Servidor a escutar na porta ${PORT}`));
