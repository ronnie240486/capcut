
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

function hexToFfmpegColor(hex) {
    if (!hex) return 'white';
    if (hex.startsWith('#')) {
        return `0x${hex.slice(1)}FF`; // Add Alpha FF
    }
    return hex;
}

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        // --- SAFETY CHECK ---
        if (!clips || !Array.isArray(clips)) {
            console.warn("TransitionBuilder: 'clips' is undefined or not an array.");
            return { inputs: [], filterComplex: '', outputMapVideo: null, outputMapAudio: null };
        }

        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // Separate tracks
        // Ensure main track clips are sorted by start time
        const mainTrackClips = clips.filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video')).sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => ['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image'));
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track)));

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // --- 1. PREPARE INPUTS AND BASE FILTERS ---
        if (mainTrackClips.length === 0) {
            // Placeholder black video
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            const idx = inputIndexCounter++;
            filterChain += `[${idx}:v]null[base_v_placeholder];`;
            mainTrackLabels.push({ label: `[base_v_placeholder]`, duration: 5 });
            
            // Placeholder silence for base track
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            const idxA = inputIndexCounter++;
            filterChain += `[${idxA}:a]anull[base_a_placeholder];`;
            baseAudioSegments.push(`[base_a_placeholder]`);
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(0.1, parseFloat(clip.duration) || 5);

                // Input
                if (clip.type === 'image') {
                    // Loop image for duration + extra buffer for transitions
                    // Adding 2s buffer to ensure we have enough frames for xfade offset overlap
                    inputs.push('-loop', '1', '-t', (duration + 5).toString(), '-i', filePath); 
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

                // Standardize Resolution & Pixel Format & FPS
                addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

                // Trim Video
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // Apply Effects
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                // Apply Color Adjustments
                if (clip.properties && clip.properties.adjustments) {
                     const adj = clip.properties.adjustments;
                     let eqStr = [];
                     if(adj.brightness !== 1) eqStr.push(`brightness=${adj.brightness - 1}`);
                     if(adj.contrast !== 1) eqStr.push(`contrast=${adj.contrast}`);
                     if(adj.saturate !== 1) eqStr.push(`saturation=${adj.saturate}`);
                     if(eqStr.length > 0) addFilter(`eq=${eqStr.join(':')}`);
                     if(adj.hue !== 0) addFilter(`hue=h=${adj.hue}`);
                }

                // Apply Movement
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                    if (moveFilter) addFilter(moveFilter);
                } else if (clip.type === 'image') {
                    const staticMove = presetGenerator.getMovementFilter('zoom-slow-in', duration, true);
                    addFilter(staticMove);
                }

                addFilter(`scale=1280:720,setsar=1`);

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // Audio Handling
                const mediaInfo = mediaLibrary ? mediaLibrary[clip.fileName] : null;
                const audioLabel = `a_base_${i}`;
                
                if (clip.type === 'video' && (mediaInfo?.hasAudio !== false)) {
                    const start = clip.mediaStartOffset || 0;
                    // Trim audio matches video
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
                } else {
                    // Generate silence for image/silent video
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                }
                baseAudioSegments.push(`[${audioLabel}]`);
            });
        }

        // --- 2. COMPOSE MAIN TRACKS (VIDEO & AUDIO) ---
        let mainVideoStreamLabel = '';
        let baseAudioCombinedLabel = '';

        if (mainTrackLabels.length > 0) {
            if (mainTrackLabels.length === 1) {
                // Single clip - Passthrough
                filterChain += `${mainTrackLabels[0].label}null[v_concat_out];`;
                mainVideoStreamLabel = '[v_concat_out]';
                
                filterChain += `${baseAudioSegments[0]}anull[a_concat_out];`;
                baseAudioCombinedLabel = '[a_concat_out]';
            } else {
                // Multi clip - CHAIN MIXING
                let currentMixV = mainTrackLabels[0].label;
                let currentMixA = baseAudioSegments[0];
                let currentDuration = mainTrackLabels[0].duration;

                for (let i = 1; i < mainTrackLabels.length; i++) {
                    const nextClipV = mainTrackLabels[i];
                    const nextClipA = baseAudioSegments[i];
                    const prevClip = mainTrackLabels[i-1];
                    const trans = prevClip.transition || { id: 'fade', duration: 0 };
                    
                    // Logic: Force 0.1s overlap if no transition to prevent black frames,
                    // otherwise use transition duration.
                    // Important: Ensure transition isn't longer than clips.
                    let transDur = (trans.duration > 0) ? trans.duration : 0.1;
                    const maxPossible = Math.min(prevClip.duration/2, nextClipV.duration/2);
                    if (transDur > maxPossible) transDur = maxPossible;

                    // --- VIDEO MIXING (XFADE) ---
                    const offset = currentDuration - transDur;
                    const nextLabelV = `mix_v_${i}`;
                    const transFilter = (trans.duration > 0) ? presetGenerator.getTransitionXfade(trans.id) : 'fade';
                    
                    filterChain += `${currentMixV}${nextClipV.label}xfade=transition=${transFilter}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                    currentMixV = `[${nextLabelV}]`;

                    // --- AUDIO MIXING (ACROSSFADE) ---
                    // Syncing audio duration with video by using the same overlap duration
                    const nextLabelA = `mix_a_${i}`;
                    filterChain += `${currentMixA}${nextClipA}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;
                    currentMixA = `[${nextLabelA}]`;
                    
                    // Update accumulated duration (Both streams now have same length)
                    // New Total = Prev Total + Next Duration - Overlap
                    currentDuration = currentDuration + nextClipV.duration - transDur;
                }
                
                mainVideoStreamLabel = currentMixV;
                baseAudioCombinedLabel = currentMixA;
            }
        } else {
             // Fallback
             filterChain += `color=c=black:s=1280x720:r=30:d=5[black_fallback];`;
             mainVideoStreamLabel = `[black_fallback]`;
             filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=5[a_fallback];`;
             baseAudioCombinedLabel = `[a_fallback]`;
        }

        // --- 3. OVERLAYS (Text/Images) ---
        let finalCompLabel = mainVideoStreamLabel;
        
        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';
            
            if (clip.type === 'text') {
                 const bgLabel = `txtbg_${i}`;
                 filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${clip.duration}[${bgLabel}];`;
                 
                 const p = clip.properties || {};
                 const txt = wrapText(p.text || 'Texto', 30).replace(/'/g, '').replace(/:/g, '\\:');
                 const design = p.textDesign || {};
                 const color = hexToFfmpegColor(design.color);
                 const fontsize = 60 * (p.transform?.scale || 1);
                 
                 const x = `(w-text_w)/2+${(p.transform?.x || 0)}`;
                 const y = `(h-text_h)/2+${(p.transform?.y || 0)}`;

                 let styleParams = '';
                 if (design.stroke && design.stroke.width > 0) {
                     styleParams += `:borderw=${design.stroke.width}:bordercolor=${hexToFfmpegColor(design.stroke.color)}`;
                 }
                 if (design.shadow && design.shadow.color) {
                     styleParams += `:shadowx=${design.shadow.x || 2}:shadowy=${design.shadow.y || 2}:shadowcolor=${hexToFfmpegColor(design.shadow.color)}`;
                 }
                 
                 const font = 'Sans'; 
                 const txtLabel = `txt_${i}`;
                 filterChain += `[${bgLabel}]drawtext=text='${txt}':font='${font}':fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styleParams}[${txtLabel}];`;
                 overlayInputLabel = `[${txtLabel}]`;

            } else {
                 const filePath = fileMap[clip.fileName];
                 if (!filePath) return;
                 
                 inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                 const idx = inputIndexCounter++;
                 
                 const imgLabel = `img_ov_${i}`;
                 const scale = clip.properties?.transform?.scale || 0.5;
                 const targetW = Math.floor(1280 * scale);
                 
                 filterChain += `[${idx}:v]scale=${targetW}:-1[${imgLabel}];`;
                 overlayInputLabel = `[${imgLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
            const startTime = clip.start;
            const shiftedLabel = `shift_${i}`;
            
            filterChain += `${overlayInputLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
            filterChain += `${finalCompLabel}[${shiftedLabel}]overlay=enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
            
            finalCompLabel = `[${nextCompLabel}]`;
        });

        // --- 4. FINAL AUDIO MIXING ---
        // Combine base track (which now has transitions applied) with secondary audio tracks (music, sfx, voice)
        
        let audioMixInputs = [baseAudioCombinedLabel];
        
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delay = Math.max(0, Math.round(clip.start * 1000)); 
            
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudioLabel = '';
        if (audioMixInputs.length > 1) {
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out]`;
            finalAudioLabel = '[final_audio_out]';
        } else {
            finalAudioLabel = baseAudioCombinedLabel;
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalCompLabel,
            outputMapAudio: finalAudioLabel
        };
    }
};
