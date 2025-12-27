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

// EXPANDED TRANSITIONS MAP
const FFMPEG_TRANSITIONS = {
    'fade': 'fade', 'crossfade': 'fade', 'fade-classic': 'fade',
    'black': 'fadeblack', 'white': 'fadewhite', 'fadegrays': 'fadegrays',
    'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
    'slide-up': 'slideup', 'slide-down': 'slidedown', 'slide-left': 'slideleft', 'slide-right': 'slideright',
    'circle-open': 'circleopen', 'circle-close': 'circleclose',
    'dissolve': 'dissolve', 'pixelize': 'pixelize', 'radial': 'radial',
    'hblur': 'hblur',
    'diagonaltl': 'diagonaltl', 'diagonaltr': 'diagonaltr', 'diagonalbl': 'diagonalbl', 'diagonalbr': 'diagonalbr',
    'horzopen': 'horzopen', 'horzclose': 'horzclose', 'vertopen': 'vertopen', 'vertclose': 'vertclose',
    'rectcrop': 'rectcrop', 'circlecrop': 'circlecrop',
    'fadegrays': 'fadegrays',
    // Mapped from frontend names
    'checker-wipe': 'dissolve', 'clock-wipe': 'clock',
    'push-left': 'pushleft', 'push-right': 'pushright', 'push-up': 'pushup', 'push-down': 'pushdown',
};

