
import presetGenerator from './preset-generator.js';

// Helper to escape text for drawtext filter
function escapeDrawText(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "'\\\\''")
        .replace(/%/g, '%%')
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
            '360p': { w: 640, h: 360 },
            '480p': { w: 854, h: 480 },
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 }
        };
        
        const targetRes = resMap[exportConfig.resolution] || resMap['720p'];
        const targetFps = parseInt(exportConfig.fps) || 30;
        
        const SCALE_FILTER = `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${targetRes.w}:${targetRes.h}:-1:-1:color=black,setsar=1,fps=${targetFps},format=yuv420p`;

        const maxClipEnd = clips.reduce((max, c) => Math.max(max, c.start + (parseFloat(c.duration) || 5)), 0);
        const projectDuration = Math.max(explicitTotalDuration, maxClipEnd, 1);

        const mainTrackClips = clips.filter(c => c.track === 'video').sort((a, b) => a.start - b.start);
        const trackOrder = { camada: 1, camada2: 2, camada3: 3, text: 4, subtitle: 5 };
        const overlayClips = clips.filter(c => 
            ['text', 'subtitle', 'camada', 'camada2', 'camada3'].includes(c.track)
        ).sort((a, b) => {
            const trackDiff = (trackOrder[a.track] || 0) - (trackOrder[b.track] || 0);
            if (trackDiff !== 0) return trackDiff;
            return a.start - b.start;
        });

        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'camada2', 'camada3', 'text'].includes(c.track))
        );

        // --- 0. GERAR BACKGROUND BASE (VIDEO & AUDIO) ---
        let baseVideoStream = '[bg_base]';
        const bgFile = fileMap['background']; 
        if (bgFile) {
             inputs.push('-loop', '1', '-t', projectDuration.toString(), '-s', `${targetRes.w}x${targetRes.h}`, '-i', bgFile);
             const bgIdx = inputIndexCounter++;
             filterChain += `[${bgIdx}:v]scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=increase,crop=${targetRes.w}:${targetRes.h},setsar=1,fps=${targetFps},format=yuv420p[bg_base];`;
        } else {
             inputs.push('-f', 'lavfi', '-t', projectDuration.toString(), '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
             baseVideoStream = `[${inputIndexCounter++}:v]`;
        }

        let baseAudioStream = '[base_audio_silence]';
        inputs.push('-f', 'lavfi', '-t', projectDuration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        const silenceIdx = inputIndexCounter++;
        filterChain += `[${silenceIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[base_audio_silence];`;

        // --- 1. PROCESSAR TRILHA PRINCIPAL (VIDEO) ---
        let mainTrackVideoStream = null;
        let mainTrackAudioStream = null;
        
        let accumulatedDurationForAudio = 0;
        let finalAudioSegments = [baseAudioStream];

        if (mainTrackClips.length > 0) {
             let mainTrackLabels = [];
             let mainTrackAudioSegments = [];
             
             mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                const duration = Math.max(0.1, parseFloat(clip.duration) || 5);

                if (clip.type === 'image') {
                    // Using -video_size for more explicit demuxer-level scaling
                    inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-video_size', `${targetRes.w}x${targetRes.h}`, '-i', filePath); 
                } else {
                    // Limit input reading to duration + buffer to save memory
                    const seek = clip.mediaStartOffset || 0;
                    inputs.push('-ss', seek.toString(), '-t', (duration + 2).toString(), '-i', filePath);
                }

                const idx = inputIndexCounter++;
                let currentV = `[${idx}:v]`;
                
                const addFilter = (filterText) => {
                    if (!filterText) return;
                    const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${filterText}[${nextLabel}];`;
                    currentV = `[${nextLabel}]`;
                };

                addFilter(SCALE_FILTER);

                if (clip.type !== 'image') {
                    addFilter(`setpts=PTS-STARTPTS`);
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
                
                if (clip.properties && clip.properties.audioDeepSync) {
                    addFilter("eq=contrast='1+0.2*abs(sin(2*PI*t*2))':brightness='0.05*abs(sin(2*PI*t*2))'");
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
                    const staticMove = presetGenerator.getMovementFilter('', duration, true, {}, targetRes, targetFps);
                    addFilter(staticMove);
                }

                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                const mediaInfo = mediaLibrary[clip.fileName];
            if (clip.type === 'video' && mediaInfo?.hasAudio) {
                const audioLabel = `a_main_${i}`;
                const start = clip.mediaStartOffset || 0;
                const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;
                const delay = Math.round(accumulatedDurationForAudio * 1000);
                
                let audioFilters = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';
                if (clip.properties && clip.properties.audioDeepSync) {
                    audioFilters += ',bass=g=15,volume=1.5';
                }

                filterChain += `[${idx}:a]${audioFilters},atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,volume=${vol},adelay=${delay}|${delay}[${audioLabel}];`;
                finalAudioSegments.push(`[${audioLabel}]`);
            }
            
            accumulatedDurationForAudio += duration;
         });

         if (mainTrackLabels.length > 0) {
            let currentMixV = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const trans = nextClip.transition || { id: 'fade', duration: 0.5 };
                const hasExplicitTrans = !!nextClip.transition;
                let transDur = hasExplicitTrans ? trans.duration : 0.0; 
                
                const offset = accumulatedDuration - transDur;
                if (offset < 0) {
                    transDur = 0; 
                }

                let transId = presetGenerator.getTransitionXfade(trans.id);
                if (!transId) transId = 'fade';

                const nextLabelV = `mix_v_${i}`;
                
                if (transDur > 0 && hasExplicitTrans) {
                    filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                    accumulatedDuration = offset + nextClip.duration;
                } else {
                    // SEQUENTIAL OVERLAY (Saves a lot of transition memory compared to xfade)
                    const overlayLabelV = `ovm_v_${i}`;
                    filterChain += `${currentMixV}${nextClip.label}overlay=enable='gt(t,${accumulatedDuration})':eof_action=pass[${overlayLabelV}];`;
                    accumulatedDuration += nextClip.duration;
                    currentMixV = `[${overlayLabelV}]`;
                    continue; 
                }
                
                currentMixV = `[${nextLabelV}]`;
            }
            mainTrackVideoStream = currentMixV;
         }
    }

    let finalComp = baseVideoStream;
    
    if (mainTrackVideoStream) {
        const compLabel = `comp_base`;
        filterChain += `${baseVideoStream}${mainTrackVideoStream}overlay=x=0:y=0:eof_action=pass[${compLabel}];`;
        finalComp = `[${compLabel}]`;
    }

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
                 let alpha = '1.0';
                 let animType = 'none';

                 if (clip.properties.textDesign?.animation) {
                     const anim = clip.properties.textDesign.animation;
                     const animDur = 0.5;
                     
                     if (anim.in === 'fade-in' || anim.id === 'fade-in') {
                         alpha = `min(t/${animDur},1)`;
                     }
                     if (anim.out === 'fade-out') {
                         alpha = `if(lt(t,${clip.duration - animDur}),${alpha},min((d-t)/${animDur},1))`;
                     }
                     if (anim.loop === 'pulse') {
                         alpha = `(${alpha})*(0.8+0.2*sin(2*PI*t))`;
                     }
                 }

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

                 const txtLabel = `txt_base_${i}`;
                 const finalTxt = escapedTxt || ' ';
                 filterChain += `[${bgLabel}]drawtext=text='${finalTxt}'${fontArg}:fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}:alpha='${alpha}'${styles}[${txtLabel}];`;
                 overlayInputLabel = `[${txtLabel}]`;

                 // PROGRESS BAR LOGIC
                 if (clip.properties.textDesign?.isProgressBar) {
                     const pbLabel = `txt_pb_${i}`;
                     const pbColor = clip.properties.textDesign?.color || 'white';
                     const pbH = Math.round(15 * scaleFactor);
                     const pbY = targetRes.h - pbH - Math.round(40 * scaleFactor);
                     const progressExpr = `(t+${clip.start})/${projectDuration}`;
                     filterChain += `${overlayInputLabel}drawbox=x=0:y=${pbY}:w=iw*${progressExpr}:h=${pbH}:color=${pbColor}:t=fill[${pbLabel}];`;
                     overlayInputLabel = `[${pbLabel}]`;
                 }

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

                 if (clip.properties.movement) {
                     const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, clip.duration, clip.type === 'image', clip.properties.movement.config, targetRes, targetFps);
                     if (moveFilter) filters.push(moveFilter);
                 }
                 
                 if (clip.properties.transform?.rotation) {
                     filters.push(`rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`);
                 }
                 
                 const scaleVal = clip.properties.transform?.scale || 0.5;
                 const targetW = Math.max(2, Math.floor(targetRes.w * scaleVal / 2) * 2);
                 filters.push(`scale=${targetW}:'max(2,trunc(ih*(${targetW}/iw)/2)*2)',setsar=1,format=yuva420p`);

                 filterChain += `${rawLabel}${filters.join(',')}[${processedLabel}];`;
                 overlayInputLabel = `[${processedLabel}]`;
            }

            const nextCompLabel = `comp_${i}`;
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
            // Removed redundant fifo buffer per overlay to save memory on Cloud Run
            filterChain += `${finalComp}[${shiftedLabel}]overlay=x=${overlayX}:y=${overlayY}:enable='between(t,${startTime},${endTime})':eof_action=pass[${nextCompLabel}];`;
            finalComp = `[${nextCompLabel}]`;
        });

        const safeAudioFormat = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';
        
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delayMs = Math.round(clip.start * 1000); 
            const dur = Math.max(0.1, clip.duration);
            
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + dur},asetpts=PTS-STARTPTS,${safeAudioFormat},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;
            finalAudioSegments.push(`[${lbl}]`);
        });

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
                const dur = Math.max(0.1, clip.duration);
                
                filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + dur},asetpts=PTS-STARTPTS,${safeAudioFormat},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;
                finalAudioSegments.push(`[${lbl}]`);
            }
        });

        // --- GERAR AUDIO FINAL ---
        let finalAudio = '[final_audio_out]';
        const amixInputs = finalAudioSegments.length;
        
        if (amixInputs > 0) {
            // Using a single amix at the end is MUCH more RAM-efficient than chaining
            // Added dropout_transition=0 and normalize=0 to minimize processing
            filterChain += `${finalAudioSegments.join('')}amix=inputs=${amixInputs}:duration=longest:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            filterChain += `${baseAudioStream}acopy[final_audio_out];`;
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
