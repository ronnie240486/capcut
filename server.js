// Importa os módulos necessários
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const app = express();
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

// --- Configuração do Multer ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- Função auxiliar para processar streaming via FFmpeg ---
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
    if (code !== 0) {
      console.error(`[FFmpeg] Processo ${friendlyName} terminou com erro ${code}`);
      if (!res.headersSent) res.status(500).json({ message: `Erro no processamento (${friendlyName}), código: ${code}` });
    } else console.log(`[Job Concluído] ${friendlyName} finalizado.`);
    fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro:", err));
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`[FFmpeg] Falha ao iniciar ${friendlyName}:`, err);
    fs.unlink(inputPath, (err) => err && console.error("Falha ao apagar ficheiro:", err));
    if (!res.headersSent) res.status(500).json({ message: `Falha ao iniciar o processamento (${friendlyName}).` });
  });

  req.on('close', () => ffmpegProcess.kill());
};

// --- Rotas básicas ---
app.get('/', (req, res) => res.status(200).json({ message: 'Bem-vindo ao backend do ProEdit! Servidor funcionando.' }));

app.post('/api/projects', (req, res) => {
  const projectData = req.body;
  console.log('Recebido novo projeto:', projectData.name);
  res.status(201).json({ message: `Projeto "${projectData.name}" recebido!`, projectId: `proj_${Date.now()}` });
});

// --- Rota de exportação atualizada ---
app.post('/api/export', upload.any(), (req, res) => {
  try {
    const projectState = JSON.parse(req.body.projectState || "{}");
    const { clips = [], totalDuration = 0, media = {} } = projectState;

    const fileMap = {};
    const inputs = [];
    const cleanupFiles = [];

    req.files.forEach(file => {
      inputs.push('-i', file.path);
      fileMap[file.originalname] = (inputs.length / 2) - 1;
      cleanupFiles.push(file.path);
    });

    if (inputs.length === 0 && totalDuration > 0) {
      // Cria vídeo vazio se não houver arquivos
      const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
      const commandArgs = [
        '-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=${totalDuration}`,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
        '-shortest', outputPath
      ];
      const ffmpegProcess = spawn(ffmpegPath, commandArgs);
      ffmpegProcess.on('close', code => {
        if (code !== 0) return res.status(500).json({ message: "Falha ao criar vídeo vazio." });
        res.sendFile(path.resolve(outputPath), () => fs.unlink(outputPath, () => {}));
      });
      return;
    }

    let filterComplexParts = [];
    let videoStreams = [];
    let audioStreams = [];

    clips.forEach((clip, idx) => {
      const inputIndex = fileMap[clip.fileName];
      const mediaInfo = media[clip.fileName];
      if (inputIndex === undefined || !mediaInfo) return;

      if (clip.track === 'video') {
        const vName = `[v${idx}]`;
        filterComplexParts.push(`[${inputIndex}:v]scale=1280:720,setsar=1,setpts=PTS-STARTPTS${vName}`);
        videoStreams.push({ name: vName, clip });
      }

      if (mediaInfo.hasAudio && (clip.properties?.volume ?? 1) > 0) {
        const aName = `[a${idx}]`;
        const volumeFilter = (clip.properties.volume !== 1) ? `volume=${clip.properties.volume},` : '';
        filterComplexParts.push(`[${inputIndex}:a]${volumeFilter}asetpts=PTS-STARTPTS,aresample=44100${aName}`);
        audioStreams.push({ name: aName, clip });
      }
    });

    filterComplexParts.push(`color=s=1280x720:c=black:d=${totalDuration}[base]`);
    let lastOverlay = '[base]';
    videoStreams.forEach((vs, idx) => {
      const nextOverlay = (idx === videoStreams.length - 1) ? '[outv]' : `[ov${idx}]`;
      filterComplexParts.push(`${lastOverlay}${vs.name}overlay=enable='between(t,${vs.clip.start},${vs.clip.start + vs.clip.duration})'${nextOverlay}`);
      lastOverlay = nextOverlay;
    });
    if (!videoStreams.length) filterComplexParts.push(`[base]null[outv]`);

    if (audioStreams.length) {
      const delayed = [];
      audioStreams.forEach((as, idx) => {
        const dName = `[ad${idx}]`;
        const delayMs = Math.max(0, as.clip.start * 1000);
        filterComplexParts.push(`${as.name}adelay=${delayMs}|${delayMs}${dName}`);
        delayed.push(dName);
      });
      filterComplexParts.push(`${delayed.join('')}amix=inputs=${delayed.length}:dropout_transition=3[outa]`);
    } else filterComplexParts.push(`anullsrc=r=44100:cl=stereo[outa]`);

    const filterComplex = filterComplexParts.join('; ');
    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    cleanupFiles.push(outputPath);

    const commandArgs = [
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p', '-r', '30',
      '-t', totalDuration,
      outputPath
    ];

    console.log('[Export Job] FFmpeg comando:', ffmpegPath, commandArgs.join(' '));
    const ffmpegProcess = spawn(ffmpegPath, commandArgs);

    ffmpegProcess.stderr.on('data', d => console.error(`[FFmpeg Export STDERR]: ${d.toString()}`));

    ffmpegProcess.on('close', code => {
      if (code !== 0) {
        console.error(`[Export Job] FFmpeg terminou com erro ${code}`);
        cleanupFiles.forEach(f => fs.unlink(f, () => {}));
        if (!res.headersSent) res.status(500).json({ message: "Falha na exportação do vídeo." });
        return;
      }
      res.sendFile(path.resolve(outputPath), () => cleanupFiles.forEach(f => fs.unlink(f, () => {})));
    });

    ffmpegProcess.on('error', err => {
      console.error(`[Export Job] Falha ao iniciar FFmpeg:`, err);
      cleanupFiles.forEach(f => fs.unlink(f, () => {}));
      if (!res.headersSent) res.status(500).json({ message: `Falha ao iniciar a exportação.` });
    });

  } catch (e) {
    console.error('[Export Job] Erro inesperado:', e);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// --- Rotas de processamento real ---
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

// --- Rotas placeholder ---
[
  '/api/process/stabilize-real', '/api/process/motionblur-real',
  '/api/process/reframe', '/api/process/mask',
  '/api/process/enhance-voice', '/api/process/remove-bg',
  '/api/process/auto-captions', '/api/process/retouch',
  '/api/process/ai-removal', '/api/process/ai-expand',
  '/api/process/lip-sync', '/api/process/camera-track',
  '/api/process/video-translate'
].forEach(route => {
  app.post(route, (req, res) => {
    const func = route.split('/').pop();
    console.log(`[Placeholder] Pedido para ${func}`);
    res.status(501).json({ message: `Funcionalidade '${func}' ainda não implementada.` });
  });
});

// --- Iniciar servidor ---
app.listen(PORT, () => console.log(`Servidor a escutar na porta ${PORT}`));
