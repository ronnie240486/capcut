// exportVideo.js
import path from 'path';

/**
 * Normaliza cada entrada de vídeo ou áudio.
 * Garante que path seja string e duration seja número.
 */
function normalizeInputs(inputs, type = 'video') {
    if (!Array.isArray(inputs)) {
        throw new Error(`Inputs devem ser um array (${type})`);
    }

    return inputs.map((item, index) => {
        if (!item.path || !item.duration) {
            throw new Error(`Todos os ${type}Inputs devem ter { path, duration }, problema no índice ${index}`);
        }

        // Se for array, pega o primeiro elemento
        const filePath = Array.isArray(item.path) ? item.path[0] : item.path;
        const duration = parseFloat(item.duration);

        if (!filePath || isNaN(duration)) {
            throw new Error(`Inputs inválidos no índice ${index} (${type})`);
        }

        return { path: filePath, duration };
    });
}

/**
 * Prepara os argumentos do FFmpeg para exportar vídeo final
 */
export async function handleExportVideo(job, uploadDir, onReady) {
    try {
        const { videoInputs: rawVideos, audioInputs: rawAudios } = job.params;

        // Normaliza os inputs
        const videoInputs = normalizeInputs(rawVideos, 'video');
        const audioInputs = normalizeInputs(rawAudios, 'audio');

        if (videoInputs.length === 0 && audioInputs.length === 0) {
            throw new Error('Nenhum vídeo ou áudio fornecido');
        }

        const ffmpegArgs = [];

        // Adiciona vídeos
        videoInputs.forEach((v, idx) => {
            const filePath = path.resolve(uploadDir, path.basename(v.path));
            ffmpegArgs.push('-loop', '1', '-t', v.duration.toString(), '-i', filePath);
        });

        // Adiciona áudios
        audioInputs.forEach((a) => {
            const filePath = path.resolve(uploadDir, path.basename(a.path));
            ffmpegArgs.push('-i', filePath);
        });

        // Configura codecs e opções básicas
        ffmpegArgs.push(
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest'
        );

        // Chama callback quando pronto para spawn
        const totalDuration = videoInputs.reduce((sum, v) => sum + v.duration, 0);
        onReady(job.id, ffmpegArgs, totalDuration);

    } catch (err) {
        console.error('Erro em handleExportVideo:', err);
        throw err;
    }
}
