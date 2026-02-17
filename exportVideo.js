import path from 'path';
import fs from 'fs';

function normalizeInputs(inputs, type) {
    if (!Array.isArray(inputs)) throw new Error(`Inputs devem ser um array (${type})`);
    return inputs.map((input, idx) => {
        if (!input.path) throw new Error(`${type}[${idx}] precisa ter 'path'`);
        return { path: input.path, duration: input.duration || 5 };
    });
}

export async function handleExportVideo(job, uploadDir, callback) {
    try {
        const videoInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('video')).map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 })),
            'video'
        );
        const imageInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('image')).map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 })),
            'image'
        );
        const audioInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('audio')).map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 })),
            'audio'
        );

        const allVisuals = [...imageInputs, ...videoInputs];
        if (allVisuals.length === 0) throw new Error("Nenhum vídeo ou imagem enviado");

        // FFmpeg inputs
        const ffmpegArgs = [];
        allVisuals.forEach((clip, idx) => {
            if (clip.path.endsWith('.jpg') || clip.path.endsWith('.png')) {
                ffmpegArgs.push('-loop', '1', '-t', clip.duration, '-i', clip.path);
            } else {
                ffmpegArgs.push('-i', clip.path);
            }
        });
        audioInputs.forEach(aud => ffmpegArgs.push('-i', aud.path));

        // Criar filtros xfade corretamente
        let filterComplex = '';
        if (allVisuals.length === 1) {
            filterComplex = '';
        } else {
            let lastOutput = `[0:v]`;
            for (let i = 1; i < allVisuals.length; i++) {
                const offset = allVisuals.slice(0, i).reduce((sum, c) => sum + c.duration, 0);
                const outName = `[v${i}]`;
                filterComplex += `${lastOutput}[${i}:v]xfade=transition=fade:duration=1:offset=${offset}${outName};`;
                lastOutput = outName;
            }
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const totalDuration = allVisuals.reduce((sum, c) => sum + c.duration, 0);

        const finalArgs = [...ffmpegArgs];
        if (filterComplex) finalArgs.push('-filter_complex', filterComplex, '-map', `[v${allVisuals.length - 1}]`);
        else finalArgs.push('-map', '0:v'); // Se só um vídeo/imagem

        // Mapear áudio
        if (audioInputs.length) finalArgs.push('-map', `${ffmpegArgs.length - audioInputs.length}:a?`);

        finalArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', outputPath);

        callback(job.id, finalArgs, totalDuration);
    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
