
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ storage }).any();
const jobs = {};

const isImage = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext);
};

app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).json({ message: 'Dados do projeto em falta.' });
    try {
        const projectState = JSON.parse(req.body.projectState);
        jobs[jobId] = { status: 'pending', progress: 0, files: req.files, projectState };
        res.status(202).json({ jobId });
        processExportJob(jobId);
    } catch (e) { res.status(400).json({ message: 'Dados inválidos.' }); }
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json({
        status: job.status,
        progress: job.progress,
        downloadUrl: job.downloadUrl,
        error: job.error
    });
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) return res.status(404).json({ message: 'Ficheiro não encontrado.' });
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath));
});

async function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing";
    try {
        const { files, projectState } = job;
        const { clips, totalDuration, exportConfig } = projectState;
        const duration = parseFloat(totalDuration) || 5;
        const config = exportConfig || { format: 'mp4', filename: 'video' };
        
        const fileMap = {};
        const inputArgs = [];
        files.forEach((file, idx) => {
            if (isImage(file.originalname)) inputArgs.push("-loop", "1");
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
        });

        const outputPath = path.join(uploadDir, `${config.filename}.${config.format}`);
        job.outputPath = outputPath;

        let filterComplex = `color=s=1920x1080:c=black:d=${duration}[bg]`;
        let lastVideo = "[bg]";

        // Filtros de Vídeo e Movimentos
        const visualClips = clips.filter(c => ['video', 'camada', 'text', 'image'].includes(c.type) || ['video', 'camada', 'text'].includes(c.track));
        
        visualClips.forEach((clip, i) => {
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined && clip.type !== 'text') return;

            let clipFilter = "";
            const procLabel = `v_proc${i}`;
            const clipDur = clip.duration;

            if (clip.type === 'text') {
                clipFilter = `color=s=1920x1080:c=blue@0:d=${clipDur},drawtext=text='${clip.properties.text || ' '}' :fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2`;
            } else {
                clipFilter = `[${inputIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`;
            }

            // Aplicar Propriedades (Opacidade e Transformação Básica)
            if (clip.properties.opacity !== undefined) {
                clipFilter += `,format=rgba,colorchannelmixer=aa=${clip.properties.opacity}`;
            }

            // --- MOVIMENTOS ESPECÍFICOS ---
            const mov = clip.properties.movement?.type;
            if (mov === 'zoom-slow-in' || mov === 'kenBurns') {
                clipFilter += `,zoompan=z='min(zoom+0.001,1.5)':d=${Math.round(clipDur * 30)}:s=1920x1080`;
            } else if (mov === 'shake-hard' || mov === 'handheld-2') {
                clipFilter += `,crop=w=iw-40:h=ih-40:x='20+15*sin(2*pi*8*t)':y='20+15*cos(2*pi*8*t)',scale=1920:1080`;
            }

            // --- TRANSIÇÕES ---
            if (clip.transition?.id) {
                const tDur = clip.transition.duration || 1;
                if (clip.transition.id === 'crossfade') {
                    clipFilter += `,fade=t=in:st=0:d=${tDur}:alpha=1`;
                }
            }

            filterComplex += `;${clipFilter}[${procLabel}]`;

            // Overlay na timeline
            let x = clip.properties.transform?.x || 0;
            let y = clip.properties.transform?.y || 0;
            filterComplex += `;${lastVideo}[${procLabel}]overlay=x='${x}':y='${y}':enable='between(t,${clip.start},${clip.start + clip.duration})'[v_stage${i}]`;
            lastVideo = `[v_stage${i}]`;
        });

        // Áudio (Merge e Delay)
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track));
        const audioInputs = [];
        audioClips.forEach((clip, i) => {
            const idx = fileMap[clip.fileName];
            if (idx === undefined) return;
            filterComplex += `;[${idx}:a]volume=${clip.properties.volume || 1},adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${i}]`;
            audioInputs.push(`[a${i}]`);
        });

        if (audioInputs.length > 0) {
            filterComplex += `;${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[outa]`;
        } else {
            filterComplex += `;anullsrc=r=44100:cl=stereo:d=${duration}[outa]`;
        }

        const args = [
            "-progress", "pipe:1",
            ...inputArgs,
            "-filter_complex", filterComplex,
            "-map", lastVideo,
            "-map", "[outa]",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "veryfast",
            "-t", duration.toString(),
            "-y", outputPath
        ];

        const ffmpeg = spawn("ffmpeg", args);

        ffmpeg.stdout.on('data', (data) => {
            const output = data.toString();
            const timeMatch = output.match(/out_time_ms=(\d+)/);
            if (timeMatch) {
                const processedMs = parseInt(timeMatch[1]);
                const totalMs = duration * 1000000;
                job.progress = Math.min(99, Math.round((processedMs / totalMs) * 100));
            }
        });

        ffmpeg.stderr.on('data', (data) => {
            console.debug(`FFmpeg Log: ${data.toString().split('\n')[0]}`);
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                job.status = "completed";
                job.progress = 100;
                job.downloadUrl = `/api/process/download/${jobId}`;
            } else {
                job.status = "failed";
                job.error = "Erro no FFmpeg durante o processamento.";
            }
        });
    } catch (err) { 
        job.status = "failed"; 
        job.error = err.message; 
    }
}

app.listen(PORT, () => console.log(`Servidor de Exportação Pro Ativo: ${PORT}`));
