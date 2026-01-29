
const presetGenerator = require('./presetGenerator.js');

// Helper to wrap text for drawtext
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
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // SEPARATE MAIN TRACK (Sequenced) FROM LAYERS (Overlay)
        // Main Track: 'video' only (or images treated as main video)
        // Layers: 'text', 'camada', 'subtitle' (Overlaid on top of main track)
        
        const mainTrackClips = clips.filter(c => 
            c.track === 'video' || (c.track === 'camada' && c.type === 'video') 
        ).sort((a, b) => a.start - b.start);

        const overlayClips = clips.filter(c => 
            ['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image')
        );

        // Audio Clips
        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))
        );

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // --- 1. BUILD MAIN VIDEO TRACK (Sequence with Transitions) ---
        
        if (mainTrackClips.length === 0) {
            // Create a dummy black background if no video present
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            mainTrackLabels.push(`[${inputIndexCounter++}:v]`);
             inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             baseAudioSegments.push(`[${inputIndexCounter++}:a]`);
        } else {
             mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                // Skip if file missing, unless it's generated content
                if (!filePath && clip.type !== 'text') return; 

                const duration = Math.max(1.0, parseFloat(clip.duration) || 5);

                // INPUT
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

                // PRE-PROCESS: Scale to 1280x720 (Standard HD) for consistency
                addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

                // TRIM
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // EFFECTS
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                // MOVEMENT
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                    if (moveFilter) addFilter(moveFilter);
                } else if (clip.type === 'image') {
                    const staticMove = presetGenerator.getMovementFilter(null, duration, true);
                    addFilter(staticMove);
                }

                // Ensure strict 720p
                addFilter(`scale=1280:720,setsar=1`);

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // AUDIO for video clips
                const mediaInfo = mediaLibrary[clip.fileName];
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
        let mainVideoStream = '[black_bg]';
        
        if (mainTrackLabels.length > 0 && typeof mainTrackLabels[0] === 'string') {
             mainVideoStream = mainTrackLabels[0];
        } else if (mainTrackLabels.length > 0) {
            let currentMix = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1];
                
                const trans = prevClip.transition || { id: 'fade', duration: 0 };
                
                const hasExplicitTrans = !!prevClip.transition;
                const transDur = hasExplicitTrans ? Math.min(trans.duration, prevClip.duration/2, nextClip.duration/2) : 0;
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                if (transDur > 0) {
                    const transId = presetGenerator.getTransitionXfade(trans.id);
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                    currentMix = `[${nextLabel}]`;
                } else {
                    // Simple concat logic via overlay or complex filter? 
                    // No, xfade with duration 0 doesn't work well.
                    // If no transition, we should logically concat. But mixing concat and xfade is hard.
                    // Fallback: minimal fade 0.1s
                     const minimalFade = 0.1;
                     const minOffset = accumulatedDuration - minimalFade;
                     filterChain += `${currentMix}${nextClip.label}xfade=transition=fade:duration=${minimalFade}:offset=${minOffset}[${nextLabel}];`;
                     currentMix = `[${nextLabel}]`;
                }
                
                accumulatedDuration = offset + (transDur > 0 ? transDur : 0.1) + (nextClip.duration - (transDur > 0 ? transDur : 0.1));
            }
            mainVideoStream = currentMix;
        } else {
             inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
             mainVideoStream = `[${inputIndexCounter++}:v]`;
        }

        // --- 2. APPLY OVERLAYS (Text/Image Layers) ---
        let finalComp = mainVideoStream;
        
        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';
            
            if (clip.type === 'text') {
                 const bgLabel = `txtbg_${i}`;
                 filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${clip.duration}[${bgLabel}];`;

                 let txt = (clip.properties.text || '');
                 txt = wrapText(txt, 30).replace(/'/g, '').replace(/:/g, '\\:');
                 
                 let color = clip.properties.textDesign?.color || 'white';
                 if (color === 'transparent') color = 'white@0.0';

                 const font = clip.properties.textDesign?.fontFamily || 'Sans';
                 const fontsize = 80;
                 const x = clip.properties.transform?.x ? `(w-text_w)/2+${clip.properties.transform.x}` : '(w-text_w)/2';
                 const y = clip.properties.transform?.y ? `(h-text_h)/2+${clip.properties.transform.y}` : '(h-text_h)/2';
                 
                 let styles = '';
                 if (clip.properties.textDesign?.stroke) {
                     const s = clip.properties.textDesign.stroke;
                     if (s.width > 0) {
                        styles += `:borderw=${s.width}:bordercolor=${s.color || 'black'}`;
                     }
                 }
                 
                 if (clip.properties.textDesign?.shadow) {
                     const sh = clip.properties.textDesign.shadow;
                     if (sh.x || sh.y) {
                         styles += `:shadowx=${sh.x || 2}:shadowy=${sh.y || 2}:shadowcolor=${sh.color || 'black@0.5'}`;
                     }
                 }

                 const txtLabel = `txt_${i}`;
                 filterChain += `[${bgLabel}]drawtext=text='${txt}':fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styles}[${txtLabel}];`;
                 overlayInputLabel = `[${txtLabel}]`;

            } else {
                 const filePath = fileMap[clip.fileName];
                 if (!filePath) return;
                 inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                 const idx = inputIndexCounter++;
                 const imgLabel = `img_ov_${i}`;
                 
                 const scale = clip.properties.transform?.scale || 0.5;
                 const w = Math.floor(1280 * scale / 2) * 2;
                 
                 filterChain += `[${idx}:v]scale=${w}:-1[${imgLabel}];`;
                 overlayInputLabel = `[${imgLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
            const startTime = clip.start;
            const shiftedLabel = `shift_${i}`;
            
            filterChain += `${overlayInputLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
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
            // Ensure filter chain doesn't trail with ; if simple assignment
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
