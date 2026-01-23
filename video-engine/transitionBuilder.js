const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;
        const fileToIndexMap = {};

        // 1. Collect all unique files and assign input indices
        clips.forEach(clip => {
            if (clip.fileName && !fileToIndexMap.hasOwnProperty(clip.fileName)) {
                const filePath = fileMap[clip.fileName];
                if (filePath) {
                    inputs.push('-i', filePath);
                    fileToIndexMap[clip.fileName] = inputIndexCounter++;
                }
            }
        });

        // 2. Process Visual Clips
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        let videoStreamLabels = [];
        visualClips.forEach((clip, i) => {
            const inputIdx = fileToIndexMap[clip.fileName];
            const duration = Math.max(0.1, parseFloat(clip.duration) || 5);
            let currentStream = '';

            if (clip.type === 'text') {
                // Background for text only clips
                const label = `txt_bg_${i}`;
                filterChain += `color=c=black@0.0:s=1280x720:r=30:d=${duration}[${label}];`;
                currentStream = `[${label}]`;
            } else if (inputIdx !== undefined) {
                currentStream = `[${inputIdx}:v]`;
            } else {
                return;
            }

            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentStream}${filterText}[${nextLabel}];`;
                currentStream = `[${nextLabel}]`;
            };

            // Input Normalization
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // Trim
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // FX
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }

            // Movement
            if (clip.properties?.movement) {
                const moveFilter = presetGenerator.getMovementFilter(
                    clip.properties.movement.type, 
                    duration, 
                    clip.type === 'image',
                    clip.properties.movement.config || {}
                );
                if (moveFilter) addFilter(moveFilter);
            } else if (clip.type === 'image') {
                addFilter(presetGenerator.getMovementFilter(null, duration, true));
            }

            // Text
            if (clip.properties?.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            const finalLabel = `v_fin_${i}`;
            filterChain += `${currentStream}scale=1280:720,setsar=1[${finalLabel}];`;
            videoStreamLabels.push({ label: `[${finalLabel}]`, duration });
        });

        // Concat Video
        let outputMapVideo = '[outv]';
        if (videoStreamLabels.length > 0) {
            filterChain += videoStreamLabels.map(l => l.label).join('') + `concat=n=${videoStreamLabels.length}:v=1:a=0[outv];`;
        } else {
            filterChain += `color=c=black:s=1280x720:r=30:d=1[outv];`;
        }

        // 3. Process Audio Clips (including audio from videos)
        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'video' && (mediaLibrary[c.fileName]?.hasAudio !== false))
        );

        let audioStreamLabels = [];
        audioClips.forEach((clip, i) => {
            const inputIdx = fileToIndexMap[clip.fileName];
            if (inputIdx === undefined) return;

            const duration = Math.max(0.1, parseFloat(clip.duration) || 5);
            const start = clip.start || 0;
            const mediaOffset = clip.mediaStartOffset || 0;
            const volume = clip.properties?.volume ?? 1;
            
            const label = `a_raw_${i}`;
            const delayedLabel = `a_del_${i}`;
            
            // Extract, Trim, Resample, Volume
            filterChain += `[${inputIdx}:a]atrim=start=${mediaOffset}:duration=${duration},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume}[${label}];`;
            // Delay for timeline position
            filterChain += `[${label}]adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[${delayedLabel}];`;
            
            audioStreamLabels.push(`[${delayedLabel}]`);
        });

        let outputMapAudio = '[outa]';
        if (audioStreamLabels.length > 0) {
            filterChain += `${audioStreamLabels.join('')}amix=inputs=${audioStreamLabels.length}:dropout_transition=0:normalize=0[outa]`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=1[outa]`;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: '[outv]',
            outputMapAudio: '[outa]'
        };
    }
};
