export async function handleExportVideo(job, uploadDir, callback) {
    try {
        // Normaliza entradas de vídeo e áudio
        const videoInputs = (job.files || [])
            .filter(f => f.mimetype.startsWith('video'))
            .map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 }));

        const audioInputs = (job.files || [])
            .filter(f => f.mimetype.startsWith('audio'))
            .map(f => ({ path: f.path, duration: parseFloat(job.params.duration) || 5 }));

        if (!videoInputs.length && !audioInputs.length) {
            throw new Error("Nenhum vídeo ou áudio enviado");
        }

        // Gera outputPath único
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);

        // Exemplo: construir args FFmpeg básico (concat ou filtros)
        const args = [];

        // Adiciona vídeos
        videoInputs.forEach(v => args.push('-i', v.path));

        // Adiciona áudios
        audioInputs.forEach(a => args.push('-i', a.path));

        // Para simplificação: codifica todos os streams
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', outputPath);

        console.log(`[handleExportVideo] Preparado para FFmpeg. Output: ${outputPath}`);

        // Chama callback passando o outputPath
        callback(job.id, args, 0, outputPath);

    } catch (err) {
        console.error("Erro em handleExportVideo:", err);
        throw err;
    }
}
