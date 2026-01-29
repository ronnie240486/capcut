
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
        let filterParts = [];
        let inputIndexCounter = 0;

        const mainTrackClips = clips.filter(c => 
            c.track === 'video' || (c.track === 'camada' && c.type === 'video') 
        ).sort((a, b) => a.start - b.start);

        const overlayClips = clips.filter(c => 
            ['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image')
        );

        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))
        );

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // --- 1. BUILD MAIN VIDEO TRACK ---
        if (mainTrackClips.length === 0) {
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            const vIdx = inputIndexCounter++;
            filterParts.push(`[${vIdx}:v]format=yuv420p[main_v_0]`);
            mainTrackLabels.push({ label: '[main_v_0]', duration: 5 });

            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            const aIdx = inputIndexCounter++;
            filterParts.push(`[${aIdx}:a]anull[main_a_0]`);
            baseAudioSegments.push('[main_a_0]');
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return;

                const duration = Math.max(1.0, parseFloat(clip.duration) || 5);
                const idx = inputIndexCounter++;

                if (clip.type === 'image') {
                    inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath);
                } else {
                    inputs.push('-i', filePath);
                }

                let currentV = `[${idx}:v]`;
                const nextVLabel = () => `v_${i}_${Math.random().toString(36).substr(2, 4)}`;
                
                // Pre-process
                let label = nextVLabel();
                filterParts.push(`${currentV}scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[${label}]`);
                currentV = `[${label}]`;

                // Trim
                label = nextVLabel();
                const start = clip.mediaStartOffset || 0;
                filterParts.push(`${currentV}trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS[${label}]`);
                currentV = `[${label}]`;

                // Effects & Movement
                let chain = [];
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) chain.push(fx);
                }
                
                if (clip.properties?.movement) {
                    const move = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                    if (move) chain.push(move);
                } else if (clip.type === 'image') {
                    chain.push('zoompan=z=1:d=1:s=1280x720:fps=30');
                }

                if (chain.length > 0) {
                    label = nextVLabel();
                    filterParts.push(`${currentV}${chain.join(',')},scale=1280:720,setsar=1[${label}]`);
                    currentV = `[${label}]`;
                }

                mainTrackLabels.push({ label: currentV, duration, transition: clip.transition });

                // Audio
                const mediaInfo = mediaLibrary[clip.fileName];
                const aLabel = `a_base_${i}`;
                if (clip.type === 'video' && mediaInfo?.hasAudio) {
                    filterParts.push(`[${idx}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS[${aLabel}]`);
                } else {
                    filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${aLabel}]`);
                }
                baseAudioSegments.push(`[${aLabel}]`);
            });
        }

        // --- 2. COMPOSE MAIN SEQUENCE (XFADE) ---
        let mainVideoStream = '';
        if (mainTrackLabels.length === 1) {
            mainVideoStream = mainTrackLabels[0].label;
        } else {
            let currentMix = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;

            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1];
                const trans = prevClip.transition || { id: 'fade', duration: 0.1 };
                const hasExplicitTrans = !!prevClip.transition;
                const transDur = hasExplicitTrans ? Math.min(trans.duration, prevClip.duration/2, nextClip.duration/2) : 0.01;
                const transId = hasExplicitTrans ? presetGenerator.getTransitionXfade(trans.id) : 'fade';
                const offset = accumulatedDuration - transDur;
                const nextLabel = `main_mix_${i}`;
                
                filterParts.push(`${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}]`);
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + nextClip.duration;
            }
            mainVideoStream = currentMix;
        }

        // --- 3. APPLY OVERLAYS ---
        let finalVideo = mainVideoStream;
        overlayClips.forEach((clip, i) => {
            let overlayLabel = '';
            if (clip.type === 'text') {
                const bgLabel = `tbg_${i}`;
                filterParts.push(`color=c=black@0.0:s=1280x720:r=30:d=${clip.duration}[${bgLabel}]`);
                const txt = wrapText(clip.properties.text || '', 30).replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color === 'transparent' ? 'white@0.0' : (clip.properties.textDesign?.color || 'white');
                const x = clip.properties.transform?.x ? `(w-text_w)/2+${clip.properties.transform.x}` : '(w-text_w)/2';
                const y = clip.properties.transform?.y ? `(h-text_h)/2+${clip.properties.transform.y}` : '(h-text_h)/2';
                let styles = '';
                if (clip.properties.textDesign?.stroke?.width > 0) {
                    styles += `:borderw=${clip.properties.textDesign.stroke.width}:bordercolor=${clip.properties.textDesign.stroke.color || 'black'}`;
                }
                overlayLabel = `txt_${i}`;
                filterParts.push(`[${bgLabel}]drawtext=text='${txt}':fontcolor=${color}:fontsize=80:x=${x}:y=${y}${styles}[${overlayLabel}]`);
            } else {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;
                const idx = inputIndexCounter++;
                inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                overlayLabel = `ovimg_${i}`;
                const scale = clip.properties.transform?.scale || 0.5;
                const w = Math.floor(1280 * scale / 2) * 2;
                filterParts.push(`[${idx}:v]scale=${w}:-1[${overlayLabel}]`);
            }

            const nextComp = `comp_${i}`;
            const shifted = `sh_${i}`;
            filterParts.push(`${overlayLabel}setpts=PTS+${clip.start}/TB[${shifted}]`);
            filterParts.push(`${finalVideo}[${shifted}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass[${nextComp}]`);
            finalVideo = `[${nextComp}]`;
        });

        // --- 4. AUDIO MIX ---
        let baseAudio = '[a_seq]';
        filterParts.push(`${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[a_seq]`);
        
        let mixList = [baseAudio];
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            const idx = inputIndexCounter++;
            inputs.push('-i', filePath);
            const lbl = `aud_ov_${i}`;
            const delay = Math.round(clip.start * 1000);
            const vol = clip.properties.volume ?? 1;
            filterParts.push(`[${idx}:a]atrim=duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${vol},adelay=${delay}|${delay}[${lbl}]`);
            mixList.push(`[${lbl}]`);
        });

        let finalAudio = mixList.length > 1 ? '[a_final]' : baseAudio;
        if (mixList.length > 1) {
            filterParts.push(`${mixList.join('')}amix=inputs=${mixList.length}:duration=first:dropout_transition=0:normalize=0[a_final]`);
        }

        return {
            inputs,
            filterComplex: filterParts.join(';'),
            outputMapVideo: finalVideo,
            outputMapAudio: finalAudio
        };
    }
};
