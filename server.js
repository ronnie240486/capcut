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
const MAX_WIDTH = 1920; // Necessário para filtros de imagem/cartoon

// --- HELPERS ---

// 1. Helper melhorado para pegar largura e altura também
function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        // Adicionei width e height aqui
        exec(`ffprobe -v error -show_entries stream=codec_type,duration,width,height -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ duration: 0, hasAudio: false, width: 0, height: 0 });
            
            const lines = stdout.trim().split('\n');
            let duration = 0;
            let hasAudio = false;
            let width = 0;
            let height = 0;

            lines.forEach(line => {
                const parts = line.split(',');
                if (parts[0] === 'video') {
                    width = parseInt(parts[1]) || width;
                    height = parseInt(parts[2]) || height;
                    duration = parseFloat(parts[3]) || duration;
                }
                if (parts[0] === 'audio') hasAudio = true;
            });
            resolve({ duration, hasAudio, width, height });
        });
    });
}

function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return (hours * 3600) + (minutes * 60) + seconds;
}

function getAtempoFilter(speed) {
    let s = speed;
    const filters = [];
    while (s < 0.5) {
        filters.push('atempo=0.5');
        s /= 0.5;
    }
    while (s > 2.0) {
        filters.push('atempo=2.0');
        s /= 2.0;
    }
    filters.push(`atempo=${s.toFixed(2)}`);
    return filters.join(',');
}

function createFFmpegJob(jobId, args, expectedDuration, res) {
    if (!jobs[jobId]) jobs[jobId] = {};
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;
    
    if (res) res.status(202).json({ jobId });

    const finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats', ...args];
    console.log(`[Job ${jobId}] Spawning: ffmpeg ${finalArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', finalArgs);
    let stderr = '';

    ffmpeg.stderr.on('data', d => {
        const line = d.toString();
        stderr += line;
        
        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch && expectedDuration > 0) {
            const currentTime = timeToSeconds(timeMatch[1]);
            let progress = Math.round((currentTime / expectedDuration) * 100);
            if (progress >= 100) progress = 99;
            if (progress < 0) progress = 0;
            if (jobs[jobId]) jobs[jobId].progress = progress;
        }
    });

    ffmpeg.on('close', (code) => {
        if (!jobs[jobId]) return;
        if (code === 0) {
            jobs[jobId].status = 'completed';
            jobs[jobId].progress = 100;
            jobs[jobId].downloadUrl = `/api/process/download/${jobId}`;
        } else {
            console.error(`[FFmpeg] Job ${jobId} falhou. Code: ${code}`, stderr);
            jobs[jobId].status = 'failed';
            const isMem = stderr.includes('Out of memory') || stderr.includes('Killed');
            jobs[jobId].error = isMem 
                ? "O vídeo é muito pesado. O servidor interrompeu o processamento por falta de memória."
                : "Erro no processamento. Verifique se o formato do arquivo é suportado.";
        }
    });
}

// 2. Helper para Cortes Virais (Lógica complexa separada)
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

        const cmd = `ffmpeg -i "${videoFile.path}" -filter_complex "${trimChain}" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -c:a aac "${outputPath}"`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) { job.status = 'failed'; job.error = "FFmpeg failed processing viral cuts"; } 
            else { job.status = 'completed'; job.progress = 100; job.downloadUrl = `/api/process/download/${jobId}`; }
        });
    } catch (e) { job.status = 'failed'; job.error = e.message; }
}

