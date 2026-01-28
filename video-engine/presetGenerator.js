const presetGenerator = require('./presetGenerator.js');

// Helper to wrap text
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
            .filter(c => c.track === 'video')
            .sort((a, b) => a.start - b.start);

        const overlayClips = clips.filter(c =>
            ['text', 'subtitle'].includes(c.track)
        );

        const audioClips = clips.filter(c =>
            ['audio', 'music', 'sfx', 'narration'].includes(c.track)
        );

        let mainTrackLabels = [];
        let baseAudioSegments = [];

        // ---------- MAIN VIDEO ----------
        if (mainTrackClips.length === 0) {
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=r=44100:cl=stereo');

            mainTrackLabels.push({
                label: `[${inputIndexCounter}:v]`,
                duration: 5
            });

            baseAudioSegments.push(`[${inputIndexCounter + 1}:a]`);
            inputIndexCounter += 2;
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                const duration = Number(clip.duration || 5);

                inputs.push('-i', filePath);
                const idx = inputIndexCounter++;

                let vLabel = `[${idx}:v]`;
                const tmp = `v_${i}`;

                filterChain += `
                    ${vLabel}scale=1280:720:force_original_aspect_ratio=decrease,
                    pad=1280:720:(ow-iw)/2:(oh-ih)/2,
                    fps=30,setsar=1,
                    trim=duration=${duration},
                    setpts=PTS-STARTPTS
                    [${tmp}];
                `;

                mainTrackLabels.push({
                    label: `[${tmp}]`,
                    duration
                });

                if (mediaLibrary[clip.fileName]?.hasAudio) {
                    filterChain += `
                        [${idx}:a]atrim=duration=${duration},
                        asetpts=PTS-STARTPTS[a_${i}];
                    `;
                    baseAudioSegments.push(`[a_${i}]`);
                } else {
                    filterChain += `
                        anullsrc=r=44100:cl=stereo:d=${duration}[a_${i}];
                    `;
                    baseAudioSegments.push(`[a_${i}]`);
                }
            });
        }

        // ---------- XFADE ----------
        let currentVideo = mainTrackLabels[0].label;
        let timelineDur = mainTrackLabels[0].duration;

        for (let i = 1; i < mainTrackLabels.length; i++) {
            const next = mainTrackLabels[i];
            const out = `xf_${i}`;

            filterChain += `
                ${currentVideo}${next.label}
                xfade=transition=fade:duration=0.3:offset=${timelineDur - 0.3}
                [${out}];
            `;

            timelineDur += next.duration - 0.3;
            currentVideo = `[${out}]`;
        }

        // ---------- OVERLAYS ----------
        overlayClips.forEach((clip, i) => {
            const dur = clip.duration || 5;
            const txt = wrapText(clip.properties?.text || '', 30)
                .replace(/'/g, "\\'")
                .replace(/:/g, '\\:');

            const lbl = `txt_${i}`;

            filterChain += `
                color=c=black@0.0:s=1280x720:d=${dur}[bg_${i}];
                [bg_${i}]drawtext=text='${txt}':fontsize=64:
                fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2
                [${lbl}];
                ${currentVideo}[${lbl}]
                overlay=enable='between(t,${clip.start},${clip.start + dur})'
                [ov_${i}];
            `;

            currentVideo = `[ov_${i}]`;
        });

        // ---------- AUDIO BASE ----------
        filterChain += `
            ${baseAudioSegments.join('')}
            concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio];
        `;

        let audioInputs = ['[base_audio]'];

        // ---------- AUDIO OVERLAYS ----------
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;

            const delay = Math.round((clip.start || 0) * 1000);

            filterChain += `
                [${idx}:a]atrim=duration=${clip.duration},
                volume=${clip.properties?.volume ?? 1},
                adelay=${delay}|${delay}
                [aud_${i}];
            `;

            audioInputs.push(`[aud_${i}]`);
        });

        filterChain += `
            ${audioInputs.join('')}
            amix=inputs=${audioInputs.length}:normalize=0
            [final_audio_out];
        `;

        return {
            inputs,
            filterComplex: filterChain.replace(/\s+/g, ' ').trim(),
            outputMapVideo: currentVideo,
            outputMapAudio: '[final_audio_out]'
        };
    }
};
