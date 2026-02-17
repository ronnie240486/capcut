import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Normaliza os inputs garantindo que sejam arrays de objetos { path, duration }
 */
function normalizeInputs(inputs, type) {
    if (!Array.isArray(inputs)) throw new Error(`${type} deve ser um array`);
    return inputs.map((item, index) => {
        if (!item.path) throw new Error(`Todos os ${type} devem ter { path, duration }`);
        return {
            path: item.path,
            duration: typeof item.duration === 'number' ? item.duration : 5 // default 5s
        };
    });
}

/**
 * handleExportVideo
 * @param {Array} videoInputs Array de vídeos { path, duration }
 * @param {Array} audioInputs Array de áudios { path, duration }
 * @param {String} outputDir Diretório de saída
 * @param {Function} callback Recebe (jobId, ffmpegArgs, totalDuration)
 */
export async function handleExportVideo(videoInputs, audioInputs, outputDir, callback) {
    try {
        // Normaliza os inputs
        const videos = normalizeInputs(videoInputs, 'videoInputs');
        const audios = normalizeInputs(audioInputs, 'audioInputs');

        // Cria jobId
        const jobId = `export_${Date.now()}`;

        // Paths de saída
        const outputPath = path.join(outputDir, `export_${Date.now()}.mp4`);

        // FFmpeg args básicos
        const args = [];

        // Adiciona vídeos
        videos.forEach(v => {
            args.push('-i', v.path);
        });

        // Adiciona áudios
        audios.forEach(a => {
            args.push('-i', a.path);
        });

        // Combinar vídeos e áudios (simples crossfade/concat)
        // Aqui você pode personalizar filtros complexos
        // Para teste inicial, vamos apenas copiar streams
        args.push(
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-y',
            outputPath
        );

        // Calcula duração total estimada (soma dos vídeos)
        const totalDuration = videos.reduce((sum, v) => sum + v.duration, 0);

        // Retorna para o server criar o processo FFmpeg
        callback(jobId, args, totalDuration);

        return outputPath;

    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
