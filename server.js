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

// --- Middlewares ---
app.use(cors());
app.use(express.json());


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


// --- Rotas de Processamento REAL (com FFmpeg) ---

// Função auxiliar para executar comandos FFmpeg e gerir ficheiros
const runFFmpeg = (command, inputPath, outputPath, res) => {
    console.log(`[Job Iniciado] Executando: ${command}`);
    exec(command, (error, stdout, stderr) => {
        const cleanup = () => {
            fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
            if (fs.existsSync(outputPath)) {
                fs.unlink(outputPath, (err) => err && console.error("Falha ao apagar ficheiro de saída:", err));
            }
        };

        if (error) {
            console.error('Erro no FFmpeg:', stderr);
            cleanup();
            return res.status(500).json({ message: 'Falha ao processar o ficheiro.', error: stderr });
        }

        console.log(`[Job Concluído] Ficheiro gerado: ${outputPath}`);
        res.sendFile(path.resolve(outputPath), (err) => {
            if (err) {
                console.error('Erro ao enviar o ficheiro:', err);
            }
            cleanup();
        });
    });
};

// Rota para inverter um vídeo
app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `reversed-${filename}`);
    const command = `ffmpeg -i "${inputPath}" -vf reverse "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res);
});

// Rota para extrair o áudio de um vídeo
app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputFilename = `audio-${path.parse(filename).name}.mp3`;
    const outputPath = path.join(uploadDir, outputFilename);
    const command = `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res);
});

// Rota para estabilizar um vídeo
app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `stabilized-${filename}`);
    // O filtro 'deshake' é uma forma simples de estabilização
    const command = `ffmpeg -i "${inputPath}" -vf deshake "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res);
});

// Rota para aplicar Borrão de Movimento
app.post('/api/process/motionblur-real', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `motionblur-${filename}`);
    // O filtro 'tblend' mistura frames para criar um efeito de borrão
    const command = `ffmpeg -i "${inputPath}" -vf "tblend=average,framestep=2" "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res);
});

// Rota para reduzir o ruído de um áudio
app.post('/api/process/reduce-noise-real', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    const { path: inputPath, filename } = req.file;
    const outputPath = path.join(uploadDir, `denoised-${filename}`);
    // O filtro 'anlmdn' é eficaz para reduzir ruído de fundo
    const command = `ffmpeg -i "${inputPath}" -af anlmdn=s=7 "${outputPath}"`;
    runFFmpeg(command, inputPath, outputPath, res);
});

// --- Rotas de Processamento com IA (Placeholders) ---
// Estas funcionalidades exigem modelos de IA e não podem ser feitas apenas com FFmpeg.

app.post('/api/process/remove-bg', (req, res) => {
    res.status(501).json({ message: 'Funcionalidade não implementada. Requer um serviço de IA.' });
});
app.post('/api/process/auto-captions', (req, res) => {
    res.status(501).json({ message: 'Funcionalidade não implementada. Requer um serviço de IA.' });
});
app.post('/api/process/retouch', (req, res) => {
    res.status(501).json({ message: 'Funcionalidade não implementada. Requer um serviço de IA.' });
});
app.post('/api/process/ai-removal', (req, res) => {
    res.status(501).json({ message: 'Funcionalidade não implementada. Requer um serviço de IA.' });
});
// ... (e assim por diante para as outras rotas de IA)

// --- Iniciar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor a escutar na porta ${PORT}`);
});

