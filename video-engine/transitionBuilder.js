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

// Helper to wrap text manually
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

const timelineBuilder = {

    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}) => {

        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

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

        // -------------- MAIN TRACK --------------
        if (mainTrackClips.length === 0) {

            inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            mainTrackLabels.push({ label: `[${inputIndexCounter++}:v]`, duration: 5 });

            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            baseAudioSegments.push(`[${inputIndexCounter++}:a]`);

        } else {

            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(0.5, parseFloat(clip.duration) || 5);

                if (clip.type === 'image')
                    inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath);
                else
                    inputs.push('-i', filePath);

                const idx = inputIndexCounter++;
                let currentV = `[${idx}:v]`;

                const addFilter = (text) => {
                    if (!text) return;
                    const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${text}[${nextLabel}];`;
                    currentV = `[${nextLabel}]`;
                };

                addFilter(SCALE_FILTER);

                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                if (clip.transition?.id === 'zoom-neg') {
                    const transDur = clip.transition.duration || 0.5;
                    addFilter(`negate=enable='between(t,0,${transDur})'`);
                }

                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                if (clip.properties?.adjustments) {
                    const adj = clip.properties.adjustments;
                    let eqParts = [];

                    if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                    if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                    if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);

                    let eqFilter = eqParts.length ? `eq=${eqParts.join(':')}` : '';

                    if (adj.hue !== 0)
                        eqFilter = eqFilter ? `${eqFilter},hue=h=${adj.hue}` : `hue=h=${adj.hue}`;

                    if (eqFilter) addFilter(eqFilter);
                }

                if (clip.properties?.movement) {
                    const move = presetGenerator.getMovementFilter(
                        clip.properties.movement.type,
                        duration,
                        clip.type === 'image',
                        clip.properties.movement.config,
                        targetRes,
                        targetFps
                    );

                    if (move) {
                        addFilter(
                            `${move},` +
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

                addFilter(
                    `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
                    `pad=${targetRes.w}:${targetRes.h}:(${targetRes.w}-iw)/2:(${targetRes.h}-ih)/2:color=black,setsar=1`
                );

                mainTrackLabels.push({
                    label: currentV,
                    duration,
                    transition: clip.transition
                });

                // AUDIO
                const mediaInfo = mediaLibrary[clip.fileName];
                const audioLabel = `a_base_${i}`;
                const audioFormat =
                    'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp,aresample=async=1';

                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const start = clip.mediaStartOffset || 0;
                    const vol = clip.properties.volume ?? 1;

                    filterChain += `[${idx}:a]${audioFormat},atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,volume=${vol}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);

                } else {
                    const silenceIdx = inputIndexCounter++;
                    inputs.push('-f', 'lavfi', '-t', duration.toString(), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                    filterChain += `[${silenceIdx}:a]${audioFormat}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // XFADE
        let currentMixV = '[black_bg]';
        let currentMixA = '[base_audio_seq]';

        if (mainTrackLabels.length > 0) {
            currentMixV = mainTrackLabels[0].label;
            currentMixA = baseAudioSegments[0];

            let acc = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const next = mainTrackLabels[i];
                const trans = next.transition || { id: 'fade', duration: 0.5 };

                const transDur = next.transition ? trans.duration : 0.04;
                const offset = acc - transDur;

                const transId = presetGenerator.getTransitionXfade(trans.id);

                const nextV = `mix_v_${i}`;
                const nextA = `mix_a_${i}`;

                filterChain += `${currentMixV}${next.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextV}];`;
                filterChain += `${currentMixA}${baseAudioSegments[i]}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextA}];`;

                currentMixV = `[${nextV}]`;
                currentMixA = `[${nextA}]`;
                acc = offset + next.duration;
            }
        }

        let finalComp = currentMixV;

        // OVERLAYS
        overlayClips.forEach((clip, i) => {
            let overlayInput = '';

            if (clip.type === 'text') {
                const bg = `txtbg_${i}`;
                filterChain += `color=c=black@0.0:s=${targetRes.w}x${targetRes.h}:r=${targetFps}:d=${clip.duration}[${bg}];`;

                let txt = clip.properties.text || '';
                txt = wrapText(txt, targetRes.w > 1280 ? 50 : 30);
                const escTxt = escapeDrawText(txt);

                let color = clip.properties.textDesign?.color || 'white';
                if (color === 'transparent') color = 'white@0.0';

                const baseFS = 80;
                const scaleF = targetRes.w / 1280;

                const fontsize = Math.round(baseFS * scaleF * (clip.properties.transform?.scale || 1));

                let x = '(w-text_w)/2';
                let y = '(h-text_h)/2';

                if (clip.properties.transform) {
                    const t = clip.properties.transform;
                    if (t.x) x += `+(${t.x}*${scaleF})`;
                    if (t.y) y += `+(${t.y}*${scaleF})`;
                }

                let styles = '';

                if (clip.properties.textDesign?.stroke) {
                    const s = clip.properties.textDesign.stroke;
                    if (s.width > 0)
                        styles += `:borderw=${s.width * scaleF}:bordercolor=${s.color || 'black'}`;
                }

                if (clip.properties.textDesign?.shadow) {
                    const sh = clip.properties.textDesign.shadow;
                    if (sh.x || sh.y)
                        styles += `:shadowx=${(sh.x || 2) * scaleF}:shadowy=${(sh.y || 2) * scaleF}:shadowcolor=${sh.color || 'black@0.5'}`;
                }

                const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
                const fontArg = `:fontfile='${fontFile}'`;

                const txtLbl = `txt_${i}`;

                filterChain += `[${bg}]drawtext=text='${escTxt}'${fontArg}:fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styles}[${txtLbl}];`;

                overlayInput = `[${txtLbl}]`;

            } else {
                const path = fileMap[clip.fileName];
                if (!path) return;

                inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', path);
                const idx = inputIndexCounter++;

                const imgLbl = `img_ov_${i}`;

                const scale = clip.properties.transform?.scale || 0.5;
                const w = Math.floor((targetRes.w * scale) / 2) * 2;

                let filters = `scale=${w}:-1`;

                if (clip.properties.transform?.rotation) {
                    filters += `,rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`;
                }

                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) filters += `,${fx}`;
                }

                filterChain += `[${idx}:v]${filters}[${imgLbl}];`;

                overlayInput = `[${imgLbl}]`;
            }

            const nextLabel = `comp_${i}`;
            const start = clip.start;
            const end = start + clip.duration;

            let overlayX = '(W-w)/2';
            let overlayY = '(H-h)/2';

            if (clip.type !== 'text' && clip.properties.transform) {
                const t = clip.properties.transform;
                const scaleF = targetRes.w / 1280;

                if (t.x) overlayX += `+(${t.x}*${scaleF})`;
                if (t.y) overlayY += `+(${t.y}*${scaleF})`;
            }

            const shifted = `shift_${i}`;
            filterChain += `${overlayInput}setpts=PTS+${start}/TB[${shifted}];`;

            filterChain += `${finalComp}[${shifted}]overlay=x=${overlayX}:y=${overlayY}:enable='between(t,${start},${end})':eof_action=pass[${nextLabel}];`;

            finalComp = `[${nextLabel}]`;
        });

        // AUDIO MIXER
        let audioInputs = [currentMixA];
        const audioFmt = 'aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';

        audioClips.forEach((clip, i) => {
            const path = fileMap[clip.fileName];
            if (!path) return;

            inputs.push('-i', path);
            const idx = inputIndexCounter++;

            const lbl = `sfx_${i}`;

            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume ?? 1;
            const delayMs = Math.round(clip.start * 1000);

            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,${audioFmt},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;

            audioInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';

        if (audioInputs.length > 1) {
            filterChain += `${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            finalAudio = currentMixA;
        }

        if (filterChain.endsWith(';'))
            filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalComp,
            outputMapAudio: finalAudio
        };
    }
};

export default timelineBuilder;
