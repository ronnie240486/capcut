
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import transitionBuilder from './video-engine/transitionBuilder.js';

function validateAndProbe(filePath) {
    return new Promise((resolve) => {
        // 1. Basic Size Check
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

        // 2. FFprobe Check
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
        
        // Mapeamento de arquivos
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

        // Pass totalDuration to buildTimeline
        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, exportConfig, totalDuration);
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            
            // Codec de Vídeo Otimizado
            '-c:v', 'libx264',
            '-preset', 'ultrafast', // Rápido para UX, mas seguro
            '-crf', '23', // Boa qualidade visual
            '-pix_fmt', 'yuv420p', // Compatibilidade máxima
            
            // FORÇAR SINCRONIA DE VÍDEO
            '-r', String(fps), // Força output FPS constante
            '-vsync', '1',     // CFR (Constant Frame Rate) - vital para evitar drift
            
            // Codec de Áudio Otimizado
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2',
            '-ar', '44100',
            
            // Duração e Container
            '-t', String(totalDuration + 0.1), // Garante que não corte o último frame
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
