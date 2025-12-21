const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const effects = require('./effectsRegistry');

const app = express();
const PORT = process.env.PORT || 8080;

/* =========================
   MIDDLEWARES
========================= */

app.set('trust proxy', 1);
app.use(cors({ origin: '*'}));
app.use(express.json({ limit: '200mb' }));

/* =========================
   UPLOAD
========================= */

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ storage }).any();
const uploadSingle = multer({ storage }).single('video');

/* =========================
   HELPERS
========================= */

const jobs = {};

const isImage = (f) =>
  ['.jpg','.jpeg','.png','.webp','.bmp','.tiff']
    .includes(path.extname(f).toLowerCase());

/* =========================
   ROUTES
========================= */

app.get('/', (_, res) =>
  res.json({ status: 'online', engine: 'ProEdit 100/100/100 Backend' })
);

app.get('/api/check-ffmpeg', (_, res) => {
  exec('ffmpeg -version', err =>
    res.json({ status: err ? 'offline' : 'online' })
  );
});

/* =========================
   EXPORT ROUTE
========================= */

app.post('/api/export/start', uploadAny, (req, res) => {
  if (!req.body.projectState)
    return res.status(400).json({ error: 'Missing projectState' });

  const jobId = `export_${Date.now()}`;
  jobs[jobId] = {
    status: 'processing',
    progress: 0,
    files: req.files,
    project: JSON.parse(req.body.projectState)
  };

  res.json({ jobId });
  processExport(jobId);
});

app.get('/api/process/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.sendStatus(404);
  res.json(job);
});

app.get('/api/process/download/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job || job.status !== 'completed') return res.sendStatus(404);
  res.download(job.output);
});

/* =========================
   EXPORT ENGINE (REAL)
========================= */

async function processExport(jobId) {
  const job = jobs[jobId];
  const { files, project } = job;
  const { clips, projectAspectRatio } = project;

  let width = 1920, height = 1080;
  if (projectAspectRatio === '9:16') { width = 1080; height = 1920; }
  if (projectAspectRatio === '1:1')  { width = 1080; height = 1080; }

  /* INPUTS */
  const fileMap = {};
  const inputArgs = [];

  files.forEach((f, i) => {
    if (isImage(f.originalname)) inputArgs.push('-loop', '1');
    inputArgs.push('-i', f.path);
    fileMap[f.originalname] = i;
  });

  /* FILTER COMPLEX */
  let filterComplex = '';
  const chain = [];

  clips.forEach((clip, i) => {
    const idx = fileMap[clip.fileName];
    if (idx === undefined) return;

    let cmd =
      `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

    if (clip.filterId && effects.filters[clip.filterId])
      cmd += `,${effects.filters[clip.filterId]}`;

    if (clip.movementId && effects.movements[clip.movementId])
      cmd += `,${effects.movements[clip.movementId](clip.duration, width, height)}`;

    const out = `[v${i}]`;
    filterComplex += cmd + out + ';';
    chain.push({ label: out, clip });
  });

  /* TRANSITIONS (XFADE REAL) */
  let current = chain[0].label;
  let timeline = chain[0].clip.duration;

  for (let i = 1; i < chain.length; i++) {
    const { clip, label } = chain[i];
    const dur = clip.transitionDuration || 0.8;

    if (clip.transitionId && effects.transitions[clip.transitionId]) {
      const xfade = effects.transitions[clip.transitionId](timeline - dur);
      const out = `[vx${i}]`;
      filterComplex += `${current}${label}${xfade}${out};`;
      current = out;
      timeline += clip.duration - dur;
    } else {
      timeline += clip.duration;
    }
  }

  /* AUDIO */
  filterComplex += `anullsrc=r=44100:cl=stereo:d=${timeline}[a]`;

  /* EXEC */
  const output = path.join(uploadDir, `${jobId}.mp4`);
  job.output = output;

  const args = [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', current,
    '-map', '[a]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',
    '-y', output
  ];

  const ff = spawn('ffmpeg', args);

  // Mantém em 99% enquanto o FFmpeg está rodando
job.progress = 1;

ff.stderr.on('data', data => {
  const msg = data.toString();

  // se quiser logar
  // console.log(msg);

  // nunca passa de 99 aqui
  job.progress = 99;
});


 ff.on('close', code => {
  if (code === 0) {
    job.status = 'completed';
    job.progress = 100;
    job.downloadUrl = `/api/process/download/${jobId}`;
  } else {
    job.status = 'failed';
    job.error = `FFmpeg exited with code ${code}`;
  }
});


/* =========================
   START
========================= */

app.listen(PORT, () =>
  console.log(`🚀 ProEdit Backend rodando na porta ${PORT}`)
);
