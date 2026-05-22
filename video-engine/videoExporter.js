
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

        const fps = parseInt(exportConfig.fps) || 30;
        const fileMap = {};

        if (plan) {
            const p = JSON.parse(plan);
            const stockFilesParsed = job.params.stockFiles ? JSON.parse(job.params.stockFiles) : [];
            const assembledClips = [];
            
            // Handle Background Music if present in plan
            if (p.bgMusic) {
                const musicName = p.bgMusic.name || 'background_music.mp3';
                const musicFile = job.files.find(f => f.originalname === musicName || f.path.includes(musicName));
                if (musicFile) {
                    assembledClips.push({
                        id: 'magic_bg_music',
                        type: 'audio',
                        track: 'music',
                        fileName: musicName,
                        start: 0,
                        duration: 9999, // Will be trimmed by buildTimeline
                        properties: { volume: p.bgMusic.volume || 0.3 }
                    });
                    fileMap[musicName] = musicFile.path;
                    media[musicName] = { type: 'audio' };
                }
            }

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

                const layout = s.layout || 'fullscreen';
                const startTime = s.startTime || (i === 0 ? 0 : assembledClips.reduce((max, c) => Math.max(max, c.start + (c.duration || 0)), 0));

                if (layout === 'overlay_pop') {
                    // Background Layer
                    assembledClips.push({
                        id: `scene_bg_${i}`,
                        fileName: fileName,
                        start: startTime,
                        duration: s.duration,
                        effect: 'boxblur=luma_radius=20:luma_power=1,eq=brightness=-0.1',
                        transition: s.transition || 'fade',
                        track: 'video',
                        properties: {
                            movement: s.movement ? { type: s.movement, config: {} } : { type: 'kenBurns', config: {} },
                            fit: 'cover'
                        }
                    });

                    // Foreground Overlay Layer
                    assembledClips.push({
                        id: `scene_ov_${i}`,
                        fileName: fileName,
                        start: startTime,
                        duration: s.duration,
                        track: 'camada',
                        properties: {
                            transform: { scale: 0.8, x: 0, y: 0 },
                            movement: s.movement ? { type: s.movement, config: {} } : null
                        }
                    });
                } else if (layout === 'impact_shake') {
                    assembledClips.push({
                        id: `scene_impact_${i}`,
                        fileName: fileName,
                        start: startTime,
                        duration: s.duration,
                        effect: s.filter || null,
                        transition: s.transition || 'fade',
                        track: 'video',
                        properties: {
                            movement: { type: 'shake-hard', config: { intensity: 1.5, speed: 2 } },
                            fit: 'cover'
                        }
                    });
                } else {
                    // Default Fullscreen
                    assembledClips.push({
                        id: `magic_${i}`,
                        fileName: fileName,
                        start: startTime,
                        duration: s.duration,
                        effect: s.filter || null,
                        transition: s.transition || 'fade',
                        track: 'video',
                        properties: {
                            movement: s.movement ? { type: s.movement, config: {} } : null,
                            fit: 'cover'
                        }
                    });
                }

                const subtitleText = s.subtitle || s.subtitles;
                if (subtitleText) {
                    assembledClips.push({
                        id: `magic_sub_${i}`,
                        type: 'text',
                        track: 'subtitle',
                        start: s.startTime || (assembledClips[assembledClips.length-1]?.start || 0),
                        duration: s.duration,
                        properties: {
                            text: subtitleText,
                            textDesign: { 
                                color: 'white', 
                                stroke: { width: 4, color: 'black' },
                                animation: { in: 'fade-in', out: 'fade-out', duration: 0.3 }
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
            job.files.forEach(f => {
                if (!media[f.originalname]) {
                    media[f.originalname] = { type: f.mimetype?.includes('audio') ? 'audio' : 'video' };
                }
            });
        } else if (projectState) {
            let state;
            try {
                state = typeof projectState === 'string' ? JSON.parse(projectState) : projectState;
            } catch (pErr) {
                console.error("[Export] ProjectState parse error:", pErr);
                throw new Error("Falha ao processar dados do projeto. O projeto pode ser muito grande ou estar corrompido.");
            }
            clips = state.clips || [];
            media = state.media || {};
            totalDuration = state.totalDuration || 0;
            exportConfig = state.exportConfig || {};
            // Free memory from the massive projectState string after parsing
            delete job.params.projectState;
        } else {
            throw new Error("Missing projectState or plan");
        }

        if (job.files && job.files.length > 0) {
            for (const f of job.files) {
                if (fileMap[f.originalname]) continue;
                const info = await validateAndProbe(f.path);
                
                if (info.isValid) {
                    fileMap[f.originalname] = f.path;
                    if (media[f.originalname]) {
                        media[f.originalname].hasAudio = info.hasAudio;
                    }
                }
            }
        }

        const sanitizeFilename = (name) => name.replace(/[^a-z0-9._-]/gi, '_');

        // Also check uploadDir for pre-uploaded files (from chunked upload)
        if (media) {
            for (const name of Object.keys(media)) {
                if (!fileMap[name]) {
                    const possiblePath = path.join(uploadDir, name);
                    const sanitizedPath = path.join(uploadDir, sanitizeFilename(name));
                    
                    if (fs.existsSync(possiblePath)) {
                        const info = await validateAndProbe(possiblePath);
                        if (info.isValid) {
                            fileMap[name] = possiblePath;
                            media[name].hasAudio = info.hasAudio;
                        }
                    } else if (fs.existsSync(sanitizedPath)) {
                        const info = await validateAndProbe(sanitizedPath);
                        if (info.isValid) {
                            fileMap[name] = sanitizedPath;
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
                const narrLabel = `narr_${Date.now()}`;
                filterComplex += `;[${narrationIdx}:a]volume=1.8[${narrLabel}];${outputMapAudio}[${narrLabel}]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mixeda]`;
                outputMapAudio = '[mixeda]';
            }
        }

        const filterScriptPath = path.join(uploadDir, `filter_${job.id}.txt`);
        fs.writeFileSync(filterScriptPath, filterComplex);

        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const args = [
            ...inputs,
            '-filter_complex_script', filterScriptPath,
            '-map', outputMapVideo,
            '-map', outputMapAudio,
            
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28', // Higher CRF = less memory/bitrate
            '-pix_fmt', 'yuv420p',
            '-r', String(fps),
            '-vsync', 'cfr',
            '-max_muxing_queue_size', '8192', // Much higher for 2h videos
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', '2',
            '-ar', '44100',
            '-t', String(totalDuration + 0.1),
            '-movflags', '+faststart',
            '-threads', '1', // STRICT limit to save memory on long renders
            '-y',
            outputPath
        ];

        onStart(job.id, args, totalDuration || 30);
    } catch (e) {
        console.error("Export Build Error:", e);
        throw e;
    }
};
