
import fs from 'fs';
import path from 'path';
import transitionBuilder from './video-engine/transitionBuilder.js';

export default async (job, uploadDir, onStart) => {
    try {
        const { projectState } = job.params;
        const state = JSON.parse(projectState);
        const { clips, media, totalDuration } = state;

        // 1. Map files
        const fileMap = {};
        
        // Map uploaded files to clip filenames
        // job.files contains files uploaded via multer
        job.files.forEach(f => {
            fileMap[f.originalname] = f.path;
        });

        // 2. Build Timeline
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media);
        
        if (!buildResult.filterComplex) {
            throw new Error("Timeline vazia ou inválida.");
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        // 3. Construct FFmpeg Args
        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            '-t', totalDuration.toString(), // Hard limit duration
            outputPath
        ];

        // 4. Start Processing
        onStart(job.id, args, totalDuration);

    } catch (e) {
        console.error("Export Error:", e);
        // We can't really report back easily here unless we modified the callback, 
        // but the main server.js catches startup errors if synchronous.
        // For async setup errors, we might need a way to mark job as failed.
    }
};
