// --- Dependências ---
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// --- Inicialização ---
const app = express();
const PORT = process.env.PORT || 8080;

// --- Middlewares ---
app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.options('*', cors());

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json());

// --- Upload config ---
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- Função auxiliar ---
const processWithFfmpegStream = (req, res, ffmpegArgs, outputContentType, friendlyName) => {
  if (!req.file || !fs.existsSync(req.file.path)) {
    return res.status(400).json({ message: 'Nenhum ficheiro válido foi enviado.' });
  }
  const inputPath = req.file.path;
  const finalArgs = ['-i', inputPath, ...ffmpegArgs, 'pipe:1'];

  console.log(`[Job] ${friendlyName} → ${ffmpegPath} ${finalArgs.join(' ')}`);
  const ffmpegProcess = spawn(ffmpegPath, finalArgs);

  res.setHeader('Content-Type', outputContentType);
  ffmpegProcess.stdout.pipe(res);

  ffmpegProcess.stderr.on('data', d => console.error(`[FFmpeg ${friendlyName}] ${d.toString()}`));

  ffmpegProcess.on('close', code => {
    if (code !== 0) {
      console.error(`[FFmpeg] ${friendlyName} falhou com código ${code}`);
      if (!res.headersSent) {
        res.status(500).json({ message: `Erro no processamento (${friendlyName})` });
      }
    } else {
      console.log(`[Job] ${friendlyName} concluído.`);
    }
    fs.unlink(inputPath, () => {});
  });

  ffmpegProcess.on('error', err => {
    console.error(`[FFmpeg] Falha ao iniciar ${friendlyName}:`, err);
    fs.unlink(inputPath, () => {});
    if (!res.headersSent) {
      res.status(500).json({ message: `Falha ao iniciar o processamento (${friendlyName})` });
    }
  });

  req.on('close', () => ffmpegProcess.kill());
};

// --- Rotas simples ---
app.get('/', (req, res) => {
  res.status(200).json({ message: '🚀 Backend ProEdit está ativo!' });
});

app.post('/api/projects', (req, res) => {
  console.log('[Projects] Novo projeto:', req.body.name);
  res.status(201).json({ message: `Projeto "${req.body.name}" recebido.`, projectId: `proj_${Date.now()}` });
});

// --- Exportação robusta ---
app.post('/api/export', upload.any(), (req, res) => {
  try {
    console.log('[Export] Arquivos recebidos:', req.files.map(f => f.originalname));
    const projectState = JSON.parse(req.body.projectState);
    const { clips, totalDuration, media } = projectState;

    console.log('[Export Debug] Clips:', clips);
    console.log('[Export Debug] Media:', media);
    console.log('[Export Debug] totalDuration:', totalDuration);

    const cleanupFiles = [];
    const inputs = [];
    const fileMap = {};

    req.files.forEach(file => {
      inputs.push('-i', file.path);
      fileMap[file.originalname] = (inputs.length / 2) - 1;
      cleanupFiles.push(file.path);
    });

    console.log('[Export Debug] Inputs:', inputs);

    // Caso sem mídia (somente fundo preto)
    if (inputs.length === 0 && totalDuration > 0) {
      const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
      const commandArgs = [
        '-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=${totalDuration}`,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
        '-shortest', outputPath
      ];
      console.log('[Export Debug] Criando vídeo vazio:', commandArgs.join(' '));
      const ffmpegProcess = spawn(ffmpegPath, commandArgs);
      ffmpegProcess.on('close', code => {
        if (code !== 0) return res.status(500).json({ message: "Falha ao criar vídeo vazio." });
        res.sendFile(path.resolve(outputPath), () => fs.unlink(outputPath, () => {}));
      });
      return;
    }

    let filterComplex = '';
    const videoStreams = [];
    const audioStreams = [];

    clips.forEach((clip, idx) => {
      const inputIndex = fileMap[clip.fileName];
      const mediaInfo = media[clip.fileName];
      if (inputIndex === undefined || !mediaInfo) return;

      if (clip.track === 'video') {
        const stream = `[v${idx}]`;
        filterComplex += `[${inputIndex}:v]scale=1280:720,setsar=1,setpts=PTS-STARTPTS${stream}; `;
        videoStreams.push({ stream, clip });
      }

      if (mediaInfo.hasAudio && (clip.properties.volume === undefined || clip.properties.volume > 0)) {
        const stream = `[a${idx}]`;
        const vol = clip.properties.volume ?? 1;
        const volFilter = vol !== 1 ? `volume=${vol},` : '';
        filterComplex += `[${inputIndex}:a]${volFilter}asetpts=PTS-STARTPTS,aresample=44100${stream}; `;
        audioStreams.push({ stream, clip });
      }
    });

    filterComplex += `color=s=1280x720:c=black:d=${totalDuration}[base];`;
    let last = '[base]';
    videoStreams.forEach((vs, i) => {
      const next = (i === videoStreams.length - 1) ? '[outv]' : `[ov${i}]`;
      filterComplex += `${last}${vs.stream}overlay=enable='between(t,${vs.clip.start},${vs.clip.start + vs.clip.duration})'${next};`;
      last = next;
    });
    if (videoStreams.length === 0) filterComplex += `[base]null[outv];`;

    if (audioStreams.length > 0) {
      const delayed = [];
      audioStreams.forEach((as, i) => {
        const d = `[ad${i}]`;
        const delay = as.clip.start * 1000;
        filterComplex += `${as.stream}adelay=${delay}|${delay}${d}; `;
        delayed.push(d);
      });
      filterComplex += `${delayed.join('')}amix=inputs=${delayed.length}:dropout_transition=3[outa];`;
    }

    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    cleanupFiles.push(outputPath);

    const commandArgs = [...inputs, '-filter_complex', filterComplex, '-map', '[outv]'];
    if (audioStreams.length > 0) {
      commandArgs.push('-map', '[outa]');
    } else {
      commandArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest');
    }
    commandArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-t', totalDuration, outputPath);

    console.log('[Export Debug] filter_complex:', filterComplex);
    console.log('[Export Debug] Comando final:', ffmpegPath, commandArgs.join(' '));

    const ffmpegProcess = spawn(ffmpegPath, commandArgs);
    ffmpegProcess.stderr.on('data', d => console.error(`[FFmpeg Export] ${d.toString()}`));

    ffmpegProcess.on('close', code => {
      if (code !== 0) {
        console.error(`[Export] FFmpeg falhou com código ${code}`);
        cleanupFiles.forEach(f => fs.unlink(f, () => {}));
        if (!res.headersSent) res.status(500).json({ message: "Falha na exportação." });
        return;
      }
      console.log('[Export] Sucesso!');
      res.sendFile(path.resolve(outputPath), () => cleanupFiles.forEach(f => fs.unlink(f, () => {})));
    });

    ffmpegProcess.on('error', err => {
      console.error('[Export] Erro ao iniciar FFmpeg:', err);
      cleanupFiles.forEach(f => fs.unlink(f, () => {}));
      if (!res.headersSent) res.status(500).json({ message: "Falha ao iniciar exportação." });
    });

  } catch (e) {
    console.error('[Export] Erro fatal:', e);
    res.status(500).json({ message: "Erro inesperado no servidor." });
  }
});

// --- Rotas reais de processamento ---
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

// --- Placeholders ---
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

// --- Start ---
app.listen(PORT, () => {
  console.log(`Servidor ativo na porta ${PORT}`);
});
