
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

        // --- 1. BUILD MAIN VIDEO TRACK ---
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
                // Note: We skip if no file, unless it's a generated asset handled differently (but here we assume files exist)
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(0.1, parseFloat(clip.duration) || 5);

                // Input
                if (clip.type === 'image') {
                    // Loop image for duration
                    inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath); 
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

                // Standardize Resolution & Pixel Format & FPS BEFORE any other processing
                addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

                // Trim Video (Crucial for video files to start at correct offset)
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    // For images, trim logic is handled by input -t, but trim filter ensures exactness
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

                // Re-enforce scale after movement (zoompan often resets SAR)
                addFilter(`scale=1280:720,setsar=1`);

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // Audio Handling for Video Clips (Base Track)
                const mediaInfo = mediaLibrary ? mediaLibrary[clip.fileName] : null;
                const audioLabel = `a_base_${i}`;
                
                if (clip.type === 'video' && (mediaInfo?.hasAudio !== false)) {
                    const start = clip.mediaStartOffset || 0;
                    // Trim audio to match video segment
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
                } else {
                    // Generate silence for image/silent video to keep track sync
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                }
                baseAudioSegments.push(`[${audioLabel}]`);
            });
        }

        // --- COMPOSE MAIN VIDEO TRACK ---
        let mainVideoStreamLabel = '';
        
        if (mainTrackLabels.length > 0) {
            if (mainTrackLabels.length === 1) {
                // No concat needed for single clip
                filterChain += `${mainTrackLabels[0].label}null[v_concat_out];`;
                mainVideoStreamLabel = '[v_concat_out]';
            } else {
                let currentMix = mainTrackLabels[0].label;
                let accumulatedDuration = mainTrackLabels[0].duration;

                for (let i = 1; i < mainTrackLabels.length; i++) {
                    const nextClip = mainTrackLabels[i];
                    const prevClip = mainTrackLabels[i-1];
                    const trans = prevClip.transition || { id: 'fade', duration: 0 };
                    
                    const transDur = (trans.duration > 0) ? Math.min(trans.duration, prevClip.duration/2, nextClip.duration/2) : 0.1;
                    const offset = accumulatedDuration - transDur;
                    
                    const nextLabel = `mix_${i}`;
                    const transFilter = transDur > 0.15 ? presetGenerator.getTransitionXfade(trans.id) : 'fade';
                    
                    // XFade
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transFilter}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                    
                    currentMix = `[${nextLabel}]`;
                    accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
                }
                mainVideoStreamLabel = currentMix;
            }
        } else {
             // Fallback if empty logic hit
             filterChain += `color=c=black:s=1280x720:r=30:d=5[black_fallback];`;
             mainVideoStreamLabel = `[black_fallback]`;
        }

        // --- 2. OVERLAYS ---
        let finalCompLabel = mainVideoStreamLabel;
        
        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';
            
            if (clip.type === 'text') {
                 const bgLabel = `txtbg_${i}`;
                 // Create transparent canvas
                 filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${clip.duration}[${bgLabel}];`;
                 
                 const p = clip.properties || {};
                 const txt = wrapText(p.text || 'Texto', 30).replace(/'/g, '').replace(/:/g, '\\:');
                 const design = p.textDesign || {};
                 const color = hexToFfmpegColor(design.color);
                 const fontsize = 60 * (p.transform?.scale || 1);
                 
                 // Center logic: (w-text_w)/2 + x_offset
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
            
            // Set PTS to shift start time
            filterChain += `${overlayInputLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
            // Overlay with enable between times
            filterChain += `${finalCompLabel}[${shiftedLabel}]overlay=enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
            
            finalCompLabel = `[${nextCompLabel}]`;
        });

        // --- 3. AUDIO MIXING ---
        let baseAudioCombinedLabel = '';
        if (baseAudioSegments.length > 0) {
            if (baseAudioSegments.length === 1) {
                // OPTIMIZATION: Avoid concat filter for single audio track
                // Pass through a dummy filter to normalize label
                filterChain += `${baseAudioSegments[0]}anull[base_audio_seq];`;
                baseAudioCombinedLabel = '[base_audio_seq]';
            } else {
                filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio_seq];`;
                baseAudioCombinedLabel = '[base_audio_seq]';
            }
        } else {
             inputs.push('-f', 'lavfi', '-t', '1', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             const idx = inputIndexCounter++;
             filterChain += `[${idx}:a]anull[silence_a];`;
             baseAudioCombinedLabel = `[silence_a]`;
        }

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
            
            // Trim, volume, delay
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

        // Clean trailing semicolon
        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalCompLabel,
            outputMapAudio: finalAudioLabel
        };
    }
};
