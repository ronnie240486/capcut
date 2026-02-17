import path from 'path';
import fs from 'fs';

/**
 * Normaliza inputs: garante que sejam arrays de objetos { path, duration }
 */
function normalizeInputs(inputs, type) {
    if (!Array.isArray(inputs)) {
        throw new Error(`Inputs devem ser um array (${type})`);
    }
    inputs.forEach((input, idx) => {
        if (!input.path) throw new Error(`${type}[${idx}] precisa ter 'path'`);
        if (!input.duration) input.duration = 5;
    });
    return inputs;
}

/**
 * handleExportVideo
 * @param {Object} job - job enviado do server.js
 * @param {string} uploadDir - pasta de uploads
 * @param {Function} callback - (jobId, ffmpegArgs, totalDuration)
 */
export async function handleExportVideo(job, uploadDir, callback) {
    try {
        // Separar tipos
        const videoInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('video')).map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 })),
            'video'
        );

        const audioInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('audio')).map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 })),
            'audio'
        );

        const imageInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('image')).map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 })),
            'image'
        );

        if (videoInputs.length + imageInputs.length === 0) {
            throw new Error("Nenhum vídeo ou imagem enviado");
        }

        // Montar argumentos FFmpeg
        const ffmpegArgs = [];
        let filterComplexParts = [];
        let mapArgs = [];

        // 1️⃣ Adicionar imagens (loop para criar vídeos de duração fixa)
        imageInputs.forEach((img, idx) => {
            ffmpegArgs.push('-loop', '1', '-t', img.duration, '-i', img.path);
            // Map de cada imagem
            mapArgs.push(`[${idx}:v]`);
        });

        // 2️⃣ Adicionar vídeos
        videoInputs.forEach((vid, idx) => {
            ffmpegArgs.push('-i', vid.path);
            mapArgs.push(`[${imageInputs.length + idx}:v]`);
        });

        // 3️⃣ Criar transições simples (fade) entre todos os vídeos/imagens
        if (mapArgs.length > 1) {
            let fadeFilters = [];
            for (let i = 1; i < mapArgs.length; i++) {
                fadeFilters.push(`${mapArgs[i-1]}${mapArgs[i]}xfade=transition=fade:duration=1:offset=${i*5}[v${i}]`);
            }
            filterComplexParts = fadeFilters;
        }

        // Combinar filtros
        let filterComplex = filterComplexParts.length ? filterComplexParts.join('; ') : null;

        // Output final
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const totalDuration = Math.max(
            ...[...videoInputs, ...imageInputs].map(v => v.duration)
        );

        // Callback com args
        const finalArgs = [...ffmpegArgs];
        if (filterComplex) {
            finalArgs.push('-filter_complex', filterComplex, '-map', `[v${mapArgs.length-1}]`);
        }
        finalArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', outputPath);

        // Se houver áudio, adiciona ao final
        audioInputs.forEach(aud => finalArgs.push('-i', aud.path));

        callback(job.id, finalArgs, totalDuration);
    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
