// exportVideo.js
import path from 'path';

/**
 * Normaliza os inputs e valida
 */
function normalizeInputs(inputs, type = 'video') {
    if (!inputs) return [];
    if (!Array.isArray(inputs)) throw new Error(`Inputs devem ser um array (${type})`);
    return inputs.map(input => {
        if (!input.path) throw new Error(`Cada input deve ter { path, duration } (${type})`);
        return { path: input.path, duration: input.duration || 5 };
    });
}

/**
 * Handle Export Video
 * @param {Object} job - job do servidor
 * @param {string} uploadDir - diretório de uploads
 * @param {Function} callback - (jobId, args, duration)
 */
export async function handleExportVideo(job, uploadDir, callback) {
    try {
        if (!job.files || job.files.length === 0) {
            throw new Error("Nenhum arquivo enviado");
        }

        console.log(`[Export] Arquivos recebidos:`, job.files.map(f => ({
            name: f.originalname,
            type: f.mimetype,
            path: f.path
        })));

        // Cria arrays para FFmpeg
        const videoInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('video')),
            'video'
        );

        const audioInputs = normalizeInputs(
            job.files.filter(f => f.mimetype.startsWith('audio')),
            'audio'
        );

        if (videoInputs.length === 0 && audioInputs.length === 0) {
            throw new Error("Nenhum vídeo ou áudio válido enviado");
        }

        // Cria caminho de saída
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);

        // Monta args para FFmpeg
        const args = [];

        // Adiciona vídeos
        videoInputs.forEach(v => {
            args.push('-i', v.path);
        });

        // Adiciona áudios
        audioInputs.forEach(a => {
            args.push('-i', a.path);
        });

        // Filter Complex básico para vídeos + transições simples
        const filters = [];
        if (videoInputs.length > 0) {
            // exemplo: aplica fade in/out em cada vídeo
            videoInputs.forEach((v, i) => {
                filters.push(`[${i}:v]fade=t=in:st=0:d=1,fade=t=out:st=${v.duration - 1}:d=1[v${i}]`);
            });

            // concatena vídeos
            const concatInputs = videoInputs.map((v, i) => `[v${i}]`).join('');
            filters.push(`${concatInputs}concat=n=${videoInputs.length}:v=1:a=0[outv]`);
            args.push('-filter_complex', filters.join(';'));
            args.push('-map', '[outv]');
        }

        // Mapeia áudio (simplesmente pega todos)
        audioInputs.forEach((a, i) => {
            args.push('-map', `${videoInputs.length + i}:a`);
        });

        // Código de saída
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', outputPath);

        console.log(`[Export] FFmpeg Args:`, args);

        // Duration total estimado (soma dos vídeos ou fallback 5s)
        const totalDuration = videoInputs.reduce((sum, v) => sum + v.duration, 0) || 5;

        callback(job.id, args, totalDuration);

    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
