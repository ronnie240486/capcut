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
app.use(express.urlencoded({ extended: true, limit: '100mb' }));


const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});

const uploadAny = multer({ storage }).any();
const jobs = {};

const FFMPEG_TRANSITIONS = {
    'crossfade': 'fade', 'fade': 'fade', 'fade-classic': 'fade',
    'black': 'fadeblack', 'white': 'fadewhite',
    'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
    'slide-up': 'slideup', 'slide-down': 'slidedown', 'slide-left': 'slideleft', 'slide-right': 'slideright',
    'circle-open': 'circleopen', 'circle-close': 'circleclose',
    'rectcrop': 'rectcrop', 'circlecrop': 'circlecrop', 'diagonaltl': 'diagonaltl',
    'dissolve': 'dissolve', 'pixelize': 'pixelize', 'radial': 'radial',
    'hblur': 'hblur', 'wipetl': 'wipetl',
    'fadegrays': 'fadegrays'
};

const getEffectFilter = (effectId) => {
    // A simplified mapping from CSS filters to FFmpeg's `eq` and `hue` filters
    const effects = {
        'teal-orange': 'eq=contrast=1.2:saturation=1.3,hue=h=-10',
        'noir': 'format=gray,eq=contrast=1.5',
        'vintage-warm': 'format=rgb24,sepia=80:s=0.7:b=0.1,eq=contrast=0.9:saturation=1.2',
        'vibrant': 'eq=saturation=2.5:contrast=1.1',
        'invert': 'negate',
        'sepia-max': 'format=rgb24,sepia=100',
        'high-contrast': 'eq=contrast=2.0',
        'low-light': 'eq=brightness=-0.3:contrast=1.3',
        'horror': 'format=gray,eq=contrast=1.5:brightness=-0.2',
        'cold-blue': 'hue=h=210:s=0.8'
    };
    return effects[effectId] || null;
}


app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    if (!req.body.projectState) return res.status(400).json({ message: 'Dados do projeto em falta.' });
    try {
        const projectState = JSON.parse(req.body.projectState);
        jobs[jobId] = { status: 'pending', files: req.files, projectState, progress: 0 };
        res.status(202).json({ jobId });
        processExportJob(jobId);
    } catch (e) { 
        console.error("Error starting export:", e);
        res.status(400).json({ message: 'Dados inválidos.' }); 
    }
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ message: 'Tarefa não encontrada.' });
    res.status(200).json(job);
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath) return res.status(404).json({ message: 'Ficheiro não encontrado.' });
    res.download(path.resolve(job.outputPath), path.basename(job.outputPath), (err) => {
        if (!err) {
            // Clean up old files after download
            try {
                fs.unlinkSync(job.outputPath);
                job.files.forEach(f => fs.unlinkSync(f.path));
            } catch (e) { console.error("Error cleaning up files:", e); }
        }
    });
});

