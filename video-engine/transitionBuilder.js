
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
    buildTimeline: (clips, fileMap, mediaLibrary, totalDuration = 5) => {
        // --- SAFETY CHECK ---
        if (!clips || !Array.isArray(clips)) {
            console.warn("TransitionBuilder: 'clips' is undefined or not an array.");
            return { inputs: [], filterComplex: '', outputMapVideo: null, outputMapAudio: null };
        }

        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // Separate tracks
        const mainTrackClips = clips.filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video') || (c.track === 'camada' && c.type === 'image')).sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => ['text', 'subtitle'].includes(c.track));
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.type === 'audio' && !['video', 'camada', 'text', 'subtitle'].includes(c.track)));

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // --- 1. PREPARE INPUTS AND BASE FILTERS ---
        let hasValidMainClips = false;

        mainTrackClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            // If file is missing and it's not text (which is handled in overlay), skip
            if (!filePath && clip.type !== 'text') {
                 console.warn(`Missing file for clip: ${clip.fileName}`);
                 return;
            }

            hasValidMainClips = true;
            const duration = Math.max(0.1, parseFloat(clip.duration) || 5);

            // Input
            if (clip.type === 'image') {
                // Loop image for duration + extra buffer for transitions
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

        if (!hasValidMainClips) {
            // Placeholder black video for the duration of project
            const dur = totalDuration > 0 ? totalDuration : 5;
            inputs.push('-f', 'lavfi', '-t', dur.toString(), '-i', 'color=c=black:s=1280x720:r=30');
            const idx = inputIndexCounter++;
            filterChain += `[${idx}:v]null[base_v_placeholder];`;
            mainTrackLabels.push({ label: `[base_v_placeholder]`, duration: dur });
            
            // Placeholder silence
            inputs.push('-f', 'lavfi', '-t', dur.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            const idxA = inputIndexCounter++;
            filterChain += `[${idxA}:a]anull[base_a_placeholder];`;
            baseAudioSegments.push(`[base_a_placeholder]`);
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
                    
                    let transDur = (trans.duration > 0) ? trans.duration : 0; // Default 0 overlap if no trans
                    
                    // Prevent transition longer than clips
                    const maxPossible = Math.min(prevClip.duration/2, nextClipV.duration/2);
                    if (transDur > maxPossible) transDur = maxPossible;

                    // If simple cut (0 duration), use concat logic or simple overlay? 
                    // Xfade requires overlap. If duration is 0, we can simulate a cut with very small duration or just assume standard xfade handles 0 (it doesn't).
                    // For cut, we usually use concat, but xfade is easier for chain.
                    // Let's use 0.05s mix for "cut" to keep pipeline simple, or handle cut explicitly.
                    // Actually, if duration is 0, we just want to append. 
                    // But to keep code simple, let's enforce min 0.1s overlap if transition exists, else 0 offset (abut).
                    
                    if (transDur <= 0) {
                        // Hard cut logic not easily done with xfade chain without adjusting PTS manually for every clip.
                        // Ideally we would use concat filter for cuts, and xfade for transitions.
                        // For this simplified engine, we force a tiny overlap to allow xfade 'fade' to act as joiner or just simple cut.
                         // However, xfade offset needs to be accurate.
                         transDur = 0; // No overlap
                    }

                    const offset = currentDuration - transDur;
                    const nextLabelV = `mix_v_${i}`;
                    
                    if (transDur > 0) {
                         const transFilter = presetGenerator.getTransitionXfade(trans.id) || 'fade';
                         filterChain += `${currentMixV}${nextClipV.label}xfade=transition=${transFilter}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                    } else {
                         // Hack for hard cut using overlay? Or just assume clips abut?
                         // Xfade without duration fails.
                         // Let's use a very short fade for everything to ensure continuity for now.
                         // Or better: use a mix filter that supports 0? No.
                         // We will fallback to 0.1s fade for everything that isn't a transition to ensure stability.
                         const safeDur = 0.1;
                         const safeOffset = currentDuration - safeDur;
                         filterChain += `${currentMixV}${nextClipV.label}xfade=transition=fade:duration=${safeDur}:offset=${safeOffset}[${nextLabelV}];`;
                         transDur = safeDur;
                    }

                    currentMixV = `[${nextLabelV}]`;

                    // Audio
                    const nextLabelA = `mix_a_${i}`;
                    filterChain += `${currentMixA}${nextClipA}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;
                    currentMixA = `[${nextLabelA}]`;
                    
                    currentDuration = currentDuration + nextClipV.duration - transDur;
                }
                
                mainVideoStreamLabel = currentMixV;
                baseAudioCombinedLabel = currentMixA;
            }
        } else {
             // Should be covered by hasValidMainClips check, but fallback just in case
             filterChain += `color=c=black:s=1280x720:r=30:d=${totalDuration}[black_fallback];`;
             mainVideoStreamLabel = `[black_fallback]`;
             filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalDuration}[a_fallback];`;
             baseAudioCombinedLabel = `[a_fallback]`;
        }

        // --- 3. OVERLAYS (Text/Images on Overlay Tracks) ---
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
