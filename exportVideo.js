
import path from 'path';
import { exec } from 'child_process';
import transitionBuilder from './video-engine/transitionBuilder.js';

function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ hasAudio: false });
            // Check if any line in output indicates 'audio' stream
            const hasAudio = stdout.includes('audio');
            resolve({ hasAudio });
        });
    });
}

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
            // Process files sequentially to allow async ffprobe
            for (const f of job.files) {
                fileMap[f.originalname] = f.path;
                
                // Server-side Audio Verification
                // Update the media state if the file physically has audio
                // This fixes issues where browser reported no audio for MKV/AVI/Some MP4s
                if (media[f.originalname]) {
                    const info = await getMediaInfo(f.path);
                    if (info.hasAudio) {
                        console.log(`[Export] Audio detected in ${f.originalname}`);
                        media[f.originalname].hasAudio = true;
                    }
                }
            }
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
            // Explicit Video Args
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            // Explicit Audio Args to ensure export has sound
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2',
            '-ar', '44100',
            '-t', String(totalDuration || 30),
            outputPath
        ];

        onStart(job.id, args, totalDuration || 30);

    } catch (e) {
        console.error("Export Logic Error:", e);
    }
};
