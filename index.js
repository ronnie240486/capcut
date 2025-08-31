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
// Cria uma pasta temporária para guardar os vídeos recebidos
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
// Configura o multer para guardar os ficheiros no disco
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage });

// --- Middlewares ---
// Habilita o CORS para permitir que o seu frontend se comunique com este backend
app.use(cors());
// Habilita o parsing de JSON no corpo das requisições
app.use(express.json());


// --- Rotas ---

// Rota principal (Health Check)
// Usada para verificar se o servidor está a funcionar corretamente.
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! O servidor está a funcionar.' });
});

// Rota de exemplo para salvar um projeto (funcionalidade a ser implementada)
app.post('/api/projects', (req, res) => {
  const projectData = req.body;
  console.log('Recebido um novo projeto para salvar:', projectData.name);
  
  // Aqui viria a lógica para salvar os dados num banco de dados.
  // Por enquanto, apenas retornamos uma mensagem de sucesso.
  res.status(201).json({ 
    message: `Projeto "${projectData.name}" recebido com sucesso!`, 
    projectId: `proj_${Date.now()}` 
  });
});


// --- Rota de Processamento de Vídeo REAL ---
// Esta rota recebe um ficheiro de vídeo, inverte-o com FFmpeg e devolve o resultado.
app.post('/api/process/reverse-real', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum ficheiro de vídeo foi enviado.' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `reversed-${req.file.filename}`);
    
    console.log(`[Job Iniciado] A inverter vídeo: ${inputPath}`);

    // Comando FFmpeg para inverter o vídeo
    const ffmpegCommand = `ffmpeg -i "${inputPath}" -vf reverse "${outputPath}"`;

    exec(ffmpegCommand, (error, stdout, stderr) => {
        // Função de limpeza para apagar os ficheiros temporários
        const cleanup = () => {
            fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro de entrada:", err));
            if (fs.existsSync(outputPath)) {
                fs.unlink(outputPath, (err) => err && console.error("Falha ao apagar ficheiro de saída:", err));
            }
        };

        if (error) {
            console.error('Erro no FFmpeg:', stderr);
            cleanup();
            return res.status(500).json({ message: 'Falha ao processar o vídeo.', error: stderr });
        }

        console.log(`[Job Concluído] Vídeo invertido: ${outputPath}`);
        
        // Envia o ficheiro de vídeo processado de volta para o cliente
        res.sendFile(path.resolve(outputPath), (err) => {
            if (err) {
                console.error('Erro ao enviar o ficheiro:', err);
            }
            // Após enviar (ou falhar ao enviar), limpa os ficheiros
            cleanup();
        });
    });
});


// --- Rotas de Processamento de Vídeo (Placeholders) ---
// Estas rotas simulam o início de um trabalho pesado no backend.

// Rota para processar o reverso de um vídeo
app.post('/api/process/reverse', (req, res) => {
    const { clipId } = req.body;
    console.log(`[Job Iniciado] Invertendo o clipe: ${clipId}`);
    res.status(202).json({ message: 'O processo de inversão foi iniciado.', jobId: `reverse_${Date.now()}` });
});

// Rota para estabilizar um vídeo
app.post('/api/process/stabilize', (req, res) => {
    const { clipId } = req.body;
    console.log(`[Job Iniciado] Estabilizando o clipe: ${clipId}`);
    res.status(202).json({ message: 'O processo de estabilização foi iniciado.', jobId: `stabilize_${Date.now()}` });
});

// Rota para reenquadrar um vídeo
app.post('/api/process/reframe', (req, res) => {
    const { clipId, targetAspectRatio } = req.body;
    console.log(`[Job Iniciado] Reenquadrando o clipe: ${clipId} para ${targetAspectRatio}`);
    res.status(202).json({ message: 'O processo de reenquadramento foi iniciado.', jobId: `reframe_${Date.now()}` });
});

// Rota para aplicar borrão de movimento
app.post('/api/process/motionblur', (req, res) => {
    const { clipId, intensity } = req.body;
    console.log(`[Job Iniciado] Aplicando borrão de movimento no clipe: ${clipId} com intensidade ${intensity}`);
    res.status(202).json({ message: 'O processo de borrão de movimento foi iniciado.', jobId: `motionblur_${Date.now()}` });
});

