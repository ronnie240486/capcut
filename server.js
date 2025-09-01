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
app.use(cors({ origin: '*', methods: "GET,HEAD,PUT,PATCH,POST,DELETE" }));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  console.log(`[Request] ${req.method} ${req.originalUrl}`);
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

// --- Função auxiliar para processamentos simples (streaming) ---
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

  ffmpegProcess.stderr.on('data', (d) => console.error(`[FFmpeg ${friendlyName}] ${d}`));

  ffmpegProcess.on('close', (code) => {
    fs.unlink(inputPath, () => {});
    if (code === 0) console.log(`[Job] ${friendlyName} concluído`);
    else console.error(`[Job] ${friendlyName} falhou com código ${code}`);
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`[FFmpeg] Falha em ${friendlyName}:`, err);
    fs.unlink(inputPath, () => {});
    if (!res.headersSent) res.status(500).json({ message: `Erro no processamento (${friendlyName})` });
  });

  req.on('close', () => ffmpegProcess.kill());
};

// --- Rotas ---
app.get('/', (req, res) => res.json({ message: 'Servidor ProEdit online 🚀' }));

// Salvar projetos
app.post('/api/projects', (req, res) => {
  res.status(201).json({ message: `Projeto "${req.body.name}" recebido`, projectId: `proj_${Date.now()}` });
});

// Exportação de projetos (estável)
app.post('/api/export', upload.any(), (req, res) => {
  try {
    console.log('[Export] Recebidos:', req.files.map(f => f.originalname).join(', '));
    const { clips, totalDuration, media } = JSON.parse(req.body.projectState);

    const inputs = [];
    const fileMap = {};
    req.files.forEach((file, i) => {
      inputs.push('-i', file.path);
      fileMap[file.originalname] = i;
    });

    // Caso sem media → gera vídeo preto
    if (inputs.length === 0 && totalDuration > 0) {
      const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
      const args = [
        '-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=${totalDuration}`,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
        '-shortest', outputPath
      ];
      const ffmpegProcess = spawn(ffmpegPath, args);
      ffmpegProcess.on('close', (code) => {
        if (code !== 0) return res.status(500).json({ message: "Erro na exportação vazia" });
        res.sendFile(path.resolve(outputPath), () => fs.unlink(outputPath, () => {}));
      });
      return;
    }

    // --- Monta filtros ---
    let filterComplex = `color=s=1280x720:c=black:d=${totalDuration}[base];`;
    const videoStreams = [];
    const audioStreams = [];

    clips.forEach((clip, i) => {
      const idx = fileMap[clip.fileName];
      const mediaInfo = media[clip.fileName];
      if (idx === undefined || !mediaInfo) return;

      // Vídeo
      if (clip.track === 'video') {
        const vName = `[v${i}]`;
        filterComplex += `[${idx}:v]scale=1280:720,setsar=1,setpts=PTS-STARTPTS${vName};`;
        videoStreams.push({ stream: vName, clip });
      }

      // Áudio
      if (mediaInfo.hasAudio && (clip.properties.volume ?? 1) > 0) {
        const aName = `[a${i}]`;
        const vol = clip.properties.volume ?? 1;
        const volFilter = vol !== 1 ? `volume=${vol},` : '';
        filterComplex += `[${idx}:a]${volFilter}asetpts=PTS-STARTPTS,aresample=44100${aName};`;
        audioStreams.push({ stream: aName, clip });
      }
    });

    // Overlay dos vídeos
    let lastOverlay = '[base]';
    videoStreams.forEach((vs, i) => {
      const next = (i === videoStreams.length - 1) ? '[outv]' : `[ov${i}]`;
      filterComplex += `${lastOverlay}${vs.stream}overlay=enable='between(t,${vs.clip.start},${vs.clip.start + vs.clip.duration})'${next};`;
      lastOverlay = next;
    });
    if (videoStreams.length === 0) filterComplex += `[base]null[outv];`;

    // Mixagem de áudio
    if (audioStreams.length > 0) {
      const delayed = audioStreams.map((a, i) => {
        const d = `[ad${i}]`;
        const delayMs = a.clip.start * 1000;
        filterComplex += `${a.stream}adelay=${delayMs}|${delayMs}${d};`;
        return d;
      });
      filterComplex += `${delayed.join('')}amix=inputs=${delayed.length}:dropout_transition=3[outa];`;
    }

    // Saída
    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    const commandArgs = [...inputs, '-filter_complex', filterComplex, '-map', '[outv]'];

    if (audioStreams.length > 0) {
      commandArgs.push('-map', '[outa]');
    } else {
      commandArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest');
    }

    commandArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-t', totalDuration, outputPath);

    console.log('[Export] FFmpeg:', ffmpegPath, commandArgs.join(' '));
    const ffmpegProcess = spawn(ffmpegPath, commandArgs);

    ffmpegProcess.stderr.on('data', (d) => console.error(`[FFmpeg Export] ${d}`));

    ffmpegProcess.on('close', (code) => {
      req.files.forEach(f => fs.unlink(f.path, () => {}));
      if (code !== 0) return res.status(500).json({ message: "Erro na exportação" });

      res.sendFile(path.resolve(outputPath), () => fs.unlink(outputPath, () => {}));
    });

    ffmpegProcess.on('error', (err) => {
      console.error('[Export] Falha FFmpeg:', err);
      req.files.forEach(f => fs.unlink(f.path, () => {}));
      if (!res.headersSent) res.status(500).json({ message: "Falha ao iniciar exportação" });
    });

  } catch (e) {
    console.error('[Export] Erro fatal:', e);
    res.status(500).json({ message: "Erro inesperado no servidor" });
  }
});

// --- Processamentos reais ---
app.post('/api/process/reverse-real', upload.single('video'), (req, res) => processWithFfmpegStream(req, res, ['-vf', 'reverse', '-af', 'areverse', '-f', 'mp4'], 'video/mp4', 'Reverso'));
app.post('/api/process/extract-audio-real', upload.single('video'), (req, res) => processWithFfmpegStream(req, res, ['-vn', '-q:a', '0', '-map', 'a', '-f', 'mp3'], 'audio/mpeg', 'Extrair Áudio'));
app.post('/api/process/reduce-noise-real', upload.single('video'), (req, res) => processWithFfmpegStream(req, res, ['-af', 'afftdn', '-f', 'mp4'], 'video/mp4', 'Redução de Ruído'));
app.post('/api/process/isolate-voice-real', upload.single('video'), (req, res) => processWithFfmpegStream(req, res, ['-af', 'lowpass=f=3000,highpass=f=300', '-f', 'mp4'], 'video/mp4', 'Isolar Voz'));

// --- Placeholders ---
[
  'stabilize-real','motionblur-real','reframe','mask','enhance-voice','remove-bg',
  'auto-captions','retouch','ai-removal','ai-expand','lip-sync','camera-track','video-translate'
].forEach(fn => {
  app.post(`/api/process/${fn}`, (req, res) => res.status(501).json({ message: `Funcionalidade '${fn}' ainda não implementada.` }));
});

// --- Start ---
app.listen(PORT, () => console.log(`🚀 Servidor ProEdit rodando na porta ${PORT}`));
