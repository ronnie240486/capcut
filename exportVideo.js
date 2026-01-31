
import path from 'path';
import transitionBuilder from './video-engine/transitionBuilder.js';

export default async (job, uploadDir, onStart) => {
    try {
        const { projectState } = job.params;
        const state = JSON.parse(projectState);
        const { clips, media, totalDuration } = state;

        const fileMap = {};
        job.files.forEach(f => {
            fileMap[f.originalname] = f.path;
        });

        // Use the new builder which separates layers
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media);

        if (!buildResult.filterComplex) {
            throw new Error("Empty timeline");
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            '-t', String(totalDuration),
            outputPath
        ];

        onStart(job.id, args, totalDuration);

    } catch (e) {
        console.error("Export Error:", e);
        // Fail job logic here would be nice if sync
    }
};
