
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
        
        // Filtro de Escala Seguro - CRITICAL FIX
        // Simplified double-scale to prevent parsing errors and ensure even dimensions for yuv420p.
        // Step 1: Scale to fit inside target box. Step 2: Round to nearest even number. Step 3: Pad to target.
        const SCALE_FILTER = `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,fps=${targetFps},format=yuv420p`;

        // CALCULAR DURAÇÃO TOTAL DO PROJETO
        const maxClipEnd = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
        const projectDuration = Math.max(explicitTotalDuration, maxClipEnd, 1);

        // SEPARAR TRILHAS
        // Video Principal (A-Roll) - Apenas trilha 'video'
        const mainTrackClips = clips.filter(c => c.track === 'video').sort((a, b) => a.start - b.start);

        // Overlays (Texto, Legendas, e TUDO da trilha 'camada')
        const overlayClips = clips.filter(c => 
            ['text', 'subtitle', 'camada'].includes(c.track)
        ).sort((a, b) => a.start - b.start);

        // Audio Clips
        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))
        );

        // --- 0. GERAR BACKGROUND BASE ---
        let baseStream = '[bg_base]';
        
        const bgFile = fileMap['background']; 
        if (bgFile) {
             inputs.push('-loop', '1', '-t', projectDuration.toString(), '-i', bgFile);
             const bgIdx = inputIndexCounter++;
             // Ensure safe scaling for background crop
             filterChain += `[${bgIdx}:v]scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=increase,scale=trunc(iw/2)*2:trunc(ih/2)*2,crop=${targetRes.w}:${targetRes.h},setsar=1,fps=${targetFps},format=yuv420p[bg_base];`;
        } else {
             inputs.push('-f', 'lavfi', '-t', projectDuration.toString(), '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
             baseStream = `[${inputIndexCounter++}:v]`;
        }

        // Placeholder de áudio base (silêncio)
        let baseAudioSegments = [];
        inputs.push('-f', 'lavfi', '-t', '0.1', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        const silenceSrcIdx = inputIndexCounter++;
        let mainAudioStream = `[${silenceSrcIdx}:a]`; 

        // --- 1. PROCESSAR TRILHA PRINCIPAL (VIDEO) ---
        let mainTrackStream = null;
        
        if (mainTrackClips.length > 0) {
             let mainTrackLabels = [];
             
             mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                const duration = Math.max(0.5, parseFloat(clip.duration) || 5);

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

                // Standardize Resolution FIRST
                addFilter(SCALE_FILTER);

                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }
                
                // Transitions logic (Zoom Neg, etc)
                if (clip.transition && clip.transition.id === 'zoom-neg') {
                    const transDur = clip.transition.duration || 0.5;
                    addFilter(`negate=enable='between(t,0,${transDur})'`);
                }

                // Effects
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }
                
                // Color Adjustments
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

                // Movement
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config, targetRes, targetFps);
                    if (moveFilter) addFilter(moveFilter);
                } else if (clip.type === 'image') {
                    const staticMove = presetGenerator.getMovementFilter(null, duration, true, {}, targetRes, targetFps);
                    addFilter(staticMove);
                }

                // Final scale ensure to handle any zoompan resolution changes AND force pixel format
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
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    // Padding Audio
                    const audioLabel = `a_silence_${i}`;
                    const silenceIdx = inputIndexCounter++;
                    inputs.push('-f', 'lavfi', '-t', duration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                    filterChain += `[${silenceIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
             });

             // Compor Trilha Principal com XFADE
             if (mainTrackLabels.length > 0) {
                let currentMixV = mainTrackLabels[0].label;
                let currentMixA = baseAudioSegments[0];
                let accumulatedDuration = mainTrackLabels[0].duration;

                for (let i = 1; i < mainTrackLabels.length; i++) {
                    const nextClip = mainTrackLabels[i];
                    const trans = nextClip.transition || { id: 'fade', duration: 0.5 };
                    const hasExplicitTrans = !!nextClip.transition;
                    let transDur = hasExplicitTrans ? trans.duration : 0.04; // 0.04 = hard cut safety
                    const offset = accumulatedDuration - transDur;
                    
                    if (offset < 0) transDur = 0.04; 

                    const transId = presetGenerator.getTransitionXfade(trans.id);
                    const nextLabelV = `mix_v_${i}`;
                    const nextLabelA = `mix_a_${i}`;
                    
                    filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                    filterChain += `${currentMixA}${baseAudioSegments[i]}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;
                    
                    currentMixV = `[${nextLabelV}]`;
                    currentMixA = `[${nextLabelA}]`;
                    accumulatedDuration = offset + nextClip.duration;
                }
                mainTrackStream = currentMixV;
                mainAudioStream = currentMixA;
             }
        }

        // --- 2. JUNTAR BACKGROUND COM MAIN TRACK ---
        let finalComp = baseStream;
        
        // Se temos trilha principal, sobrepomos ao fundo. 
        if (mainTrackStream) {
            const compLabel = `comp_base`;
            // overlay=eof_action=pass garante que o fundo continue se o video acabar antes
            filterChain += `${baseStream}${mainTrackStream}overlay=x=0:y=0:eof_action=pass[${compLabel}];`;
            finalComp = `[${compLabel}]`;
        }

        // --- 3. APLICAR OVERLAYS (Camadas, Texto, etc) ---
        // Overlay Clips são posicionados pelo timestamp absoluto (clip.start)
        
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
                 // IMAGE OR VIDEO OVERLAY (PIP)
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
                 
                 // Transform (Scale & Rotate)
                 const scale = clip.properties.transform?.scale || 0.5;
                 // Force even width calculation
                 const w = Math.max(2, Math.floor(targetRes.w * scale / 2) * 2);
                 // Scale with explicit -2 height logic to preserve aspect but enforce even dimensions
                 filters.push(`scale=${w}:-2`);
                 
                 if (clip.properties.transform?.rotation) {
                     filters.push(`rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`);
                 }
                 
                 // Ensure pixel format matches main composition to avoid "Failed to configure output pad" errors
                 filters.push('format=yuv420p');

                 filterChain += `${rawLabel}${filters.join(',')}[${processedLabel}];`;
                 overlayInputLabel = `[${processedLabel}]`;
            }

            // Aplicar Overlay com Timing
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

        // --- 4. MIXAGEM DE ÁUDIO (Trilhas Extras) ---
        let audioMixInputs = [mainAudioStream];
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
            
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,${safeAudioFormat},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        // Também adicionar áudio de clipes da CAMADA se forem videos
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
        if (audioMixInputs.length > 1) {
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
