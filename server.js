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

// NEW: COMPREHENSIVE FFMPEG EFFECTS MAP
const FFMPEG_EFFECTS = {
    // Cinematic Pro
    'teal-orange': "curves=r='0/0.1 1/0.9':g='0/0.5 1/0.5':b='0.1/0 0.9/1'",
    'matrix': "eq=contrast=1.3:brightness=-0.1:saturation=2,hue=h=120,vignette",
    'noir': "format=gray,eq=contrast=1.6:brightness=-0.15,vignette",
    'vintage-warm': "eq=contrast=1.1:saturation=0.7:brightness=0.05,vignette,gblur=sigma=0.3,curves=r='0/0.1 1/0.9':b='0/0.2 1/0.8'",
    'cool-morning': "eq=brightness=0.05:saturation=0.8,curves=b='0/0.1 1/0.9'",
    'cyberpunk': "eq=contrast=1.4:saturation=1.8,hue=h=210,vignette=angle=PI/3",
    'dreamy-blur': "gblur=sigma=1.5,eq=brightness=0.1:saturation=0.8",
    'horror': "eq=contrast=1.6:brightness=-0.3:saturation=0.3,vignette,curves=b='0/0.1 1/0.9'",
    'underwater': "eq=contrast=1.1:brightness=-0.1,hue=h=190,gblur=sigma=0.5",
    'sunset': "eq=saturation=1.4,vignette,curves=r='0/0.1 1/0.95':g='0/0.05 1/1':b='0/0.2 1/0.8'",
    'vibrant': 'eq=saturation=1.8:contrast=1.1',
    'muted': 'eq=saturation=0.6:contrast=0.95',
    'golden-hour': "curves=r='0/0.1 1/1':g='0/0.05 1/1':b='0/0.2 1/0.8',eq=saturation=1.2",
    'cold-blue': "curves=b='0/0.15 1/1',eq=saturation=0.9",
    'night-vision': "format=gray,curves=strong_contrast,lutrgb=r='gammaval(0.8)':g='gammaval(1.2)':b='gammaval(0.8)'",
    'scifi': "eq=contrast=1.2,hue=h=180",
    'pastel': "eq=brightness=0.1:saturation=0.7:contrast=0.9",
    'posterize': "curves=r='0/0.2 0.4/0.2 0.4/0.8 1/0.8':g='0/0.2 0.4/0.2 0.4/0.8 1/0.8':b='0/0.2 0.4/0.2 0.4/0.8 1/0.8'",

    // Artistic
    'pop-art': 'eq=saturation=3:contrast=1.5',
    'invert': 'negate',
    'sepia-max': 'format=rgb24,sepia',
    'high-contrast': 'eq=contrast=1.8',
    'low-light': 'eq=brightness=-0.4:contrast=1.3',
    'overexposed': 'eq=brightness=0.4:contrast=0.9',
    'radioactive': 'eq=saturation=3,hue=h=90',
    'mono': 'format=gray'
};

// Helper to check for audio stream in a file
function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', filePath]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => stderr += d.toString());
        ffmpeg.on('close', () => {
            // Check for Audio stream info in stderr output
            // Example: Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)
            resolve(/Stream #\d+:\d+.*Audio:/.test(stderr));
        });
        ffmpeg.on('error', () => {
            // If checking fails, default to false to prevent crashing map, 
            // but log it.
            console.error("Failed to check audio stream for", filePath);
            resolve(false); 
        });
    });
}

