
const presetGenerator = require('./presetGenerator.js');

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
            // Generate it inside filter complex to avoid input issues? No, main track usually needs an input to be robust.
            // But we can use lavfi here for just one input.
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            mainTrackLabels.push(`[${inputIndexCounter++}:v]`);
            // Dummy audio
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
                // Using 1920x1080 -> 720p logic from previous step, but let's stick to 720p internal to match output for speed
                // scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2
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
                    // Extract audio from same input index
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    // Generate silent audio of same duration
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // --- COMPOSE MAIN TRACK (XFADE) ---
        let mainVideoStream = '[black_bg]';
        
        if (mainTrackLabels.length > 0 && typeof mainTrackLabels[0] === 'string') {
             // Dummy case
             mainVideoStream = mainTrackLabels[0];
        } else if (mainTrackLabels.length > 0) {
            let currentMix = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1];
                
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 }; // Default fade if transition requested? No, only if explicit.
                // Actually, if no transition is set, we should just concat or use a 0 duration transition?
                // xfade requires overlap. If we want simple cut, we use concat?
                // BUT, to keep it simple, we use xfade with small duration or standard mix if transition is present.
                // If NO transition, we should use concat ideally. But mixing concat and xfade is hard.
                // Strategy: Use xfade for EVERYTHING. If no transition, use 'fade' with 0.1s duration (near cut).
                
                const hasExplicitTrans = !!prevClip.transition;
                const transDur = hasExplicitTrans ? Math.min(trans.duration, prevClip.duration/2, nextClip.duration/2) : 0.1;
                const transId = hasExplicitTrans ? presetGenerator.getTransitionXfade(trans.id) : 'fade';
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                // xfade
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                currentMix = `[${nextLabel}]`;
                
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            mainVideoStream = currentMix;
        } else {
             // Fallback
             inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
             mainVideoStream = `[${inputIndexCounter++}:v]`;
        }

        // --- 2. APPLY OVERLAYS (Text/Image Layers) ---
        let finalComp = mainVideoStream;
        
        overlayClips.forEach((clip, i) => {
            // Prepare the overlay input
            let overlayInputLabel = '';
            
            if (clip.type === 'text') {
                 // FIX: Generate text background INSIDE filter_complex to avoid "Resource temporarily unavailable" (too many inputs)
                 const bgLabel = `txtbg_${i}`;
                 filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${clip.duration}[${bgLabel}];`;

                 const txt = (clip.properties.text || '').replace(/'/g, '').replace(/:/g, '\\:');
                 
                 // Handle Colors
                 let color = clip.properties.textDesign?.color || 'white';
                 // FIX: FFmpeg drawtext doesn't support 'transparent' keyword directly in all versions or contexts
                 if (color === 'transparent') color = 'white@0.0';

                 const font = clip.properties.textDesign?.fontFamily || 'Sans';
                 const fontsize = 80;
                 const x = clip.properties.transform?.x ? `(w-text_w)/2+${clip.properties.transform.x}` : '(w-text_w)/2';
                 const y = clip.properties.transform?.y ? `(h-text_h)/2+${clip.properties.transform.y}` : '(h-text_h)/2';
                 
                 // Handle Stroke/Border
                 let styles = '';
                 if (clip.properties.textDesign?.stroke) {
                     const s = clip.properties.textDesign.stroke;
                     if (s.width > 0) {
                        styles += `:borderw=${s.width}:bordercolor=${s.color || 'black'}`;
                     }
                 }
                 
                 // Handle Shadow
                 if (clip.properties.textDesign?.shadow) {
                     const sh = clip.properties.textDesign.shadow;
                     if (sh.x || sh.y) {
                         styles += `:shadowx=${sh.x || 2}:shadowy=${sh.y || 2}:shadowcolor=${sh.color || 'black@0.5'}`;
                     }
                 }

                 const txtLabel = `txt_${i}`;
                 // Drawtext on generated transparent bg
                 filterChain += `[${bgLabel}]drawtext=text='${txt}':fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styles}[${txtLabel}];`;
                 overlayInputLabel = `[${txtLabel}]`;

            } else {
                 // Image overlay
                 const filePath = fileMap[clip.fileName];
                 if (!filePath) return;
                 inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                 const idx = inputIndexCounter++;
                 const imgLabel = `img_ov_${i}`;
                 
                 // Resize overlay to reasonable size (e.g., 30% width?) or use properties
                 const scale = clip.properties.transform?.scale || 0.5;
                 const w = Math.floor(1280 * scale / 2) * 2;
                 
                 filterChain += `[${idx}:v]scale=${w}:-1[${imgLabel}];`;
                 overlayInputLabel = `[${imgLabel}]`;
            }

            // Apply Overlay
            // enable='between(t,start,end)'
            const nextCompLabel = `comp_${i}`;
            // Use 'overlay' filter
            
            const startTime = clip.start;
            // Shift timestamps of overlay
            const shiftedLabel = `shift_${i}`;
            filterChain += `${overlayInputLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
            
            // Overlay with enable to ensure it only shows when intended (though setpts helps)
            // EOF_ACTION=pass ensures main video continues.
            filterChain += `${finalComp}[${shiftedLabel}]overlay=enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
            
            finalComp = `[${nextCompLabel}]`;
        });

        // --- 3. AUDIO MIXING ---
        // Combine base audio (sequenced)
        let baseAudioCombined = '[base_audio_seq]';
        if (baseAudioSegments.length > 0) {
             filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio_seq];`;
        } else {
             // Create silent audio stream inside filter complex if possible?
             // anullsrc is better as input to guarantee stream properties
             inputs.push('-f', 'lavfi', '-t', '0.1', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
             baseAudioCombined = `[${inputIndexCounter++}:a]`;
        }
        
        let audioMixInputs = [baseAudioCombined];
        
        // Add overlay audios (sfx, music)
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delay = Math.round(clip.start * 1000); // ms
            
            // atrim -> volume -> adelay
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        if (audioMixInputs.length > 1) {
            // amix inputs
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            finalAudio = baseAudioCombined;
        }

        // REMOVE TRAILING SEMICOLON TO FIX "No such filter: ''"
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
