
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

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

// --- HELPER: MAPEAMENTO COMPLETO DE FILTROS ARTÍSTICOS ---
const getFFmpegArtisticFilter = (effectId) => {
    switch (effectId) {
        // Cinematic Pro
        case 'teal-orange': return "colorbalance=rs=.2:gs=-.1:bs=-.2:rm=.2:gm=-.1:bm=-.2,curves=vintage";
        case 'matrix': return "colorbalance=gh=.3:bh=-.1,hue=h=90:s=1.2,curves=matrix";
        case 'noir': return "format=gray,eq=contrast=1.5:brightness=-0.1";
        case 'cyberpunk': return "colorbalance=rm=.3:bm=.5:rs=.2:bs=.4,hue=h=300:s=1.5";
        case 'horror': return "curves=p=0/0.1:0.5/0.3:1/0.8,hue=s=0.5,colorlevels=rimin=0.1:gimin=0.1";
        case 'night-vision': return "format=gray,colorlevels=rimin=0.1:gimin=0.4:bimin=0.1,hue=h=90:s=2";
        case 'sunset': return "colorbalance=rs=.3:gs=.1:bs=-.2,curves=all='0/0 0.5/0.45 1/1'";
        
        // Glitch & Distortion
        case 'pixelate': return "pixelizew=width=10:height=10";
        case 'invert': return "negate";
        case 'sepia-max': return "sepia=s=1";
        case 'vivid': return "eq=saturation=1.8:contrast=1.2";
        
        // Estilos de Grade (CG-PRO-X)
        default:
            if (effectId?.startsWith('cg-pro')) return "curves=all='0/0.1 0.5/0.5 1/0.9'";
            if (effectId?.startsWith('vintage')) return "sepia=s=0.5,curves=vintage";
            if (effectId?.startsWith('noir-style')) return "format=gray,eq=contrast=1.3";
            return null;
    }
};

// --- HELPER: MAPEAMENTO COMPLETO DE MOVIMENTOS (50+) ---
const getMovementFilter = (clip) => {
    const mov = clip.properties.movement?.type;
    const dur = clip.duration || 5;
    const frames = Math.round(dur * 30);

    switch (mov) {
        // Zooms
        case 'zoom-slow-in': return `zoompan=z='min(zoom+0.0015,1.5)':d=${frames}:s=1920x1080`;
        case 'zoom-fast-in': return `zoompan=z='min(zoom+0.01,2.0)':d=${frames}:s=1920x1080`;
        case 'zoom-slow-out': return `zoompan=z='max(1.5-0.0015*on,1.0)':d=${frames}:s=1920x1080`;
        case 'mov-zoom-crash-in': return `zoompan=z='min(zoom+0.05,3.0)':d=${frames}:s=1920x1080`;
        
        // Pans (Lento)
        case 'mov-pan-slow-l': return `zoompan=z=1.2:x='iw*0.1*(on/${frames})':d=${frames}:s=1920x1080`;
        case 'mov-pan-slow-r': return `zoompan=z=1.2:x='iw*0.1*(1-on/${frames})':d=${frames}:s=1920x1080`;
        case 'mov-pan-slow-u': return `zoompan=z=1.2:y='ih*0.1*(on/${frames})':d=${frames}:s=1920x1080`;
        case 'mov-pan-slow-d': return `zoompan=z=1.2:y='ih*0.1*(1-on/${frames})':d=${frames}:s=1920x1080`;

        // Tremores
        case 'shake-hard': return `crop=w=iw-40:h=ih-40:x='20+10*sin(2*pi*8*t)':y='20+10*cos(2*pi*8*t)',scale=1920:1080`;
        case 'earthquake': return `crop=w=iw-60:h=ih-60:x='30+20*sin(2*pi*12*t)':y='30+20*cos(2*pi*12*t)',scale=1920:1080`;
        case 'mov-shake-violent': return `crop=w=iw-100:h=ih-100:x='50+40*sin(2*pi*15*t)':y='50+40*cos(2*pi*15*t)',scale=1920:1080`;
        
        // 3D & Especiais
        case 'mov-3d-float': return `crop=iw:ih:0:'10*sin(2*pi*0.5*t)',scale=1920:1080`;
        case 'mov-rubber-band': return `zoompan=z='1+0.1*sin(2*pi*t)':d=${frames}:s=1920x1080`;
        
        default: return null;
    }
};

// --- HELPER: MAPEAMENTO DE TRANSIÇÕES ---
const getTransitionFilter = (clip) => {
    const tid = clip.transition?.id;
    const tdur = clip.transition?.duration || 1;
    
    // Filtros que modificam o clip antes do overlay (Entrada)
    switch(tid) {
        case 'crossfade':
        case 'fade-classic':
            return `fade=t=in:st=0:d=${tdur}`;
        case 'flash-white':
            return `fade=t=in:st=0:d=${tdur}:color=white`;
        case 'flash-black':
            return `fade=t=in:st=0:d=${tdur}:color=black`;
        case 'zoom-in':
            return `zoompan=z='min(zoom+0.05,1.5)':d=${Math.round(tdur*30)}:s=1920x1080`;
        default:
            return null;
    }
};

