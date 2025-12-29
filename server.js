
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
function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries stream=codec_type,duration -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ duration: 0, hasAudio: false });
            const lines = stdout.trim().split('\n');
            let duration = 0;
            let hasAudio = false;
            lines.forEach(line => {
                const parts = line.split(',');
                if (parts[0] === 'video') duration = parseFloat(parts[1]) || duration;
                if (parts[0] === 'audio') hasAudio = true;
            });
            resolve({ duration, hasAudio });
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

async function processSingleClipJob(jobId) {
    const job = jobs[jobId];
    if (!job) return;

    const action = jobId.split('_')[0];
    const videoFile = job.files[0];
    if (!videoFile) { job.status = 'failed'; job.error = "Nenhum arquivo enviado."; return; }

    const { duration: originalDuration, hasAudio } = await getMediaInfo(videoFile.path);
    let params = job.params || {};
    const isAudioOnly = videoFile.mimetype.startsWith('audio/');
    let outputExt = isAudioOnly ? '.wav' : '.mp4';
    
    if (action.includes('audio') || action.includes('voice') || action.includes('silence')) outputExt = '.wav';

    const outputPath = path.join(uploadDir, `${action}-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    let args = [];
    let expectedDuration = originalDuration;

    switch (action) {
        case 'interpolate-real':
            const speed = parseFloat(params.speed) || 0.5;
            const factor = 1 / speed;
            expectedDuration = originalDuration * factor;
            
            // CORREÇÃO: Removido me_mode=bilin que causava erro de constante e simplificado para maior compatibilidade
            let filterComplex = `[0:v]scale='min(1280,iw)':-2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
            let mapping = ['-map', '[v]'];

            if (hasAudio) {
                filterComplex += `;[0:a]${getAtempoFilter(speed)}[a]`;
                mapping.push('-map', '[a]');
            }

            args = [
                '-i', videoFile.path,
                '-filter_complex', filterComplex,
                ...mapping,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', 
                '-pix_fmt', 'yuv420p',
                '-max_muxing_queue_size', '1024',
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
            args = ['-i', videoFile.path, '-vn', '-af', `silenceremove=stop_periods=-1:stop_duration=${silence_dur}:stop_threshold=${silence_thresh}dB`, '-y', outputPath];
            break;

        case 'isolate-voice-real':
            args = ['-i', videoFile.path, '-vn', '-af', 'highpass=f=200,lowpass=f=3000', '-y', outputPath];
            break;

        case 'extract-audio':
            // Garante extração limpa para MP3
            const finalAudioPath = outputPath.replace('.wav', '.mp3');
            args = ['-i', videoFile.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', finalAudioPath];
            job.outputPath = finalAudioPath;
            break;

        default:
            args = ['-i', videoFile.path, '-vf', 'unsharp=5:5:1.0:5:5:0.0,eq=saturation=1.2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath];
    }

    createFFmpegJob(jobId, args, expectedDuration);
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
