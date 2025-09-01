const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*', methods: "GET,HEAD,PUT,PATCH,POST,DELETE" }));
app.use(express.json());

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

const processWithFfmpegStream = (req, res, ffmpegArgs, outputContentType, friendlyName) => {
  if (!req.file || !fs.existsSync(req.file.path)) return res.status(400).json({ message: 'Nenhum ficheiro válido foi enviado.' });

  const inputPath = req.file.path;
  const finalArgs = ['-i', inputPath, ...ffmpegArgs, 'pipe:1'];
  console.log(`[Job Iniciado] ${friendlyName} com comando: ${ffmpegPath} ${finalArgs.join(' ')}`);

  const ffmpegProcess = spawn(ffmpegPath, finalArgs);
  res.setHeader('Content-Type', outputContentType);
  ffmpegProcess.stdout.pipe(res);

  ffmpegProcess.stderr.on('data', (data) => console.error(`[FFmpeg STDERR] ${friendlyName}: ${data.toString()}`));

  ffmpegProcess.on('close', (code) => {
    if (code !== 0 && !res.headersSent) res.status(500).json({ message: `Erro no processamento (${friendlyName}), código: ${code}` });
    console.log(`[Job Concluído] Stream para ${friendlyName} finalizado com sucesso.`);
    fs.unlink(inputPath, () => {});
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`[FFmpeg] Falha ao iniciar o processo ${friendlyName}:`, err);
    fs.unlink(inputPath, () => {});
    if (!res.headersSent) res.status(500).json({ message: `Falha ao iniciar o processamento (${friendlyName}).` });
  });

  req.on('close', () => ffmpegProcess.kill());
};

app.get('/', (req, res) => res.json({ message: 'Servidor ProEdit ativo.' }));

app.post('/api/projects', (req, res) => {
  const projectData = req.body;
  console.log('Projeto recebido:', projectData.name);
  res.status(201).json({ message: `Projeto "${projectData.name}" recebido!`, projectId: `proj_${Date.now()}` });
});

// Rotas de processamento
app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
  processWithFfmpegStream(req, res, ['-vn', '-q:a', '0', '-map', 'a', '-f', 'mp3'], 'audio/mpeg', 'Extrair Áudio');
});

app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
  processWithFfmpegStream(req, res, ['-vf', 'reverse', '-af', 'areverse', '-f', 'mp4'], 'video/mp4', 'Reverso');
});

// Placeholders
const placeholders = ['/api/process/stabilize-real', '/api/process/motionblur-real'];
placeholders.forEach(route => app.post(route, (req, res) => res.status(501).json({ message: 'Funcionalidade em desenvolvimento.' })));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
