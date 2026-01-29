
const presetGenerator = require('./presetGenerator.js');

function wrapText(text, maxCharsPerLine) {
    if (!text) return '';
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        if (currentLine.length + 1 + words[i].length <= maxCharsPerLine) {
            currentLine += ' ' + words[i];
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);
    return lines.join('\n');
}

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        if (!clips || !Array.isArray(clips) || clips.length === 0) {
            return { inputs: [], filterComplex: '', outputMapVideo: null, outputMapAudio: null };
        }

        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // SEPARATE TRACKS
        const mainTrackClips = clips.filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video')).sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => ['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image'));
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track)));

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // --- 1. BUILD MAIN VIDEO TRACK ---
        if (mainTrackClips.length === 0) {
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            mainTrackLabels.push(`[${inputIndexCounter++}:v]`);
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            baseAudioSegments.push(`[${inputIndexCounter++}:a]`);
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(1.0, parseFloat(clip.duration) || 5);

                // Input
                if (clip.type === 'image') {
                    inputs.push('-loop', '1', '-t', (duration + 3).toString(), '-i', filePath); 
                } else {
                    inputs.push('-i', filePath);
                }

                const idx = inputIndexCounter++;
                let currentV = `[${idx}:v]`;
                
                const addFilter = (filterText) => {
                    if (!filterText) return;
                    const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${filterText}[${nextLabel}];`;
                    currentV = `[${nextLabel}]`;
                };

                // Pre-process
                addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

                // Trim
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // Effect
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                // Movement
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                    if (moveFilter) addFilter(moveFilter);
                } else if (clip.type === 'image') {
                    const staticMove = presetGenerator.getMovementFilter(null, duration, true);
                    addFilter(staticMove);
                }

                // Enforce size again after zoom
                addFilter(`scale=1280:720,setsar=1`);

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // Audio from Video
                const mediaInfo = mediaLibrary ? mediaLibrary[clip.fileName] : null;
                const audioLabel = `a_base_${i}`;
                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const start = clip.mediaStartOffset || 0;
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // --- COMPOSE MAIN TRACK (XFADE) ---
        let mainVideoStream = '';
        if (typeof mainTrackLabels[0] === 'string') {
             mainVideoStream = mainTrackLabels[0];
        } else if (mainTrackLabels.length > 0) {
            let currentMix = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1];
                const trans = prevClip.transition || { id: 'fade', duration: 0 };
                const transDur = trans.duration > 0 ? Math.min(trans.duration, prevClip.duration/2, nextClip.duration/2) : 0;
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                if (transDur > 0) {
                    const transId = presetGenerator.getTransitionXfade(trans.id);
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                } else {
                     // If no transition, xfade fade with tiny duration acts as concat for visual consistency
                     const minimalFade = 0.1;
                     const minOffset = accumulatedDuration - minimalFade;
                     filterChain += `${currentMix}${nextClip.label}xfade=transition=fade:duration=${minimalFade}:offset=${minOffset}[${nextLabel}];`;
                }
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + (transDur > 0 ? transDur : 0.1) + (nextClip.duration - (transDur > 0 ? transDur : 0.1));
            }
            mainVideoStream = currentMix;
        }

        // --- 2. OVERLAYS ---
        let finalComp = mainVideoStream;
        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';
            if (clip.type === 'text') {
                 const bgLabel = `txtbg_${i}`;
                 filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${clip.duration}[${bgLabel}];`;
                 
                 const txt = wrapText(clip.properties.text || '', 30).replace(/'/g, '').replace(/:/g, '\\:');
                 const color = clip.properties.textDesign?.color || 'white';
                 const fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; // Adjust path for your env or use default
                 const x = clip.properties.transform?.x ? `(w-text_w)/2+${clip.properties.transform.x}` : '(w-text_w)/2';
                 const y = clip.properties.transform?.y ? `(h-text_h)/2+${clip.properties.transform.y}` : '(h-text_h)/2';
                 
                 const txtLabel = `txt_${i}`;
                 // Using default font 'Sans' which usually works with FFmpeg
                 filterChain += `[${bgLabel}]drawtext=text='${txt}':fontcolor=${color}:fontsize=80:x=${x}:y=${y}[${txtLabel}];`;
                 overlayInputLabel = `[${txtLabel}]`;
            } else {
                 const filePath = fileMap[clip.fileName];
                 if (!filePath) return;
                 inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                 const idx = inputIndexCounter++;
                 const imgLabel = `img_ov_${i}`;
                 filterChain += `[${idx}:v]scale=640:-1[${imgLabel}];`;
                 overlayInputLabel = `[${imgLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
            const startTime = clip.start;
            const shiftedLabel = `shift_${i}`;
            // Set PTS to shift start time
            filterChain += `${overlayInputLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
            // Overlay with enable between times
            filterChain += `${finalComp}[${shiftedLabel}]overlay=enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
            finalComp = `[${nextCompLabel}]`;
        });

        // --- 3. AUDIO MIXING ---
        let baseAudioCombined = '[base_audio_seq]';
        if (baseAudioSegments.length > 0) {
             filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio_seq];`;
        } else {
             inputs.push('-f', 'lavfi', '-t', '0.1', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             baseAudioCombined = `[${inputIndexCounter++}:a]`;
        }

        let audioMixInputs = [baseAudioCombined];
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delay = Math.round(clip.start * 1000); 
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        if (audioMixInputs.length > 1) {
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out]`;
        } else {
            finalAudio = baseAudioCombined;
            if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalComp,
            outputMapAudio: finalAudio
        };
    }
};
