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

// Confiança no proxy do Railway (importante para ambientes de produção)
app.set('trust proxy', 1);

// Configuração de CORS mais explícita e robusta
const corsOptions = {
  origin: '*', // Permite qualquer origem. Ideal para desenvolvimento e testes.
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Habilita o pre-flight para todas as rotas

// Logger para ver todas as requisições que chegam
app.use((req, res, next) => {
  console.log(`[Request Received] Method: ${req.method}, URL: ${req.originalUrl}`);
  next();
});

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

// --- Função Auxiliar para Processamento com FFmpeg ---
const processWithFfmpeg = (req, res, command, outputFilename, friendlyName) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum ficheiro foi enviado.' });
    }
    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, outputFilename);
    console.log(`[Job Iniciado] ${friendlyName}: ${inputPath}`);

    // Adiciona os parâmetros extras ao comando
    let finalCommand = command.replace('{intensity}', req.body.intensity || 5);

    exec(finalCommand, (error, stdout, stderr) => {
        const cleanup = () => {
            fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
            if (fs.existsSync(outputPath)) {
                fs.unlink(outputPath, (err) => err && console.error("Falha ao apagar ficheiro de saída:", err));
            }
        };
        if (error) {
            console.error(`Erro no FFmpeg (${friendlyName}):`, stderr);
            cleanup();
            return res.status(500).json({ message: `Falha ao processar (${friendlyName}).`, error: stderr });
        }
        console.log(`[Job Concluído] ${friendlyName}: ${outputPath}`);
        res.sendFile(path.resolve(outputPath), (err) => {
            if (err) console.error('Erro ao enviar o ficheiro:', err);
            cleanup();
        });
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

// --- Rotas de Processamento REAL ---

app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    const command = `ffmpeg -i "${req.file.path}" -vf reverse -af areverse "${path.join(uploadDir, `reversed-${req.file.filename}`)}"`;
    processWithFfmpeg(req, res, command, `reversed-${req.file.filename}`, 'Reverso');
});

app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => {
    const outputFilename = `audio-${path.parse(req.file.filename).name}.mp3`;
    const command = `ffmpeg -i "${req.file.path}" -q:a 0 -map a "${path.join(uploadDir, outputFilename)}"`;
    processWithFfmpeg(req, res, command, outputFilename, 'Extrair Áudio');
});

app.post('/api/process/stabilize-real', upload.single('video'), (req, res) => {
    const outputFilename = `stabilized-${req.file.filename}`;
    // Nota: A estabilização é um processo de duas passagens. Esta é uma versão simplificada.
    const command = `ffmpeg -i "${req.file.path}" -vf vidstabtransform,unsharp=5:5:0.8:3:3:0.4 "${path.join(uploadDir, outputFilename)}"`;
    console.warn("Aviso: Estabilização é experimental e pode ser lenta.");
    processWithFfmpeg(req, res, command, outputFilename, 'Estabilização');
});

app.post('/api/process/motionblur-real', upload.single('video'), (req, res) => {
    const outputFilename = `motionblur-${req.file.filename}`;
    const command = `ffmpeg -i "${req.file.path}" -vf "minterpolate='fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',tblend=all_mode=average,framestep=2" "${path.join(uploadDir, outputFilename)}"`;
    console.warn("Aviso: Borrão de Movimento é experimental e muito lento.");
    processWithFfmpeg(req, res, command, outputFilename, 'Borrão de Movimento');
});

app.post('/api/process/reduce-noise-real', upload.single('video'), (req, res) => {
    const outputFilename = `denoised-${req.file.filename}`;
    const command = `ffmpeg -i "${req.file.path}" -af "afftdn" "${path.join(uploadDir, outputFilename)}"`;
    processWithFfmpeg(req, res, command, outputFilename, 'Redução de Ruído');
});

app.post('/api/process/isolate-voice-real', upload.single('video'), (req, res) => {
    const outputFilename = `isolated-${req.file.filename}`;
    // Usa um filtro para tentar atenuar sons que não são de voz
    const command = `ffmpeg -i "${req.file.path}" -af "lowpass=f=3000,highpass=f=300" "${path.join(uploadDir, outputFilename)}"`;
    console.warn("Aviso: Isolar Voz é uma técnica básica e não uma remoção de IA.");
    processWithFfmpeg(req, res, command, outputFilename, 'Isolar Voz');
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

