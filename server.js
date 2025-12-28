
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

// --- HELPERS ---
function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', path.resolve(filePath)]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => stderr += d.toString());
        ffmpeg.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)));
    });
}

function isImage(filename) {
    return /\.(jpe?g|png|webp|gif)$/i.test(filename);
}

function getStyleFilter(style) {
    const filters = {
        'anime_vibrant': 'unsharp=5:5:1.0:5:5:0.0,curves=all="0/0 0.1/0.15 0.5/0.6 1/1",saturate=1.5',
        'pixar': 'bilateral=sigmaS=5:sigmaR=0.1,curves=all="0/0 0.5/0.45 1/1",saturate=1.3',
        'sketch': 'edgedetect=low=0.1:high=0.4,negate',
        'noir': 'format=gray,curves=all="0/0 0.3/0.1 0.7/0.9 1/1"',
        'cyberpunk': 'curves=r="0/0 0.5/0.6 1/1":g="0/0 0.5/0.4 1/1":b="0/0 0.5/0.7 1/1",saturate=2'
    };
    return filters[style] || filters['anime_vibrant'];
}

function createFFmpegJob(jobId, args, res) {
    jobs[jobId] = { status: 'processing', progress: 0 };
    if (res) res.status(202).json({ jobId });

    console.log(`Starting FFmpeg job ${jobId} with args:`, args.join(' '));

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', d => {
        stderr += d.toString();
        if (stderr.includes('frame=')) jobs[jobId].progress = 50;
    });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            jobs[jobId].status = 'failed';
            jobs[jobId].error = stderr;
        }
    });
}

// --- VIRAL CUTS LOGIC ---
async function processViralCutsJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing'; job.progress = 10;
    try {
        const videoFile = job.files[0];
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

        const cmd = `ffmpeg -i "${videoFile.path}" -filter_complex "${trimChain}" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -c:a aac -y "${outputPath}"`;
        exec(cmd, (error) => {
            if (error) { job.status = 'failed'; job.error = "FFmpeg viral cuts failed"; } 
            else { job.status = 'completed'; job.progress = 100; job.downloadUrl = `/api/process/download/${jobId}`; }
        });
    } catch (e) { job.status = 'failed'; job.error = e.message; }
}

// --- SINGLE CLIP JOB LOGIC (INTEGRATED) ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    job.status = 'processing'; job.progress = 0;

    const action = jobId.split('_')[0];
    const videoFile = job.files[0];
    if (!videoFile && action !== 'voice-clone') {
         job.status = 'failed'; job.error = "No media file provided."; return;
    }

    let params = job.params || {};
    const inputIsImg = isImage(videoFile.originalname);
    let outputExt = inputIsImg ? '.png' : '.mp4';
    
    // Override extensions based on action
    if (['extract-audio-real', 'reduce-noise-real', 'isolate-voice-real', 'voice-clone'].includes(action)) outputExt = '.wav';
    if (action === 'rotoscope-real' && !inputIsImg) outputExt = '.webm';

    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    let args = [];

    switch (action) {
        case 'rotoscope-real':
             const color = (params.color || '#00FF00').replace('#', '0x');
             args.push('-i', videoFile.path, '-vf', `chromakey=${color}:0.3:0.1`);
             if (outputExt === '.webm') args.push('-c:v', 'libvpx-vp9', '-auto-alt-ref', '0');
             args.push(outputPath);
             break;

        case 'ai-dubbing':
            const targetLang = params.targetLanguage || 'English';
            const apiKeyEleven = params.apiKey;
            const geminiKey = process.env.API_KEY;

            try {
                // 1. Extrair Áudio
                const extractedAudioPath = path.join(uploadDir, `temp_extract_${jobId}.mp3`);
                await new Promise((res, rej) => exec(`ffmpeg -i "${videoFile.path}" -vn -acodec libmp3lame "${extractedAudioPath}"`, (err) => err ? rej(err) : res()));

                // 2. Gemini 3 Flash (Traduzir)
                const audioBuffer = fs.readFileSync(extractedAudioPath);
                const geminiPayload = {
                    contents: [{ parts: [{ inline_data: { mime_type: "audio/mp3", data: audioBuffer.toString('base64') } }, { text: `Transcreva e traduza para ${targetLang}. Retorne APENAS o texto traduzido.` }] }]
                };
                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiPayload) });
                const geminiData = await geminiRes.json();
                const translatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

                // 3. ElevenLabs (Clone + TTS)
                // Nota: FormData no Node requer construção manual ou pacote form-data
                const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/eleven_multilingual_v2`, { 
                    method: 'POST', 
                    headers: { 'xi-api-key': apiKeyEleven, 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ text: translatedText, model_id: "eleven_multilingual_v2" }) 
                });
                const dubbedAudioPath = path.join(uploadDir, `dubbed_${jobId}.mp3`);
                fs.writeFileSync(dubbedAudioPath, Buffer.from(await ttsRes.arrayBuffer()));

                // 4. Merge
                args = ['-i', videoFile.path, '-i', dubbedAudioPath, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', outputPath];
                createFFmpegJob(jobId, args); return;
            } catch (e) { job.status = 'failed'; job.error = e.message; return; }

        case 'interpolate-real':
            const speed = params.speed || 0.5;
            const factor = 1 / speed;
            args = ['-i', videoFile.path, '-filter_complex', `[0:v]minterpolate=fps=60:mi_mode=mci,setpts=${factor}*PTS[v];[0:a]atempo=${speed}[a]`, '-map', '[v]', '-map', '[a]', '-y', outputPath];
            break;

        case 'reverse-real':
            args = ['-i', videoFile.path, '-vf', 'reverse', '-af', 'areverse', '-y', outputPath];
            break;

        case 'upscale-real':
            args = ['-i', videoFile.path, '-vf', "scale=3840:2160:flags=lanczos", '-y', outputPath];
            break;

        default:
            // Fallback para filtros simples do FFmpeg
            const filter = getStyleFilter(action);
            args = ['-i', videoFile.path, '-vf', filter, '-y', outputPath];
    }

    createFFmpegJob(jobId, args);
}

// --- ENDPOINTS ---

app.post('/api/process/viral-cuts', uploadAny, (req, res) => {
    const jobId = `viral_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processViralCutsJob(jobId);
});

app.post('/api/process/generate-music', uploadAny, async (req, res) => {
    const { prompt, duration, hfToken } = req.body;
    const jobId = `music_gen_${Date.now()}`;
    const outputPath = path.join(uploadDir, `music_${Date.now()}.wav`);
    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });

    try {
        if (hfToken) {
            const hfRes = await fetch("https://api-inference.huggingface.co/models/facebook/musicgen-small", { method: "POST", headers: { Authorization: `Bearer ${hfToken}` }, body: JSON.stringify({ inputs: prompt }) });
            if (hfRes.ok) {
                fs.writeFileSync(outputPath, Buffer.from(await hfRes.arrayBuffer()));
                jobs[jobId].status = 'completed'; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
                return;
            }
        }
        // Fallback Procedural
        exec(`ffmpeg -f lavfi -i "anoisesrc=d=${duration}:c=pink,lowpass=f=200" -y "${outputPath}"`, (err) => {
            if (err) jobs[jobId].status = 'failed';
            else { jobs[jobId].status = 'completed'; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
        });
    } catch (e) { jobs[jobId].status = 'failed'; job.error = e.message; }
});

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body };
    res.status(202).json({ jobId });
    processSingleClipJob(jobId);
});

// Reutilizando lógica existente de status/download/export/audio_proc
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
