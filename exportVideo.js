
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

    // 3. Separar Clipes Visuais e de Áudio
    const visualClips = clips
        .filter(c => ['video', 'image', 'camada'].includes(c.track) || c.type === 'video' || c.type === 'image')
        .sort((a, b) => a.start - b.start);

    const audioClips = clips
        .filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.type === 'audio' && !visualClips.includes(c)))
        .sort((a, b) => a.start - b.start);

    if (visualClips.length === 0) {
        job.status = 'failed';
        job.error = "Nenhum clipe visual para exportar.";
        return;
    }

    const outputExt = job.params.format === 'mp3' || job.params.type === 'audio' ? '.mp3' : '.mp4';
    const outputPath = path.join(uploadDir, `export-${Date.now()}${outputExt}`);
    job.outputPath = outputPath;

    // 4. Construir Timeline Visual
    const mediaLibrary = projectState.media || {};
    const visualResult = transitionBuilder.buildTimeline(visualClips, fileMap, mediaLibrary);
    
    if (!visualResult.filterComplex) {
        job.status = 'failed';
        job.error = "Erro ao gerar filtros de renderização.";
        return;
    }

    let { inputs, filterComplex, outputMapVideo, outputMapAudio } = visualResult;
    
    // 5. Processar Áudio Tracks (Mixing)
    let audioStreamsToMix = [];
    
    // Adiciona o áudio do vídeo principal se existir
    if (outputMapAudio) {
        audioStreamsToMix.push(outputMapAudio);
    }

    // A lista 'inputs' vem do builder com formato ['-i', path, '-i', path].
    // O número de inputs já usados é inputs.length / 2.
    let nextInputIndex = inputs.length / 2;

    audioClips.forEach((clip, i) => {
        const filePath = fileMap[clip.fileName];
        if (!filePath) {
            console.warn(`Arquivo de áudio faltando: ${clip.fileName}`);
            return;
        }

        const mediaItem = mediaLibrary[clip.fileName];
        
        // Verifica se o arquivo realmente tem áudio antes de tentar processar
        let hasStream = true;
        if (mediaItem) {
            if (mediaItem.type === 'image') hasStream = false;
            // Se for vídeo e explicitamente disser que não tem áudio
            if (mediaItem.type === 'video' && mediaItem.hasAudio === false) hasStream = false;
        } else {
            // Fallback se não tiver metadados: imagem nunca tem áudio
            if (clip.type === 'image') hasStream = false;
        }

        if (!hasStream) {
            console.log(`Skipping audio clip ${clip.id} (no audio stream)`);
            return;
        }

        inputs.push('-i', filePath);
        const currentIndex = nextInputIndex++;
        const label = `audmix${i}`;
        
        const delayMs = Math.round(clip.start * 1000);
        const mediaStart = clip.mediaStartOffset || 0;
        const dur = clip.duration;

        // Padroniza formato do áudio extra também
        let af = `[${currentIndex}:a]atrim=start=${mediaStart}:duration=${mediaStart + dur},asetpts=PTS-STARTPTS`;
        
        if (clip.properties && clip.properties.volume !== undefined) {
            af += `,volume=${clip.properties.volume}`;
        }
        
        if (delayMs > 0) {
            af += `,adelay=${delayMs}|${delayMs}`;
        }
        
        // Garante formato compatível
        af += `,aformat=sample_rates=44100:channel_layouts=stereo[${label}];`;
        filterComplex += af;
        audioStreamsToMix.push(`[${label}]`);
    });

    // 6. Mix Final
    let finalAudioMap = outputMapAudio;
    
    if (audioStreamsToMix.length > 1) {
        const mixLabel = 'amixed_final';
        // duration=first: termina quando o vídeo termina
        // dropout_transition=0: evita fade repentino
        // normalize=0: não normaliza volume (controlamos manualmente)
        filterComplex += `${audioStreamsToMix.join('')}amix=inputs=${audioStreamsToMix.length}:duration=first:dropout_transition=0[${mixLabel}]`;
        finalAudioMap = `[${mixLabel}]`;
    } else if (audioStreamsToMix.length === 1) {
        finalAudioMap = audioStreamsToMix[0];
    }

    // 7. Montar Comando Final
    const finalArgs = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', outputMapVideo,
        '-map', finalAudioMap || '0:a?', // Fallback seguro
        ...presetGenerator.getVideoArgs(),
        ...presetGenerator.getAudioArgs(),
        '-y', outputPath
    ];

    console.log("FFmpeg Filter Chain Size:", filterComplex.length);

    const totalDuration = visualClips.reduce((acc, c) => acc + (c.duration || 5), 0);

    createFFmpegJob(job.id, finalArgs, totalDuration);
};
