// index.js — Mock backend para assets/effects/templates do CapCut
const express = require('express');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const cors = require('cors'); // Importa o pacote CORS

const PORT = process.env.PORT || 3000;
const app = express();

// --- CONFIGURAÇÃO ESSENCIAL ---
app.use(cors()); // Habilita o CORS para todas as rotas
app.use(morgan('dev'));
app.use(express.json());

// Ajuste este caminho para a pasta onde você extraiu os assets no servidor
const BASE = path.resolve(__dirname, 'capcut_extracted');
const ASSETS = path.join(BASE, 'assets');
const RES = path.join(BASE, 'res');

// Serve arquivos estáticos (assets/res)
app.use('/static/assets', express.static(ASSETS));
app.use('/static/res', express.static(RES));

// --- Helpers para listar arquivos ---
function walkDir(dir, exts = []) {
  const out = [];
  if (!fs.existsSync(dir)) {
    console.error(`AVISO: O diretório de assets não foi encontrado em: ${dir}`);
    return out;
  }
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const files = fs.readdirSync(cur);
    for (const f of files) {
      const fp = path.join(cur, f);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        stack.push(fp);
      } else {
        if (!exts.length || exts.includes(path.extname(f).toLowerCase())) {
          out.push(path.relative(dir, fp).split(path.sep).join('/'));
        }
      }
    }
  }
  return out;
}

// --- Endpoints ---

// Rota de teste para verificar se o servidor está no ar
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor está rodando!' });
});

// Lista templates detectados (.js template files)
app.get('/api/templates', (req, res) => {
  const templates = walkDir(ASSETS, ['.js']).filter(p => p.toLowerCase().includes('template') || p.toLowerCase().includes('/pages/'));
  res.json({ count: templates.length, templates });
});

// Lista efeitos
app.get('/api/effects', (req, res) => {
  const candidates = walkDir(ASSETS, ['.json', '.dat', '.model', '.bin', '.so', '.ttf', '.png', '.mp3', '.wav']);
  const effects = candidates.filter(p => /effect|filter|transition|fx|sticker|preset/i.test(p));
  res.json({ count: effects.length, effects });
});

// Lista audios
app.get('/api/audios', (req, res) => {
  const audios = walkDir(ASSETS, ['.mp3', '.wav', '.m4a', '.ogg']);
  res.json({ count: audios.length, audios });
});

// Baixar asset direto
app.get('/api/asset', (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).json({ error: 'file param required' });
  const full = path.join(ASSETS, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not found' });
  res.sendFile(full);
});

// Criar job de "aplicar efeito" (simulado)
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const JOBS = {};

app.post('/api/apply-effect', upload.single('video'), (req, res) => {
  const { effect, params } = req.body;
  const inputFile = req.file ? req.file.path : null;
  const jobId = uuidv4();
  JOBS[jobId] = { id: jobId, status: 'queued', effect, params: params ? JSON.parse(params) : {}, inputFile, createdAt: Date.now() };

  setTimeout(() => {
    JOBS[jobId].status = 'processing';
    setTimeout(() => {
      JOBS[jobId].status = 'done';
      JOBS[jobId].result = { url: `/static/res/result_${jobId}.mp4` };
    }, 2500);
  }, 800);

  res.json({ jobId, status: JOBS[jobId].status });
});

// Consultar status do job
app.get('/api/job/:id', (req, res) => {
  const j = JOBS[req.params.id];
  if (!j) return res.status(404).json({ error: 'job not found' });
  res.json(j);
});

// Endpoint para listar strings do código
app.get('/api/strings', (req, res) => {
  const stringsPath = path.join(__dirname, 'extracted_strings.json');
  if (fs.existsSync(stringsPath)) {
    const data = JSON.parse(fs.readFileSync(stringsPath, 'utf8'));
    res.json({ count: Object.keys(data).length, data });
  } else {
    res.json({ count: 0, data: {}, hint: 'gere extracted_strings.json' });
  }
});
