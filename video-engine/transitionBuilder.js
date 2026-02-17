const presetGenerator = require('./presetGenerator.js');

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

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}) => {

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

        const SCALE_FILTER =
            `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
            `pad=${targetRes.w}:${targetRes.h}:(${targetRes.w}-iw)/2:(${targetRes.h}-ih)/2:color=black,` +
            `setsar=1,fps=${targetFps},format=yuv420p`;

        // SEPARAR TRILHAS
        const mainTrackClips = clips.filter(c =>
            c.track === 'video' || (c.track === 'camada' && c.type === 'video')
        ).sort((a, b) => a.start - b.start);

        const overlayClips = clips.filter(c =>
            ['text', 'subtitle'].includes(c.track) ||
            (c.track === 'camada' && c.type === 'image')
        );

        const audioClips = clips.filter(c =>
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))
        );

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // ---------------- TRILHA PRINCIPAL ----------------
        if (mainTrackClips.length === 0) {
            // Fundo preto
            inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            mainTrackLabels.push({ label: `[${inputIndexCounter++}:v]`, duration: 5 });

            // Áudio mudo
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            baseAudioSegments.push(`[${inputIndexCounter++}:a]`);

        } else {

            mainTrackClips.forEach((clip, i) => {

                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(0.5, parseFloat(clip.duration) || 5);

                // INPUT
                if (clip.type === 'image')
                    inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath);
                else
                    inputs.push('-i', filePath);

                const idx = inputIndexCounter++;
                let currentV = `[${idx}:v]`;

                const addFilter = (filterText) => {
                    if (!filterText) return;
                    const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${filterText}[${nextLabel}];`;
                    currentV = `[${nextLabel}]`;
                };

                // Escala inicial
                addFilter(SCALE_FILTER);

                // Trim
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // TRANSIÇÃO NEGATIVA
                if (clip.transition && clip.transition.id === 'zoom-neg') {
                    const transDur = clip.transition.duration || 0.5;
                    addFilter(`negate=enable='between(t,0,${transDur})'`);
                }

                // EFEITOS
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                // AJUSTES DE COR
                if (clip.properties && clip.properties.adjustments) {
                    const adj = clip.properties.adjustments;
                    let eqParts = [];
                    if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                    if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                    if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);

                    let eqFilter = eqParts.length > 0 ? `eq=${eqParts.join(':')}` : '';
                    if (adj.hue !== 0)
                        eqFilter = eqFilter ? `${eqFilter},hue=h=${adj.hue}` : `hue=h=${adj.hue}`;

                    if (eqFilter) addFilter(eqFilter);
                }

                // MOVIMENTO
                if (clip.properties && clip.properties.movement) {

                    const moveFilter = presetGenerator.getMovementFilter(
                        clip.properties.movement.type,
                        duration,
                        clip.type === 'image',
                        clip.properties.movement.config,
                        targetRes,
                        targetFps
                    );

                    if (moveFilter) {
                        addFilter(
                            `${moveFilter},` +
                            `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
                            `pad=${targetRes.w}:${targetRes.h}:(${targetRes.w}-iw)/2:(${targetRes.h}-ih)/2:color=black,setsar=1`
                        );
                    }

                } else if (clip.type === 'image') {

                    const staticMove = presetGenerator.getMovementFilter(
                        null,
                        duration,
                        true,
                        {},
                        targetRes,
                        targetFps
                    );

                    addFilter(
                        `${staticMove},` +
                        `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
                        `pad=${targetRes.w}:${targetRes.h}:(${targetRes.w}-iw)/2:(${targetRes.h}-ih)/2:color=black,setsar=1`
                    );
                }

                // ESCALA FINAL
                addFilter(
                    `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
                    `pad=${targetRes.w}:${targetRes.h}:(${targetRes.w}-iw)/2:(${targetRes.h}-ih)/2:color=black,setsar=1`
                );

                // SALVAR STREAM
                mainTrackLabels.push({
                    label: currentV,
                    duration: duration,
                    transition: clip.transition
                });

                // ÁUDIO
                const mediaInfo = mediaLibrary[clip.fileName];
                const audioLabel = `a_base_${i}`;

                const audioFormatFilter =
                    'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp,aresample=async=1';

                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const start = clip.mediaStartOffset || 0;
                    const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;
                    filterChain += `[${idx}:a]${audioFormatFilter},atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,volume=${vol}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    const silenceIdx = inputIndexCounter++;
                    inputs.push('-f', 'lavfi', '-t', duration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                    filterChain += `[${silenceIdx}:a]${audioFormatFilter}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // ---------------- XFADE ----------------
        let mainVideoStream = '[black_bg]';
        let mainAudioStream = '[base_audio_seq]';

        if (mainTrackLabels.length > 0) {
            let currentMixV = mainTrackLabels[0].label;
            let currentMixA = baseAudioSegments[0];
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {

                const nextClip = mainTrackLabels[i];
                const trans = nextClip.transition || { id: 'fade', duration: 0.5 };
                const hasExplicit = !!nextClip.transition;

                let transDur = hasExplicit ? trans.duration : 0.04;
                const offset = accumulatedDuration - transDur;
                const transId = presetGenerator.getTransitionXfade(trans.id);

                const nextLabelV = `mix_v_${i}`;
                const nextLabelA = `mix_a_${i}`;

                filterChain += `${currentMixV}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabelV}];`;
                filterChain += `${currentMixA}${baseAudioSegments[i]}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextLabelA}];`;

                currentMixV = `[${nextLabelV}]`;
                currentMixA = `[${nextLabelA}]`;
                accumulatedDuration = offset + nextClip.duration;
            }

            mainVideoStream = currentMixV;
            mainAudioStream = currentMixA;
        }

        // ---------------- OVERLAYS ----------------
        let finalComp = mainVideoStream;

        overlayClips.forEach((clip, i) => {
            let overlayInputLabel = '';

            if (clip.type === 'text') {
                const bgLabel = `txtbg_${i}`;
                filterChain += `color=c=black@0.0:s=${targetRes.w}x${targetRes.h}:r=${targetFps}:d=${clip.duration}[${bgLabel}];`;

                let txt = clip.properties.text || '';
                txt = wrapText(txt, targetRes.w > 1280 ? 50 : 30);
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
                    if (s.width > 0)
                        styles += `:borderw=${s.width * scaleFactor}:bordercolor=${s.color || 'black'}`;
                }

                if (clip.properties.textDesign?.shadow) {
                    const sh = clip.properties.textDesign.shadow;
                    if (sh.x || sh.y)
                        styles += `:shadowx=${(sh.x || 2) * scaleFactor}:shadowy=${(sh.y || 2) * scaleFactor}:shadowcolor=${sh.color || 'black@0.5'}`;
                }

                const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
                const fontArg = `:fontfile='${fontFile}'`;

                const txtLabel = `txt_${i}`;
                filterChain += `[${bgLabel}]drawtext=text='${escapedTxt}'${fontArg}:fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styles}[${txtLabel}];`;
                overlayInputLabel = `[${txtLabel}]`;

            } else {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                const idx = inputIndexCounter++;

                const imgLabel = `img_ov_${i}`;
                const scale = clip.properties.transform?.scale || 0.5;
                const w = Math.floor((targetRes.w * scale) / 2) * 2;

                let transformFilters = `scale=${w}:-1`;
                if (clip.properties.transform?.rotation) {
                    transformFilters += `,rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`;
                }

                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) transformFilters += `,${fx}`;
                }

                filterChain += `[${idx}:v]${transformFilters}[${imgLabel}];`;
                overlayInputLabel = `[${imgLabel}]`;
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

        // ---------------- MIXER DE ÁUDIO ----------------
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
