
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import transitionBuilder from './transition-builder.js';

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
        const { projectState, plan, narrationFile } = job.params;
        let totalDuration = 0;
        let clips = [];
        let media = {};
        let exportConfig = {};

        if (plan) {
            const p = JSON.parse(plan);
            const stockFilesParsed = job.params.stockFiles ? JSON.parse(job.params.stockFiles) : [];
            const assembledClips = [];
            
            p.scenes.forEach((s, i) => {
                let fileName = '';
                if (s.stockTopic) {
                    const stock = stockFilesParsed.shift();
                    if (stock) {
                        fileName = stock.originalname;
                        if (!job.files.some(f => f.originalname === fileName)) {
                            job.files.push({
                                originalname: fileName,
                                path: stock.path
                            });
                        }
                    }
                }
                
                if (!fileName) {
                    fileName = job.files[s.fileIndex]?.originalname || '';
                }

                assembledClips.push({
                    id: `magic_${i}`,
                    fileName: fileName,
                    start: s.startTime,
                    duration: s.duration,
                    effects: s.filter ? [s.filter] : [],
                    transition: s.transition || 'fade',
                    track: 'video'
                });

                if (s.subtitles) {
                    assembledClips.push({
                        id: `magic_sub_${i}`,
                        type: 'text',
                        track: 'subtitle',
                        start: s.startTime,
                        duration: s.duration,
                        properties: {
                            text: s.subtitles,
                            textDesign: { 
                                color: 'white', 
                                stroke: { width: 2, color: 'black' },
                                animation: { in: 'fade-in', out: 'fade-out', duration: 0.5 }
                            },
                            transform: { y: 280, scale: 0.75 }
                        }
                    });
                }
            });

            // Handle SFX
            if (p.sfx && Array.isArray(p.sfx)) {
                p.sfx.forEach((s, i) => {
                    const sfxName = `${s.type}.mp3`;
                    const sfxPath = path.join(uploadDir, '..', 'assets', 'sfx', sfxName);
                    
                    if (fs.existsSync(sfxPath)) {
                        assembledClips.push({
                            id: `magic_sfx_${i}`,
                            type: 'audio',
                            track: 'sfx',
                            fileName: sfxName,
                            start: s.time,
                            duration: 2,
                            properties: { volume: s.volume || 0.8 }
                        });
                        fileMap[sfxName] = sfxPath;
                    }
                });
            }

            clips = assembledClips;
            totalDuration = clips.reduce((sum, c) => Math.max(sum, c.start + (c.duration || 0)), 0);
            job.files.forEach(f => media[f.originalname] = { type: 'video' });
        } else if (projectState) {
            const state = JSON.parse(projectState);
            clips = state.clips;
            media = state.media;
            totalDuration = state.totalDuration;
            exportConfig = state.exportConfig || {};
        } else {
            throw new Error("Missing projectState or plan");
        }

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

        // Also check uploadDir for pre-uploaded files (from chunked upload)
        if (media) {
            for (const name of Object.keys(media)) {
                if (!fileMap[name]) {
                    const possiblePath = path.join(uploadDir, name);
                    if (fs.existsSync(possiblePath)) {
                        const info = await validateAndProbe(possiblePath);
                        if (info.isValid) {
                            fileMap[name] = possiblePath;
                            media[name].hasAudio = info.hasAudio;
                        }
                    }
                }
            }
        }

        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, exportConfig, totalDuration);
        
        let inputs = [...buildResult.inputs];
        let filterComplex = buildResult.filterComplex;
        let outputMapVideo = buildResult.outputMapVideo || '[v]';
        let outputMapAudio = buildResult.outputMapAudio || '[a]';

        if (narrationFile) {
            const narrationPath = path.join(uploadDir, narrationFile);
            const info = await validateAndProbe(narrationPath);
            
            if (info.isValid && info.hasAudio) {
                // Count how many -i flags are already in inputs
                let inputCount = 0;
                for (let i = 0; i < inputs.length; i++) {
                    if (inputs[i] === '-i') inputCount++;
                }
                
                const narrationIdx = inputCount;
                inputs.push('-i', narrationPath);
                
                // Mix narration into the final audio
                // Use a safer label for the narration
                const narrLabel = `narr_${Date.now()}`;
                filterComplex += `;[${narrationIdx}:a]volume=1.8[${narrLabel}];${outputMapAudio}[${narrLabel}]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mixeda]`;
                outputMapAudio = '[mixeda]';
                console.log(`[Export] Integrated narration file: ${narrationFile} at index ${narrationIdx}`);
            } else {
                console.warn(`[Export] Narration file invalid or missing audio: ${narrationFile}`);
            }
        }

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const args = [
            ...inputs,
            '-filter_complex', filterComplex,
            '-map', outputMapVideo,
            '-map', outputMapAudio,
            
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