// EXPANDED EFFECTS MAP
const FFMPEG_EFFECTS = {
    'teal-orange': 'eq=contrast=1.2:saturation=1.3,hue=h=-10,format=rgb24,sepia=0.2',
    'matrix': 'eq=contrast=1.2:brightness=0.9:saturation=1.5,hue=h=90',
    'noir': 'format=gray,eq=contrast=1.5:brightness=0.9',
    'vintage-warm': 'format=rgb24,sepia=0.5,eq=contrast=0.9:brightness=1.1:saturation=1.2',
    'cool-morning': 'format=rgb24,sepia=0.2,eq=brightness=1.1,hue=h=180',
    'cyberpunk': 'eq=contrast=1.4:saturation=2,hue=h=20',
    'dreamy-blur': 'gblur=sigma=1,eq=brightness=1.2:saturation=0.8',
    'horror': 'format=gray,eq=contrast=1.5:brightness=0.7,format=rgb24,sepia=0.3',
    'underwater': 'eq=contrast=1.2:brightness=0.8,hue=h=190',
    'sunset': 'format=rgb24,sepia=0.6,eq=saturation=1.5,hue=h=-20',
    'vibrant': 'eq=saturation=2.5:contrast=1.1',
    'invert': 'negate',
    'sepia-max': 'format=rgb24,sepia=1',
    'high-contrast': 'eq=contrast=2.0',
    'low-light': 'eq=brightness=-0.5:contrast=1.5',
    'mono': 'format=gray',
};


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
            if (/\.(jpe?g|png|webp)$/i.test(file.originalname)) {
                inputArgs.push('-loop', '1');
            }
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
        });

        const outputPath = path.join(uploadDir, `${Date.now()}_${config.filename}.${config.format}`);
        job.outputPath = outputPath;

        let filterComplex = "";
        
        const processedStreams = {};
        const allVisualClips = clips.filter(c => ['video', 'camada', 'text', 'image', 'subtitle'].includes(c.track) || ['video', 'camada', 'text', 'image', 'subtitle'].includes(c.type));

        allVisualClips.forEach((clip, i) => {
            const clipIdentifier = `clip_v_${i}`;
            if (clip.type === 'text') {
                processedStreams[clip.id] = `[${clipIdentifier}]`;
                const p = clip.properties;
                const td = p.textDesign || {};
                const textColor = td.color || 'white';
                const boxColor = td.backgroundColor || 'black@0.0'; // Transparent if not specified
                filterComplex += `color=s=1920x1080:c=${boxColor}:d=${clip.duration},format=rgba,drawtext=text='${(p.text || '').replace(/'/g, `''`)}':fontcolor=${textColor}:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2[${clipIdentifier}];`;
                return;
            }
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined) return;

            processedStreams[clip.id] = `[${clipIdentifier}]`;
            let chain = `[${inputIdx}:v]`;
            const mediaStart = clip.mediaStartOffset || 0;
            chain += `trim=start=${mediaStart}:duration=${clip.duration},setpts=PTS-STARTPTS,`;
            
            chain += `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1`;
            const p = clip.properties;
            
            // --- Ken Burns (Movement) ---
            if (p.kenBurns?.enabled) {
                // Simple zoom-in for now
                chain += `,zoompan=z='min(zoom+0.001, 1.5)':d=${25 * clip.duration}:s=1920x1080`;
            }

            // --- Effects & Adjustments ---
            let filters = [];
            if (p.adjustments) {
                filters.push(`eq=brightness=${p.adjustments.brightness ?? 1}:contrast=${p.adjustments.contrast ?? 1}:saturation=${p.adjustments.saturate ?? 1}`);
                if (p.adjustments.hue) filters.push(`hue=h=${p.adjustments.hue}`);
            }
            const effectFilter = FFMPEG_EFFECTS[clip.effect];
            if (effectFilter) filters.push(effectFilter);
            if (p.opacity < 1) filters.push(`format=rgba,colorchannelmixer=aa=${p.opacity}`);
            
            if(filters.length > 0) chain += `,${filters.join(',')}`;

            filterComplex += `${chain}[${clipIdentifier}];`;
        });

        // --- Video Composition (Transitions) ---
        let lastVideoStream = '';
        const mainTrackClips = clips
            .filter(c => c.track === 'video' && media && media[c.fileName] && processedStreams[c.id])
            .sort((a,b) => a.start - b.start);

        if (mainTrackClips.length > 0) {
            lastVideoStream = processedStreams[mainTrackClips[0].id];
            
            for(let i=1; i < mainTrackClips.length; i++) {
                const clip = mainTrackClips[i];
                const prevClip = mainTrackClips[i-1];
                const currentVideoStream = processedStreams[clip.id];
                
                const transition = prevClip.transition; // Transition is on the outgoing clip
                const transitionDuration = transition?.duration || 0.5;
                const offset = prevClip.start + prevClip.duration; // Use END time of previous clip for offset
                const transType = FFMPEG_TRANSITIONS[transition?.id] || 'fade';
                
                const nextVideoStream = `[vout${i}]`;
                filterComplex += `${lastVideoStream}${currentVideoStream}xfade=transition=${transType}:duration=${transitionDuration}:offset=${offset}${nextVideoStream};`;
                lastVideoStream = nextVideoStream;
            }
        }

        filterComplex += `color=s=1920x1080:c=${backgroundColor || 'black'}:d=${totalDuration}[base];`;
        let lastStage = '[base]';

        if (lastVideoStream) {
            filterComplex += `${lastStage}${lastVideoStream}overlay=0:0:shortest=1[main_video_track];`;
            lastStage = '[main_video_track]';
        }

        // --- Overlays ---
        const overlayTracks = ['camada', 'text', 'subtitle', 'image'];
        clips
            .filter(c => overlayTracks.includes(c.track) && processedStreams[c.id])
            .sort((a,b) => a.start - b.start)
            .forEach((clip, i) => {
                const stream = processedStreams[clip.id];
                const p = clip.properties;
                const x = p.transform?.x || 0;
                const y = p.transform?.y || 0;
                const scale = p.transform?.scale || 1;
                // Note: rotation and other complex transforms are not handled yet for simplicity
                const nextStage = `[ovr_stage_${i}]`;
                filterComplex += `${stream}scale=iw*${scale}:-1[scaled_ovr_${i}];`;
                filterComplex += `${lastStage}[scaled_ovr_${i}]overlay=x=(W-w)/2+${x}:y=(H-h)/2+${y}:enable='between(t,${clip.start},${clip.start+clip.duration})'${nextStage};`;
                lastStage = nextStage;
            });
        
        // --- NEW ROBUST AUDIO PIPELINE ---
        const audioSetupFilters = [];
        const audioInputsForMix = [];
        clips.forEach((clip, i) => {
            const mediaItem = media[clip.fileName];
            const hasAudio = mediaItem?.hasAudio || ['audio', 'narration', 'music', 'sfx'].includes(clip.track);
            const inputIdx = fileMap[clip.fileName];

            if (hasAudio && inputIdx !== undefined) {
                const p = clip.properties;
                const mediaStart = clip.mediaStartOffset || 0;
                const clipAudioStream = `[a_clip_${i}]`;
                let filter = `[${inputIdx}:a]atrim=start=${mediaStart}:duration=${clip.duration},asetpts=PTS-STARTPTS`;
                if (p.speed && p.speed !== 1) filter += `,atempo=${p.speed}`;
                if (p.volume !== undefined && p.volume !== 1) filter += `,volume=${p.volume}`;
                filter += `,adelay=${clip.start * 1000}|${clip.start * 1000}${clipAudioStream}`;
                audioSetupFilters.push(filter);
                audioInputsForMix.push(clipAudioStream);
            }
        });
        if(audioSetupFilters.length > 0) filterComplex += ';' + audioSetupFilters.join(';');
        if (audioInputsForMix.length > 0) {
            filterComplex += `;${audioInputsForMix.join('')}amix=inputs=${audioInputsForMix.length}:duration=longest[outa]`;
        } else {
            filterComplex += `;anullsrc=r=44100:d=${duration}[outa]`;
        }


        const args = [
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-map', lastStage,
            '-map', '[outa]',
            '-c:v', 'libx264', '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-preset', 'veryfast', '-crf', '23',
            '-progress', '-', '-nostats',
            '-t', duration.toString(),
            '-y', outputPath
        ];
        
        console.log("Spawning FFmpeg...");
        // console.log("FFMPEG ARGS:", args.join(' '));
        
        const ffmpeg = spawn("ffmpeg", args);
        let ffmpeg_err = '';

        ffmpeg.stderr.on('data', (data) => {
            const log = data.toString();
            ffmpeg_err += log;
            const timeMatch = log.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1], 10), minutes = parseInt(timeMatch[2], 10), seconds = parseInt(timeMatch[3], 10), ms = parseInt(timeMatch[4], 10);
                const currentTime = hours * 3600 + minutes * 60 + seconds + ms / 100;
                if (duration > 0) {
                    let progress = Math.min(100, Math.round((currentTime / duration) * 100));
                    if (jobs[jobId]) jobs[jobId].progress = progress;
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
                    jobs[jobId].error = "FFmpeg failed. Code: " + code;
                    console.error("FFMPEG FAILED with code " + code);
                    console.error("FFMPEG stderr:\n", ffmpeg_err);
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

app.get('/api/check-ffmpeg', (req, res) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    ffmpeg.on('error', () => res.status(500).send('FFmpeg not found'));
    ffmpeg.on('close', (code) => {
        if (code === 0) res.status(200).send('FFmpeg is ready');
        else res.status(500).send('FFmpeg exited with error');
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
