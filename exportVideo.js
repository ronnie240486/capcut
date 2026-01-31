
const fs = require('fs');
const path = require('path');
const transitionBuilder = require('./video-engine/transitionBuilder.js');

module.exports = async (job, uploadDir, onStart) => {
    try {
        if (!job || !job.params || !job.params.projectState) {
            throw new Error("Estado do projeto ausente ou inválido.");
        }

        const { projectState } = job.params;
        let state;
        try {
            state = JSON.parse(projectState);
        } catch (e) {
            throw new Error("JSON do projeto corrompido.");
        }

        const { clips, media, totalDuration } = state;

        if (!clips || clips.length === 0) {
            throw new Error("Timeline vazia.");
        }

        // 1. Map files
        const fileMap = {};
        
        // Map uploaded files to clip filenames
        if (job.files) {
            job.files.forEach(f => {
                fileMap[f.originalname] = f.path;
            });
        }

        // 2. Build Timeline
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media);
        
        if (!buildResult || !buildResult.filterComplex) {
            throw new Error("Falha ao gerar grafo de filtros. Verifique se as mídias são suportadas.");
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        // 3. Construct FFmpeg Args (Ultra Fast Optimization)
        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            
            // Video Encoding Settings (Ultra Fast)
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', // Prioritize speed over compression
            '-tune', 'fastdecode',  // Optimize for fast decoding/encoding
            '-crf', '28',           // Lower quality slightly for speed (Standard is 23, 28 is faster/smaller)
            '-pix_fmt', 'yuv420p',
            '-shortest',            // Finish when shortest stream ends
            
            // Audio Encoding Settings
            '-c:a', 'aac', 
            '-b:a', '128k',         // 128k is sufficient and faster
            '-ac', '2',
            
            // Container Settings
            '-movflags', '+faststart',
            '-t', String(totalDuration || 60), // Safety duration limit
            outputPath
        ];

        // 4. Start Processing
        onStart(job.id, args, totalDuration);

    } catch (e) {
        console.error("Export Error:", e);
        // Critical: Update job status so frontend stops loading
        job.status = 'failed';
        job.error = e.message || "Erro interno na exportação.";
    }
};