// Audio Extraction Endpoint
app.post('/api/process/extract-audio', uploadAny, (req, res) => {
    const jobId = `extract_${Date.now()}`;
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'No file uploaded.' });
    
    jobs[jobId] = { status: 'pending', files: req.files, progress: 0 };
    res.status(202).json({ jobId });
    
    const file = req.files[0];
    const outputPath = path.join(uploadDir, `${Date.now()}_extracted.mp3`);
    jobs[jobId].outputPath = outputPath;
    jobs[jobId].status = 'processing';

    const ffmpeg = spawn('ffmpeg', [
        '-i', file.path,
        '-vn', // No video
        '-acodec', 'libmp3lame',
        '-q:a', '2',
        '-y', outputPath
    ]);

    let ffmpeg_err = '';
    ffmpeg.stderr.on('data', d => ffmpeg_err += d.toString());

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error("FFmpeg extract error:", ffmpeg_err);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = 'FFmpeg extraction failed';
        }
    });
});


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
        
        // 1. Verify Audio Streams in Inputs
        const fileAudioMap = {}; // idx -> hasAudio (bool)
        
        for (let idx = 0; idx < files.length; idx++) {
            const file = files[idx];
            if (/\.(jpe?g|png|webp)$/i.test(file.originalname)) {
                inputArgs.push('-loop', '1');
            }
            inputArgs.push("-i", file.path);
            fileMap[file.originalname] = idx;
            
            // Check if this file actually has audio
            fileAudioMap[idx] = await checkAudioStream(file.path);
        }

        const outputPath = path.join(uploadDir, `${Date.now()}_${config.filename}.${config.format}`);
        job.outputPath = outputPath;

        const filterComplexParts = [];
        
        const processedStreams = {};
        const allVisualClips = clips.filter(c => ['video', 'camada', 'text', 'image', 'subtitle'].includes(c.track) || ['video', 'camada', 'text', 'image', 'subtitle'].includes(c.type));

        allVisualClips.forEach((clip, i) => {
            const clipIdentifier = `clip_v_${i}`;
            if (clip.type === 'text') {
                processedStreams[clip.id] = `[${clipIdentifier}]`;
                const p = clip.properties;
                const td = p.textDesign || {};
                const textColor = td.color || 'white';
                const boxColor = td.backgroundColor || 'black@0.0';
                filterComplexParts.push(`color=s=1920x1080:c=${boxColor}:d=${clip.duration},format=rgba,drawtext=text='${(p.text || '').replace(/'/g, `''`)}':fontcolor=${textColor}:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2[${clipIdentifier}]`);
                return;
            }
            const inputIdx = fileMap[clip.fileName];
            if (inputIdx === undefined) return;

            processedStreams[clip.id] = `[${clipIdentifier}]`;
            
            const p = clip.properties;
            const mediaStart = clip.mediaStartOffset || 0;
            
            const filters = [
                `trim=start=${mediaStart}:duration=${clip.duration}`,
                'setpts=PTS-STARTPTS',
                'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
                'setsar=1'
            ];
            
            // --- Movement Filters ---
            if (p.kenBurns?.enabled) {
                filters.push(`zoompan=z='min(zoom+0.0015,1.5)':d=${Math.round(25 * clip.duration)}:s=1920x1080:fps=25`);
            } else if (p.movement) {
                const moveType = p.movement.type;
                const d = clip.duration;
                let preFilter = null;
                let postFilter = null;
                switch(moveType) {
                    case 'earthquake': postFilter = `crop=in_w:in_h:x='min(iw/50, 8)*sin(n*PI*4)':y='min(ih/50, 8)*cos(n*PI*5)'`; break;
                    case 'shake-hard': postFilter = `crop=in_w:in_h:x='4*sin(n*PI*8)':y='4*cos(n*PI*10)'`; break;
                    case 'jitter': postFilter = `crop=in_w:in_h:x='2*sin(n*PI*20)':y='2*cos(n*PI*24)'`; break;
                    case 'handheld-1': postFilter = `crop=in_w:in_h:x='2*sin(n*PI/5)':y='1*cos(n*PI/4)'`; break;
                    case 'handheld-2': postFilter = `crop=in_w:in_h:x='4*sin(n*PI/2)':y='2*cos(n*PI/1.5)'`; break;
                    case 'mov-pan-slow-l': preFilter = 'scale=1.2*iw:-2'; postFilter = `crop=iw/1.2:ih/1.2:x='(iw-iw/1.2)*(1-(t/${d}))':y='(oh-ih)/2'`; break;
                    case 'mov-pan-slow-r': preFilter = 'scale=1.2*iw:-2'; postFilter = `crop=iw/1.2:ih/1.2:x='(iw-iw/1.2)*(t/${d})':y='(oh-ih)/2'`; break;
                    case 'mov-pan-slow-u': preFilter = 'scale=1.2*iw:-2'; postFilter = `crop=iw/1.2:ih/1.2:x='(ow-iw)/2':y='(ih-ih/1.2)*(1-(t/${d}))'`; break;
                    case 'mov-pan-slow-d': preFilter = 'scale=1.2*iw:-2'; postFilter = `crop=iw/1.2:ih/1.2:x='(ow-iw)/2':y='(ih-ih/1.2)*(t/${d})'`; break;
                    case 'mov-zoom-crash-in': postFilter = `zoompan=z='min(zoom+0.03,5)':d=1:s=1920x1080:fps=25`; break;
                    case 'mov-zoom-crash-out': postFilter = `zoompan=z='if(lte(zoom,1.0),5,max(1.0,zoom-0.03))':d=1:s=1920x1080:fps=25`; break;
                    case 'zoom-slow-in': postFilter = `zoompan=z='min(zoom+0.001, 1.5)':d=${Math.round(25 * d)}:s=1920x1080:fps=25`; break;
                    case 'zoom-slow-out': postFilter = `zoompan=z='if(lte(zoom,1.0),1.5,max(1.0,zoom-0.001))':d=${Math.round(25 * d)}:s=1920x1080:fps=25`; break;
                }
                if (preFilter) filters.push(preFilter);
                if (postFilter) filters.push(postFilter);
            }

            if (p.adjustments) {
                const brightness = (p.adjustments.brightness ?? 1.0) - 1.0;
                filters.push(`eq=brightness=${brightness}:contrast=${p.adjustments.contrast ?? 1}:saturation=${p.adjustments.saturate ?? 1}`);
                if (p.adjustments.hue) filters.push(`hue=h=${p.adjustments.hue}`);
            }
            
            const effectFilter = FFMPEG_EFFECTS[clip.effect];
            if (effectFilter) filters.push(effectFilter);
            
            if (p.opacity !== undefined && p.opacity < 1) filters.push(`format=rgba,colorchannelmixer=aa=${p.opacity}`);

            filterComplexParts.push(`[${inputIdx}:v] ${filters.join(',')} [${clipIdentifier}]`);
        });

        // --- Video Composition ---
        let lastVideoStream = '';
        const mainTrackClips = clips.filter(c => (c.track === 'video' || c.track === 'camada') && media && media[c.fileName] && processedStreams[c.id]).sort((a,b) => a.start - b.start);

        if (mainTrackClips.length > 0) {
            lastVideoStream = processedStreams[mainTrackClips[0].id];
            for(let i=1; i < mainTrackClips.length; i++) {
                const prevClip = mainTrackClips[i-1];
                const transition = prevClip.transition;
                const transitionDuration = transition?.duration || 0.5;
                const offset = prevClip.start + prevClip.duration;
                const transType = FFMPEG_TRANSITIONS[transition?.id] || 'fade';
                const nextStreamId = `[vout${i}]`;
                filterComplexParts.push(`${lastVideoStream}${processedStreams[mainTrackClips[i].id]}xfade=transition=${transType}:duration=${transitionDuration}:offset=${offset}${nextStreamId}`);
                lastVideoStream = nextStreamId;
            }
        }

        filterComplexParts.push(`color=s=1920x1080:c=${backgroundColor || 'black'}:d=${totalDuration}[base]`);
        let lastStage = '[base]';

        if (lastVideoStream) {
            filterComplexParts.push(`${lastStage}${lastVideoStream}overlay=0:0:shortest=1[main_video_track]`);
            lastStage = '[main_video_track]';
        }

        // --- Overlays ---
        const overlayTracks = ['text', 'subtitle', 'image'];
        clips.filter(c => overlayTracks.includes(c.track) && processedStreams[c.id]).sort((a,b) => a.start - b.start)
            .forEach((clip, i) => {
                const p = clip.properties;
                const nextStage = `[ovr_stage_${i}]`;
                const scaleFilter = `scale=iw*${p.transform?.scale || 1}:-1`;
                filterComplexParts.push(`${processedStreams[clip.id]}${scaleFilter}[scaled_ovr_${i}]`);
                filterComplexParts.push(`${lastStage}[scaled_ovr_${i}]overlay=x=(W-w)/2+${p.transform?.x || 0}:y=(H-h)/2+${p.transform?.y || 0}:enable='between(t,${clip.start},${clip.start+clip.duration})'${nextStage}`);
                lastStage = nextStage;
            });
        
        // --- Audio Pipeline ---
        const audioSetupFilters = [];
        const audioInputsForMix = [];
        
        clips.forEach((clip, i) => {
            const inputIdx = fileMap[clip.fileName];
            
            // KEY FIX: Only include audio if the INPUT file actually has an audio stream.
            // This prevents "Stream map matches no streams" errors for silent video files.
            const hasAudioStream = inputIdx !== undefined && fileAudioMap[inputIdx];
            
            if (hasAudioStream) {
                const p = clip.properties;
                const mediaStart = clip.mediaStartOffset || 0;
                const clipAudioStream = `[a_clip_${i}]`;
                
                let filter = `[${inputIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=start=${mediaStart}:duration=${clip.duration},asetpts=PTS-STARTPTS`;
                if (p.speed && p.speed !== 1) filter += `,atempo=${p.speed}`;
                if (p.volume !== undefined && p.volume !== 1) filter += `,volume=${p.volume}`;
                filter += `,adelay=${clip.start * 1000}|${clip.start * 1000}${clipAudioStream}`;
                audioSetupFilters.push(filter);
                audioInputsForMix.push(clipAudioStream);
            }
        });
        
        if (audioSetupFilters.length > 0) filterComplexParts.push(...audioSetupFilters);

        if (audioInputsForMix.length > 0) {
            filterComplexParts.push(`${audioInputsForMix.join('')}amix=inputs=${audioInputsForMix.length}:duration=longest[outa]`);
        } else {
            filterComplexParts.push(`anullsrc=r=44100:d=${duration}[outa]`);
        }
        
        const finalFilterComplex = filterComplexParts.join(';');

        let videoCodecArgs = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
        let audioCodecArgs = ['-c:a', 'aac'];
        let videoPresetArgs = ['-preset', 'veryfast', '-crf', '23'];

        if (config.format === 'webm') {
            videoCodecArgs = ['-c:v', 'libvpx-vp9'];
            audioCodecArgs = ['-c:a', 'libopus'];
            videoPresetArgs = ['-crf', '30', '-b:v', '0'];
        }

        const args = [
            ...inputArgs,
            '-filter_complex', finalFilterComplex,
            '-map', lastStage,
            '-map', '[outa]',
            ...videoCodecArgs,
            ...audioCodecArgs,
            ...videoPresetArgs,
            '-progress', '-', '-nostats',
            '-t', duration.toString(),
            '-y', outputPath
        ];
        
        console.log("Spawning FFmpeg...");
        // console.log("FFMPEG ARGS:", ["ffmpeg", ...args].join(' '));
        
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
