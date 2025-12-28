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
// Viral Cuts Logic
async function processViralCutsJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing'; job.progress = 10;
    try {
        const videoFile = job.files.video[0];
        const params = job.params || {};
        const count = parseInt(params.count) || 3;
        const style = params.style || 'blur';
        
        const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFile.path}"`;
        const duration = await new Promise((resolve, reject) => exec(durationCmd, (err, stdout) => err ? reject(err) : resolve(parseFloat(stdout))));

        const segmentDuration = 10;
        const step = Math.max(15, Math.floor(duration / (count + 1)));
        
        let verticalFilter = "";
        if (style === 'crop') verticalFilter = "scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1";
        else verticalFilter = "split[original][blur];[blur]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:(iw-720)/2:(ih-1280)/2,boxblur=20:10[bg];[original]scale=720:1280:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2";

        const segments = [];
        for(let i=1; i<=count; i++) {
            const start = step * i;
            if (start + segmentDuration < duration) segments.push({ start, duration: segmentDuration });
        }
        if (segments.length === 0) segments.push({ start: 0, duration: Math.min(duration, 30) });

        let trimChain = "";
        segments.forEach((seg, idx) => {
            trimChain += `[0:v]trim=${seg.start}:${seg.start+seg.duration},setpts=PTS-STARTPTS,${verticalFilter}[v${idx}];`;
            trimChain += `[0:a]atrim=${seg.start}:${seg.start+seg.duration},asetpts=PTS-STARTPTS[a${idx}];`;
        });
        
        const vInputs = segments.map((_, i) => `[v${i}]`).join('');
        const aInputs = segments.map((_, i) => `[a${i}]`).join('');
        
        trimChain += `${vInputs}concat=n=${segments.length}:v=1:a=0[outv];${aInputs}concat=n=${segments.length}:v=0:a=1[outa]`;

        const outputPath = path.join(uploadDir, `viral_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const cmd = `ffmpeg -i "${videoFile.path}" -filter_complex "${trimChain}" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -c:a aac "${outputPath}"`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) { job.status = 'failed'; job.error = "FFmpeg failed processing viral cuts"; } 
            else { job.status = 'completed'; job.progress = 100; job.downloadUrl = `/api/process/download/${jobId}`; }
        });
    } catch (e) { job.status = 'failed'; job.error = e.message; }
}

function processScriptToVideoJob(jobId) {
    const job = jobs[jobId];
    job.status = 'failed';
    job.error = "Script to video processing not fully implemented on server-side. Use client-side generation.";
}

// --- LÓGICA DE PROCESSAMENTO DE TAREFAS DE CLIPE ÚNICO ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing'; job.progress = 0;

    const action = jobId.split('_')[0];
    const videoFile = job.files.video ? job.files.video[0] : (job.files.audio ? job.files.audio[0] : null);
    if (!videoFile && action !== 'voice-clone') { // voice-clone might pass file differently or we handle it inside
         job.status = 'failed'; job.error = "No media file provided."; return;
    }

    let params = {};
    if (job.params && job.params.params) {
        try { params = typeof job.params.params === 'string' ? JSON.parse(job.params.params) : job.params.params; } catch(e) {}
    } else if (job.params) params = job.params;

    const inputIsImage = videoFile ? isImage(videoFile.originalname) : false;
    let outputExtension = '.mp4';
    if (inputIsImage && ['magic-erase-real', 'video-to-cartoon-real', 'style-transfer-real', 'stickerize-real', 'retouch-real', 'colorize-real', 'reframe-real', 'remove-bg-real', 'upscale-real'].includes(action)) outputExtension = '.png';
    if (['extract-audio-real', 'reduce-noise-real', 'isolate-voice-real', 'enhance-voice-real', 'auto-ducking-real', 'voice-fx-real', 'voice-clone'].includes(action)) outputExtension = '.wav';
    
    // WebM for transparency support in video, PNG for image rotoscope
    if (action === 'rotoscope-real') {
        outputExtension = inputIsImage ? '.png' : '.webm';
    }

    const outputFilename = `${action}-${Date.now()}${outputExtension}`;
    const outputPath = path.join(uploadDir, outputFilename);
    job.outputPath = outputPath;

    const MAX_WIDTH = 1280;
    const originalW = params.originalWidth || 1920;
    let args = [];

    switch (action) {
        case 'rotoscope-real': {
             // Auto Rotoscope (Smart Cutout)
             const color = (params.color || '#00FF00').replace('#', '0x');
             const similarity = params.similarity || 0.3;
             const smoothness = params.smoothness || 0.1;
             
             args.push('-i', videoFile.path);
             args.push('-vf', `chromakey=${color}:${similarity}:${smoothness}`);
             
             if (outputExtension === '.png') {
                 // For image input, output PNG with alpha
                 args.push('-c:v', 'png');
                 args.push('-f', 'image2');
             } else {
                 // For video input, output WebM with alpha
                 args.push('-c:v', 'libvpx-vp9', '-b:v', '2M'); 
                 args.push('-auto-alt-ref', '0');
                 args.push('-c:a', 'libvorbis');
             }
             args.push(outputPath);
             break;
        }

        case 'lip-sync-real': {
             // Lip Sync (Dubbing)
             // Replaces video audio with new voice file
             const voiceFile = job.files.audio ? job.files.audio[0] : null;
             if (!voiceFile) { job.status = 'failed'; job.error = "Audio file required for Lip Sync."; return; }
             
             // Map video stream from input 0, audio stream from input 1
             // -shortest cuts video to match audio length if audio is shorter (common in dubbing)
             args.push('-i', videoFile.path);
             args.push('-i', voiceFile.path);
             args.push('-map', '0:v:0');
             args.push('-map', '1:a:0');
             args.push('-c:v', 'copy'); // Copy video stream (fast) or re-encode if needed for precision
             args.push('-c:a', 'aac');
             args.push('-shortest');
             args.push(outputPath);
             break;
        }

        case 'ai-dubbing': {
            // AI Dubbing Pipeline: Extract -> Translate (Gemini) -> Clone+TTS (ElevenLabs) -> Merge
            const targetLang = params.targetLanguage || 'English';
            const apiKeyEleven = job.params.apiKey;
            const geminiKey = process.env.API_KEY;

            if (!apiKeyEleven) { job.status = 'failed'; job.error = "ElevenLabs API Key required."; return; }
            if (!geminiKey) { job.status = 'failed'; job.error = "Gemini API Key missing."; return; }

            try {
                // 1. Extract Audio
                const extractedAudioPath = path.join(uploadDir, `temp_extract_${jobId}.mp3`);
                await new Promise((resolve, reject) => {
                    exec(`ffmpeg -i "${videoFile.path}" -vn -acodec libmp3lame "${extractedAudioPath}"`, (err) => err ? reject(err) : resolve());
                });

                // 2. Transcribe & Translate (Gemini)
                console.log(`[Job ${jobId}] Transcribing & Translating...`);
                // Read audio as base64 for Gemini
                const audioBuffer = fs.readFileSync(extractedAudioPath);
                const audioBase64 = audioBuffer.toString('base64');
                
                const geminiPayload = {
                    contents: [{
                        parts: [
                            { inline_data: { mime_type: "audio/mp3", data: audioBase64 } },
                            { text: `Transcribe the spoken audio and translate it to ${targetLang}. Return ONLY the translated text.` }
                        ]
                    }]
                };

                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiPayload)
                });
                
                if (!geminiRes.ok) throw new Error(`Gemini Translation Failed: ${geminiRes.status}`);
                const geminiData = await geminiRes.json();
                const translatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!translatedText) throw new Error("No translation returned.");
                console.log(`[Job ${jobId}] Translated: ${translatedText.substring(0, 50)}...`);

                // 3. Instant Voice Clone & TTS (ElevenLabs)
                console.log(`[Job ${jobId}] Cloning Voice & Generating Speech...`);
                
                // Add Voice
                const addVoiceForm = new FormData();
                addVoiceForm.append('name', `Dubbing_Temp_${jobId}`);
                addVoiceForm.append('files', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'sample.mp3');
                
                const addVoiceRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKeyEleven },
                    body: addVoiceForm
                });
                if (!addVoiceRes.ok) throw new Error(`Voice Clone Failed: ${await addVoiceRes.text()}`);
                const voiceData = await addVoiceRes.json();
                const voiceId = voiceData.voice_id;

                // Generate TTS
                const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKeyEleven, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: translatedText, model_id: "eleven_multilingual_v2" })
                });
                if (!ttsRes.ok) throw new Error(`TTS Generation Failed`);
                
                const ttsBuffer = await ttsRes.arrayBuffer();
                const dubbedAudioPath = path.join(uploadDir, `dubbed_audio_${jobId}.mp3`);
                fs.writeFileSync(dubbedAudioPath, Buffer.from(ttsBuffer));

                // Cleanup Voice
                await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
                    method: 'DELETE',
                    headers: { 'xi-api-key': apiKeyEleven }
                });

                // 4. Merge
                args.push('-i', videoFile.path);
                args.push('-i', dubbedAudioPath);
                args.push('-map', '0:v');
                args.push('-map', '1:a');
                args.push('-c:v', 'copy');
                args.push('-c:a', 'aac');
                args.push('-shortest'); // Ensure video doesn't run longer than audio (or vice versa logic needed?) Usually we want full video but audio might differ.
                // Standard dubbing keeps video length. If audio is shorter, silent end. If longer, cut.
                args.push(outputPath);

            } catch (e) {
                job.status = 'failed'; job.error = e.message; return;
            }
            break;
        }

        case 'magic-erase-real': {
             let { x, y, w, h } = params;
             let processScale = originalW > MAX_WIDTH ? `scale=${MAX_WIDTH}:-2,` : "";
             let scaleFactor = originalW > MAX_WIDTH ? MAX_WIDTH / originalW : 1;
             const dx = Math.round(x * scaleFactor); const dy = Math.round(y * scaleFactor);
             const dw = Math.max(1, Math.round(w * scaleFactor)); const dh = Math.max(1, Math.round(h * scaleFactor));
             
             if(inputIsImage && outputExtension === '.mp4') args.push('-loop', '1', '-t', '5');
             args.push('-i', videoFile.path);
             if(inputIsImage && outputExtension === '.mp4') args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             args.push('-vf', `${processScale}delogo=x=${dx}:y=${dy}:w=${dw}:h=${dh}:show=0` + (outputExtension === '.mp4' ? ",scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" : ""));
             if(inputIsImage && outputExtension === '.mp4') args.push('-map', '0:v', '-map', '1:a', '-shortest');
             if(outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
             else args.push('-y');
             args.push(outputPath);
             break;
        }

        case 'video-to-cartoon-real': {
             const cStyle = params.style || 'anime_vibrant';
             const styleFilter = getStyleFilter(cStyle);
             let filters = [];
             
             if (inputIsImage && originalW > MAX_WIDTH) filters.push(`scale=${MAX_WIDTH}:-2`);
             
             filters.push(styleFilter);
             
             if (outputExtension === '.mp4') filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "format=yuv420p");
             
             if(inputIsImage && outputExtension === '.mp4') args.push('-loop', '1', '-t', '5');
             args.push('-i', videoFile.path);
             if(inputIsImage && outputExtension === '.mp4') args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             args.push('-vf', filters.join(","));
             if(inputIsImage && outputExtension === '.mp4') args.push('-map', '0:v', '-map', '1:a', '-shortest');
             if(outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
             else args.push('-y');
             args.push(outputPath);
             break;
        }

        case 'interpolate-real': {
             const speed = params.speed || 0.5;
             const mode = params.mode || 'blend';
             const factor = 1 / speed;
             const targetFps = Math.round(30 * factor);
             let miFilter = `fps=${targetFps}`;
             if (mode === 'optical') miFilter += `:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
             else miFilter += `:mi_mode=blend`;

             let audioFilter = "";
             let remainingSpeed = speed;
             const atempoChain = [];
             while (remainingSpeed < 0.5) { atempoChain.push("atempo=0.5"); remainingSpeed *= 2; }
             atempoChain.push(`atempo=${remainingSpeed}`);
             audioFilter = atempoChain.join(",");

             args.push('-i', videoFile.path);
             args.push('-filter_complex', `[0:v]minterpolate=${miFilter},setpts=${factor}*PTS[v];[0:a]${audioFilter}[a]`);
             args.push('-map', '[v]', '-map', '[a]');
             args.push('-r', '30');
             args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p');
             args.push('-c:a', 'aac', '-b:a', '128k');
             args.push(outputPath);
             break;
        }
             
        case 'upscale-real':
             args.push('-i', videoFile.path);
             args.push('-vf', "scale=3840:2160:flags=lanczos,unsharp=5:5:1.0:5:5:0.0,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
             if (outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'superfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy');
             args.push(outputPath);
             break;
             
        case 'reverse-real':
             args.push('-i', videoFile.path);
             args.push('-vf', 'reverse', '-af', 'areverse');
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
             args.push(outputPath);
             break;

        case 'stabilize-real':
             const trfPath = path.join(uploadDir, `transform_${jobId}.trf`);
             const detectCmd = `ffmpeg -i "${videoFile.path}" -vf vidstabdetect=stepSize=32:shakiness=10:accuracy=15:result="${trfPath}" -f null -`;
             await new Promise((resolve, reject) => exec(detectCmd, (err) => err ? reject(err) : resolve()));
             args.push('-i', videoFile.path);
             args.push('-vf', `vidstabtransform=input="${trfPath}":zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`);
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'reframe-real':
             args.push('-i', videoFile.path);
             args.push('-vf', 'scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1,format=yuv420p');
             if (outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'stickerize-real':
             args.push('-i', videoFile.path);
             args.push('-vf', "split[original][copy];[copy]scale=iw+20:ih+20,drawbox=w=iw+20:h=ih+20:c=white:t=fill[outline];[outline][original]overlay=10:10");
             args.push('-y', outputPath);
             break;

        case 'remove-silence-real':
             const sThresh = params.threshold || -30;
             const sDur = params.duration || 0.5;
             const isAudioOnly = !videoFile.mimetype || videoFile.mimetype.startsWith('audio');

             if (isAudioOnly) {
                 // Simple audio filter
                 args.push('-i', videoFile.path);
                 args.push('-af', `silenceremove=start_periods=1:start_duration=${sDur}:start_threshold=${sThresh}dB:stop_periods=-1:stop_duration=${sDur}:stop_threshold=${sThresh}dB`);
                 args.push('-vn', '-acodec', 'pcm_s16le');
                 args.push(outputPath);
             } else {
                 // Smart Video Jump Cuts (Complex)
                 // 1. Detect silence
                 const detectCmd = `ffmpeg -i "${videoFile.path}" -af silencedetect=noise=${sThresh}dB:d=${sDur} -f null -`;
                 console.log(`[Job ${jobId}] Detecting silence: ${detectCmd}`);
                 
                 let stderrLog = "";
                 try {
                     stderrLog = await new Promise((resolve, reject) => {
                         exec(detectCmd, (error, stdout, stderr) => {
                             // silencedetect writes to stderr
                             resolve(stderr);
                         });
                     });
                 } catch (e) {
                     job.status = 'failed'; job.error = "Silence detection failed."; return;
                 }

                 // 2. Parse silence logs
                 const silenceSegments = [];
                 const regex = /silence_start: (\d+(\.\d+)?)|silence_end: (\d+(\.\d+)?)/g;
                 let match;
                 let currentStart = null;
                 
                 while ((match = regex.exec(stderrLog)) !== null) {
                     if (match[1]) { // start
                         currentStart = parseFloat(match[1]);
                     } else if (match[3] && currentStart !== null) { // end
                         silenceSegments.push({ start: currentStart, end: parseFloat(match[3]) });
                         currentStart = null;
                     }
                 }

                 // Get total duration
                 let duration = 0;
                 const durMatch = stderrLog.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                 if (durMatch) {
                     duration = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                 }

                 if (silenceSegments.length === 0) {
                     // No silence found, copy
                     args.push('-i', videoFile.path);
                     args.push('-c', 'copy');
                     args.push(outputPath);
                 } else {
                     // 3. Construct Keep Segments (Invert silence)
                     const keepSegments = [];
                     let lastEnd = 0;
                     silenceSegments.forEach(seg => {
                         if (seg.start > lastEnd) {
                             keepSegments.push({ start: lastEnd, end: seg.start });
                         }
                         lastEnd = seg.end;
                     });
                     if (lastEnd < duration) {
                         keepSegments.push({ start: lastEnd, end: duration });
                     }

                     // 4. Construct Filter Complex
                     let filterComplex = "";
                     keepSegments.forEach((seg, i) => {
                         filterComplex += `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}];`;
                         filterComplex += `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}];`;
                     });
                     
                     keepSegments.forEach((_, i) => {
                         filterComplex += `[v${i}][a${i}]`;
                     });
                     filterComplex += `concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`;

                     args.push('-i', videoFile.path);
                     args.push('-filter_complex', filterComplex);
                     args.push('-map', '[outv]', '-map', '[outa]');
                     args.push('-c:v', 'libx264', '-preset', 'superfast', '-c:a', 'aac');
                     args.push(outputPath);
                 }
             }
             break;

        case 'auto-ducking-real':
             const voiceFile = job.files.audio ? job.files.audio[0] : null;
             if (!voiceFile) { job.status = 'failed'; job.error = 'Arquivo de voz não encontrado.'; return; }
             const dThresh = params.threshold || 0.125;
             const dRatio = params.ratio || 2;
             args.push('-i', videoFile.path); // Main audio
             args.push('-i', voiceFile.path); // Control audio
             args.push('-filter_complex', `[0][1]sidechaincompress=threshold=${dThresh}:ratio=${dRatio}:attack=20:release=300[out]`);
             args.push('-map', '[out]', '-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;

        case 'voice-clone': {
             // If apiKey provided, use ElevenLabs Instant Cloning logic
             // Otherwise, fallback to "save recording"
             const apiKey = job.params.apiKey;
             
             if (apiKey && apiKey.length > 5) {
                 try {
                     console.log(`[Job ${jobId}] Starting ElevenLabs Instant Clone...`);
                     const textToSpeak = params.text || "Hello, this is my cloned voice.";
                     
                     // 1. Add Voice
                     const addVoiceFormData = new FormData();
                     addVoiceFormData.append('name', `Clone ${Date.now()}`);
                     // We must read the file to append to FormData
                     const fileBuffer = fs.readFileSync(videoFile.path);
                     const blob = new Blob([fileBuffer], { type: 'audio/mpeg' }); // Use Blob polyfill or native if available in Node 18+
                     addVoiceFormData.append('files', blob, 'sample.mp3');
                     addVoiceFormData.append('description', 'Instant Clone from ProEdit');

                     const addRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
                         method: 'POST',
                         headers: { 'xi-api-key': apiKey },
                         body: addVoiceFormData
                     });

                     if (!addRes.ok) {
                         const err = await addRes.text();
                         throw new Error(`ElevenLabs Add Voice failed: ${err}`);
                     }
                     const addData = await addRes.json();
                     const voiceId = addData.voice_id;
                     console.log(`[Job ${jobId}] Voice created: ${voiceId}`);

                     // 2. Generate Audio (TTS)
                     const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                         method: 'POST',
                         headers: { 
                             'xi-api-key': apiKey,
                             'Content-Type': 'application/json'
                         },
                         body: JSON.stringify({
                             text: textToSpeak,
                             model_id: "eleven_multilingual_v2",
                             voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                         })
                     });

                     if (!ttsRes.ok) {
                         throw new Error(`ElevenLabs TTS failed: ${await ttsRes.text()}`);
                     }

                     const arrayBuffer = await ttsRes.arrayBuffer();
                     fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
                     
                     // Skip ffmpeg, done
                     job.status = 'completed';
                     job.progress = 100;
                     job.downloadUrl = `/api/process/download/${jobId}`;
                     return;

                 } catch (e) {
                     console.error(`[Job ${jobId}] Clone Error:`, e);
                     // Fallback to simple copy if API fails
                     job.error = "Cloning API failed, saving original recording.";
                     // Proceed to ffmpeg copy below
                 }
             }
             // Fallback: Just copy/convert the recorded audio
             args.push('-i', videoFile.path);
             args.push('-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;
        }

        case 'extract-audio-real':
             args.push('-i', videoFile.path);
             args.push('-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2');
             args.push(outputPath);
             break;

        case 'reduce-noise-real':
             args.push('-i', videoFile.path);
             args.push('-af', 'afftdn', '-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;

        case 'voice-fx-real': {
             const preset = params.preset || 'robot';
             let filters = [];
             if(preset === 'robot') filters.push("asetrate=11025*0.9,aresample=44100,atempo=1.1");
             else if(preset === 'squirrel') filters.push("asetrate=44100*1.5,aresample=44100,atempo=0.7");
             else if(preset === 'monster') filters.push("asetrate=44100*0.6,aresample=44100,atempo=1.3");
             else if(preset === 'echo') filters.push("aecho=0.8:0.9:1000:0.3");
             else if(preset === 'radio') filters.push("highpass=f=200,lowpass=f=3000");
             args.push('-i', videoFile.path);
             args.push('-af', filters.join(','));
             args.push('-vn', '-acodec', 'pcm_s16le');
             args.push(outputPath);
             break;
        }

        case 'image-to-video-motion':
             if (!inputIsImage) { job.status = 'failed'; job.error = "Input must be an image."; return; }
             const motionMode = params.mode || 'zoom-in';
             const d = 5; // duration 5s
             
             args.push('-loop', '1');
             args.push('-i', videoFile.path);
             
             let zoomExpr = "";
             if (motionMode === 'zoom-in') zoomExpr = `zoom+0.0015`;
             else if (motionMode === 'zoom-out') zoomExpr = `if(eq(on,1), 1.5, zoom-0.0015)`;
             else if (motionMode === 'pan-right') zoomExpr = `1.2`;
             
             let xExpr = "iw/2-(iw/zoom/2)";
             let yExpr = "ih/2-(ih/zoom/2)";
             
             if (motionMode === 'pan-right') {
                 xExpr = "x-1"; 
             }

             args.push('-vf', `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${d*25}:s=1280x720,format=yuv420p`);
             args.push('-t', d.toString());
             args.push('-c:v', 'libx264', '-preset', 'ultrafast');
             args.push(outputPath);
             break;

        case 'particles-real':
             const pType = params.type || 'rain';
             
             if (inputIsImage) {
                 args.push('-loop', '1');
                 args.push('-t', '5');
                 args.push('-i', videoFile.path);
             } else {
                 args.push('-i', videoFile.path);
             }

             let filterComplex = "";
             if (pType === 'rain') {
                 filterComplex = `nullsrc=size=1280x720[glass];noise=alls=20:allf=t+u[noise];[glass][noise]overlay=format=auto,geq=r='if(gt(random(1),0.98),255,0)':g='if(gt(random(1),0.98),255,0)':b='if(gt(random(1),0.98),255,0)'[rain];[0:v]scale=1280:720[base];[base][rain]overlay`;
             } else if (pType === 'snow') {
                 filterComplex = `nullsrc=size=1280x720[glass];noise=alls=100:allf=t+u[noise];[glass][noise]overlay,scale=iw*0.1:ih*0.1,scale=iw*10:ih*10:flags=neighbor[snow];[0:v]scale=1280:720[base];[base][snow]overlay=format=auto:shortest=1`;
             } else if (pType === 'old_film') {
                 filterComplex = `[0:v]eq=saturation=0[bw];nullsrc=size=1280x720[glass];noise=alls=20:allf=t+u[noise];[bw][noise]overlay=shortest=1[grain];[grain]vignette=PI/4[outv]`;
             } else if (pType === 'nightclub') {
                 args.push('-vf', 'hue=H=2*PI*t:s=sin(2*PI*t)+1');
             }

             if (pType !== 'nightclub') {
                 args.push('-filter_complex', filterComplex);
                 if (pType === 'old_film') args.push('-map', '[outv]');
             }
             
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
             if (!inputIsImage) args.push('-c:a', 'copy');
             args.push(outputPath);
             break;

        case 'colorize-real':
             args.push('-i', videoFile.path);
             args.push('-vf', 'eq=saturation=2.0:brightness=0.05:contrast=1.1');
             if (outputExtension === '.mp4') args.push('-c:v', 'libx264', '-preset', 'ultrafast');
             args.push(outputPath);
             break;

        default:
             job.status = 'failed'; job.error = "Action not supported."; return;
    }

    // --- FIX FOR SINGLE IMAGE OUTPUT ---
    if (outputExtension === '.png' || outputExtension === '.jpg') {
        // If args don't already have -frames:v or -update, add one to prevent infinite loop or sequence error
        // The most compatible way for single image out is -frames:v 1
        if (!args.includes('-frames:v') && !args.includes('-update')) {
            // Insert before output path (last arg)
            const out = args.pop();
            args.push('-frames:v', '1');
            args.push(out);
        }
    }

    // SPAWN PROCESS
    console.log(`[Job ${jobId}] Spawning: ffmpeg ${args.join(' ')}`);
    
    let totalDuration = 0;
    const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoFile.path}"`;
    exec(probeCmd, (err, stdout) => {
        if(!err) totalDuration = parseFloat(stdout);
        args.unshift("-progress", "pipe:1");
        const ffmpeg = spawn('ffmpeg', args);
        
        ffmpeg.stdout.on('data', (data) => {
            const str = data.toString();
            const timeMatch = str.match(/out_time_ms=(\d+)/);
            if (timeMatch && totalDuration > 0) {
                const progress = Math.min(99, (parseInt(timeMatch[1]) / 1000000 / totalDuration) * 100);
                job.progress = progress;
            }
        });

        ffmpeg.stderr.on('data', (data) => console.log(`[FFmpeg Error] ${data}`));

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                job.status = 'completed';
                job.progress = 100;
                job.downloadUrl = `/api/process/download/${jobId}`;
            } else {
                job.status = 'failed';
                job.error = "FFmpeg process failed.";
            }
        });
    });
}

