// exportVideo.js
import path from 'path';
import fs from 'fs';

/**
 * Normaliza inputs de vídeo e áudio
 * @param {Array} inputs 
 * @param {string} type "video" ou "audio"
 * @returns {Array}
 */
function normalizeInputs(inputs, type) {
    if (!Array.isArray(inputs)) throw new Error(`Inputs devem ser um array (${type})`);
    return inputs.map(input => {
        if (!input.path || !fs.existsSync(input.path)) {
            throw new Error(`Arquivo de ${type} não encontrado: ${input.path}`);
        }
        return {
            path: input.path,
            duration: parseFloat(input.duration) || 5
        };
    });
}

/**
 * handleExportVideo
 * @param {Object} job Objeto de job (contendo files e params)
 * @param {string} uploadDir Diretório de uploads
 * @param {Function} callback Callback (jobId, argsFFmpeg, duration)
 */
export async function handleExportVideo(job, uploadDir, callback) {
    if (!job || !job.files || job.files.length === 0) {
        throw new Error("Nenhum vídeo enviado");
    }

    // Separa vídeos e áudios
    const videoInputs = job.files
        .filter(f => f.mimetype.startsWith('video'))
        .map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 }));

    const audioInputs = job.files
        .filter(f => f.mimetype.startsWith('audio'))
        .map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 }));

    // Normaliza
    const videos = normalizeInputs(videoInputs, 'video');
    const audios = normalizeInputs(audioInputs, 'audio');

    if (videos.length === 0 && audios.length === 0) {
        throw new Error("Nenhum vídeo ou áudio válido enviado");
    }

    // Define output path
    const outputFileName = `export_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, outputFileName);
    job.outputPath = outputPath;

    // Cria argumentos FFmpeg
    const ffmpegArgs = [];

    videos.forEach(v => ffmpegArgs.push('-i', v.path));
    audios.forEach(a => ffmpegArgs.push('-i', a.path));

    // Video codec e áudio codec padrão
    ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', outputPath);

    // Estima duração total do vídeo
    const totalDuration = videos.reduce((sum, v) => sum + v.duration, 0);

    // Chama callback com FFmpeg args
    if (typeof callback === 'function') {
        callback(job.id, ffmpegArgs, totalDuration || 10);
    }
}