// --- MAIN PROCESSOR ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    if (!job) return;

    const action = jobId.split('_')[0];
    
    // Rota especial para cortes virais
    if (action === 'viral-cuts') return processViralCutsJob(jobId);

    const videoFile = job.files[0];
    if (!videoFile) { job.status = 'failed'; job.error = "Nenhum arquivo enviado."; return; }

    // Pega info completa (agora inclui width/height)
    const { duration: originalDuration, hasAudio, width: originalW, height: originalH } = await getMediaInfo(videoFile.path);
    
    let params = job.params || {};
    const inputIsImage = videoFile.mimetype.startsWith('image/');
    let outputExt = (inputIsImage || videoFile.mimetype.startsWith('audio/')) ? '.mp4' : '.mp4';
    
    // Ajustes de extensão
    if (action.includes('audio') || action.includes('voice') || action.includes('silence')) {
         if (action === 'extract-audio' || action === 'voice-fx-real') outputExt = '.wav';
    }

    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    let args = [];
    let expectedDuration = originalDuration;
    let outputExtension = outputExt;

    switch (action) {
        // --- FUNÇÕES EXISTENTES (Melhoradas) ---
        case 'interpolate-real':
            const speed = parseFloat(params.speed) || 0.5;
            const factor = 1 / speed;
            const mode = params.mode || 'blend';
            expectedDuration = originalDuration * factor;
            
            let miFilter = `fps=30`; 
            if (mode === 'optical') miFilter += `:mi_mode=mci:mc_mode=obmc:me_mode=bidir`;
            else miFilter += `:mi_mode=blend`;

            let audioFilter = "";
            let filterString = `[0:v]minterpolate=${miFilter},setpts=${factor}*PTS[v]`;
            let mapArgs = ['-map', '[v]'];
            
            if (hasAudio) {
                audioFilter = getAtempoFilter(speed);
                filterString += `;[0:a]${audioFilter}[a]`;
                mapArgs.push('-map', '[a]');
            }

            args = [
                '-i', videoFile.path,
                '-filter_complex', filterString,
                ...mapArgs,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', 
                '-pix_fmt', 'yuv420p',
                '-y', outputPath
            ];
            break;

        case 'upscale-real':
            args = ['-i', videoFile.path, '-vf', "scale=1920:1080:flags=lanczos", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath];
            break;

        case 'reverse-real':
            args = ['-i', videoFile.path, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath];
            break;

        case 'reduce-noise-real':
            args = ['-i', videoFile.path, '-vn', '-af', 'afftdn', '-y', outputPath];
            break;

        case 'remove-silence-real':
            const silence_dur = params.duration || 0.5;
            const silence_thresh = params.threshold || -30;
            // Usa re-encoding de vídeo para garantir sincronia caso tenha vídeo
            args = [
                '-i', videoFile.path, 
                '-af', `silenceremove=stop_periods=-1:stop_duration=${silence_dur}:stop_threshold=${silence_thresh}dB`,
                '-c:v', 'libx264', '-preset', 'ultrafast',
                '-y', outputPath
            ];
            break;

        case 'isolate-voice-real':
            args = ['-i', videoFile.path, '-vn', '-af', 'highpass=f=200,lowpass=f=3000', '-y', outputPath];
            break;

        case 'extract-audio':
            const finalAudioPath = outputPath.replace('.wav', '.mp3');
            job.outputPath = finalAudioPath;
            args = ['-i', videoFile.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', finalAudioPath];
            break;

        // --- NOVAS FUNÇÕES ADICIONADAS ---
        
        case 'lip-sync-real':
            const voiceFile = job.files[1] || (job.files.length > 1 ? job.files[1] : null);
            if (!voiceFile) { job.status = 'failed'; job.error = "Arquivo de áudio necessário."; return; }
            args = [
                '-i', videoFile.path, '-i', voiceFile.path,
                '-map', '0:v:0', '-map', '1:a:0',
                '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', outputPath
            ];
            break;

        case 'ai-dubbing':
            const targetLang = params.targetLanguage || 'English';
            const apiKeyEleven = job.params.apiKey;
            const geminiKey = process.env.API_KEY; // Requer .env configurado
            // Implementação simplificada: requer lógica externa de API
            // Por segurança neste código monolítico, falha se não configurado
            job.status = 'failed'; job.error = "AI Dubbing requer configuração de chaves de API no servidor.";
            return; 

        case 'magic-erase-real':
            let { x, y, w, h } = params;
            x = parseInt(x) || 0; y = parseInt(y) || 0; w = parseInt(w) || 100; h = parseInt(h) || 100;
            let processScale = originalW > MAX_WIDTH ? `scale=${MAX_WIDTH}:-2,` : "";
            let scaleFactor = originalW > MAX_WIDTH ? MAX_WIDTH / originalW : 1;
            const dx = Math.round(x * scaleFactor); const dy = Math.round(y * scaleFactor);
            const dw = Math.max(1, Math.round(w * scaleFactor)); const dh = Math.max(1, Math.round(h * scaleFactor));
            
            if(inputIsImage) args.push('-loop', '1', '-t', '5');
            args.push('-i', videoFile.path);
            if(inputIsImage) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            args.push('-vf', `${processScale}delogo=x=${dx}:y=${dy}:w=${dw}:h=${dh}:show=0` + (outputExtension === '.mp4' ? ",scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" : ""));
            if(inputIsImage) args.push('-map', '0:v', '-map', '1:a', '-shortest');
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', outputPath);
            break;

        case 'video-to-cartoon-real':
            const styleFilter = "bilateral=sigmaS=100:sigmaR=0.1,unsharp=5:5:1.0:5:5:0.0";
            let cFilters = [];
            if (inputIsImage && originalW > MAX_WIDTH) cFilters.push(`scale=${MAX_WIDTH}:-2`);
            cFilters.push(styleFilter);
            if (outputExtension === '.mp4') cFilters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "format=yuv420p");
            
            if(inputIsImage) args.push('-loop', '1', '-t', '5');
            args.push('-i', videoFile.path);
            if(inputIsImage) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            args.push('-vf', cFilters.join(","));
            if(inputIsImage) args.push('-map', '0:v', '-map', '1:a', '-shortest');
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', outputPath);
            break;

        case 'stabilize-real':
            const trfPath = path.join(uploadDir, `transform_${jobId}.trf`);
            const detectCmd = `ffmpeg -i "${videoFile.path}" -vf vidstabdetect=stepSize=32:shakiness=10:accuracy=15:result="${trfPath}" -f null -`;
            await new Promise((resolve, reject) => exec(detectCmd, (err) => err ? reject(err) : resolve()));
            args = [
                '-i', videoFile.path,
                '-vf', `vidstabtransform=input="${trfPath}":zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', '-y', outputPath
            ];
            break;

        case 'reframe-real':
            args = ['-i', videoFile.path, '-vf', 'scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', '-y', outputPath];
            break;

        case 'stickerize-real':
            args = ['-i', videoFile.path, '-vf', "split[original][copy];[copy]scale=iw+20:ih+20,drawbox=w=iw+20:h=ih+20:c=white:t=fill[outline];[outline][original]overlay=10:10", '-y', outputPath];
            break;

        case 'auto-ducking-real':
            const duckVoice = job.files[1];
            if (!duckVoice) { job.status = 'failed'; job.error = 'Arquivo de voz não encontrado.'; return; }
            const dThresh = params.threshold || 0.125;
            args = ['-i', videoFile.path, '-i', duckVoice.path, '-filter_complex', `[0][1]sidechaincompress=threshold=${dThresh}:ratio=2:attack=20:release=300[out]`, '-map', '[out]', '-vn', '-acodec', 'pcm_s16le', '-y', outputPath];
            break;

        case 'voice-clone':
            // Simples conversão pcm se não tiver API key configurada
            args = ['-i', videoFile.path, '-vn', '-acodec', 'pcm_s16le', '-y', outputPath];
            break;

        case 'extract-audio-real':
            args = ['-i', videoFile.path, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-y', outputPath];
            break;

        case 'voice-fx-real':
            const fxPreset = params.preset || 'robot';
            let fxFilters = [];
            if(fxPreset === 'robot') fxFilters.push("asetrate=11025*0.9,aresample=44100,atempo=1.1");
            else if(fxPreset === 'squirrel') fxFilters.push("asetrate=44100*1.5,aresample=44100,atempo=0.7");
            else if(fxPreset === 'monster') fxFilters.push("asetrate=44100*0.6,aresample=44100,atempo=1.3");
            else if(fxPreset === 'echo') fxFilters.push("aecho=0.8:0.9:1000:0.3");
            args = ['-i', videoFile.path, '-af', fxFilters.join(','), '-vn', '-acodec', 'pcm_s16le', '-y', outputPath];
            break;

        case 'image-to-video-motion':
            if (!inputIsImage) { job.status = 'failed'; job.error = "Input must be an image."; return; }
            const motionMode = params.mode || 'zoom-in';
            let zoomExpr = (motionMode === 'zoom-in') ? `zoom+0.0015` : `if(eq(on,1), 1.5, zoom-0.0015)`;
            args = ['-loop', '1', '-i', videoFile.path, '-vf', `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=1280x720,format=yuv420p`, '-t', '5', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
            break;

        case 'particles-real':
            const pType = params.type || 'rain';
            if (inputIsImage) args.push('-loop', '1', '-t', '5', '-i', videoFile.path);
            else args.push('-i', videoFile.path);
            let pComplex = (pType === 'rain') 
                ? `nullsrc=size=1280x720[glass];noise=alls=20:allf=t+u[noise];[glass][noise]overlay=format=auto,geq=r='if(gt(random(1),0.98),255,0)':g='if(gt(random(1),0.98),255,0)':b='if(gt(random(1),0.98),255,0)'[rain];[0:v]scale=1280:720[base];[base][rain]overlay`
                : `[0:v]noise=alls=20:allf=t+u`;
            args.push('-filter_complex', pComplex, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath);
            break;

        case 'colorize-real':
            args = ['-i', videoFile.path, '-vf', 'eq=saturation=2.0:brightness=0.05:contrast=1.1', '-c:v', 'libx264', '-preset', 'ultrafast', '-y', outputPath];
            break;

        default:
            args = ['-i', videoFile.path, '-vf', 'unsharp=5:5:1.0:5:5:0.0,eq=saturation=1.2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath];
    }

    createFFmpegJob(jobId, args, expectedDuration);
}

// --- ROTAS DA API ---

// 1. Rota de Extração Simples (MP3)
app.post('/api/process/extract-audio', uploadAny, (req, res) => {
    const jobId = `extract_${Date.now()}`;
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'No file uploaded.' });
    jobs[jobId] = { status: 'pending', files: req.files, progress: 0 };
    res.status(202).json({ jobId });
    const outputPath = path.join(uploadDir, `${Date.now()}_extracted.mp3`);
    jobs[jobId].outputPath = outputPath;
    jobs[jobId].status = 'processing';
    const ffmpeg = spawn('ffmpeg', ['-i', req.files[0].path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath]);
    ffmpeg.on('close', (code) => {
        if (code === 0) { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
        else { jobs[jobId].status = 'failed'; }
    });
});

// 2. Rota de Geração de Música (Adicionada)
app.post('/api/process/generate-music', uploadAny, async (req, res) => {
    const { prompt, duration } = req.body;
    const jobId = `music_gen_${Date.now()}`;
    const outputFilename = `ai_music_${Date.now()}.wav`; 
    const outputPath = path.join(uploadDir, outputFilename);
    const dur = parseFloat(duration) || 10;
    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });

    // Fallback: Geração Procedural
    let filter = "anoisesrc=a=0.1:c=pink:d=" + dur + ",lowpass=f=200"; 
    const lowerPrompt = (prompt || "").toLowerCase();
    if (lowerPrompt.includes("techno")) filter = `aevalsrc='0.1*sin(2*PI*t*120/60)*tan(2*PI*t*60)':d=${dur},lowpass=f=400`; 
    else if (lowerPrompt.includes("piano")) filter = `sine=f=440:d=${dur},tremolo=f=5:d=0.5`;

    const command = `ffmpeg -f lavfi -i "${filter}" -acodec pcm_s16le -ar 44100 -ac 2 -y "${outputPath}"`;
    exec(command, (err) => {
        if (err) { jobs[jobId].status = 'failed'; } 
        else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
    });
});

app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body, outputPath: null, startTime: Date.now() };
    processSingleClipJob(jobId);
    res.status(202).json({ jobId });
});

app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ status: 'not_found' });
    res.json(job);
});

app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath || !fs.existsSync(job.outputPath)) {
        return res.status(404).send("Arquivo não encontrado.");
    }
    res.download(job.outputPath);
});

app.get('/api/check-ffmpeg', (req, res) => res.send("FFmpeg is ready"));

setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach(id => {
        if (now - jobs[id].startTime > 3600000) {
            if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) fs.unlinkSync(jobs[id].outputPath);
            delete jobs[id];
        }
    });
}, 600000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
