// exportVideo.js
import path from 'path';
import fs from 'fs/promises';

// Normaliza inputs e garante que são arrays válidos
function normalizeInputs(inputs, type = 'video') {
    if (!Array.isArray(inputs)) {
        throw new Error(`Inputs devem ser um array (${type})`);
    }
    inputs.forEach((i, idx) => {
        if (!i.path || typeof i.path !== 'string') {
            throw new Error(`Cada input precisa ter { path } (${type} index ${idx})`);
        }
        if (!i.duration) i.duration = 5; // fallback duration
    });
    return inputs;
}

export async function handleExportVideo(job, uploadDir, ffmpegCallback) {
    try {
        if (!job || !job.files) throw new Error("Job inválido");

        // Separar vídeos e áudios
        const videoInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('video')).map(f => ({
                path: f.path,
                duration: parseFloat(job.params.duration) || 5
            })), 'video'
        );

        const audioInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('audio')).map(f => ({
                path: f.path,
                duration: parseFloat(job.params.duration) || 5
            })), 'audio'
        );

        if (videoInputs.length === 0) {
            throw new Error("Nenhum vídeo enviado");
        }

        // Cria filter_complex dinamicamente
        let filterComplex = '';
        const mapArgs = [];
        let lastVideoLabel = null;

        videoInputs.forEach((v, i) => {
            const label = `v${i}`;
            // Aplica movimento básico: zoom de 1x a 1.05x
            filterComplex += `[${i}:v]scale=1280:720,zoompan=z='if(lte(zoom,1.05),zoom+0.001,1.0)':d=1:fps=30[${label}];`;

            if (lastVideoLabel !== null) {
                const outLabel = `v${i}out`;
                filterComplex += `[${lastVideoLabel}][${label}]xfade=transition=fade:duration=1:offset=${i * v.duration}[${outLabel}];`;
                lastVideoLabel = outLabel;
            } else {
                lastVideoLabel = label;
            }
        });

        mapArgs.push('-map', `[${lastVideoLabel}]`);

        // Mapeia todos os áudios enviados (ou do primeiro vídeo se não houver)
        if (audioInputs.length > 0) {
            audioInputs.forEach((a, i) => mapArgs.push('-i', a.path));
            mapArgs.push('-map', `${videoInputs.length}:a?`); // primeiro audio como exemplo
        } else {
            mapArgs.push('-map', '0:a?'); // fallback: áudio do primeiro vídeo
        }

        // Define caminho final do arquivo
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        // Argumentos finais do FFmpeg
        const args = ['-i', videoInputs.map(v => v.path).join(' -i '), '-filter_complex', filterComplex, ...mapArgs, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', outputPath];

        // Chama callback para criar o job FFmpeg
        ffmpegCallback(job.id, args, videoInputs.reduce((sum, v) => sum + v.duration, 0));

    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
