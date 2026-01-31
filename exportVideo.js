
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

        const { clips, media, totalDuration, exportConfig } = state;

        if (!clips || clips.length === 0) {
            throw new Error("Timeline vazia.");
        }

        // Default Config if missing
        const config = exportConfig || { resolution: '720p', fps: 30, format: 'mp4' };

        // 1. Map files
        const fileMap = {};
        
        // Map uploaded files to clip filenames
        if (job.files) {
            job.files.forEach(f => {
                fileMap[f.originalname] = f.path;
            });
        }

        // 2. Build Timeline with Config
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, config);
        
        if (!buildResult || !buildResult.filterComplex) {
            throw new Error("Falha ao gerar grafo de filtros. Verifique se as mídias são suportadas.");
        }

        const ext = config.format === 'webm' ? 'webm' : config.format === 'mov' ? 'mov' : 'mp4';
        const outputPath = path.join(uploadDir, `export_${Date.now()}.${ext}`);
        job.outputPath = outputPath;

        // 3. Construct FFmpeg Args (Optimized)
        const fps = config.fps || 30;
        
        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            
            // Video Encoding Settings
            '-c:v', config.format === 'webm' ? 'libvpx-vp9' : 'libx264', 
            '-preset', 'ultrafast', // Prioritize speed
            '-tune', 'fastdecode',  
            '-crf', '23',           // Better quality than 28
            '-pix_fmt', 'yuv420p',
            '-r', String(fps),      // Force Output FPS
            
            // Audio Encoding Settings
            '-c:a', 'aac', 
            '-b:a', '192k',         // Higher bitrate for audio
            '-ar', '44100',
            '-ac', '2',
            
            // Container Settings
            '-movflags', '+faststart',
            '-t', String(totalDuration + 1), // Safety duration limit
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
