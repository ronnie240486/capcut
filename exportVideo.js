
const fs = require('fs');
const path = require('path');
const transitionBuilder = require('./video-engine/transitionBuilder.js');

module.exports = async (job, uploadDir, onStart) => {
    try {
        const { projectState } = job.params;
        let state;
        try {
            state = JSON.parse(projectState);
        } catch (e) {
            throw new Error("Falha ao processar dados do projeto (JSON inválido).");
        }
        
        const { clips, media, totalDuration } = state;

        if (!clips || !Array.isArray(clips)) {
            throw new Error("Dados do projeto inválidos: lista de clipes ausente.");
        }

        // 1. Map files
        const fileMap = {};
        
        // Map uploaded files to clip filenames
        if (job.files && Array.isArray(job.files)) {
            job.files.forEach(f => {
                // console.log(`Mapped file: ${f.originalname} -> ${f.path}`);
                fileMap[f.originalname] = f.path;
            });
        } else {
            console.warn("No files uploaded for export job");
        }

        // 2. Build Timeline (Pass totalDuration)
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, totalDuration || 5);
        
        if (!buildResult || !buildResult.filterComplex) {
            console.warn("Timeline vazia gerada. Verifique se os arquivos foram enviados corretamente.");
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        // 3. Construct FFmpeg Args
        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex || `nullsrc=s=1280x720:d=${totalDuration||5}[outv];anullsrc=d=${totalDuration||5}[outa]`, 
            '-map', buildResult.outputMapVideo || '[outv]',
            '-map', buildResult.outputMapAudio || '[outa]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            '-t', String(totalDuration || 5), 
            '-f', 'mp4',
            '-y', 
            outputPath
        ];

        // 4. Start Processing
        onStart(job.id, args, totalDuration || 5);

    } catch (e) {
        console.error("Export Error:", e);
        throw e; 
    }
};
