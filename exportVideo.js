
import path from 'path';
import { exec } from 'child_process';
import transitionBuilder from './video-engine/transitionBuilder.js';

function getMediaInfo(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve({ hasAudio: false });
            const hasAudio = stdout && stdout.includes('audio');
            resolve({ hasAudio });
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
                fileMap[f.originalname] = f.path;
                if (media[f.originalname]) {
                    const info = await getMediaInfo(f.path);
                    media[f.originalname].hasAudio = info.hasAudio;
                }
            }
        }

        const buildResult = transitionBuilder.buildTimeline(clips, fileMap, media, exportConfig);
        const outputPath = path.join(uploadDir, `export_${Date.now()}.mp4`);
        job.outputPath = outputPath;

        // --- EXPORTAÇÃO DE ALTA PERFORMANCE & SINCRONIA ---
        const args = [
            ...buildResult.inputs,
            '-filter_complex', buildResult.filterComplex,
            '-map', buildResult.outputMapVideo,
            '-map', buildResult.outputMapAudio,
            
            // Codec de Vídeo
            '-c:v', 'libx264',
            '-preset', 'ultrafast', // Mantido ultrafast para mobile, mas compensado com flags de sync
            '-tune', 'zerolatency',
            '-crf', '26', // Qualidade balanceada
            '-pix_fmt', 'yuv420p',
            '-r', String(fps),
            
            // SINCRONIA DE VÍDEO (CRÍTICO)
            '-vsync', '1', // CFR: Constant Frame Rate (força quadros a baterem com o timestamp)
            
            // Codec de Áudio
            '-c:a', 'aac',
            '-b:a', '192k', // Alta qualidade de áudio
            '-ac', '2',
            '-ar', '44100',
            
            // SINCRONIA DE ÁUDIO (CRÍTICO)
            '-af', 'aresample=async=1', // Compensa drift de timestamp de áudio
            
            // Duração e Metadados
            '-t', String(totalDuration + 0.1), // Pequena margem de segurança
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
