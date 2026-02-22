import presetGenerator from './presetGenerator.js';

export default {
    // Helper to escape text for drawtext filter
    escapeDrawText: (text) => {
        if (!text) return '';
        return text
            .replace(/\\/g, '\\\\')
            .replace(/:/g, '\\:')
            .replace(/'/g, "\\'")
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');
    },

    // Helper to wrap text manually since drawtext wrapping can be finicky
    wrapText: (text, maxCharsPerLine) => {
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
    },

    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}, explicitTotalDuration = 30) => {
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // --- CONFIGURAÇÃO DE RESOLUÇÃO E FPS ---
        const resMap = {
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 }
        };
        
        const targetRes = resMap[exportConfig.resolution] || resMap['720p'];
        const targetFps = parseInt(exportConfig.fps) || 30;

        // Cache for reusing inputs and tracking usage
        const inputCache = {};
        const inputUsageCount = {};
        const getOrAddInput = (filePath, isImage = false, duration = 0) => {
            const key = `${filePath}_${isImage}_${duration}`;
            if (inputCache[key] !== undefined) {
                inputUsageCount[key]++;
                return { idx: inputCache[key], key };
            }
            
            const idx = inputIndexCounter++;
            if (isImage) {
                inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath);
            } else {
                inputs.push('-i', filePath);
            }
            inputCache[key] = idx;
            inputUsageCount[key] = 1;
            return { idx, key };
        };
        
        // Helper to get the correct label for an input usage
        const inputLabelsUsed = {};
        const getStreamLabel = (inputInfo) => {
            const { idx, key } = inputInfo;
            const count = inputUsageCount[key];
            if (count <= 1) return `[${idx}:v]`;
            
            if (!inputLabelsUsed[key]) inputLabelsUsed[key] = 0;
            const usageIdx = inputLabelsUsed[key]++;
            return `[v_split_${idx}_${usageIdx}]`;
        };

        // Pre-process filterChain for splits
        const generateSplits = () => {
            let splits = '';
            for (const key in inputCache) {
                const idx = inputCache[key];
                const count = inputUsageCount[key];
                if (count > 1) {
                    let splitLabels = '';
                    for (let i = 0; i < count; i++) {
                        splitLabels += `[v_split_${idx}_${i}]`;
                    }
                    splits += `[${idx}:v]split=${count}${splitLabels};`;
                }
            }
            return splits;
        };
        
        // Filtro de Escala Seguro e Uniformização
        // 1. Scale to fit inside target box
        // 2. Ensure even dimensions for YUV420P (Min 2px)
        // 3. Pad to target resolution (Centered)
        // 4. Force setsar=1 to avoid aspect ratio mismatches in concat/xfade
        const SCALE_FILTER = `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,scale='max(2,trunc(iw/2)*2)':'max(2,trunc(ih/2)*2)',pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${targetFps},format=yuv420p`;

        // CALCULAR DURAÇÃO TOTAL DO PROJETO
        const maxClipEnd = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
        const projectDuration = Math.max(explicitTotalDuration, maxClipEnd, 1);

        // SEPARAR TRILHAS
        const mainTrackClips = clips.filter(c => c.track === 'video').sort((a, b) => a.start - b.start);
        
        const overlayClips = clips.filter(c => 
            ['text', 'subtitle', 'camada'].includes(c.track)
        ).sort((a, b) => a.start - b.start);

        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))
        );

        // --- 0. GERAR BACKGROUND BASE (VIDEO & AUDIO) ---
        
        // Video Base (Black or Image)
        let baseVideoStream = '[bg_base]';
        const bgFile = fileMap['background']; 
        if (bgFile) {
             inputs.push('-loop', '1', '-t', projectDuration.toString(), '-i', bgFile);
             const bgIdx = inputIndexCounter++;
             filterChain += `[${bgIdx}:v]scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=increase,scale=trunc(iw/2)*2:trunc(ih/2)*2,crop=${targetRes.w}:${targetRes.h},setsar=1,fps=${targetFps},format=yuv420p[bg_base];`;
        } else {
             filterChain += `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}:d=${projectDuration},format=yuv420p[bg_base];`;
             baseVideoStream = '[bg_base]';
        }

        // Audio Base (Full Duration Silence) - Critical for AMIX stability
        let baseAudioStream = '[base_audio_silence]';
        filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${projectDuration},aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[base_audio_silence];`;

        // --- 1. PROCESSAR TRILHA PRINCIPAL (VIDEO) ---
        let mainTrackVideoStream = null;
        let mainTrackAudioStream = null;
        
        if (mainTrackClips.length > 0) {
             let mainTrackLabels = [];
             let mainTrackAudioSegments = [];
             
             mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                const duration = Math.max(0.1, parseFloat(clip.duration) || 5);
                const inputInfo = getOrAddInput(filePath, clip.type === 'image', duration);
                let currentV = getStreamLabel(inputInfo);
                
                const addFilter = (filterText) => {
                    if (!filterText) return;
                    const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${filterText}[${nextLabel}];`;
                    currentV = `[${nextLabel}]`;
                };

                // Standardize format EARLY for zoompan compatibility
                if (clip.type === 'image') {
                    addFilter('format=yuv420p');
                }

                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`setpts=PTS-STARTPTS`);
                }
                
                if (clip.transition && clip.transition.id === 'zoom-neg') {
                    const transDur = clip.transition.duration || 0.5;
                    addFilter(`negate=enable='between(t,0,${transDur})'`);
                }

                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }
                
                if (clip.properties && clip.properties.adjustments) {
                    const adj = clip.properties.adjustments;
                    let eqParts = [];
                    if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                    if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                    if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                    
                    let eqFilter = eqParts.length > 0 ? `eq=${eqParts.join(':')}` : '';
                    if (adj.hue !== 0) eqFilter = eqFilter ? `${eqFilter},hue=h=${adj.hue}` : `hue=h=${adj.hue}`;
                    if (eqFilter) addFilter(eqFilter);
                }

                let moveApplied = false;
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config, targetRes, targetFps);
                    if (moveFilter) {
                        addFilter(moveFilter);
                        moveApplied = true;
                    }
                } 
                
                if (!moveApplied && clip.type === 'image') {
                    const staticMove = presetGenerator.getMovementFilter(null, duration, true, {}, targetRes, targetFps);
                    addFilter(staticMove);
                }

                // Ensure properties match for XFADE (Critical: setsar=1, yuv420p)
                // We re-apply safe scale logic with centered padding to handle odd dimensions correctly
                // Adding FIFO buffer here to prevent "Resource temporarily unavailable"
                // We use max(2, ...) to avoid 0-dimension errors
                addFilter(`scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,scale='max(2,trunc(iw/2)*2)':'max(2,trunc(ih/2)*2)',pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${targetFps},format=yuv420p`);

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // Audio do Video
                const mediaInfo = mediaLibrary[clip.fileName];
                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const audioLabel = `a_main_${i}`;
                    const start = clip.mediaStartOffset || 0;
                    const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;
                    const audioFormatFilter = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp,aresample=async=1';
                    
                    filterChain += `[${idx}:a]${audioFormatFilter},atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,volume=${vol}[${audioLabel}];`;
                    mainTrackAudioSegments.push(`[${audioLabel}]`);
                } else {
                    // Padding Audio (Source filter inside graph to save command-line inputs)
                    const audioLabel = `a_pad_${i}`;
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration},aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[${audioLabel}];`;
                    mainTrackAudioSegments.push(`[${audioLabel}]`);
                }
             });

             // Compor Trilha Principal (Video & Audio Concat/Xfade)
             if (mainTrackLabels.length > 0) {
                let currentMixV = mainTrackLabels[0].label;
                let currentMixA = mainTrackAudioSegments[0];
                let accumulatedDuration = mainTrackLabels[0].duration;

                for (let i = 1; i < mainTrackLabels.length; i++) {
                    const nextClip = mainTrackLabels[i];
                    // IMPORTANT: Ensure transition exists, otherwise use a minimal value to prevent breakage
                    const trans = nextClip.transition || { id: 'fade', duration: 0.5 };
                    const hasExplicitTrans = !!nextClip.transition;
                    let transDur = hasExplicitTrans ? trans.duration : 0.0; 
                    
                    // Offset logic: Start transition 'duration' seconds before the end of the previous clip
                    // accumulatedDuration is the end time of the previous mix
                    const offset = accumulatedDuration - transDur;
                    
                    // Fallback to simple concat if offset is negative (clip too short)
                    if (offset < 0) {
                        transDur = 0; 
                    }

                    // Get FFmpeg Xfade name, default to 'fade' if not found
                    let transId = presetGenerator.getTransitionXfade(trans.id);
                    if (!transId) transId = 'fade';

                    const nextLabelV = `mix_v_${i}`;
                    const nextLabelA = `mix_a_${i}`;
                    
                    if (transDur > 0 && hasExplicitTrans) {
                        filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                        filterChain += `${currentMixA}${mainTrackAudioSegments[i]}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;
                        accumulatedDuration = offset + nextClip.duration;
                    } else {
                        // Simple Concatenation via Xfade (safe fallback to prevent flashes)
                        const safeDur = 0.04;
                        const safeOffset = Math.max(0, accumulatedDuration - safeDur);
                         filterChain += `${currentMixV}${nextClip.label}xfade=transition=fade:duration=${safeDur}:offset=${safeOffset}[${nextLabelV}];`;
                         filterChain += `${currentMixA}${mainTrackAudioSegments[i]}acrossfade=d=${safeDur}:c1=tri:c2=tri[${nextLabelA}];`;
                         accumulatedDuration = safeOffset + nextClip.duration;
                    }
                    
                    currentMixV = `[${nextLabelV}]`;
                    currentMixA = `[${nextLabelA}]`;
                }
                mainTrackVideoStream = currentMixV;
                mainTrackAudioStream = currentMixA;
             }
        }

        // --- 2. JUNTAR BACKGROUND COM MAIN TRACK ---
        let finalComp = baseVideoStream;
        
        if (mainTrackVideoStream) {
            const compLabel = `comp_base`;
            // Base stream is already setsar=1, mainTrack is setsar=1
            // Adding FIFO to main stream before overlay
            filterChain += `${baseVideoStream}${mainTrackVideoStream}overlay=x=0:y=0:eof_action=pass[${compLabel}];`;
            finalComp = `[${compLabel}]`;
        }

        // --- 3. APLICAR OVERLAYS ---
        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';
            
            if (clip.type === 'text') {
                 const bgLabel = `txtbg_${i}`;
                 filterChain += `color=c=black@0.0:s=${targetRes.w}x${targetRes.h}:r=${targetFps}:d=${clip.duration}[${bgLabel}];`;

                 let txt = (clip.properties.text || '');
                 const maxChars = targetRes.w > 1280 ? 50 : 30; 
                 txt = this.wrapText(txt, maxChars);
                 const escapedTxt = this.escapeDrawText(txt);
                 
                 let color = clip.properties.textDesign?.color || 'white';
                 if (color === 'transparent') color = 'white@0.0';

                 const baseFontSize = 80;
                 const scaleFactor = targetRes.w / 1280;
                 const fontsize = Math.round(baseFontSize * scaleFactor * (clip.properties.transform?.scale || 1));
                 
                 let x = '(w-text_w)/2';
                 let y = '(h-text_h)/2';
                 
                 if (clip.properties.transform) {
                     const t = clip.properties.transform;
                     if (t.x) x += `+(${t.x}*${scaleFactor})`;
                     if (t.y) y += `+(${t.y}*${scaleFactor})`;
                 }
                 
                 let styles = '';
                 if (clip.properties.textDesign?.stroke) {
                     const s = clip.properties.textDesign.stroke;
                     if (s.width > 0) styles += `:borderw=${s.width * scaleFactor}:bordercolor=${s.color || 'black'}`;
                 }
                 if (clip.properties.textDesign?.shadow) {
                     const sh = clip.properties.textDesign.shadow;
                     if (sh.x || sh.y) styles += `:shadowx=${(sh.x || 2) * scaleFactor}:shadowy=${(sh.y || 2) * scaleFactor}:shadowcolor=${sh.color || 'black@0.5'}`;
                 }
                 
                 const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"; 
                 const fontArg = `:fontfile='${fontFile}'`;

                 const txtLabel = `txt_${i}`;
                 filterChain += `[${bgLabel}]drawtext=text='${escapedTxt}'${fontArg}:fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styles}[${txtLabel}];`;
                 overlayInputLabel = `[${txtLabel}]`;

            } else {
                 const filePath = fileMap[clip.fileName];
                 if (!filePath) return;
                 
                 const idx = getOrAddInput(filePath, clip.type === 'image', clip.duration);
                 const rawLabel = `[${idx}:v]`;
                 const processedLabel = `ov_proc_${i}`;
                 
                 let filters = [];
                 
                 // Force Alpha format immediately for Overlay content to avoid format issues during scaling
                 // Also force SAR=1 to match main track and prevent overlay errors
                 filters.push('format=yuva420p,setsar=1');

                 if (clip.type === 'video') {
                     const start = clip.mediaStartOffset || 0;
                     filters.push(`trim=start=${start}:duration=${start + clip.duration},setpts=PTS-STARTPTS`);
                 } else {
                     filters.push(`trim=duration=${clip.duration},setpts=PTS-STARTPTS`);
                 }
                 
                 if (clip.effect) {
                     const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                     if (fx) filters.push(fx);
                 }

                 if (clip.properties.movement) {
                     const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, clip.duration, clip.type === 'image', clip.properties.movement.config, targetRes, targetFps);
                     if (moveFilter) filters.push(moveFilter);
                 }
                 
                 const scale = clip.properties.transform?.scale || 0.5;
                 const w = Math.max(2, Math.floor(targetRes.w * scale / 2) * 2);
                 filters.push(`scale=${w}:'max(2,trunc(ih*${w}/max(1,iw)/2)*2)'`);
                 
                 if (clip.properties.transform?.rotation) {
                     filters.push(`rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`);
                 }
                 
                 const joinedFilters = filters.filter(Boolean).join(',');
                 if (joinedFilters) {
                     filterChain += `${rawLabel}${joinedFilters}[${processedLabel}];`;
                 } else {
                     // Fallback if no filters (should not happen due to format/fifo)
                     filterChain += `${rawLabel}null[${processedLabel}];`;
                 }
                 overlayInputLabel = `[${processedLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
            // Use fixed precision to avoid scientific notation in FFmpeg expressions
            const startTime = parseFloat(clip.start.toFixed(4));
            const endTime = parseFloat((startTime + clip.duration).toFixed(4));
            
            let overlayX = '(W-w)/2';
            let overlayY = '(H-h)/2';
            if (clip.type !== 'text' && clip.properties.transform) {
                 const t = clip.properties.transform;
                 const scaleFactor = targetRes.w / 1280;
                 if (t.x) overlayX += `+(${t.x}*${scaleFactor})`;
                 if (t.y) overlayY += `+(${t.y}*${scaleFactor})`;
            }

            const shiftedLabel = `shift_${i}`;
            filterChain += `${overlayInputLabel}setpts=PTS+${startTime}/TB[${shiftedLabel}];`;
            
            filterChain += `${finalComp}[${shiftedLabel}]overlay=x=${overlayX}:y=${overlayY}:enable='between(t,${startTime},${endTime})':eof_action=pass[${nextCompLabel}];`;
            finalComp = `[${nextCompLabel}]`;
        });

        // --- 4. MIXAGEM DE ÁUDIO (ROBUSTA) ---
        // Start with the full duration silence
        let audioMixInputs = [baseAudioStream];
        const safeAudioFormat = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';
        
        // Add Main Track Audio if exists
        if (mainTrackAudioStream) {
            audioMixInputs.push(mainTrackAudioStream);
        }

        // Add Extra Audio Clips
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            const idx = getOrAddInput(filePath);
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delayMs = Math.round(clip.start * 1000); 
            
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,${safeAudioFormat},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        // Add Layer Audio Clips
        overlayClips.forEach((clip, i) => {
            if (clip.type === 'video') {
                const filePath = fileMap[clip.fileName];
                const mediaInfo = mediaLibrary[clip.fileName];
                if (!filePath || !mediaInfo?.hasAudio) return;
                
                const idx = getOrAddInput(filePath);
                const lbl = `layer_audio_${i}`;
                
                const startTrim = clip.mediaStartOffset || 0;
                const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
                const delayMs = Math.round(clip.start * 1000);
                
                filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,${safeAudioFormat},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;
                audioMixInputs.push(`[${lbl}]`);
            }
        });

        let finalAudio = '[final_audio_out]';
        // Use amix with duration=first because the first input is our full-length silence track
        filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;

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
