
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const transitionBuilder = require('./video-engine/transitionBuilder.js');

function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ hasAudio: false });
            // stdout contains 'audio' if an audio stream exists
            const hasAudio = stdout.includes('audio');
            resolve({ hasAudio });
        });
    });
}

module.exports = async (job, uploadDir, onStart) => {
    try {
        const { projectState } = job.params;
        const state = JSON.parse(projectState);
        const { clips, media, totalDuration } = state;

        // 1. Map files & Detect Audio (Server-Side Source of Truth)
        const fileMap = {};
        
        // Process all uploaded files to update audio status
        const metadataPromises = job.files.map(async (f) => {
            fileMap[f.originalname] = f.path;
            
            // Re-verify audio existence on server side because frontend detection is unreliable
            const info = await getMediaInfo(f.path);
            
            // Update media library state if the file exists there
            if (media[f.originalname]) {
                media[f.originalname].hasAudio = info.hasAudio;
            }
        });

        await Promise.all(metadataPromises);

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
    }
};
