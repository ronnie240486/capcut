
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
    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}) => {
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // CONFIGURATION RESOLUTION & FPS
        const resMap = {
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 }
        };
        
        const targetRes = resMap[exportConfig.resolution] || resMap['720p'];
        const targetFps = exportConfig.fps || 30;
        
        // Scale Filter: Force aspect ratio to avoid distortion, pad with black bars if needed
        const SCALE_FILTER = `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${targetFps},format=yuv420p`;

        // SEPARATE MAIN TRACK (Sequenced) FROM LAYERS (Overlay)
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
            inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            mainTrackLabels.push(`[${inputIndexCounter++}:v]`);
            // Dummy audio
             inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             baseAudioSegments.push(`[${inputIndexCounter++}:a]`);
        } else {
             mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return; 

                const duration = Math.max(0.5, parseFloat(clip.duration) || 5);

                // INPUT
                if (clip.type === 'image') {
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

                // PRE-PROCESS: Scale to Target Resolution
                addFilter(SCALE_FILTER);

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

                // MOVEMENT (Passed resolution to generator)
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config, targetRes, targetFps);
                    if (moveFilter) addFilter(moveFilter);
                } else if (clip.type === 'image') {
                    const staticMove = presetGenerator.getMovementFilter(null, duration, true, {}, targetRes, targetFps);
                    addFilter(staticMove);
                }

                // Ensure strict Resolution/SAR before transition
                addFilter(`scale=${targetRes.w}:${targetRes.h},setsar=1`);

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // AUDIO for video clips
                const mediaInfo = mediaLibrary[clip.fileName];
                const audioLabel = `a_base_${i}`;
                
                // FORCE consistent audio format including sample_fmts=fltp for safe mixing
                const audioFormatFilter = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';

                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const start = clip.mediaStartOffset || 0;
                    // Force aformat and selection of stream 0:a
                    filterChain += `[${idx}:a]${audioFormatFilter},atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    // Generate silent audio of exact duration for this clip
                    inputs.push('-f', 'lavfi', '-t', duration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                    const silenceIdx = inputIndexCounter++;
                    filterChain += `[${silenceIdx}:a]${audioFormatFilter}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // --- COMPOSE MAIN TRACK (XFADE & ACROSSFADE) ---
        let mainVideoStream = '[black_bg]';
        let mainAudioStream = '[base_audio_seq]';
        
        if (mainTrackLabels.length > 0 && typeof mainTrackLabels[0] === 'string') {
             // Case where it's a dummy placeholder
             mainVideoStream = mainTrackLabels[0];
             mainAudioStream = baseAudioSegments[0];
        } else if (mainTrackLabels.length > 0) {
            let currentMixV = mainTrackLabels[0].label;
            let currentMixA = baseAudioSegments[0];
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1];
                
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 };
                const hasExplicitTrans = !!prevClip.transition;
                const transDur = hasExplicitTrans ? Math.min(trans.duration, prevClip.duration/2, nextClip.duration/2) : 0; // 0 if no transition for seamless cut
                
                const nextAudioLabel = baseAudioSegments[i];
                
                if (hasExplicitTrans) {
                     const transId = presetGenerator.getTransitionXfade(trans.id);
                     const offset = accumulatedDuration - transDur;
                     
                     const nextLabelV = `mix_v_${i}`;
                     const nextLabelA = `mix_a_${i}`;
                     
                     // xfade for video
                     filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                     // acrossfade for audio (approximation using crossfade logic or simple mix if not supported, but ffmpeg has acrossfade)
                     // acrossfade doesn't take offset, it takes overlapping streams. 
                     // IMPORTANT: acrossfade consumes streams. The audio chain assumes inputs are sequential.
                     // However, xfade math relies on timestamps. `acrossfade` relies on stream end/start.
                     // Since we trimmed audio segments exactly to video length, acrossfade should work naturally if we chain them.
                     
                     filterChain += `${currentMixA}${nextAudioLabel}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;
                     
                     currentMixV = `[${nextLabelV}]`;
                     currentMixA = `[${nextLabelA}]`;
                     accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
                } else {
                     // No transition: Simple concat or chained concat filter?
                     // Actually, if we mix xfade and non-xfade, it gets complex.
                     // Strategy: Treat "no transition" as a 0s xfade or use concat filter for the whole chain if NO clips have transitions.
                     // But here we might have mixed. 
                     // A robust way for mixed is using xfade with duration=0 (cut).
                     // However, duration=0 in xfade might be buggy in old ffmpeg. 
                     // Safe approach: Use xfade=transition=fade:duration=0.01:offset=... for almost-cut.
                     
                     const transId = 'fade';
                     const minimalDur = 0.04; // 1 frame approx
                     const offset = accumulatedDuration - minimalDur;
                     
                     const nextLabelV = `mix_v_${i}`;
                     const nextLabelA = `mix_a_${i}`;
                     
                     filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${minimalDur}:offset=${offset}[${nextLabelV}];`;
                     filterChain += `${currentMixA}${nextAudioLabel}acrossfade=d=${minimalDur}:c1=tri:c2=tri[${nextLabelA}];`;
                     
                     currentMixV = `[${nextLabelV}]`;
                     currentMixA = `[${nextLabelA}]`;
                     accumulatedDuration = offset + minimalDur + (nextClip.duration - minimalDur);
                }
            }
            mainVideoStream = currentMixV;
            mainAudioStream = currentMixA;
        } else {
             inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
             mainVideoStream = `[${inputIndexCounter++}:v]`;
             inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             mainAudioStream = `[${inputIndexCounter++}:a]`;
        }

        // --- 2. APPLY OVERLAYS (Text/Image Layers) ---
        let finalComp = mainVideoStream;
        
        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';
            
            if (clip.type === 'text') {
                 const bgLabel = `txtbg_${i}`;
                 filterChain += `color=c=black@0.0:s=${targetRes.w}x${targetRes.h}:r=${targetFps}:d=${clip.duration}[${bgLabel}];`;

                 let txt = (clip.properties.text || '');
                 txt = wrapText(txt, 30).replace(/'/g, '').replace(/:/g, '\\:');
                 
                 let color = clip.properties.textDesign?.color || 'white';
                 if (color === 'transparent') color = 'white@0.0';

                 // Scale font size based on resolution (Base 80px for 720p)
                 const baseFontSize = 80;
                 const scaleFactor = targetRes.w / 1280;
                 const fontsize = Math.round(baseFontSize * scaleFactor);
                 
                 const x = clip.properties.transform?.x ? `(w-text_w)/2+(${clip.properties.transform.x}*${scaleFactor})` : '(w-text_w)/2';
                 const y = clip.properties.transform?.y ? `(h-text_h)/2+(${clip.properties.transform.y}*${scaleFactor})` : '(h-text_h)/2';
                 
                 let styles = '';
                 if (clip.properties.textDesign?.stroke) {
                     const s = clip.properties.textDesign.stroke;
                     if (s.width > 0) {
                        styles += `:borderw=${s.width * scaleFactor}:bordercolor=${s.color || 'black'}`;
                     }
                 }
                 if (clip.properties.textDesign?.shadow) {
                     const sh = clip.properties.textDesign.shadow;
                     if (sh.x || sh.y) {
                         styles += `:shadowx=${(sh.x || 2) * scaleFactor}:shadowy=${(sh.y || 2) * scaleFactor}:shadowcolor=${sh.color || 'black@0.5'}`;
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
                 const w = Math.floor(targetRes.w * scale / 2) * 2;
                 
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

        // --- 3. AUDIO MIXING (Background Music / SFX) ---
        let audioMixInputs = [mainAudioStream];
        
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delay = Math.round(clip.start * 1000); // ms
            
            // Force safe mixing format
            const safeAudioFormat = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';

            // atrim -> aformat -> volume -> adelay
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,${safeAudioFormat},volume=${volume},adelay=${delay}|${delay}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        if (audioMixInputs.length > 1) {
            // amix inputs (normalize=0 to prevent volume drop). duration=first (main track) matches video length better than longest usually, but longest is safer for trailing audio.
            // Let's use 'first' to match video duration typically, or handle explicitly.
            // Using 'longest' ensures background music isn't cut if it extends slightly, but `exportVideo.js` `-t` handles the hard cut.
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            finalAudio = mainAudioStream;
        }

        if (filterChain.endsWith(';')) {
            filterChain = filterChain.slice(0, -1);
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalComp,
            outputMapAudio: finalAudio
        };
    }
};
