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
  console.log(`[Request Received] Method: ${req.method}, URL: ${req.originalUrl}`);
  next();
});

app.use(express.json());

// Adiciona os cabeçalhos COOP e COEP para permitir o SharedArrayBuffer no frontend
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

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
    
    // Adiciona o ficheiro de entrada e os argumentos para streaming
    const finalArgs = ['-i', inputPath, ...ffmpegArgs, 'pipe:1'];

    console.log(`[Job Iniciado] ${friendlyName} com comando: ${ffmpegPath} ${finalArgs.join(' ')}`);
    
    const ffmpegProcess = spawn(ffmpegPath, finalArgs);

    res.setHeader('Content-Type', outputContentType);

    // Envia a saída do FFmpeg diretamente para o cliente
    ffmpegProcess.stdout.pipe(res);

    // Regista os erros do FFmpeg no log do servidor
    ffmpegProcess.stderr.on('data', (data) => {
        console.error(`[FFmpeg STDERR] ${friendlyName}: ${data.toString()}`);
    });

    ffmpegProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`[FFmpeg] Processo ${friendlyName} terminou com código de erro ${code}`);
            if (!res.headersSent) {
                res.status(500).json({ message: `Erro no processamento (${friendlyName}), código: ${code}` });
            }
        } else {
            console.log(`[Job Concluído] Stream para ${friendlyName} finalizado com sucesso.`);
        }
        // Limpa o ficheiro de entrada após o processo terminar
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
    });

    ffmpegProcess.on('error', (err) => {
        console.error(`[FFmpeg] Falha ao iniciar o processo ${friendlyName}:`, err);
        fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
        if (!res.headersSent) {
            res.status(500).json({ message: `Falha ao iniciar o processamento (${friendlyName}).` });
        }
    });
    
    // Se o cliente fechar a conexão, termina o processo FFmpeg
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

// --- Rotas de Processamento REAL (Otimizadas para Streaming) ---

app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    const args = ['-vf', 'reverse', '-af', 'areverse', '-f', 'mp4'];
    processWithFfmpegStream(req, res, args, 'video/mp4', 'Reverso');
});

app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
    const args = ['-vn', '-q:a', '0', '-map', 'a', '-f', 'mp3'];
    processWithFfmpegStream(req, res, args, 'audio/mpeg', 'Extrair Áudio');
});

app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    res.status(501).json({ message: 'A estabilização é muito complexa para streaming e está em desenvolvimento.' });
});

app.post('/api/process/motionblur-real', upload.single('video'), (req, res) => {
    res.status(501).json({ message: 'O borrão de movimento é muito complexo para streaming e está em desenvolvimento.' });
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
