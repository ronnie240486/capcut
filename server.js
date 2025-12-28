
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

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ storage }).any();
const jobs = {};

function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', filePath]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => stderr += d.toString());
        ffmpeg.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)));
    });
}

function createFFmpegJob(jobId, args, res) {
    jobs[jobId] = { status: 'processing', progress: 0 };
    if (res) res.status(202).json({ jobId });

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', d => {
        stderr += d.toString();
        // Progresso simplificado
        if (jobs[jobId]) jobs[jobId].progress = 50;
    });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error("FFmpeg Error:", stderr);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = stderr;
        }
    });
}

// --- NOVO: ENDPOINT PARA EXTRAÇÃO DE ÁUDIO ---
app.post('/api/process/extract-audio', uploadAny, (req, res) => {
    const jobId = `audio_ext_${Date.now()}`;
    const file = req.files[0];
    if (!file) return res.status(400).send("Arquivo não enviado.");

    const outputPath = path.join(uploadDir, `${jobId}.mp3`);
    jobs[jobId] = { outputPath };

    // Comando: -i entrada -vn (sem video) -acodec mp3 saida.mp3
    const args = ['-i', file.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath];
    createFFmpegJob(jobId, args, res);
});

// --- NOVO: ENDPOINT PARA EXTRAÇÃO DE FRAME (FREEZE) ---
app.post('/api/util/extract-frame', uploadAny, (req, res) => {
    const videoFile = req.files.find(f => f.fieldname === 'video' || f.fieldname === 'files');
    const timestamp = req.body.timestamp || 0;
    if (!videoFile) return res.status(400).send("Vídeo não enviado.");

    const outputPath = path.join(uploadDir, `frame_${Date.now()}.png`);
    
    // Comando: -ss tempo -i video -frames:v 1 saida.png
    const args = ['-ss', timestamp.toString(), '-i', videoFile.path, '-frames:v', '1', '-q:v', '2', '-y', outputPath];
    
    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.on('close', (code) => {
        if (code === 0) res.sendFile(path.resolve(outputPath));
        else res.status(500).send("Erro ao extrair frame.");
    });
});

// --- ENDPOINTS DE ÁUDIO (ISOLAMENTO, RUÍDO, REALCE) ---
app.post('/api/process/start/:type(isolate-voice-real|reduce-noise-real|enhance-voice-real)', uploadAny, async (req, res) => {
    const type = req.params.type;
    const jobId = `audio_proc_${Date.now()}`;
    const file = req.files[0];
    const isVideo = file.mimetype.startsWith('video/');
    const intensity = (req.body.intensity || 50) / 100;
    const ext = isVideo ? 'mp4' : 'wav';
    const outputPath = path.join(uploadDir, `${type}_${Date.now()}.${ext}`);
    
    jobs[jobId] = { outputPath, files: req.files };

    let audioFilter = '';
    if (type === 'reduce-noise-real') {
        audioFilter = `afftdn=nr=${intensity * 30 + 10}:nf=-35`;
    } else if (type === 'isolate-voice-real') {
        audioFilter = `highpass=f=150,lowpass=f=3500,afftdn=nr=20`;
    } else { // enhance
        audioFilter = `compand=attacks=0:points=-80/-80|-40/-15|-20/-10|0/-7,equalizer=f=3000:width_type=h:width=200:g=3`;
    }

    let args = isVideo ? 
        ['-i', file.path, '-af', audioFilter, '-c:v', 'copy', '-c:a', 'aac', '-y', outputPath] :
        ['-i', file.path, '-af', audioFilter, '-vn', '-acodec', 'pcm_s16le', '-y', outputPath];

    createFFmpegJob(jobId, args, res);
});

// --- ENDPOINT GENÉRICO DE START (Caso existam outros) ---
app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    const file = req.files[0];
    if (!file) return res.status(400).send("Arquivo não enviado.");

    const outputPath = path.join(uploadDir, `${jobId}.mp4`);
    jobs[jobId] = { outputPath };

    let args = ['-i', file.path];
    // Adicionar lógica de filtros conforme a 'action' se necessário
    args.push('-c:v', 'libx264', '-preset', 'fast', '-y', outputPath);

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
            if (/\.(jpe?g|png|webp)$/i.test(file.originalname)) inputArgs.push('-loop', '1');
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
            fileAudioMap[idx] = await checkAudioStream(file.path);
        }

        const outputPath = path.join(uploadDir, `${Date.now()}_export.${config.format}`);
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

            const filters = [
                `trim=start=${clip.mediaStartOffset || 0}:duration=${clip.duration}`,
                'setpts=PTS-STARTPTS',
                'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
                'setsar=1'
            ];

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

        const args = [
            ...inputArgs,
            '-filter_complex', filterComplexParts.join(';'),
            '-map', lastV, '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-t', duration.toString(), '-y', outputPath
        ];

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
