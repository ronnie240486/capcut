import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export async function handleExportVideo(job, uploadDir, ffmpegCallback) {
    try {
        if (!job) throw new Error("Job não definido");
        const params = job.params || {};

        // Video inputs: parse JSON se veio como string
        let videoInputs = [];
        if (Array.isArray(params.videoInputs)) videoInputs = params.videoInputs;
        else if (params.videoInputs) videoInputs = JSON.parse(params.videoInputs);

        let audioInputs = [];
        if (Array.isArray(params.audioInputs)) audioInputs = params.audioInputs;
        else if (params.audioInputs) audioInputs = JSON.parse(params.audioInputs);

        if (!Array.isArray(videoInputs) || !Array.isArray(audioInputs)) {
            throw new Error("Inputs devem ser um array");
        }

        // Validar cada entrada
        videoInputs.forEach((v, i) => {
            if (!v.path || !v.duration) throw new Error(`Todos os videoInputs devem ter { path, duration } (item ${i})`);
            v.duration = parseFloat(v.duration);
        });

        audioInputs.forEach((a, i) => {
            if (!a.path || !a.duration) throw new Error(`Todos os audioInputs devem ter { path, duration } (item ${i})`);
            a.duration = parseFloat(a.duration);
        });

        // Montar argumentos FFmpeg
        const ffmpegArgs = [];
        videoInputs.forEach(v => ffmpegArgs.push('-loop', '1', '-t', v.duration.toString(), '-i', path.resolve(uploadDir, path.basename(v.path))));
        audioInputs.forEach(a => ffmpegArgs.push('-i', path.resolve(uploadDir, path.basename(a.path))));

        // Video codec + áudio
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k');

        // Duração mínima entre vídeos e áudio
        ffmpegArgs.push('-shortest');

        // Output
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);

        // Chamar callback do server.js para criar job FFmpeg
        ffmpegCallback(job.id, ffmpegArgs.concat(['-y', outputPath]), videoInputs.reduce((a,b) => a + b.duration, 0));

        // Salvar path final no job
        job.outputPath = outputPath;

    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
