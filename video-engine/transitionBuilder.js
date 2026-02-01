
import presetGenerator from './presetGenerator.js';

export default {
    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // 1. RESOLUTION & FPS CONFIGURATION
        const resMap = {
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 }
        };
        
        // Default to 1080p if not specified or invalid
        const targetRes = resMap[exportConfig.resolution] || resMap['1080p']; 
        const targetFps = parseInt(exportConfig.fps) || 30;
        
        console.log(`[Builder] Configuring Export: ${targetRes.w}x${targetRes.h} @ ${targetFps}fps`);

        // Tracks
        const mainTrackClips = clips.filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video')).sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => (['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image'))).sort((a,b) => a.start - b.start);
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))).sort((a,b) => a.start - b.start);

        let mainTrackLabels = [];
        let baseAudioSegments = [];
        let totalVideoDuration = 0;

        // --- 1. PROCESS MAIN VIDEO TRACK ---
        if (mainTrackClips.length === 0) {
            // Dummy black background if no video
            inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            mainTrackLabels.push({ label: `[${inputIndexCounter++}:v]`, duration: 5 });
            totalVideoDuration = 5;
            
            // Generate matching silence
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            baseAudioSegments.push(`[${inputIndexCounter++}:a]`);
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return; 

                const duration = Math.max(0.1, parseFloat(clip.duration));
                totalVideoDuration += duration;

                // Input
                if (clip.type === 'image') {
                    // Loop image for duration + buffer
                    inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); 
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

                // Standardize Resolution & FPS (CRITICAL STEP)
                // Scales to fit target box, pads with black, sets correct pixel format and frame rate
                addFilter(`scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${targetFps},format=yuv420p`);

                // Trim Content
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // Effects
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                // Movement (ZoomPan) - Adjusted for target resolution
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                    // Movement generators often default to 1280x720, we need to ensure they output targetRes or we rescale after
                    if (moveFilter) {
                        addFilter(moveFilter); 
                        // Re-enforce resolution after zoompan (which might default to 720p)
                        addFilter(`scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black`);
                    }
                } else if (clip.type === 'image') {
                    // Default subtle zoom for images
                    const staticMove = presetGenerator.getMovementFilter(null, duration, true);
                    addFilter(staticMove);
                    addFilter(`scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black`);
                }

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // Audio extraction for video clips
                const mediaInfo = mediaLibrary[clip.fileName];
                const audioLabel = `a_base_${i}`;
                
                // Audio Handling: If video has audio, trim and use it. If not, generate EXACT duration silence.
                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const start = clip.mediaStartOffset || 0;
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    // Generate silence for this segment to maintain sync
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // --- 2. COMPOSE XFADE TRANSITIONS ---
        let mainVideoStream = '[black_bg]';
        
        if (mainTrackLabels.length === 1) {
             mainVideoStream = mainTrackLabels[0].label;
        } else if (mainTrackLabels.length > 1) {
            let currentMix = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1]; 
                
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 };
                const hasExplicitTrans = !!prevClip.transition;
                const transDur = hasExplicitTrans ? Math.min(trans.duration, 2.0) : 0.5;
                
                // Default mapping using presetGenerator
                let transId = 'fade';
                if (presetGenerator.getTransitionXfade && hasExplicitTrans) {
                    transId = presetGenerator.getTransitionXfade(trans.id);
                }
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                // Helper for time-based enable
                const enableBetween = `enable='between(t,${offset},${offset+transDur})'`;

                // --- CUSTOM TRANSITION LOGIC ---

                // 1. Negative Zoom (Invert Color + Zoom)
                if (trans.id === 'zoom-neg') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=zoomin:duration=${transDur}:offset=${offset},negate=${enableBetween}[${nextLabel}];`;
                } 
                
                // 2. Whip Pan (Slide + Directional Blur)
                else if (trans.id.includes('whip')) {
                    const isVertical = trans.id.includes('up') || trans.id.includes('down');
                    const blurFilter = isVertical ? 'gblur=sigma=0:sigmaV=40' : 'gblur=sigma=40:sigmaV=0';
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset},${blurFilter}:${enableBetween}[${nextLabel}];`;
                }

                // 3. Spin / Rotation
                else if (trans.id.includes('spin') && !trans.id.includes('zoom-spin')) {
                     const direction = trans.id.includes('ccw') ? -1 : 1;
                     filterChain += `${currentMix}${nextClip.label}xfade=transition=dissolve:duration=${transDur}:offset=${offset},rotate=a='${direction}*2*PI*(t-${offset})/${transDur}':${enableBetween}:fillcolor=black[${nextLabel}];`;
                }
                
                // 4. Zoom Spin
                else if (trans.id === 'zoom-spin-fast') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=zoomin:duration=${transDur}:offset=${offset},rotate=a='4*PI*(t-${offset})/${transDur}':${enableBetween}:fillcolor=black[${nextLabel}];`;
                }
                
                // 5. Slide / Push (Enhanced with Blur)
                else if (trans.id.includes('slide') || trans.id.includes('push')) {
                    // Simple motion blur approximation
                    const blurFilter = 'gblur=sigma=5'; 
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset},${blurFilter}:${enableBetween}[${nextLabel}];`;
                }
                
                // 6. PURE PIXELIZE
                else if (trans.id === 'pixelize' || trans.id === 'mosaic-small' || trans.id === 'mosaic-large' || trans.id === 'checker-wipe') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=pixelize:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                }

                // 7. DATAMOSH
                else if (trans.id === 'datamosh') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=dissolve:duration=${transDur}:offset=${offset},lagfun=decay=0.95:planes=1:${enableBetween}[${nextLabel}];`;
                }

                // 8. RGB SPLIT / SHAKE
                else if (trans.id === 'rgb-split' || trans.id === 'rgb-shake' || trans.id === 'glitch-chroma') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=hblur:duration=${transDur}:offset=${offset},chromashift=cbh=20:crh=-20:cbv=20:crv=-20:${enableBetween}[${nextLabel}];`;
                }

                // 9. SCANLINE / CYBER SLICE
                else if (trans.id === 'scan-line-v' || trans.id === 'scan-line' || trans.id === 'cyber-slice' || trans.id === 'scan-line-v') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=zoomin:duration=${transDur}:offset=${offset},drawgrid=y=0:h=8:t=4:c=black@0.5:${enableBetween}[${nextLabel}];`;
                }

                // 10. NOISE / STATIC
                else if (trans.id === 'noise' || trans.id === 'digital-noise' || trans.id === 'noise-jump') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=dissolve:duration=${transDur}:offset=${offset},noise=alls=100:allf=t+u:${enableBetween}[${nextLabel}];`;
                }

                // 11. GLITCH
                else if (trans.id.includes('glitch') || trans.id === 'cyber-zoom') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=slideleft:duration=${transDur}:offset=${offset},noise=alls=40:allf=t+u:${enableBetween},hue=s=0:${enableBetween}[${nextLabel}];`;
                }

                // 12. Flash / Glow / Burn
                else if (['flash-white', 'flash-bang', 'glow-intense', 'exposure', 'burn', 'lens-flare', 'god-rays', 'flashback'].some(t => trans.id.includes(t))) {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=fade:duration=${transDur}:offset=${offset},eq=brightness='if(between(t,${offset},${offset+transDur}),0.8*sin((t-${offset})/${transDur}*3.1415),0)':eval=frame:${enableBetween}[${nextLabel}];`;
                }

                // 13. Film Roll
                else if (['film-roll', 'film-roll-v', 'roll-up'].some(t => trans.id.includes(t))) {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=slideup:duration=${transDur}:offset=${offset},gblur=sigma=0:sigmaV=20:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }

                // 14. Warp / Swirl / Twist
                else if (['swirl', 'warp', 'morph', 'kaleidoscope'].some(t => trans.id.includes(t))) {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=dissolve:duration=${transDur}:offset=${offset},lenscorrection=k1=-0.2:k2=-0.2:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }

                // 15. Distortion / Turbulence / Liquid / Organic
                else if (['turbulence', 'distortion', 'wave', 'water-drop', 'liquid-melt', 'ink-splash', 'oil-paint', 'smoke-reveal', 'water-ripple', 'bubble-pop'].some(t => trans.id.includes(t))) {
                    let effectFilter = 'gblur=sigma=20'; // Default organic blur
                    
                    if (trans.id.includes('smoke')) {
                        effectFilter = 'noise=alls=50:allf=t+u,gblur=sigma=10';
                    } else if (trans.id.includes('bubble') || trans.id.includes('ripple') || trans.id.includes('water')) {
                        effectFilter = 'lenscorrection=k1=-0.2:k2=-0.2';
                    } else if (trans.id.includes('liquid') || trans.id.includes('ink') || trans.id.includes('oil')) {
                        // "Gooey" effect: Blur then high contrast
                        effectFilter = 'gblur=sigma=20,eq=contrast=2.0';
                    } else if (trans.id.includes('distortion') || trans.id.includes('turbulence')) {
                         effectFilter = 'chromashift=cbh=20:crh=-20';
                    }

                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset},${effectFilter}:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }
                
                // 16. Paper & Texture Effects (Sketch, Rip, Burn, Fold)
                else if (trans.id === 'sketch-reveal') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=dissolve:duration=${transDur}:offset=${offset},edgedetect=low=0.1:high=0.4:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }
                else if (trans.id === 'burn-paper') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=circleopen:duration=${transDur}:offset=${offset},curves=r=0/0 0.5/0.8 1/1:g=0/0 0.5/0.5 1/1:b=0/0 0.5/0.2 1/1:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }
                else if (trans.id === 'paper-rip') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=horzopen:duration=${transDur}:offset=${offset},noise=alls=40:allf=t+u:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }
                
                // 17. 3D Transforms (Fixed)
                else if (['cube-rotate-l', 'cube-rotate-r', 'flip-card', 'room-fly', 'door-open'].includes(trans.id)) {
                    let effectFilter = 'gblur=sigma=0';
                    
                    if (trans.id.includes('cube')) {
                        // Simulate cube spin with horizontal motion blur
                        effectFilter = 'gblur=sigma=20:sigmaV=0'; 
                    } else if (trans.id === 'room-fly') {
                        // Simulate entering room with lens distortion
                        effectFilter = 'lenscorrection=k1=-0.1:k2=-0.1';
                    } else if (trans.id === 'flip-card') {
                        // Simulate flip with slight vertical squeeze/blur
                        effectFilter = 'gblur=sigma=0:sigmaV=10';
                    }
                    
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset},${effectFilter}:enable='between(t,${offset},${offset+transDur})'[${nextLabel}];`;
                }

                // 18. Luma Fade
                else if (trans.id === 'luma-fade') {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=dissolve:duration=${transDur}:offset=${offset},eq=contrast=1.5:brightness=0.05:eval=frame:${enableBetween}[${nextLabel}];`;
                }
                
                // 19. Standard XFade (Fallback)
                else {
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                }
                
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            mainVideoStream = currentMix;
        }

        // --- 3. APPLY OVERLAYS ---
        let finalComp = mainVideoStream;
        
        overlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath && clip.type !== 'text') return;

            let overlayLabel = '';
            
            if (clip.type === 'text') {
                 // Skip complex text for now
                 return;
            } else {
                 inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                 const idx = inputIndexCounter++;
                 const imgLabel = `img_ov_${i}`;
                 
                 // Scale overlay proportionally (e.g., 50% width of target resolution)
                 const ovW = Math.round(targetRes.w * 0.5);
                 filterChain += `[${idx}:v]scale=${ovW}:-1[${imgLabel}];`;
                 overlayLabel = `[${imgLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
            const startTime = clip.start;
            const shiftedLabel = `shift_${i}`;
            
            const x = `(W-w)/2`;
            const y = `(H-h)/2`;

            filterChain += `${overlayLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
            filterChain += `${finalComp}[${shiftedLabel}]overlay=x=${x}:y=${y}:enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
            finalComp = `[${nextCompLabel}]`;
        });

        // --- 4. AUDIO MIXING (ROBUST) ---
        let baseAudioCombined = '[base_audio_seq]';
        
        if (baseAudioSegments.length > 0) {
             // Concatenate all base segments (video audio + silence fillers)
             // This creates a solid "base track" that is exactly the length of the video
             filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio_seq];`;
        } else {
             // Fallback: Generate full duration silence if something went wrong
             inputs.push('-f', 'lavfi', '-t', Math.max(1, totalVideoDuration).toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
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
            
            // Format NORMALIZE added to ensure mixing works
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay},aformat=sample_rates=44100:channel_layouts=stereo[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        if (audioMixInputs.length > 1) {
            // Mix normalized inputs with 'first' duration (base track determines length)
            // This ensures background music doesn't extend the video endlessly
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            finalAudio = baseAudioCombined;
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalComp,
            outputMapAudio: finalAudio
        };
    }
};
