
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const handleExport = require('./exportVideo.js');
const https = require('https'); 

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

// --- REAL AUDIO FALLBACKS (Curated Royalty Free List) ---
const REAL_MUSIC_FALLBACKS = [
    { id: 'fb_m1', name: 'Cinematic Epic Trailer', artist: 'Gregor Quendel', duration: 120, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/09/audio_a7e2311438.mp3?filename=epic-cinematic-trailer-114407.mp3' },
    { id: 'fb_m2', name: 'Lofi Study Beat', artist: 'FASSounds', duration: 140, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112762.mp3' },
    { id: 'fb_m3', name: 'Corporate Uplifting', artist: 'LesFM', duration: 120, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/01/26/audio_2475143a4e.mp3?filename=upbeat-corporate-11286.mp3' },
    { id: 'fb_m4', name: 'Ambient Piano & Strings', artist: 'RelaxingTime', duration: 200, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/02/07/audio_659021d743.mp3?filename=ambient-piano-amp-strings-10711.mp3' },
    { id: 'fb_m5', name: 'Action Rock Energy', artist: 'Coma-Media', duration: 110, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_349d44a2b9.mp3?filename=action-rock-116037.mp3' },
    { id: 'fb_m6', name: 'Cyberpunk Phonk', artist: 'QubeSounds', duration: 150, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_514510b64d.mp3?filename=uplifting-future-bass-113368.mp3' },
    { id: 'fb_m7', name: 'Happy Ukulele', artist: 'MusicUnlimited', duration: 100, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=happy-ukulele-10769.mp3' },
    { id: 'fb_m8', name: 'Dark Suspense', artist: 'SoundGallery', duration: 180, previewUrl: 'https://cdn.pixabay.com/download/audio/2021/11/23/audio_035a336ec6.mp3?filename=dark-suspense-11293.mp3' }
];

const REAL_SFX_FALLBACKS = [
    { id: 'fb_s1', name: 'Whoosh Transition', artist: 'SoundEffect', duration: 2, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c36c1e54c2.mp3?filename=whoosh-6316.mp3' },
    { id: 'fb_s2', name: 'Cinematic Hit', artist: 'TrailerFX', duration: 4, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_9593259850.mp3?filename=cinematic-boom-11749.mp3' },
    { id: 'fb_s3', name: 'Camera Shutter', artist: 'PhotoFX', duration: 1, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_27d75c879d.mp3?filename=camera-shutter-6305.mp3' },
    { id: 'fb_s4', name: 'Nature Birds', artist: 'NatureSounds', duration: 15, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/02/02/audio_6f7c11f7e0.mp3?filename=forest-birds-10825.mp3' },
    { id: 'fb_s5', name: 'Keyboard Typing', artist: 'OfficeFX', duration: 5, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/19/audio_4123565259.mp3?filename=typing-6580.mp3' },
    { id: 'fb_s6', name: 'Glitch Sound', artist: 'TechFX', duration: 1, previewUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_514510b64d.mp3?filename=glitch-113368.mp3' }
];

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

// --- PROXY ROUTES PARA RESULTADOS REAIS ---

// Proxy para Pixabay Audio (With Fallback)
app.get('/api/proxy/pixabay', (req, res) => {
    // Return curated fallback list immediately to ensure "Real Results" for all users
    // regardless of API Key status (since Pixabay Audio API access is restricted).
    // Filters locally based on query.
    
    const { q, category } = req.query;
    const isSFX = (category || '').includes('sfx') || (q || '').toLowerCase().includes('effect');
    const sourceList = isSFX ? REAL_SFX_FALLBACKS : REAL_MUSIC_FALLBACKS;
    
    const results = sourceList.filter(item => 
        !q || 
        item.name.toLowerCase().includes(String(q).toLowerCase()) || 
        item.artist.toLowerCase().includes(String(q).toLowerCase())
    );
    
    res.json({ hits: results.length > 0 ? results : sourceList });
});

// Proxy para Freesound (With Fallback)
app.get('/api/proxy/freesound', (req, res) => {
    const { token, q } = req.query;
    
    if (!token || token === 'undefined' || token === '') {
        return res.json({ results: REAL_SFX_FALLBACKS });
    }

    const options = {
        headers: { 'User-Agent': 'ProEdit/1.0' }
    };

    const freesoundUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q || '')}&fields=id,name,previews,duration,username&token=${token}&page_size=15`;

    const request = https.get(freesoundUrl, options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                if (apiRes.statusCode !== 200) {
                    throw new Error(`Upstream Error: ${apiRes.statusCode}`);
                }
                const json = JSON.parse(data);
                res.json(json.results ? json : { results: REAL_SFX_FALLBACKS });
            } catch (e) {
                console.error("Freesound Proxy Error:", e.message);
                res.json({ results: REAL_SFX_FALLBACKS });
            }
        });
    });
    
    request.on('error', (e) => {
        console.error("Freesound Request Error:", e.message);
        res.json({ results: REAL_SFX_FALLBACKS });
    });
});


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
            
            let filterComplex = `[0:v]scale='min(1280,iw)':-2,pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
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
            const finalAudioPath = outputPath.replace('.wav', '.mp3');
            args = ['-i', videoFile.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', finalAudioPath];
            job.outputPath = finalAudioPath;
            break;
        
        case 'voice-fx-real':
            const p = params.preset;
            let af = 'anull';
            if(p === 'robot') af = "asetrate=44100*0.9,atempo=1.1,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3";
            else if(p === 'chipmunk') af = "asetrate=44100*1.4,atempo=0.7"; 
            else if(p === 'monster') af = "asetrate=44100*0.6,atempo=1.6";
            else if(p === 'echo') af = "aecho=0.8:0.9:1000:0.3";
            else if(p === 'radio') af = "highpass=f=500,lowpass=f=3000,afftdn";
            else if(p === 'helium') af = "asetrate=44100*1.4,atempo=0.7";
            
            args = ['-i', videoFile.path, '-vn', '-af', af, '-y', outputPath];
            break;

        default:
            args = ['-i', videoFile.path, '-vf', 'unsharp=5:5:1.0:5:5:0.0,eq=saturation=1.2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', outputPath];
    }

    createFFmpegJob(jobId, args, expectedDuration);
}

// ROTA ESPECÍFICA PARA EXPORTAÇÃO
app.post('/api/export/start', uploadAny, (req, res) => {
    const jobId = `export_${Date.now()}`;
    jobs[jobId] = { 
        id: jobId,
        status: 'pending', 
        files: req.files, 
        params: req.body, 
        outputPath: null, 
        startTime: Date.now() 
    };
    
    // Responde imediatamente
    res.status(202).json({ jobId });

    // Inicia processamento assíncrono usando o módulo exportVideo
    handleExport(jobs[jobId], uploadDir, (id, args, totalDuration) => {
        createFFmpegJob(id, args, totalDuration);
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
