// Importa os módulos necessários
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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

app.use(express.json());

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

// --- ROTA DE EXPORTAÇÃO NO SERVIDOR ---
app.post('/api/export', upload.any(), (req, res) => {
    console.log('[Export Job] Recebidos ficheiros:', req.files.map(f => f.originalname).join(', '));
    const projectState = JSON.parse(req.body.projectState);
    const { clips, totalDuration } = projectState;
    const usedMedia = new Set(clips.map(c => c.fileName));
    
    const cleanupFiles = [];
    const inputs = [];
    const fileMap = {};
    req.files.forEach(file => {
        if (usedMedia.has(file.originalname)) {
            inputs.push('-i', file.path);
            fileMap[file.originalname] = inputs.length / 2 - 1;
            cleanupFiles.push(file.path);
        } else {
            // Se um ficheiro foi enviado mas não é usado, apaga-o
            fs.unlink(file.path, () => {});
        }
    });

    let filterComplex = '';
    const videoStreams = [];
    const audioStreams = [];

    clips.forEach(clip => {
        const inputIndex = fileMap[clip.fileName];
        if (inputIndex === undefined) return;

        if (clip.track === 'video') {
            const streamId = `v${inputIndex}_${videoStreams.length}`;
            filterComplex += `[${inputIndex}:v]scale=1280:720,setsar=1,setpts=PTS-STARTPTS+${clip.start}/TB[${streamId}]; `;
            videoStreams.push({ stream: `[${streamId}]`, start: clip.start, end: clip.start + clip.duration });
        }
        if (clip.track === 'audio' || (clip.track === 'video' && clip.properties.volume > 0)) {
            const streamId = `a${inputIndex}_${audioStreams.length}`;
            filterComplex += `[${inputIndex}:a]asetpts=PTS-STARTPTS+${clip.start}/TB[${streamId}]; `;
            audioStreams.push(`[${streamId}]`);
        }
    });

    if (videoStreams.length > 0) {
        // Usa o filtro 'overlay' para empilhar os vídeos
        let lastStream = `[0:v]trim=duration=0[bg]; [bg]`; // Começa com uma base vazia
        videoStreams.forEach(vs => {
            lastStream += `${vs.stream}overlay=enable='between(t,${vs.start},${vs.end})'`;
            if (videoStreams.indexOf(vs) !== videoStreams.length - 1) {
                const nextStreamId = `ov${videoStreams.indexOf(vs)}`;
                lastStream += `[${nextStreamId}]; [${nextStreamId}]`;
            }
        });
        filterComplex += `${lastStream}[outv]; `;
    } else {
        // Se não houver vídeo, cria um fundo preto
        filterComplex += `color=c=black:s=1280x720:d=${totalDuration}[outv]; `;
    }

    if (audioStreams.length > 0) {
        filterComplex += `${audioStreams.join('')}amix=inputs=${audioStreams.length}[outa]`;
    }

    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    cleanupFiles.push(outputPath);

    const commandArgs = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', videoStreams.length > 0 ? '[outv]' : '0:v',
        '-map', audioStreams.length > 0 ? '[outa]' : '0:a?',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-r', '30', '-shortest',
        outputPath
    ];

    console.log('[Export Job] Comando FFmpeg:', ffmpegPath, commandArgs.join(' '));
    const ffmpegProcess = spawn(ffmpegPath, commandArgs);

    ffmpegProcess.stderr.on('data', (data) => console.error(`[FFmpeg Export STDERR]: ${data.toString()}`));

    ffmpegProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`[Export Job] FFmpeg terminou com código de erro ${code}`);
            cleanupFiles.forEach(f => fs.unlink(f, () => {}));
            return res.status(500).json({ message: "Falha na exportação do vídeo." });
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
});


// --- Rotas de Processamento REAL (Otimizadas para Streaming) ---

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

// --- Rotas de Placeholders (Funcionalidades Futuras) ---
const placeholderRoutes = [
    '/api/process/stabilize-real', '/api/process/motionblur-real',
    '/api/process/reframe', '/api/process/mask',
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

