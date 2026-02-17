
import presetGenerator from './presetGenerator.js';

// Helper to escape text for drawtext filter
function escapeDrawText(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
}

// Helper to wrap text manually since drawtext wrapping can be finicky
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

export default {
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
        
        // Filtro de Escala Seguro
        const SCALE_FILTER = `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,fps=${targetFps},format=yuv420p`;

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
             inputs.push('-f', 'lavfi', '-t', projectDuration.toString(), '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
             baseVideoStream = `[${inputIndexCounter++}:v]`;
        }

        // Audio Base (Full Duration Silence) - Critical for AMIX stability
        let baseAudioStream = '[base_audio_silence]';
        inputs.push('-f', 'lavfi', '-t', projectDuration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        const silenceIdx = inputIndexCounter++;
        filterChain += `[${silenceIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[base_audio_silence];`;

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

                // Standardize Resolution
                addFilter(SCALE_FILTER);

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
                    // Update: Pass targetRes and targetFps to movement generator to avoid aspect ratio issues
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

                // Force scale again after movement to ensure even dimensions for xfade
                addFilter(`scale=${targetRes.w}:${targetRes.h}:flags=lanczos,setsar=1,format=yuv420p`);

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
                    // Padding Audio (Silence for this clip duration)
                    const audioLabel = `a_pad_${i}`;
                    // Re-use the main silence source if possible, but trimming it is safer for concatenation
                    const padIdx = inputIndexCounter++;
                    inputs.push('-f', 'lavfi', '-t', duration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                    filterChain += `[${padIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[${audioLabel}];`;
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
                    const trans = nextClip.transition || { id: 'fade', duration: 0.5 };
                    const hasExplicitTrans = !!nextClip.transition;
                    let transDur = hasExplicitTrans ? trans.duration : 0.04; 
                    const offset = accumulatedDuration - transDur;
                    
                    if (offset < 0) transDur = 0.04; 

                    const transId = presetGenerator.getTransitionXfade(trans.id);
                    const nextLabelV = `mix_v_${i}`;
                    const nextLabelA = `mix_a_${i}`;
                    
                    filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                    filterChain += `${currentMixA}${mainTrackAudioSegments[i]}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;
                    
                    currentMixV = `[${nextLabelV}]`;
                    currentMixA = `[${nextLabelA}]`;
                    accumulatedDuration = offset + nextClip.duration;
                }
                mainTrackVideoStream = currentMixV;
                mainTrackAudioStream = currentMixA;
             }
        }

        // --- 2. JUNTAR BACKGROUND COM MAIN TRACK ---
        let finalComp = baseVideoStream;
        
        if (mainTrackVideoStream) {
            const compLabel = `comp_base`;
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
                 txt = wrapText(txt, maxChars);
                 const escapedTxt = escapeDrawText(txt);
                 
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
                 
                 if (clip.type === 'image') {
                     inputs.push('-loop', '1', '-t', (clip.duration + 1).toString(), '-i', filePath);
                 } else {
                     inputs.push('-i', filePath);
                 }
                 
                 const idx = inputIndexCounter++;
                 const rawLabel = `[${idx}:v]`;
                 const processedLabel = `ov_proc_${i}`;
                 
                 let filters = [];
                 
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
                 
                 const scale = clip.properties.transform?.scale || 0.5;
                 const w = Math.max(2, Math.floor(targetRes.w * scale / 2) * 2);
                 filters.push(`scale=${w}:-2`);
                 
                 if (clip.properties.transform?.rotation) {
                     filters.push(`rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`);
                 }
                 
                 filters.push('format=yuv420p');

                 filterChain += `${rawLabel}${filters.join(',')}[${processedLabel}];`;
                 overlayInputLabel = `[${processedLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
            const startTime = clip.start;
            const endTime = startTime + clip.duration;
            
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
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
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
                
                inputs.push('-i', filePath);
                const idx = inputIndexCounter++;
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
