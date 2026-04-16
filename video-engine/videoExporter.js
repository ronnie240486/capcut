
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import transitionBuilder from './video-engine/transitionBuilder.js';

function validateAndProbe(filePath) {
    return new Promise((resolve) => {
        try {
            const stats = fs.statSync(filePath);
            if (stats.size < 100) { 
                 console.warn(`[Export] Skipping empty/tiny file: ${filePath} (${stats.size} bytes)`);
                 return resolve({ isValid: false });
            }
        } catch(e) {
            console.warn(`[Export] File not found: ${filePath}`);
            return resolve({ isValid: false });
        }

        exec(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) {
                console.warn(`[Export] Probe failed for ${filePath}: ${err.message}`);
                return resolve({ isValid: false });
            }
            const hasAudio = stdout && stdout.includes('audio');
            resolve({ isValid: true, hasAudio });
        });
    });
}

export const handleExportVideo = async (job, uploadDir, onStart) => {
    try {
        const { projectState } = job.params;
        if (!projectState) throw new Error("Missing projectState");

        const state = JSON.parse(projectState);
        const { clips, media, totalDuration } = state;
        const exportConfig = state.exportConfig || {};
        const fps = parseInt(exportConfig.fps) || 30;
        
        const fileMap = {};
        if (job.files && job.files.length > 0) {
            for (const f of job.files) {
                const info = await validateAndProbe(f.path);
                
                if (info.isValid) {
                    fileMap[f.originalname] = f.path;
                    if (media[f.originalname]) {
                        media[f.originalname].hasAudio = info.hasAudio;
                    }
                }
            }
        }

        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, exportConfig, totalDuration);
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
            '-r', String(fps),
            '-vsync', '1',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2',
            '-ar', '44100',
            '-t', String(totalDuration + 0.1),
            '-movflags', '+faststart',
            '-y',
            outputPath
        ];

        onStart(job.id, args, totalDuration || 30);
    } catch (e) {
        console.error("Export Build Error:", e);
        throw e;
    }
};
