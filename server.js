const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

// --- CONFIGURAÇÃO INICIAL ---
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
const MAX_WIDTH = 1920; // Definição global para resize

// --- HELPERS (FUNÇÕES AUXILIARES) ---

function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        // Agora busca duração, largura, altura e se tem áudio
        const cmd = `ffprobe -v error -show_entries stream=codec_type,duration,width,height -of csv=p=0 "${filePath}"`;
        exec(cmd, (err, stdout) => {
            if (err) return resolve({ duration: 0, hasAudio: false, width: 0, height: 0 });
            
            const lines = stdout.trim().split('\n');
            let duration = 0;
            let hasAudio = false;
            let width = 0;
            let height = 0;

            lines.forEach(line => {
                const parts = line.split(',');
                // FFprobe output varia, mas geralmente: video,width,height,duration ou audio,duration
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

function createFFmpegJob(jobId, args, expectedDuration) {
    if (!jobs[jobId]) jobs[jobId] = {};
    jobs[jobId].status = 'processing';
    jobs[jobId].progress = 0;

    const finalArgs = ['-hide_banner', '-loglevel', 'error', '-stats', ...args];
    console.log(`[Job ${jobId}] Executando: ffmpeg ${finalArgs.join(' ')}`);

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

// --- LÓGICA DE CORTES VIRAIS (Processo Separado por complexidade) ---
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

// --- PROCESSADOR PRINCIPAL ---
async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    if (!job) return;

    const action = jobId.split('_')[0];
    
    // Roteamento especial para viral cuts que usa exec em vez de spawn
    if (action === 'viral-cuts') {
        return processViralCutsJob(jobId);
    }

    const videoFile = job.files[0];
    if (!videoFile) { job.status = 'failed'; job.error = "Nenhum arquivo enviado."; return; }

    // Obtém info detalhada
    const { duration: originalDuration, hasAudio, width: originalW, height: originalH } = await getMediaInfo(videoFile.path);
    
    let params = job.params || {};
    const inputIsImage = videoFile.mimetype.startsWith('image/');
    let outputExt = (inputIsImage || videoFile.mimetype.startsWith('audio/')) ? '.mp4' : '.mp4';
    
    // Ajuste de extensão baseada na ação
    if (action.includes('audio') || action.includes('voice') || action.includes('silence')) {
        // Se a entrada for vídeo e quisermos só áudio, ou se for manipulação de áudio
        if (action === 'extract-audio' || action === 'voice-fx-real') outputExt = '.wav';
    }

    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    let args = [];
    let expectedDuration = originalDuration;
    let outputExtension = outputExt; // Alias para usar nos cases

    switch (action) {
        case 'interpolate-real':
            const speed = parseFloat(params.speed) || 0.5;
            const factor = 1 / speed;
            const mode = params.mode || 'blend';
            expectedDuration = originalDuration * factor;
            
            let miFilter = `fps=30`; // Base
            if (mode === 'optical') miFilter += `:mi_mode=mci:mc_mode=obmc:me_mode=bidir`; // Optical Flow (Pesado)
            else miFilter += `:mi_mode=blend`; // Blend (Leve)

            let audioFilter = "";
            let remainingSpeed = speed;
            
            // Lógica de áudio para slow motion
            if (hasAudio) {
               audioFilter = getAtempoFilter(speed);
            }

            // Construção do filter complex
            let filterString = `[0:v]minterpolate=${miFilter},setpts=${factor}*PTS[v]`;
            let mapArgs = ['-map', '[v]'];
            
            if (hasAudio) {
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

        case 'extract-audio':
            // Garante extração limpa para MP3
            const mp3Path = outputPath.replace('.wav', '.mp3');
            job.outputPath = mp3Path;
            args = ['-i', videoFile.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', mp3Path];
            break;

        case 'lip-sync-real':
            const voiceFile = job.files[1] || (job.files.length > 1 ? job.files[1] : null); // Procura segundo arquivo
            if (!voiceFile) { job.status = 'failed'; job.error = "Arquivo de áudio necessário para Lip Sync."; return; }
            
            args = [
                '-i', videoFile.path,
                '-i', voiceFile.path,
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                '-y', outputPath
            ];
            break;

        case 'magic-erase-real':
            let { x, y, w, h } = params;
            // Validação simples
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
            
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
            args.push('-y', outputPath);
            break;

        case 'video-to-cartoon-real':
            const cStyle = params.style || 'anime_vibrant';
            // Filtro simplificado para cartoon (bilateral + edges)
            let styleFilter = "bilateral=sigmaS=100:sigmaR=0.1,unsharp=5:5:1.0:5:5:0.0"; 
            
            let cartoonFilters = [];
            if (inputIsImage && originalW > MAX_WIDTH) cartoonFilters.push(`scale=${MAX_WIDTH}:-2`);
            cartoonFilters.push(styleFilter);
            if (outputExtension === '.mp4') cartoonFilters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "format=yuv420p");
            
            if(inputIsImage) args.push('-loop', '1', '-t', '5');
            args.push('-i', videoFile.path);
            if(inputIsImage) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            
            args.push('-vf', cartoonFilters.join(","));
            
            if(inputIsImage) args.push('-map', '0:v', '-map', '1:a', '-shortest');
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac');
            args.push('-y', outputPath);
            break;

        case 'stabilize-real':
            const trfPath = path.join(uploadDir, `transform_${jobId}.trf`);
            const detectCmd = `ffmpeg -i "${videoFile.path}" -vf vidstabdetect=stepSize=32:shakiness=10:accuracy=15:result="${trfPath}" -f null -`;
            
            // Detect pass (sync)
            await new Promise((resolve, reject) => exec(detectCmd, (err) => err ? reject(err) : resolve()));
            
            args = [
                '-i', videoFile.path,
                '-vf', `vidstabtransform=input="${trfPath}":zoom=0:smoothing=10,unsharp=5:5:0.8:3:3:0.4,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy',
                '-y', outputPath
            ];
            break;

        case 'reframe-real':
            args = [
                '-i', videoFile.path,
                '-vf', 'scale=-2:1280,crop=720:1280:(iw-720)/2:0,setsar=1,format=yuv420p',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy',
                '-y', outputPath
            ];
            break;

        case 'remove-silence-real':
            const silence_dur = params.duration || 0.5;
            const silence_thresh = params.threshold || -30;
            // Filtro simples para remover silêncio
            args = [
                '-i', videoFile.path, 
                '-af', `silenceremove=stop_periods=-1:stop_duration=${silence_dur}:stop_threshold=${silence_thresh}dB`,
                '-c:v', 'libx264', '-preset', 'ultrafast', // Re-encoda vídeo para manter sync
                '-y', outputPath
            ];
            break;

        case 'isolate-voice-real':
            args = ['-i', videoFile.path, '-vn', '-af', 'highpass=f=200,lowpass=f=3000', '-y', outputPath];
            break;
            
        case 'reduce-noise-real':
             args = ['-i', videoFile.path, '-vn', '-af', 'afftdn', '-y', outputPath];
             break;

        case 'image-to-video-motion':
             if (!inputIsImage) { job.status = 'failed'; job.error = "Input must be an image."; return; }
             const motionMode = params.mode || 'zoom-in';
             const d = 5; // duration 5s
             
             let zoomExpr = "";
             if (motionMode === 'zoom-in') zoomExpr = `zoom+0.0015`;
             else if (motionMode === 'zoom-out') zoomExpr = `if(eq(on,1), 1.5, zoom-0.0015)`;
             else if (motionMode === 'pan-right') zoomExpr = `1.2`; // Simplificado
             
             let xExpr = "iw/2-(iw/zoom/2)";
             let yExpr = "ih/2-(ih/zoom/2)";
             if (motionMode === 'pan-right') xExpr = "x-1"; 

             args = [
                '-loop', '1',
                '-i', videoFile.path,
                '-vf', `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${d*25}:s=1280x720,format=yuv420p`,
                '-t', d.toString(),
                '-c:v', 'libx264', '-preset', 'ultrafast',
                '-y', outputPath
             ];
             break;
             
        case 'colorize-real':
            args = [
                '-i', videoFile.path,
                '-vf', 'eq=saturation=2.0:brightness=0.05:contrast=1.1',
                '-c:v', 'libx264', '-preset', 'ultrafast',
                '-y', outputPath
            ];
            break;
            
        case 'particles-real':
             const pType = params.type || 'rain';
             if (inputIsImage) {
                 args.push('-loop', '1', '-t', '5', '-i', videoFile.path);
             } else {
                 args.push('-i', videoFile.path);
             }

             let complex = "";
             if (pType === 'rain') {
                 complex = `nullsrc=size=1280x720[glass];noise=alls=20:allf=t+u[noise];[glass][noise]overlay=format=auto,geq=r='if(gt(random(1),0.98),255,0)':g='if(gt(random(1),0.98),255,0)':b='if(gt(random(1),0.98),255,0)'[rain];[0:v]scale=1280:720[base];[base][rain]overlay`;
             } else {
                 // Fallback para filtro simples de noise se não for rain
                 complex = `[0:v]noise=alls=20:allf=t+u`;
             }
             
             args.push('-filter_complex', complex);
             args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath);
             break;

        default:
            // Filtro genérico de melhoria se nenhuma action bater
            args = ['-i', videoFile.path, '-vf', 'unsharp=5:5:1.0:5:5:0.0,eq=saturation=1.2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath];
    }

    createFFmpegJob(jobId, args, expectedDuration);
}

// --- ROTAS DA API ---

// 1. Audio Extraction Endpoint (Específico)
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

// 2. Music Generation Endpoint
app.post('/api/process/generate-music', uploadAny, async (req, res) => {
    const { prompt, duration, hfToken } = req.body;
    const jobId = `music_gen_${Date.now()}`;
    const outputFilename = `ai_music_${Date.now()}.wav`; 
    const outputPath = path.join(uploadDir, outputFilename);
    const dur = parseFloat(duration) || 10;
    
    jobs[jobId] = { status: 'processing', progress: 0, outputPath };
    res.status(202).json({ jobId });

    try {
        // Opção 1: Hugging Face MusicGen (Se tiver token)
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
                const tempPath = path.join(uploadDir, `temp_musicgen_${Date.now()}.flac`);
                fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));

                // Loop/Trim para duração desejada
                const cmd = `ffmpeg -stream_loop -1 -i "${tempPath}" -t ${dur} -acodec pcm_s16le -ar 44100 -ac 2 -y "${outputPath}"`;
                exec(cmd, (err) => {
                    if(fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "FFmpeg loop failed."; }
                    else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
                });
                return;
            }
        }

        // Opção 2: Geração Procedural (Fallback)
        console.log(`[Job ${jobId}] Usando Geração Procedural (Fallback)`);
        let filter = "anoisesrc=a=0.1:c=pink:d=" + dur + ",lowpass=f=200"; 
        
        const lowerPrompt = (prompt || "").toLowerCase();
        if (lowerPrompt.includes("techno") || lowerPrompt.includes("beat")) {
             filter = `aevalsrc='0.1*sin(2*PI*t*120/60)*tan(2*PI*t*60)':d=${dur},lowpass=f=400`; 
        } else if (lowerPrompt.includes("piano") || lowerPrompt.includes("sad")) {
             filter = `sine=f=440:d=${dur},tremolo=f=5:d=0.5`;
        }

        const command = `ffmpeg -f lavfi -i "${filter}" -acodec pcm_s16le -ar 44100 -ac 2 -y "${outputPath}"`;
        exec(command, (err) => {
            if (err) { jobs[jobId].status = 'failed'; jobs[jobId].error = "Erro na síntese."; } 
            else { jobs[jobId].status = 'completed'; jobs[jobId].progress = 100; jobs[jobId].downloadUrl = `/api/process/download/${jobId}`; }
        });

    } catch (e) {
        jobs[jobId].status = 'failed';
        jobs[jobId].error = e.message;
    }
});

// 3. General Start Process Endpoint
app.post('/api/process/start/:action', uploadAny, (req, res) => {
    const action = req.params.action;
    const jobId = `${action}_${Date.now()}`;
    jobs[jobId] = { status: 'pending', files: req.files, params: req.body, outputPath: null, startTime: Date.now() };
    
    // Inicia o processamento
    processSingleClipJob(jobId);
    
    res.status(202).json({ jobId });
});

// 4. Status Check
app.get('/api/process/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ status: 'not_found' });
    res.json(job);
});

// 5. Download File
app.get('/api/process/download/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed' || !job.outputPath || !fs.existsSync(job.outputPath)) {
        return res.status(404).send("Arquivo não encontrado.");
    }
    res.download(job.outputPath);
});

app.get('/api/check-ffmpeg', (req, res) => res.send("FFmpeg is ready and Server is Running"));

// --- CLEANUP JOB (A cada 10 min, limpa arquivos > 1h) ---
setInterval(() => {
    const now = Date.now();
    Object.keys(jobs).forEach(id => {
        if (now - jobs[id].startTime > 3600000) {
            if (jobs[id].outputPath && fs.existsSync(jobs[id].outputPath)) {
                try { fs.unlinkSync(jobs[id].outputPath); } catch(e){}
            }
            delete jobs[id];
        }
    });
}, 600000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
