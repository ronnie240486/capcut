
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const transitionBuilder = require('./video-engine/transitionBuilder.js');
const presetGenerator = require('./video-engine/presetGenerator.js');

function checkAudioStream(filePath) {
    return new Promise((resolve) => {
        // -select_streams a verifies if any audio stream exists
        // -show_entries stream=codec_type will output 'audio' if found
        exec(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`, (err, stdout) => {
            if (err) return resolve(false);
            // Strict check: output must contain 'audio' (case insensitive)
            resolve(stdout && stdout.toLowerCase().includes('audio'));
        });
    });
}

module.exports = async function handleExport(job, uploadDir, createFFmpegJob) {
    console.log("Iniciando exportação para Job:", job.id);

    const projectStateStr = job.params.projectState;
    if (!projectStateStr) {
        job.status = 'failed';
        job.error = "Dados do projeto não encontrados.";
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

    const fileMap = {};
    if (job.files && job.files.length > 0) {
        job.files.forEach(f => {
            fileMap[f.originalname] = f.path;
        });
    }

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

    // Check Audio for Visual Clips
    const audioPresenceMap = {};
    for (const clip of visualClips) {
        if (clip.type === 'video') {
            const filePath = fileMap[clip.fileName];
            if (filePath && audioPresenceMap[clip.fileName] === undefined) {
                audioPresenceMap[clip.fileName] = await checkAudioStream(filePath);
            }
        }
    }

    const mediaLibrary = projectState.media || {};
    const visualResult = transitionBuilder.buildTimeline(visualClips, fileMap, mediaLibrary, audioPresenceMap);
    
    if (!visualResult.filterComplex) {
        job.status = 'failed';
        job.error = "Erro ao gerar filtros de renderização.";
        return;
    }

    let { inputs, filterComplex, outputMapVideo, outputMapAudio } = visualResult;
    
    let audioStreamsToMix = [];
    if (outputMapAudio) {
        audioStreamsToMix.push(outputMapAudio);
    }

    // IMPORTANT: Correctly calculate next input index based on what transitionBuilder produced
    // Since transitionBuilder adds '-i' and 'path', length is 2x number of inputs
    let nextInputIndex = inputs.length / 2;

    // CRITICAL FIX: Ensure there is a separator between the visual/concat filters and the new audio filters
    if (filterComplex && !filterComplex.trim().endsWith(';')) {
        filterComplex += ';';
    }

    for (const clip of audioClips) {
        const filePath = fileMap[clip.fileName];
        if (!filePath) {
            console.warn(`Arquivo de áudio faltando: ${clip.fileName}`);
            continue;
        }

        // Always verify stream presence to prevent 'No output pad' errors for audio tracks too
        let hasStream = true;
        if (audioPresenceMap[clip.fileName] !== undefined) {
            hasStream = audioPresenceMap[clip.fileName];
        } else {
            hasStream = await checkAudioStream(filePath);
            audioPresenceMap[clip.fileName] = hasStream;
        }

        if (!hasStream) {
            console.log(`Skipping audio clip ${clip.id} (no audio stream detected)`);
            continue;
        }

        inputs.push('-i', filePath);
        const currentIndex = nextInputIndex++;
        const label = `audmix${clip.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        const delayMs = Math.round(clip.start * 1000);
        const mediaStart = clip.mediaStartOffset || 0;
        const dur = clip.duration;

        // Use [idx:a:0] to explicitly select first audio stream
        let af = `[${currentIndex}:a:0]atrim=start=${mediaStart}:duration=${mediaStart + dur},asetpts=PTS-STARTPTS`;
        
        if (clip.properties && clip.properties.volume !== undefined) {
            af += `,volume=${clip.properties.volume}`;
        }
        
        if (delayMs > 0) {
            af += `,adelay=${delayMs}|${delayMs}`;
        }
        
        af += `,aformat=sample_rates=44100:channel_layouts=stereo[${label}];`;
        filterComplex += af;
        audioStreamsToMix.push(`[${label}]`);
    }

    let finalAudioMap = outputMapAudio;
    
    if (audioStreamsToMix.length > 1) {
        const mixLabel = 'amixed_final';
        // Ensure separator before amix if needed
        if (!filterComplex.trim().endsWith(';')) {
            filterComplex += ';';
        }
        filterComplex += `${audioStreamsToMix.join('')}amix=inputs=${audioStreamsToMix.length}:duration=first:dropout_transition=0[${mixLabel}]`;
        finalAudioMap = `[${mixLabel}]`;
    } else if (audioStreamsToMix.length === 1) {
        finalAudioMap = audioStreamsToMix[0];
    }

    const finalArgs = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', outputMapVideo,
        '-map', finalAudioMap || '0:a?', 
        ...presetGenerator.getVideoArgs(),
        ...presetGenerator.getAudioArgs(),
        '-y', outputPath
    ];

    const totalDuration = visualClips.reduce((acc, c) => acc + (c.duration || 5), 0);

    createFFmpegJob(job.id, finalArgs, totalDuration);
};