async function processExportJob(jobId) {
    const job = jobs[jobId];
    job.status = "processing";
    
    try {
        const { files, projectState } = job;
        const { clips, totalDuration, exportConfig, backgroundColor, media } = projectState;
        const duration = parseFloat(totalDuration) || 5;
        const config = exportConfig || { format: 'mp4', filename: 'video' };
        
        const fileMap = {};
        const inputArgs = [];
        files.forEach((file, idx) => {
             // For image inputs that need to be looped
            if (/\.(jpe?g|png|webp)$/i.test(file.originalname)) {
                inputArgs.push('-loop', '1');
            }
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
        });

        const outputPath = path.join(uploadDir, `${Date.now()}_${config.filename}.${config.format}`);
        job.outputPath = outputPath;

        let filterComplex = "";
        const visualClips = clips.filter(c => ['video', 'camada', 'text', 'image'].includes(c.type));
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (media && media[c.fileName]?.hasAudio && c.track === 'video'));
        
        // 1. Pre-process all visual clips individually
        const processedStreams = {}; // map clip.id to stream name
        visualClips.forEach((clip, i) => {
            const clipIdentifier = `clip_${i}`;
            processedStreams[clip.id] = `[${clipIdentifier}]`;
            
            if (clip.type === 'text') {
                filterComplex += `color=s=1920x1080:c=black@0.0:d=${clip.duration},drawtext=text='${clip.properties.text.replace(/'/g, "''")}':fontcolor=${clip.properties.textDesign?.color || 'white'}:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2,format=rgba[${clipIdentifier}];`;
                return;
            }

            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined) return;
            
            let chain = `[${inputIdx}:v]`;
            
            // Trim if it's a video
            if (clip.type === 'video') {
                const mediaStart = clip.mediaStartOffset || 0;
                chain += `trim=start=${mediaStart}:duration=${clip.duration},setpts=PTS-STARTPTS,`;
            }
            
            // Scale and Pad
            chain += `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1`;

            // Adjustments
            const p = clip.properties;
            if (p.adjustments) {
                chain += `,eq=brightness=${p.adjustments.brightness ?? 1}:contrast=${p.adjustments.contrast ?? 1}:saturation=${p.adjustments.saturate ?? 1}`;
                if (p.adjustments.hue) chain += `,hue=h=${p.adjustments.hue}`;
            }

            // Effects
            const effectFilter = getEffectFilter(clip.effect);
            if (effectFilter) chain += `,${effectFilter}`;

            // Transform: Scale & Rotate
            if (p.transform) {
                 if (p.transform.scale && p.transform.scale !== 1) chain += `,scale=iw*${p.transform.scale}:ih*${p.transform.scale}`;
                 if (p.transform.rotation && p.transform.rotation !== 0) chain += `,rotate=${p.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`;
            }

            // Opacity
            if (p.opacity < 1) {
                chain += `,format=rgba,colorchannelmixer=aa=${p.opacity}`;
            }

            filterComplex += `${chain}[${clipIdentifier}];`;
        });
        
        // 2. Stitch the main 'video' track with transitions
        const mainTrackClips = clips.filter(c => c.track === 'video').sort((a,b) => a.start - b.start);
        let mainTrackStream = `color=s=1920x1080:c=${backgroundColor || 'black'}:d=${totalDuration}[base];`;
        let lastStage = '[base]';
        
        if(mainTrackClips.length > 0) {
            // Create silent placeholders for xfade
            mainTrackClips.forEach((clip, i) => {
                mainTrackStream += `aevalsrc=0:d=${clip.duration}[asilent${i}];`;
            });
            
            // Chain main track clips with xfade
            let lastV = processedStreams[mainTrackClips[0].id];
            let lastA = `[asilent0]`;
            let accumulatedDuration = mainTrackClips[0].duration;

            for(let i=1; i < mainTrackClips.length; i++) {
                const clip = mainTrackClips[i];
                const prevClip = mainTrackClips[i-1];
                const stream = processedStreams[clip.id];
                const audioStream = `[asilent${i}]`;
                const transition = clip.transition;
                const transitionDuration = transition?.duration || 0.5;
                const offset = prevClip.start + prevClip.duration - transitionDuration;
                
                const transType = FFMPEG_TRANSITIONS[transition?.id] || 'fade';
                
                mainTrackStream += `${lastV}${stream}xfade=transition=${transType}:duration=${transitionDuration}:offset=${offset}[vout${i}];`;
                mainTrackStream += `${lastA}${audioStream}acrossfade=d=${transitionDuration}[aout${i}];`;

                lastV = `[vout${i}]`;
                lastA = `[aout${i}]`;
                accumulatedDuration += clip.duration - transitionDuration;
            }
            
            mainTrackStream += `[base]${lastV}overlay=0:0:shortest=1[main_video];`;
            lastStage = '[main_video]';
        } else {
             filterComplex += `color=s=1920x1080:c=${backgroundColor || 'black'}:d=${totalDuration}[main_video];`;
             lastStage = '[main_video]';
        }
        filterComplex += mainTrackStream;
        
        // 3. Overlay other tracks ('camada', 'text')
        const overlayTracks = ['camada', 'text', 'subtitle'];
        const overlayClips = clips.filter(c => overlayTracks.includes(c.track)).sort((a,b)=>a.start-b.start);

        overlayClips.forEach((clip, i) => {
            const stream = processedStreams[clip.id];
            if (!stream) return;
            const x = clip.properties.transform?.x || 0;
            const y = clip.properties.transform?.y || 0;
            const nextStage = `[ovr_stage_${i}]`;
            filterComplex += `${lastStage}${stream}overlay=x=(W-w)/2+${x}:y=(H-h)/2+${y}:enable='between(t,${clip.start},${clip.start+clip.duration})'${nextStage};`;
            lastStage = nextStage;
        });

        // 4. Audio mixing
        const audioInputs = [];
        audioClips.forEach((clip, i) => {
            const idx = fileMap[clip.fileName];
            if (idx === undefined) return;
            const vol = clip.properties.volume ?? 1;
            const speed = clip.properties.speed ?? 1;
            let audioChain = `[${idx}:a]volume=${vol}`;
            if(speed !== 1) audioChain += `,atempo=${speed}`;
            audioChain += `,adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${i}]`;
            filterComplex += `${audioChain};`;
            audioInputs.push(`[a${i}]`);
        });

        if (audioInputs.length > 0) {
            filterComplex += `${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=longest[outa]`;
        } else {
            filterComplex += `anullsrc=r=44100:d=${duration}[outa]`;
        }

        const args = [
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-map', lastStage,
            '-map', '[outa]',
            '-c:v', 'libx264', '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-preset', 'veryfast', '-crf', '23',
            '-progress', '-', '-nostats', // Enable progress reporting
            '-t', duration.toString(),
            '-y', outputPath
        ];
        
        console.log("Spawning FFmpeg...");
        
        const ffmpeg = spawn("ffmpeg", args);

        ffmpeg.stderr.on('data', (data) => {
            const log = data.toString();
            // console.log(`ffmpeg: ${log}`); // Verbose logging

            // Regex to find time=HH:MM:SS.ms
            const timeMatch = log.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10);
                const minutes = parseInt(timeMatch[2], 10);
                const seconds = parseInt(timeMatch[3], 10);
                const milliseconds = parseInt(timeMatch[4], 10);
                const currentTimeInSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 100;

                if (duration > 0) {
                    let progress = Math.round((currentTimeInSeconds / duration) * 100);
                    progress = Math.min(100, progress); // Cap at 100
                    if (jobs[jobId]) {
                        jobs[jobId].progress = progress;
                    }
                }
            }
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                if (jobs[jobId]) {
                    jobs[jobId].status = "completed";
                    jobs[jobId].progress = 100;
                    jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
                }
            } else {
                 if (jobs[jobId]) {
                    jobs[jobId].status = "failed";
                    jobs[jobId].error = "FFmpeg process failed with code " + code;
                }
            }
        });

    } catch (err) { 
        if (jobs[jobId]) {
            jobs[jobId].status = "failed"; 
            jobs[jobId].error = err.message; 
        }
        console.error("Error processing export:", err);
    }
}


// Simple check endpoint
app.get('/api/check-ffmpeg', (req, res) => {
    // Simple check if ffmpeg is available
    const ffmpeg = spawn('ffmpeg', ['-version']);
    ffmpeg.on('error', () => res.status(500).send('FFmpeg not found'));
    ffmpeg.on('close', (code) => {
        if (code === 0) res.status(200).send('FFmpeg is ready');
        else res.status(500).send('FFmpeg exited with error');
    });
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
