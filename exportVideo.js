
import path from 'path';
import transitionBuilder from './video-engine/transitionBuilder.js';

export const handleExportVideo = async (job, uploadDir, onStart) => {
    try {
        console.log(`[Export] Starting job ${job.id}`);
        const { projectState } = job.params;
        
        if (!projectState) {
            throw new Error("Missing projectState in export params");
        }

        let state;
        try {
            state = JSON.parse(projectState);
        } catch (e) {
            throw new Error("Invalid JSON in projectState");
        }

        const { clips, media, totalDuration } = state;

        if (!clips || !media) {
             throw new Error("Invalid project state: missing clips or media");
        }

        const fileMap = {};
        if (job.files && job.files.length > 0) {
            job.files.forEach(f => {
                fileMap[f.originalname] = f.path;
            });
        }

        // Use the builder
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media);

        if (!buildResult.filterComplex) {
            throw new Error("Empty timeline generated");
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', 
            '-crf', '23', 
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', 
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-t', String(totalDuration || 30),
            outputPath
        ];

        onStart(job.id, args, totalDuration || 30);

    } catch (e) {
        console.error("Export Logic Error:", e);
        // We can't easily fail the job from here without callback, 
        // but the server logs will show it and FFmpeg spawn won't happen.
    }
};
