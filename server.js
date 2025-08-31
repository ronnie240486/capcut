// Importa os módulos necessários
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Inicializa a aplicação Express
const app = express();

// Define a porta. Railway fornecerá a porta através de process.env.PORT
const PORT = process.env.PORT || 8080;

// --- Middlewares ---

// --- CORREÇÃO: Configuração do CORS mais explícita ---
// Isto garante que o servidor aceita pedidos de qualquer origem.
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Habilita o parsing de JSON no corpo das requisições
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


// --- Função Auxiliar para Executar FFmpeg ---
function runFFmpeg(command, inputPath, outputPath, res, friendlyName) {
    console.log(`[Job Iniciado] ${friendlyName}: ${inputPath}`);
    exec(command, (error, stdout, stderr) => {
        const cleanup = () => {
            fs.unlink(inputPath, (err) => err && console.error(`Falha ao apagar ficheiro de entrada (${inputPath}):`, err));
            if (fs.existsSync(outputPath)) {
                fs.unlink(outputPath, (err) => err && console.error(`Falha ao apagar ficheiro de saída (${outputPath}):`, err));
            }
        };

        if (error) {
            console.error(`Erro no FFmpeg (${friendlyName}):`, stderr);
            cleanup();
            return res.status(500).json({ message: `Falha ao processar (${friendlyName}).`, error: stderr });
        }

        console.log(`[Job Concluído] ${friendlyName}: ${outputPath}`);
        res.sendFile(path.resolve(outputPath), (err) => {
            if (err) {
                console.error('Erro ao enviar o ficheiro:', err);
            }
            cleanup();
        });
    });
}

// --- Rotas ---

app.get('/', (req, res) => {
    res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' });
});

app.post('/api/projects', (req, res) => {
    const projectData = req.body;
    console.log('Recebido um novo projeto para salvar:', projectData.name);
    res.status(201).json({
        message: `Projeto "${projectData.name}" recebido com sucesso!`,
        projectId: `proj_${Date.now()}`
    });
});

// --- Rotas de Processamento REAL com FFmpeg ---

app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `reversed-${filename}`);
    const command = `ffmpeg -i "${inputPath}" -vf reverse "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res, "Reverso");
});

app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `audio-${path.parse(filename).name}.mp3`);
    const command = `ffmpeg -i "${inputPath}" -q:a 0 -map a "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res, "Extrair Áudio");
});

app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `stabilized-${filename}`);
    const command = `ffmpeg -i "${inputPath}" -vf vidstabtransform,unsharp=5:5:0.8:3:3:0.4 -vcodec libx264 -preset slow "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res, "Estabilização");
});

app.post('/api/process/motionblur-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `motionblur-${filename}`);
    const command = `ffmpeg -i "${inputPath}" -vf "tblend=average,framestep=2,minterpolate" "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res, "Borrão de Movimento");
});

app.post('/api/process/reduce-noise-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `denoised-${filename}`);
    const command = `ffmpeg -i "${inputPath}" -vf "hqdn3d=luma_spatial=4:chroma_spatial=3:luma_tmp=6:chroma_tmp=4" -c:a copy "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res, "Redução de Ruído (Vídeo)");
});

app.post('/api/process/isolate-voice-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `isolated-${path.parse(filename).name}.mp3`);
    const command = `ffmpeg -i "${inputPath}" -af "pan=mono|c0=c1" "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res, "Isolar Voz (Mono)");
});


// --- Rotas de Processamento com IA (Placeholders) ---
const placeholderRoutes = [
    '/api/process/reframe', '/api/process/mask', '/api/process/enhance-voice', '/api/process/remove-bg',
    '/api/process/auto-captions', '/api/process/retouch', '/api/process/ai-removal', '/api/process/ai-expand',
    '/api/process/lip-sync', '/api/process/camera-track', '/api/process/video-translate'
];
placeholderRoutes.forEach(route => {
    app.post(route, (req, res) => {
        const featureName = route.split('/').pop();
        console.log(`[Job Placeholder] Pedido recebido para: ${featureName}`);
        res.status(501).json({ message: `A funcionalidade '${featureName}' ainda não foi implementada.` });
    });
});


// --- Iniciar o Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor a escutar na porta ${PORT}`);
});

