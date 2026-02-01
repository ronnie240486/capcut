
import path from 'path';
import { exec } from 'child_process';
import transitionBuilder from './video-engine/transitionBuilder.js';

function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        // Run ffprobe to check for audio streams
        exec(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) {
                console.warn(`[Export] FFprobe error for ${filePath}:`, err.message);
                return resolve({ hasAudio: false });
            }
            // If stdout contains 'audio', it has an audio stream
            const hasAudio = stdout && stdout.includes('audio');
            console.log(`[Export] Checked audio for ${path.basename(filePath)}: ${hasAudio}`);
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
        
        // Config defaults
        const exportConfig = state.exportConfig || {};
        const fps = parseInt(exportConfig.fps) || 30;
        const resolution = exportConfig.resolution || '1080p';

        if (!clips || !media) {
             throw new Error("Invalid project state: missing clips or media");
        }

        const fileMap = {};
        if (job.files && job.files.length > 0) {
            // Process files sequentially to allow async ffprobe
            for (const f of job.files) {
                fileMap[f.originalname] = f.path;
                
                // Server-side Audio Verification
                if (media[f.originalname]) {
                    const info = await getMediaInfo(f.path);
                    if (info.hasAudio) {
                        media[f.originalname].hasAudio = true;
                    } else {
                        // Explicitly set to false if ffprobe finds none
                        media[f.originalname].hasAudio = false;
                    }
                }
            }
        }

        // Use the builder with Export Config
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, exportConfig);

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
            '-crf', resolution === '4k' ? '18' : '23', // Higher quality for 4K
            '-r', String(fps), // Enforce output FPS
            
            // Explicit Audio Args to ensure export has sound
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2',
            '-ar', '44100',
            '-t', String(totalDuration + 0.1), // Allow slight buffer
            outputPath
        ];

        onStart(job.id, args, totalDuration || 30);

    } catch (e) {
        console.error("Export Logic Error:", e);
    }
};
