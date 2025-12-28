
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

// Helper para checar stream de áudio
function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', filePath]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => stderr += d.toString());
        ffmpeg.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)));
    });
}

// Gerenciador de Jobs FFmpeg
function createFFmpegJob(jobId, args, res) {
    jobs[jobId] = { status: 'processing', progress: 0 };
    res.status(202).json({ jobId });

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', d => {
        stderr += d.toString();
        // Tentar capturar progresso básico do FFmpeg
        const timeMatch = d.toString().match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch && jobs[jobId]) {
            jobs[jobId].progress = 50; // Progresso simplificado para processos rápidos
        }
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

// --- ENDPOINTS DE PROCESSAMENTO ---

// 1. Remover Silêncio (Jump Cuts)
app.post('/api/process/start/remove-silence-real', uploadAny, (req, res) => {
    const jobId = `silence_${Date.now()}`;
    const file = req.files[0];
    const threshold = req.body.threshold || -30;
    const duration = req.body.duration || 0.5;
    const outputPath = path.join(uploadDir, `silence_${Date.now()}.mp4`);
    jobs[jobId] = { outputPath, files: req.files };

    const args = [
        '-i', file.path,
        '-af', `silenceremove=stop_periods=-1:stop_duration=${duration}:stop_threshold=${threshold}dB`,
        '-vcodec', 'libx264', '-preset', 'fast', '-crf', '23', '-y', outputPath
    ];
    createFFmpegJob(jobId, args, res);
});

// 2. Isolar Voz / Ruído / Realçar
app.post('/api/process/start/:type(isolate-voice-real|reduce-noise-real|enhance-voice-real)', uploadAny, (req, res) => {
    const type = req.params.type;
    const jobId = `audio_${type}_${Date.now()}`;
    const file = req.files[0];
    const intensity = (req.body.intensity || 50) / 100;
    const outputPath = path.join(uploadDir, `${type}_${Date.now()}.wav`);
    jobs[jobId] = { outputPath, files: req.files };

    let filter = '';
    if (type === 'reduce-noise-real') {
        filter = `afftdn=nr=${intensity * 50}:nf=-40`;
    } else if (type === 'isolate-voice-real') {
        filter = `highpass=f=200,lowpass=f=3000,afftdn=nr=25`;
    } else { // enhance
        filter = `compand=attacks=0:points=-80/-80|-40/-15|-20/-10|0/-7,equalizer=f=3000:width_type=h:width=200:g=3`;
    }

    const args = ['-i', file.path, '-af', filter, '-vn', '-acodec', 'pcm_s16le', '-y', outputPath];
    createFFmpegJob(jobId, args, res);
});

// 3. Auto Ducking
app.post('/api/process/start/auto-ducking-real', uploadAny, (req, res) => {
    const jobId = `ducking_${Date.now()}`;
    if (req.files.length < 2) return res.status(400).send("Necessário música e voz.");
    
    const music = req.files[0].path;
    const voice = req.files[1].path;
    const threshold = req.body.threshold || 0.1;
    const outputPath = path.join(uploadDir, `ducking_${Date.now()}.mp3`);
    jobs[jobId] = { outputPath, files: req.files };

    const args = [
        '-i', music, '-i', voice,
        '-filter_complex', `[1:a]asplit[v1][v2];[0:a][v1]sidechaincompress=threshold=${threshold}:ratio=4[bg];[bg][v2]amix=inputs=2:duration=first[outa]`,
        '-map', '[outa]', '-y', outputPath
    ];
    createFFmpegJob(jobId, args, res);
});

// 4. AI Slow Motion (Interpolação)
app.post('/api/process/start/interpolate-real', uploadAny, (req, res) => {
    const jobId = `slowmo_${Date.now()}`;
    const file = req.files[0];
    const speedFactor = req.body.speed || 0.5;
    const mode = req.body.mode || 'optical';
    const outputPath = path.join(uploadDir, `slowmo_${Date.now()}.mp4`);
    jobs[jobId] = { outputPath, files: req.files };

    let miFilter = mode === 'optical' ? 'mi_mode=mci:mc_mode=aobmc:vsfm=1' : 'mi_mode=blend';
    const args = [
        '-i', file.path,
        '-filter_complex', `[0:v]minterpolate=fps=60:${miFilter},setpts=${1/speedFactor}*PTS[v];[0:a]atempo=${speedFactor}[a]`,
        '-map', '[v]', '-map', '[a]', '-vcodec', 'libx264', '-preset', 'fast', '-y', outputPath
    ];
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

            const p = clip.properties;
            const filters = [
                `trim=start=${clip.mediaStartOffset || 0}:duration=${clip.duration}`,
                'setpts=PTS-STARTPTS',
                'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
                'setsar=1'
            ];

            // Curva de Velocidade / Velocidade Linear
            if (p.speedCurve) {
                // Implementação simplificada: usa a média da curva para o PTS
                const avgSpeed = p.speedCurve.points.reduce((acc, p) => acc + p.speed, 0) / p.speedCurve.points.length;
                filters.push(`setpts=${1/avgSpeed}*PTS`);
            } else if (p.speed && p.speed !== 1) {
                filters.push(`setpts=${1/p.speed}*PTS`);
            }

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

        // Áudio Mix
        const audioInputs = [];
        clips.forEach((clip, i) => {
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx !== undefined && fileAudioMap[inputIdx]) {
                const aStream = `[a_clip_${i}]`;
                let aFilter = `[${inputIdx}:a]atrim=start=${clip.mediaStartOffset || 0}:duration=${clip.duration},asetpts=PTS-STARTPTS`;
                if (clip.properties.speed && clip.properties.speed !== 1) aFilter += `,atempo=${clip.properties.speed}`;
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

app.listen(PORT, () => console.log(`Server on ${PORT}`));