app.post('/api/process/generate-music', uploadAny, async (req, res) => {
    const { prompt, duration, hfToken, pixabayKey } = req.body;
    const jobId = `music_gen_${Date.now()}`;
    const outputFilename = `ai_music_${Date.now()}.wav`; // Using .wav for safety
    const outputPath = path.join(uploadDir, outputFilename);
    const dur = parseFloat(duration) || 10;
    
    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });

    try {
        // Priority 1: Hugging Face MusicGen
        if (hfToken && hfToken.length > 5) {
            console.log(`[Job ${jobId}] Using MusicGen (HF)`);
            const hfRes = await fetch("https://api-inference.huggingface.co/models/facebook/musicgen-small", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${hfToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ inputs: prompt }),
            });

            if (hfRes.ok) {
                const arrayBuffer = await hfRes.arrayBuffer();
                // MusicGen API returns raw bytes, usually FLAC or WAV
                const tempPath = path.join(uploadDir, `temp_musicgen_${Date.now()}.flac`);
                fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));

                // Loop/Trim to desired duration using FFmpeg
                // -stream_loop -1 with -t works for looping input
                const cmd = `ffmpeg -stream_loop -1 -i "${tempPath}" -t ${dur} -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
                exec(cmd, (err) => {
                    if(fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "FFmpeg loop failed."; }
                    else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
                });
                return;
            } else {
                console.warn("MusicGen API failed, falling back to Pixabay/Procedural.");
            }
        }

        // Priority 3: Procedural Generation (FFmpeg Synth)
        // Advanced Drone/Ambient Generator based on prompt keywords
        console.log(`[Job ${jobId}] Using Procedural Generation`);
        let filter = "anoisesrc=a=0.1:c=pink:d=" + dur + ",lowpass=f=200"; // Default Drone
        
        const lowerPrompt = (prompt || "").toLowerCase();
        if (lowerPrompt.includes("techno") || lowerPrompt.includes("beat")) {
             // Simple beat: noise + gate or similar. Hard in pure lavfi without complex graph.
             // We'll stick to an abstract glitched beat.
             filter = `aevalsrc='0.1*sin(2*PI*t*120/60)*tan(2*PI*t*60)':d=${dur},lowpass=f=400`; 
        } else if (lowerPrompt.includes("piano") || lowerPrompt.includes("sad")) {
             // Sine tones (organ-like)
             filter = `sine=f=440:d=${dur},tremolo=f=5:d=0.5`;
        } else if (lowerPrompt.includes("sci-fi") || lowerPrompt.includes("space")) {
             // Space drone
             filter = `anoisesrc=d=${dur}:c=brown,lowpass=f=100,flanger`;
        }

        const command = `ffmpeg -f lavfi -i "${filter}" -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`;
        exec(command, (err) => {
            if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "Erro na síntese."; } 
            else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
        });

    } catch (e) {
        jobs[jobId].status = 'failed'; 
        jobs[jobId].error = e.message;
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
