const presetGenerator = require('./presetGenerator');

/* ===================== HELPERS ===================== */

function wrapText(text, maxChars) {
    if (!text) return '';
    const words = text.split(' ');
    let lines = [];
    let line = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        if ((line + ' ' + words[i]).length <= maxChars) {
            line += ' ' + words[i];
        } else {
            lines.push(line);
            line = words[i];
        }
    }
    if (line) lines.push(line);
    return lines.join('\n');
}

/* ===================== BUILDER ===================== */

module.exports = {
    buildTimeline(clips = [], fileMap = {}, mediaLibrary = {}) {

        if (!Array.isArray(clips)) clips = [];

        let inputs = [];
        let filter = '';
        let idx = 0;

        /* ---------- SEPARAÇÃO ---------- */

        const videos = clips
            .filter(c => c && c.track === 'video')
            .sort((a, b) => (a.start || 0) - (b.start || 0));

        const texts = clips.filter(c => c && c.track === 'text');

        const audios = clips.filter(c =>
            c && ['music', 'audio', 'sfx', 'narration'].includes(c.track)
        );

        let videoParts = [];
        let audioParts = [];

        let timelineDuration = 0;

        /* ---------- BASE DE VÍDEO ---------- */

        if (videos.length === 0) {
            inputs.push('-f','lavfi','-t','5','-i','color=c=black:s=1280x720:r=30');
            inputs.push('-f','lavfi','-t','5','-i','anullsrc=r=44100:cl=stereo');

            videoParts.push(`[${idx}:v]`);
            audioParts.push(`[${idx + 1}:a]`);

            timelineDuration = 5;
            idx += 2;
        } else {
            videos.forEach((clip, i) => {
                const file = fileMap[clip.fileName];
                if (!file) return;

                const dur = Number(clip.duration || 5);
                timelineDuration += dur;

                inputs.push('-i', file);

                const v = `v_${i}`;
                const a = `a_${i}`;

                filter += `
                    [${idx}:v]
                    scale=1280:720:force_original_aspect_ratio=decrease,
                    pad=1280:720:(ow-iw)/2:(oh-ih)/2,
                    fps=30,setsar=1,
                    trim=0:${dur},setpts=PTS-STARTPTS
                    [${v}];
                `;

                if (mediaLibrary[clip.fileName]?.hasAudio) {
                    filter += `
                        [${idx}:a]
                        atrim=0:${dur},
                        asetpts=PTS-STARTPTS
                        [${a}];
                    `;
                } else {
                    filter += `
                        anullsrc=r=44100:cl=stereo:d=${dur}
                        [${a}];
                    `;
                }

                videoParts.push(`[${v}]`);
                audioParts.push(`[${a}]`);
                idx++;
            });
        }

        /* ---------- CONCAT BASE ---------- */

        filter += `
            ${videoParts.join('')}
            concat=n=${videoParts.length}:v=1:a=0
            [video_base];

            ${audioParts.join('')}
            concat=n=${audioParts.length}:v=0:a=1
            [audio_base];
        `;

        let currentVideo = '[video_base]';

        /* ---------- TEXTOS ---------- */

        texts.forEach((clip, i) => {
            const dur = Number(clip.duration || 5);
            const start = Number(clip.start || 0);

            const txt = wrapText(clip.properties?.text || '', 30)
                .replace(/'/g, "\\'")
                .replace(/:/g, '\\:');

            filter += `
                color=c=black@0.0:s=1280x720:d=${dur}
                [txtbg_${i}];

                [txtbg_${i}]
                drawtext=text='${txt}':
                fontsize=64:fontcolor=white:
                x=(w-text_w)/2:y=(h-text_h)/2
                [txt_${i}];

                ${currentVideo}[txt_${i}]
                overlay=enable='between(t,${start},${start + dur})'
                [vout_${i}];
            `;
            currentVideo = `[vout_${i}]`;
        });

        /* ---------- ÁUDIOS OVERLAY ---------- */

        let mixInputs = ['[audio_base]'];

        audios.forEach((clip, i) => {
            const file = fileMap[clip.fileName];
            if (!file) return;

            const dur = Number(clip.duration || 5);
            const delay = Math.max(0, Math.round((clip.start || 0) * 1000));
            const vol = clip.properties?.volume ?? 1;

            inputs.push('-i', file);

            filter += `
                [${idx}:a]
                atrim=0:${dur},
                asetpts=PTS-STARTPTS,
                volume=${vol},
                adelay=${delay}|${delay}
                [aud_${i}];
            `;

            mixInputs.push(`[aud_${i}]`);
            idx++;
        });

        /* ---------- MIX FINAL + FALLBACK ---------- */

        filter += `
            ${mixInputs.join('')}
            amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0
            [final_audio_raw];

            [final_audio_raw]
            atrim=0:${timelineDuration}
            [final_audio_out];

            anullsrc=r=44100:cl=stereo:d=0.1
            [a_fallback];

            [final_audio_out][a_fallback]
            amix=inputs=2:duration=first
            [audio_safe];
        `;

        /* ---------- RETURN ---------- */

        return {
            inputs,
            filterComplex: filter.replace(/\s+/g, ' ').trim(),
            outputMapVideo: currentVideo,
            outputMapAudio: '[audio_safe]'
        };
    }
};
