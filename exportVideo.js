// exportVideo.js
import path from 'path';
import fs from 'fs/promises';

export async function handleExportVideo(job, uploadDir, ffmpegCallback) {
    try {
        // Garantir que videoInputs e audioInputs sejam arrays
        const videoInputs = Array.isArray(job.params.videoInputs) ? job.params.videoInputs : [];
        const audioInputs = Array.isArray(job.params.audioInputs) ? job.params.audioInputs : [];

        if (videoInputs.length === 0 || audioInputs.length === 0) {
            throw new Error("Todos os videoInputs e audioInputs devem ser arrays não vazios");
        }

        // Validar cada item
        videoInputs.forEach((v, i) => {
            if (!v.path || !v.duration) {
                throw new Error(`videoInput[${i}] deve ter { path, duration }`);
            }
        });
        audioInputs.forEach((a, i) => {
            if (!a.path || !a.duration) {
                throw new Error(`audioInput[${i}] deve ter { path, duration }`);
            }
        });

        // Montar argumentos do FFmpeg
        const args = [];
        const filterParts = [];
        let inputCount = 0;

        for (let i = 0; i < videoInputs.length; i++) {
            const v = videoInputs[i];
            const a = audioInputs[i];

            // Loop 1 imagem para durar o tempo do áudio
            args.push('-loop', '1', '-t', a.duration, '-i', v.path);

            // Adicionar áudio
            args.push('-i', a.path);

            // Para filter_complex: mapear cada par para concatenação final
            filterParts.push(`[${inputCount}:v][${inputCount + 1}:a]`);
            inputCount += 2;
        }

        // Criar filter_complex para concatenar todos
        const concatCount = videoInputs.length;
        const filterComplex = `${filterParts.join('')}concat=n=${concatCount}:v=1:a=1[outv][outa]`;

        // Caminho final
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);

        // Chamar callback para spawn FFmpeg
        ffmpegCallback(job.id, [
            ...args,
            '-filter_complex', filterComplex,
            '-map', '[outv]',
            '-map', '[outa]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-y',
            outputPath
        ], videoInputs.reduce((sum, v) => sum + parseFloat(v.duration), 0));

    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