app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).json({ message: 'Dados do projeto em falta.' });
    try {
        const projectState = JSON.parse(req.body.projectState);
        jobs[jobId] = { status: 'pending', files: req.files, projectState };
        res.status(202).json({ jobId });
        processExportJob(jobId);
    } catch (e) { res.status(400).json({ message: 'Dados inválidos.' }); }
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json(job);
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
        const { clips, totalDuration, exportConfig, backgroundColor } = projectState;
        const duration = parseFloat(totalDuration) || 5;
        const config = exportConfig || { format: 'mp4', filename: 'video' };
        
        // FIX: Strip '#' from hex color as FFmpeg interprets it as a comment start in filter complex
        let bgColor = (backgroundColor || 'black').replace('#', '');
        if (bgColor.length === 6) bgColor = '0x' + bgColor; // FFmpeg hex format

        const fileMap = {};
        const inputArgs = [];
        
        let currentIdx = 0;
        files.forEach((file) => {
            if (fileMap[file.originalname] !== undefined) return;
            if (isImage(file.originalname)) {
                inputArgs.push("-loop", "1", "-t", duration.toString());
            }
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = currentIdx++;
        });

        const outputPath = path.join(uploadDir, `${config.filename}.${config.format}`);
        job.outputPath = outputPath;

        // 1. Criar Fundo (Stage)
        let filterComplex = `color=s=1920x1080:c=${bgColor}:d=${duration}[bg]`;
        let lastVideo = "[bg]";

        const visualClips = clips.filter(c => ['video', 'camada', 'text', 'image', 'subtitle'].includes(c.type) || ['video', 'camada', 'text', 'subtitle'].includes(c.track));
        
        visualClips.forEach((clip, i) => {
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined && clip.type !== 'text') return;

            let clipChain = [];
            const procLabel = `v_proc${i}`;

            if (clip.type === 'text' || clip.track === 'text' || clip.track === 'subtitle') {
                const text = (clip.properties.text || ' ').replace(/'/g, "\\'");
                const fontSize = clip.track === 'subtitle' ? 60 : 100;
                clipChain.push(`color=s=1920x1080:c=black@0:d=${clip.duration},drawtext=text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2`);
            } else {
                clipChain.push(`[${inputIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`);
            }

            const mov = getMovementFilter(clip);
            if (mov) clipChain.push(mov);

            const adj = clip.properties.adjustments || {};
            const brightness = (adj.brightness || 1) - 1;
            clipChain.push(`eq=brightness=${brightness}:contrast=${adj.contrast || 1}:saturation=${adj.saturate || 1}`);

            const art = getFFmpegArtisticFilter(clip.effect);
            if (art) clipChain.push(art);

            const trans = getTransitionFilter(clip);
            if (trans) clipChain.push(trans);

            if (clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                clipChain.push(`format=rgba,colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            filterComplex += `;${clipChain.join(',')}[${procLabel}]`;

            const x = clip.properties.transform?.x || 0;
            const y = clip.properties.transform?.y || 0;
            
            let finalX = `${x}`;
            const tid = clip.transition?.id;
            if (tid === 'slide-left' || tid === 'push-left') {
                finalX = `if(lt(t,${clip.start + 0.5}), 1920*(1-(t-${clip.start})*2)+${x}, ${x})`;
            } else if (tid === 'slide-right' || tid === 'push-right') {
                finalX = `if(lt(t,${clip.start + 0.5}), -1920*(1-(t-${clip.start})*2)+${x}, ${x})`;
            }

            filterComplex += `;${lastVideo}[${procLabel}]overlay=x='${finalX}':y='${y}':enable='between(t,${clip.start},${clip.start + clip.duration})'[v_stage${i}]`;
            lastVideo = `[v_stage${i}]`;
        });

        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track));
        const audioInputs = [];
        audioClips.forEach((clip, i) => {
            const idx = fileMap[clip.fileName];
            if (idx === undefined) return;
            const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            filterComplex += `;[${idx}:a]volume=${vol},adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${i}]`;
            audioInputs.push(`[a${i}]`);
        });

        if (audioInputs.length > 0) {
            filterComplex += `;${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[outa]`;
        } else {
            filterComplex += `;anullsrc=r=44100:cl=stereo:d=${duration}[outa]`;
        }

        const args = [
            ...inputArgs,
            "-filter_complex", filterComplex,
            "-map", lastVideo,
            "-map", "[outa]",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            "-crf", "18",
            "-t", duration.toString(),
            "-y", outputPath
        ];

        console.log(`Iniciando FFmpeg com argumentos: ${args.join(' ')}`);
        const ffmpeg = spawn("ffmpeg", args);

        let ffmpegStderr = "";
        ffmpeg.stderr.on("data", (data) => {
            ffmpegStderr += data.toString();
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                job.status = "completed";
                job.downloadUrl = `/api/process/download/${jobId}`;
                console.log(`Renderização concluída: ${jobId}`);
            } else {
                job.status = "failed";
                job.error = `FFmpeg falhou com código ${code}. Log: ${ffmpegStderr.slice(-200)}`;
                console.error(`FFmpeg Error Log: ${ffmpegStderr}`);
            }
        });
    } catch (err) { 
        job.status = "failed"; 
        job.error = err.message; 
        console.error("Erro no processamento:", err);
    }
}

app.listen(PORT, () => console.log(`Engine de Renderização Pro (50+ efeitos) ativa na porta: ${PORT}`));