// Rota para processamento de máscara
app.post('/api/process/mask', (req, res) => {
    const { clipId, maskType } = req.body;
    console.log(`[Job Iniciado] Aplicando máscara do tipo '${maskType}' no clipe: ${clipId}`);
    res.status(202).json({ message: 'O processo de máscara foi iniciado.', jobId: `mask_${Date.now()}` });
});


// --- Rotas de Processamento de Áudio (Placeholders) ---

app.post('/api/process/extract-audio', (req, res) => {
    const { clipId } = req.body;
    console.log(`[Job Iniciado] Extraindo áudio do clipe: ${clipId}`);
    res.status(202).json({ message: 'A extração de áudio foi iniciada.', jobId: `extract-audio_${Date.now()}` });
});

app.post('/api/process/isolate-voice', (req, res) => {
    const { clipId } = req.body;
    console.log(`[Job Iniciado] Isolando voz do clipe: ${clipId}`);
    res.status(202).json({ message: 'O processo de isolamento de voz foi iniciado.', jobId: `isolate-voice_${Date.now()}` });
});

app.post('/api/process/reduce-noise', (req, res) => {
    const { clipId, level } = req.body;
    console.log(`[Job Iniciado] Reduzindo ruído do clipe: ${clipId} com nível ${level}`);
    res.status(202).json({ message: 'A redução de ruído foi iniciada.', jobId: `reduce-noise_${Date.now()}` });
});

app.post('/api/process/enhance-voice', (req, res) => {
    const { clipId } = req.body;
    console.log(`[Job Iniciado] Aprimorando voz do clipe: ${clipId}`);
    res.status(202).json({ message: 'O aprimoramento de voz foi iniciado.', jobId: `enhance-voice_${Date.now()}` });
});


// --- Rotas de Processamento com IA (Placeholders) ---

app.post('/api/process/remove-bg', (req, res) => {
    const { clipId } = req.body;
    console.log(`[Job Iniciado] Removendo fundo do clipe: ${clipId}`);
    res.status(202).json({ message: 'A remoção de fundo foi iniciada.', jobId: `remove-bg_${Date.now()}` });
});

app.post('/api/process/auto-captions', (req, res) => {
    const { clipId, language } = req.body;
    console.log(`[Job Iniciado] Gerando legendas automáticas para o clipe: ${clipId} em ${language}`);
    res.status(202).json({ message: 'A geração de legendas foi iniciada.', jobId: `auto-captions_${Date.now()}` });
});

app.post('/api/process/retouch', (req, res) => {
    const { clipId, settings } = req.body;
    console.log(`[Job Iniciado] Aplicando retoque no clipe: ${clipId}`, settings);
    res.status(202).json({ message: 'O processo de retoque foi iniciado.', jobId: `retouch_${Date.now()}` });
});

app.post('/api/process/ai-removal', (req, res) => {
    const { clipId, objectToRemove } = req.body;
    console.log(`[Job Iniciado] Removendo objeto '${objectToRemove}' do clipe: ${clipId}`);
    res.status(202).json({ message: 'A remoção com IA foi iniciada.', jobId: `ai-removal_${Date.now()}` });
});

app.post('/api/process/ai-expand', (req, res) => {
    const { clipId, direction } = req.body;
    console.log(`[Job Iniciado] Expandindo clipe: ${clipId} na direção ${direction}`);
    res.status(202).json({ message: 'A expansão com IA foi iniciada.', jobId: `ai-expand_${Date.now()}` });
});

app.post('/api/process/lip-sync', (req, res) => {
    const { videoClipId, audioClipId } = req.body;
    console.log(`[Job Iniciado] Sincronizando lábios do clipe ${videoClipId} com o áudio ${audioClipId}`);
    res.status(202).json({ message: 'A sincronização labial foi iniciada.', jobId: `lip-sync_${Date.now()}` });
});

app.post('/api/process/camera-track', (req, res) => {
    const { clipId, objectToTrack } = req.body;
    console.log(`[Job Iniciado] Rastreando objeto '${objectToTrack}' no clipe: ${clipId}`);
    res.status(202).json({ message: 'O rastreio de câmera foi iniciado.', jobId: `camera-track_${Date.now()}` });
});

app.post('/api/process/video-translate', (req, res) => {
    const { clipId, targetLanguage } = req.body;
    console.log(`[Job Iniciado] Traduzindo vídeo do clipe: ${clipId} para ${targetLanguage}`);
    res.status(202).json({ message: 'A tradução de vídeo foi iniciada.', jobId: `video-translate_${Date.now()}` });
});


// --- Iniciar o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor a escutar na porta ${PORT}`);
});

