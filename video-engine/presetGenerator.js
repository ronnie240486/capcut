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
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        const mainTrackClips = clips
            .filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video'))
            .sort((a, b) => a.start - b.start);

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

        // =========================
        // 1. MAIN VIDEO TRACK
        // =========================

        if (mainTrackClips.length === 0) {
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            mainTrackLabels.push(`[${inputIndexCounter++}:v]`);

            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            baseAudioSegments.push(`[${inputIndexCounter++}:a]`);
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(1, Number(clip.duration) || 5);

                if (clip.type === 'image') {
                    inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath);
                } else {
                    inputs.push('-i', filePath);
                }

                const idx = inputIndexCounter++;
                let currentV = `[${idx}:v]`;

                const addFilter = (filter) => {
                    if (!filter) return;
                    const lbl = `v_${i}_${Math.random().toString(36).slice(2, 6)}`;
                    filterChain += `${currentV}${filter}[${lbl}];`;
                    currentV = `[${lbl}]`;
                };

                // ✅ SCALE FIXO – UMA ÚNICA VEZ (ANTES DE TUDO)
                addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

                // ✅ TRIM CORRETO
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addFilter(`trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // EFFECTS
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                // MOVEMENT (zoompan é o ÚLTIMO geométrico)
                if (clip.properties?.movement) {
                    const mv = presetGenerator.getMovementFilter(
                        clip.properties.movement.type,
                        duration,
                        clip.type === 'image',
                        clip.properties.movement.config
                    );
                    if (mv) addFilter(mv);
                } else if (clip.type === 'image') {
                    addFilter(presetGenerator.getMovementFilter(null, duration, true));
                }

                mainTrackLabels.push({
                    label: currentV,
                    duration,
                    transition: clip.transition
                });

                // AUDIO
                const audioLabel = `a_${i}`;
                const mediaInfo = mediaLibrary[clip.fileName];

                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    const start = clip.mediaStartOffset || 0;
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
                } else {
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                }

                baseAudioSegments.push(`[${audioLabel}]`);
            });
        }

        // =========================
        // 2. XFADE SEQUENCE
        // =========================

        let mainVideoStream = mainTrackLabels[0]?.label || '[0:v]';
        let accDuration = mainTrackLabels[0]?.duration || 0;

        for (let i = 1; i < mainTrackLabels.length; i++) {
            const prev = mainTrackLabels[i - 1];
            const next = mainTrackLabels[i];
            const trans = prev.transition || { id: 'fade', duration: 0.3 };

            const tDur = Math.min(trans.duration || 0.3, prev.duration / 2, next.duration / 2);
            const offset = accDuration - tDur;
            const tId = presetGenerator.getTransitionXfade(trans.id);

            const lbl = `xf_${i}`;
            filterChain += `${mainVideoStream}${next.label}xfade=transition=${tId}:duration=${tDur}:offset=${offset}[${lbl}];`;

            mainVideoStream = `[${lbl}]`;
            accDuration = offset + tDur + (next.duration - tDur);
        }

        // =========================
        // 3. OVERLAYS (APENAS setpts)
        // =========================

        let finalComp = mainVideoStream;

        overlayClips.forEach((clip, i) => {
            let overlayLabel = '';

            if (clip.type === 'text') {
                const bg = `txtbg_${i}`;
                const dur = clip.duration || 5;

                filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${dur}[${bg}];`;

                let txt = wrapText(clip.properties.text || '', 30)
                    .replace(/'/g, "'\\''")
                    .replace(/:/g, '\\:');

                const color = clip.properties.textDesign?.color || 'white';
                const font = clip.properties.textDesign?.fontFamily || 'Sans';
                const size = 80;

                const lbl = `txt_${i}`;
                filterChain += `[${bg}]drawtext=text='${txt}':font=${font}:fontcolor=${color}:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2[${lbl}];`;
                overlayLabel = `[${lbl}]`;
            } else {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                const idx = inputIndexCounter++;
                const lbl = `img_${i}`;

                filterChain += `[${idx}:v]scale=iw*0.5:-2[${lbl}];`;
                overlayLabel = `[${lbl}]`;
            }

            const shifted = `ov_${i}`;
            const out = `comp_${i}`;

            filterChain += `${overlayLabel}setpts=PTS+${clip.start}/TB[${shifted}];`;
            filterChain += `${finalComp}[${shifted}]overlay=eof_action=pass[${out}];`;

            finalComp = `[${out}]`;
        });

        // =========================
        // 4. AUDIO MIX
        // =========================

        filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio];`;

        let audioInputs = ['[base_audio]'];

        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            const delay = Math.round((clip.start || 0) * 1000);
            const vol = clip.properties?.volume ?? 1;

            filterChain += `[${idx}:a]atrim=duration=${clip.duration},volume=${vol},adelay=${delay}|${delay}[${lbl}];`;
            audioInputs.push(`[${lbl}]`);
        });

        filterChain += `${audioInputs.join('')}amix=inputs=${audioInputs.length}:normalize=0[final_audio];`;

        return {
            inputs,
            filterComplex: filterChain.replace(/;$/, ''),
            outputMapVideo: finalComp,
            outputMapAudio: '[final_audio]'
        };
    }
};
