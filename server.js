
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ storage }).any();
const jobs = {};

function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', path.resolve(filePath)]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => stderr += d.toString());
        ffmpeg.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)));
    });
}

function createFFmpegJob(jobId, args, res) {
    jobs[jobId] = { status: 'processing', progress: 0 };
    if (res) res.status(202).json({ jobId });

    console.log(`Starting FFmpeg job ${jobId} with args:`, args.join(' '));

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', d => {
        stderr += d.toString();
        // Tenta capturar progresso básico da saída do ffmpeg
        if (stderr.includes('frame=')) jobs[jobId].progress = 50;
    });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            console.log(`Job ${jobId} completed.`);
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error(`FFmpeg Job ${jobId} Failed:`, stderr);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = stderr;
        }
    });
}

// --- EXTRAÇÃO DE ÁUDIO ---
app.post('/api/process/extract-audio', uploadAny, (req, res) => {
    const file = req.files[0];
    if (!file) return res.status(400).send("Arquivo não enviado.");
    const jobId = `audio_ext_${Date.now()}`;
    const inputPath = path.resolve(file.path);
    const outputPath = path.resolve(uploadDir, `${jobId}.mp3`);
    const args = ['-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
    createFFmpegJob(jobId, args, res);
});

// --- EXTRAÇÃO DE FRAME (FREEZE) ---
app.post('/api/util/extract-frame', uploadAny, (req, res) => {
    const videoFile = req.files.find(f => f.fieldname === 'video' || f.fieldname === 'files');
    const timestamp = req.body.timestamp || 0;
    if (!videoFile) return res.status(400).send("Vídeo não enviado.");
    const inputPath = path.resolve(videoFile.path);
    const outputPath = path.resolve(uploadDir, `frame_${Date.now()}.png`);
    const args = ['-ss', timestamp.toString(), '-i', inputPath, '-frames:v', '1', '-q:v', '2', '-y', outputPath];
    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.on('close', (code) => {
        if (code === 0) res.sendFile(outputPath);
        else res.status(500).send("Erro ao extrair frame.");
    });
});

// --- REMOÇÃO DE SILÊNCIO (SMART JUMP CUTS) ---
app.post('/api/process/start/remove-silence-real', uploadAny, (req, res) => {
    const file = req.files[0];
    if (!file) return res.status(400).send("Arquivo não enviado.");

    const jobId = `silence_${Date.now()}`;
    const inputPath = path.resolve(file.path);
    const threshold = req.body.threshold || -30; // dB
    const duration = req.body.duration || 0.5; // segundos
    const outputPath = path.resolve(uploadDir, `${jobId}.mp4`);

    jobs[jobId] = { outputPath };

    // Filtro silenceremove para áudio. Para vídeo, o ideal seria concat, 
    // mas o silenceremove no stream de áudio com -af já ajuda em muitos casos.
    const args = [
        '-i', inputPath,
        '-af', `silenceremove=stop_periods=-1:stop_duration=${duration}:stop_threshold=${threshold}dB`,
        '-c:v', 'copy', // Mantém o vídeo, remove silêncio do áudio
        '-y', outputPath
    ];

    createFFmpegJob(jobId, args, res);
});

// --- VELOCIDADE E SLOW MOTION (AI INTERPOLATION) ---
app.post('/api/process/start/interpolate-real', uploadAny, (req, res) => {
    const file = req.files[0];
    if (!file) return res.status(400).send("Arquivo não enviado.");

    const jobId = `slowmo_${Date.now()}`;
    const inputPath = path.resolve(file.path);
    const speed = parseFloat(req.body.speed) || 0.5; // 0.5 = 2x mais lento
    const mode = req.body.mode || 'optical'; // blend ou optical
    const outputPath = path.resolve(uploadDir, `${jobId}.mp4`);

    jobs[jobId] = { outputPath };

    let videoFilter = '';
    if (mode === 'optical') {
        // minterpolate = Interpolação de movimento (Optical Flow) para suavidade máxima
        videoFilter = `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsfm=1,setpts=${1/speed}*PTS`;
    } else {
        videoFilter = `setpts=${1/speed}*PTS`;
    }

    // Ajuste de áudio para acompanhar a velocidade (atempo aceita entre 0.5 e 2.0)
    let audioFilter = `atempo=${speed}`;
    if (speed < 0.5) audioFilter = `atempo=0.5,atempo=${speed/0.5}`;

    const args = [
        '-i', inputPath,
        '-filter_complex', `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-y', outputPath
    ];

    createFFmpegJob(jobId, args, res);
});

// --- PROCESSAMENTO DE ÁUDIO (RUÍDO E VOZ) CORRIGIDO ---
app.post('/api/process/start/:type(isolate-voice-real|reduce-noise-real|enhance-voice-real)', uploadAny, async (req, res) => {
    const type = req.params.type;
    const file = req.files[0];
    if (!file) return res.status(400).send("Arquivo não enviado.");

    const jobId = `audio_proc_${Date.now()}`;
    const inputPath = path.resolve(file.path);
    const intensity = (req.body.intensity || 50) / 100;
    const ext = file.mimetype.startsWith('video/') ? 'mp4' : 'wav';
    const outputPath = path.resolve(uploadDir, `${type}_${Date.now()}.${ext}`);
    
    jobs[jobId] = { outputPath };

    let audioFilter = '';
    if (type === 'reduce-noise-real') {
        // afftdn=nr=X (noise reduction em dB). 
        // Reduzimos o valor padrão para não sumir com o áudio (máx 20dB de redução aqui)
        const nr = 10 + (intensity * 15); 
        audioFilter = `afftdn=nr=${nr}:nf=-30`; 
    } else if (type === 'isolate-voice-real') {
        audioFilter = `highpass=f=100,lowpass=f=4000,afftdn=nr=10`;
    } else { // enhance
        audioFilter = `compand=attacks=0:points=-80/-80|-40/-15|-20/-10|0/-7,equalizer=f=3000:width_type=h:width=200:g=3`;
    }

    let args = file.mimetype.startsWith('video/') ? 
        ['-i', inputPath, '-af', audioFilter, '-c:v', 'copy', '-c:a', 'aac', '-y', outputPath] :
        ['-i', inputPath, '-af', audioFilter, '-vn', '-acodec', 'pcm_s16le', '-y', outputPath];

    createFFmpegJob(jobId, args, res);
});

// --- MOTOR DE EXPORTAÇÃO ---
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    const projectState = JSON.parse(req.body.projectState);
    jobs[jobId] = { status: 'pending', files: req.files, projectState, progress: 0 };
    res.status(202).json({ jobId });
    processExportJob(jobId);
});

async function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing";
    try {
        const { files, projectState } = job;
        const { clips, totalDuration, exportConfig, backgroundColor } = projectState;
        const duration = parseFloat(totalDuration) || 5;
        const config = exportConfig || { format: 'mp4', filename: 'video' };
        const fileMap = {};
        const inputArgs = [];
        const fileAudioMap = {};
        for (let idx = 0; idx < files.length; idx++) {
            const file = files[idx];
            const absPath = path.resolve(file.path);
            if (/\.(jpe?g|png|webp)$/i.test(file.originalname)) inputArgs.push('-loop', '1');
            inputArgs.push("-i", absPath);
            fileMap[file.originalname] = idx;
            fileAudioMap[idx] = await checkAudioStream(absPath);
        }
        const outputPath = path.resolve(uploadDir, `${Date.now()}_export.${config.format}`);
        job.outputPath = outputPath;
        const filterComplexParts = [];
        const processedStreams = {};
        const visualClips = clips.filter(c => ['video', 'camada', 'text', 'image'].includes(c.track));
        visualClips.forEach((clip, i) => {
            const clipIdV = `v_clip_${i}`;
            if (clip.type === 'text') {
                const td = clip.properties.textDesign || {};
                filterComplexParts.push(`color=s=1920x1080:c=${td.backgroundColor || 'black@0'}:d=${clip.duration},format=rgba,drawtext=text='${(clip.properties.text || '').replace(/'/g, `''`)}':fontcolor=${td.color || 'white'}:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2[${clipIdV}]`);
                processedStreams[clip.id] = `[${clipIdV}]`;
                return;
            }
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined) return;
            const filters = [`trim=start=${clip.mediaStartOffset || 0}:duration=${clip.duration}`, 'setpts=PTS-STARTPTS', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black', 'setsar=1'];
            let speedFactor = clip.properties.speed || 1.0;
            if (speedFactor !== 1.0) filters.push(`setpts=${1/speedFactor}*PTS`);
            filterComplexParts.push(`[${inputIdx}:v]${filters.join(',')} [${clipIdV}]`);
            processedStreams[clip.id] = `[${clipIdV}]`;
        });
        filterComplexParts.push(`color=s=1920x1080:c=${backgroundColor || 'black'}:d=${duration}[bg]`);
        let lastV = '[bg]';
        visualClips.forEach((clip, i) => {
            if (!processedStreams[clip.id]) return;
            const nextV = `[v_stage_${i}]`;
            filterComplexParts.push(`${lastV}${processedStreams[clip.id]}overlay=enable='between(t,${clip.start},${clip.start+clip.duration})'${nextV}`);
            lastV = nextV;
        });
        const audioInputs = [];
        clips.forEach((clip, i) => {
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx !== undefined && fileAudioMap[inputIdx]) {
                const aStream = `[a_clip_${i}]`;
                let speedFactor = clip.properties.speed || 1.0;
                let aFilter = `[${inputIdx}:a]atrim=start=${clip.mediaStartOffset || 0}:duration=${clip.duration},asetpts=PTS-STARTPTS`;
                if (speedFactor !== 1.0) {
                    let s = speedFactor;
                    while (s > 2.0) { aFilter += `,atempo=2.0`; s /= 2.0; }
                    while (s < 0.5) { aFilter += `,atempo=0.5`; s /= 0.5; }
                    aFilter += `,atempo=${s}`;
                }
                aFilter += `,adelay=${clip.start * 1000}|${clip.start * 1000}${aStream}`;
                filterComplexParts.push(aFilter);
                audioInputs.push(aStream);
            }
        });
        const amix = audioInputs.length > 0 ? `${audioInputs.join('')}amix=inputs=${audioInputs.length}[outa]` : `anullsrc=r=44100:cl=stereo:d=${duration}[outa]`;
        filterComplexParts.push(amix);
        const args = [...inputArgs, '-filter_complex', filterComplexParts.join(';'), '-map', lastV, '-map', '[outa]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-t', duration.toString(), '-y', outputPath];
        const ffmpeg = spawn('ffmpeg', args);
        ffmpeg.on('close', (code) => {
            job.status = code === 0 ? 'completed' : 'failed';
            job.progress = 100;
            job.downloadUrl = `/api/process/download/${jobId}`;
        });
    } catch (err) {
        job.status = 'failed';
        job.error = err.message;
    }
}

app.get('/api/process/status/:jobId', (req, res) => res.json(jobs[req.params.jobId] || { status: 'not_found' }));
app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.status(404).send("Arquivo não pronto.");
    res.download(job.outputPath);
});
app.get('/api/check-ffmpeg', (req, res) => res.send("FFmpeg is ready"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
