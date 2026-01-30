
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import handleExport from './exportVideo.js';
import https from 'https';
import filterBuilder from './video-engine/filterBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Configure Multer with increased limits
const uploadAny = multer({ 
    storage,
    limits: {
        fieldSize: 50 * 1024 * 1024, // 50MB for non-file fields (like projectState JSON)
        fileSize: 500 * 1024 * 1024 // 500MB for file uploads
    }
}).any();
const jobs = {};

// --- REAL AUDIO FALLBACKS (Curated Royalty Free List) ---
const REAL_MUSIC_FALLBACKS = [
    { id: 'fb_m1', name: 'Cinematic Epic Trailer', artist: 'Gregor Quendel', duration: 120, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/09/audio_a7e2311438.mp3?filename=epic-cinematic-trailer-114407.mp3'} },
    { id: 'fb_m2', name: 'Lofi Study Beat', artist: 'FASSounds', duration: 140, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112762.mp3'} },
    { id: 'fb_m3', name: 'Corporate Uplifting', artist: 'LesFM', duration: 120, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/01/26/audio_2475143a4e.mp3?filename=upbeat-corporate-11286.mp3'} },
    { id: 'fb_m4', name: 'Ambient Piano & Strings', artist: 'RelaxingTime', duration: 200, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/02/07/audio_659021d743.mp3?filename=ambient-piano-amp-strings-10711.mp3'} },
    { id: 'fb_m5', name: 'Action Rock Energy', artist: 'Coma-Media', duration: 110, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_349d44a2b9.mp3?filename=action-rock-116037.mp3'} },
    { id: 'fb_m6', name: 'Cyberpunk Phonk', artist: 'QubeSounds', duration: 150, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_514510b64d.mp3?filename=uplifting-future-bass-113368.mp3'} },
    { id: 'fb_m7', name: 'Happy Ukulele', artist: 'MusicUnlimited', duration: 100, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=happy-ukulele-10769.mp3'} },
    { id: 'fb_m8', name: 'Dark Suspense', artist: 'SoundGallery', duration: 180, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2021/11/23/audio_035a336ec6.mp3?filename=dark-suspense-11293.mp3'} }
];

const REAL_SFX_FALLBACKS = [
    { id: 'fb_s1', name: 'Whoosh Transition', artist: 'SoundEffect', duration: 2, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c36c1e54c2.mp3?filename=whoosh-6316.mp3'} },
    { id: 'fb_s2', name: 'Cinematic Hit', artist: 'TrailerFX', duration: 4, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_9593259850.mp3?filename=cinematic-boom-11749.mp3'} },
    { id: 'fb_s3', name: 'Camera Shutter', artist: 'PhotoFX', duration: 1, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_27d75c879d.mp3?filename=camera-shutter-6305.mp3'} },
    { id: 'fb_s4', name: 'Nature Birds', artist: 'NatureSounds', duration: 15, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/02/02/audio_6f7c11f7e0.mp3?filename=forest-birds-10825.mp3'} },
    { id: 'fb_s5', name: 'Keyboard Typing', artist: 'OfficeFX', duration: 5, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/19/audio_4123565259.mp3?filename=typing-6580.mp3'} },
    { id: 'fb_s6', name: 'Glitch Sound', artist: 'TechFX', duration: 1, previews: {'preview-hq-mp3': 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_514510b64d.mp3?filename=glitch-113368.mp3'} }
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
            const isMem = stderr.includes('Out of memory') || stderr.includes('Killed') || code === null;
            jobs[jobId].error = isMem 
                ? "Erro de Memória: O servidor interrompeu o processamento. Tente exportar em resolução menor (720p) ou dividir o vídeo."
                : "Erro na exportação. Verifique se todos os clipes estão funcionando.";
        }
    });
}

// --- PROXY ROUTES ---

// Proxy for Pixabay (Combined Audio/Video/Image)
app.get('/api/proxy/pixabay', (req, res) => {
    const { q, category, type, token } = req.query;
    
    if (!token || token === 'undefined') {
        return res.json({ hits: [] });
    }

    const medType = type || 'photo';
    let url = '';
    
    if (medType === 'video') {
         url = `https://pixabay.com/api/videos/?key=${token}&q=${encodeURIComponent(q || '')}&per_page=10`;
    } else {
         url = `https://pixabay.com/api/?key=${token}&q=${encodeURIComponent(q || '')}&image_type=photo&per_page=10`;
    }

    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                res.json(json);
            } catch (e) {
                res.json({ hits: [] });
            }
        });
    }).on('error', () => res.json({ hits: [] }));
});

// Proxy for Unsplash (Images)
app.get('/api/proxy/unsplash', (req, res) => {
    const { q, token } = req.query;
    
    if (!token || token === 'undefined') {
        return res.json({ results: [] });
    }

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q || '')}&per_page=10&client_id=${token}`;

    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                res.json(json);
            } catch (e) {
                res.json({ results: [] });
            }
        });
    }).on('error', () => res.json({ results: [] }));
});

// Proxy for Freesound (Audio)
app.get('/api/proxy/freesound', (req, res) => {
    const { token, q } = req.query;
    const isMusicSearch = (q || '').toLowerCase().includes('music');
    const fallbackList = isMusicSearch ? REAL_MUSIC_FALLBACKS : REAL_SFX_FALLBACKS;
    
    if (!token || token === 'undefined' || token === '') {
        return res.json({ results: fallbackList });
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
                res.json(json.results ? json : { results: fallbackList });
            } catch (e) {
                console.error("Freesound Proxy Error:", e.message);
                res.json({ results: fallbackList });
            }
        });
    });
    
    request.on('error', (e) => {
        console.error("Freesound Request Error:", e.message);
        res.json({ results: fallbackList });
    });
});

// --- FRAME EXTRACTION UTILITY ---
app.post('/api/util/extract-frame', uploadAny, (req, res) => {
    const videoFile = req.files[0];
    const timestamp = parseFloat(req.body.timestamp) || 0;
    
    if (!videoFile) return res.status(400).send("No video file uploaded");

    const outputPath = path.join(uploadDir, `frame_${Date.now()}.png`);

    const args = [
        '-ss', String(timestamp),
        '-i', videoFile.path,
        '-frames:v', '1',
        '-q:v', '2', 
        '-y',
        outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
            res.sendFile(outputPath);
        } else {
            console.error("FFmpeg frame extraction failed");
            res.status(500).send("Failed to extract frame");
        }
    });
    
    ffmpeg.on('error', (err) => {
         console.error("FFmpeg spawn error:", err);
         res.status(500).send("Server error");
    });
});

// --- SCENE DETECTION UTILITY ---
app.post('/api/analyze/scenes', uploadAny, (req, res) => {
    const videoFile = req.files[0];
    if (!videoFile) return res.status(400).send("No video file uploaded");

    // FFmpeg command to detect scenes with > 30% difference
    const args = [
        '-i', videoFile.path,
        '-filter:v', "select='gt(scene,0.3)',showinfo",
        '-f', 'null',
        '-'
    ];

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
        // Look for timestamps in stderr
        const scenes = [];
        const regex = /pts_time:([0-9.]+)/g;
        let match;
        while ((match = regex.exec(stderr)) !== null) {
            scenes.push(parseFloat(match[1]));
        }
        res.json({ scenes });
    });
    
    ffmpeg.on('error', (err) => {
         console.error("FFmpeg scene detection error:", err);
         res.status(500).send("Server error");
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

    // Use filterBuilder module
    const { filterComplex, mapArgs, outputOptions } = filterBuilder.build(action, params, videoFile.path);
    let args = [];
    let expectedDuration = originalDuration;

    // Special cases handling outside filterBuilder or merging
    if (action === 'interpolate-real') {
        const speed = parseFloat(params.speed) || 0.5;
        const factor = 1 / speed;
        expectedDuration = originalDuration * factor;
        
        let complex = filterComplex;
        if (hasAudio) {
            complex += `;[0:a]${filterBuilder.getAtempoFilter(speed)}[a]`;
            mapArgs.push('-map', '[a]');
        }
        
        args = [
            '-i', videoFile.path,
            '-filter_complex', complex,
            ...mapArgs,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', 
            '-pix_fmt', 'yuv420p',
            '-max_muxing_queue_size', '1024',
            '-y', outputPath
        ];
    } else if (action === 'extract-audio') {
        const finalAudioPath = outputPath.replace('.wav', '.mp3');
        args = ['-i', videoFile.path, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', finalAudioPath];
        job.outputPath = finalAudioPath;
    } else {
        // Standard Processing using filterBuilder output
        args = [
            '-i', videoFile.path,
            '-filter_complex', filterComplex,
            ...mapArgs,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
            ...(outputOptions || []),
            '-y', outputPath
        ];
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
        // Optimized Args for Memory Safety
        const optimizedArgs = [...args];
        
        // Find the output file index (it's the last one)
        const outputIndex = optimizedArgs.length - 1;
        const outputPath = optimizedArgs[outputIndex];
        
        // Inject memory safety flags before output path
        optimizedArgs.splice(outputIndex, 1, 
            '-max_muxing_queue_size', '4096', 
            '-threads', '4', 
            '-abort_on', 'empty_output',
            outputPath
        );
        
        createFFmpegJob(id, optimizedArgs, totalDuration);
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
