
const path = require('path');
const fs = require('fs');
const transitionBuilder = require('./video-engine/transitionBuilder.js');
const presetGenerator = require('./video-engine/presetGenerator.js');

module.exports = async function handleExport(job, uploadDir, createFFmpegJob) {
    console.log("Iniciando exportação para Job:", job.id);

    // 1. Validar Project State
    const projectStateStr = job.params.projectState;
    if (!projectStateStr) {
        job.status = 'failed';
        job.error = "Dados do projeto não encontrados (projectState missing).";
        return;
    }

    let projectState;
    try {
        projectState = JSON.parse(projectStateStr);
    } catch (e) {
        job.status = 'failed';
        job.error = "Dados do projeto corrompidos.";
        return;
    }

    const clips = projectState.clips || [];
    if (clips.length === 0) {
        job.status = 'failed';
        job.error = "Timeline vazia.";
        return;
    }

    // 2. Mapear Arquivos Físicos
    const fileMap = {};
    if (job.files && job.files.length > 0) {
        job.files.forEach(f => {
            fileMap[f.originalname] = f.path;
        });
    }

    // 3. Separar Clipes Visuais (Main Track) e Clipes de Áudio (Overlay/Music)
    const visualClips = clips
        .filter(c => ['video', 'image', 'camada'].includes(c.track) || c.type === 'video' || c.type === 'image')
        .sort((a, b) => a.start - b.start);

    // Clipes de áudio puro (music, narration, sfx) ou qualquer clipe na trilha de áudio
    const audioClips = clips
        .filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.type === 'audio' && !visualClips.includes(c)))
        .sort((a, b) => a.start - b.start);

    if (visualClips.length === 0) {
        job.status = 'failed';
        job.error = "Nenhum clipe visual para exportar.";
        return;
    }

    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    job.outputPath = outputPath;

    // 4. Construir Timeline Visual (Concatenação sequencial)
    const mediaLibrary = projectState.media || {};
    const visualResult = transitionBuilder.buildTimeline(visualClips, fileMap, mediaLibrary);
    
    if (!visualResult.filterComplex) {
        job.status = 'failed';
        job.error = "Erro ao gerar filtros de renderização.";
        return;
    }

    let { inputs, filterComplex, outputMapVideo, outputMapAudio } = visualResult;
    
    // 5. Processar Áudio Tracks (Mixing)
    // Inicializa lista de streams para mixar (começa com o áudio do vídeo principal)
    let audioStreamsToMix = [];
    if (outputMapAudio) {
        audioStreamsToMix.push(outputMapAudio);
    }

    // O índice de inputs continua de onde o builder parou
    let nextInputIndex = inputs.length / 2;

    audioClips.forEach((clip, i) => {
        const filePath = fileMap[clip.fileName];
        if (!filePath) {
            console.warn(`Arquivo de áudio faltando: ${clip.fileName}`);
            return;
        }

        inputs.push('-i', filePath);
        const currentIndex = nextInputIndex++;
        const label = `audmix${i}`;
        
        // Cálculos de tempo
        const delayMs = Math.round(clip.start * 1000);
        const mediaStart = clip.mediaStartOffset || 0;
        const dur = clip.duration;

        // Construir filtro de áudio
        // 1. Select Stream
        // 2. Trim (Corte do arquivo original)
        // 3. Volume
        // 4. Delay (Posição na timeline)
        
        let af = `[${currentIndex}:a]atrim=start=${mediaStart}:duration=${mediaStart + dur},asetpts=PTS-STARTPTS`;
        
        if (clip.properties && clip.properties.volume !== undefined) {
            af += `,volume=${clip.properties.volume}`;
        }
        
        if (delayMs > 0) {
            af += `,adelay=${delayMs}|${delayMs}`;
        }
        
        af += `[${label}];`;
        filterComplex += af;
        audioStreamsToMix.push(`[${label}]`);
    });

    // 6. Mix Final
    let finalAudioMap = outputMapAudio; // Se não houver extras, usa o original
    
    if (audioStreamsToMix.length > 1) {
        const mixLabel = 'amixed_final';
        // amix: inputs=N, duration=first (duração igual ao vídeo principal), dropout_transition=2 (suave)
        // duration=first garante que a música não estenda o vídeo além do visual
        filterComplex += `${audioStreamsToMix.join('')}amix=inputs=${audioStreamsToMix.length}:duration=first:dropout_transition=2[${mixLabel}]`;
        finalAudioMap = `[${mixLabel}]`;
    }

    // 7. Montar Comando Final
    const finalArgs = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', outputMapVideo,
        '-map', finalAudioMap, // Usa o mapa mixado
        ...presetGenerator.getVideoArgs(),
        ...presetGenerator.getAudioArgs(),
        '-y', outputPath
    ];

    console.log("FFmpeg Filter Chain Size:", filterComplex.length);

    const totalDuration = visualClips.reduce((acc, c) => acc + (c.duration || 5), 0);

    createFFmpegJob(job.id, finalArgs, totalDuration);
};
