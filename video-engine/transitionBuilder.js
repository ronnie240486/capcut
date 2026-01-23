const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let streamLabels = [];
        
        let inputIndexCounter = 0;

        // Visual clips only
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        if (visualClips.length === 0) {
            return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath && clip.type !== 'text') return;

            const duration = Math.max(0.1, parseFloat(clip.duration) || 5);

            // --- INPUT LOGIC ---
            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); 
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`);
            }

            const currentInputIndex = inputIndexCounter++;
            let currentStream = `[${currentInputIndex}:v]`;
            
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `tmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentStream}${filterText}[${nextLabel}];`;
                currentStream = `[${nextLabel}]`;
            };

            // 1. INPUT NORMALIZATION (STRICT)
            // Ensure 720p 30fps YUV420p SAR 1 before any processing
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. TRIM / TIMING
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. COLOR EFFECTS
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. MOVEMENT (ZOOM/PAN)
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(
                    clip.properties.movement.type, 
                    duration, 
                    clip.type === 'image',
                    clip.properties.movement.config || {}
                );
                
                if (moveFilter) {
                    addFilter(moveFilter);
                }
            } else if (clip.type === 'image') {
                addFilter(presetGenerator.getMovementFilter(null, duration, true));
            }

            // 5. POST-MOVEMENT NORMALIZATION (CRITICAL)
            // Re-scale to ensure fixed 720p output pad for xfade compatibility
            addFilter(`scale=1280:720,setsar=1,fps=30,format=yuv420p`);

            // 6. TEXT OVERLAY
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            streamLabels.push({
                label: currentStream,
                duration: duration,
                transition: clip.transition
            });
        });

        // --- VIDEO MIXING (XFADE) ---
        let finalV = '';
        
        if (streamLabels.length > 0) {
            let currentMix = streamLabels[0].label;
            let accumulatedDuration = streamLabels[0].duration;

            for (let i = 1; i < streamLabels.length; i++) {
                const nextClip = streamLabels[i];
                const prevClip = streamLabels[i-1];
                
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 };
                const transId = presetGenerator.getTransitionXfade(trans.id);
                const transDur = Math.max(0.1, Math.min(trans.duration || 0.5, prevClip.duration / 2, nextClip.duration / 2));
                
                const offset = Math.max(0, accumulatedDuration - transDur);
                const nextLabel = `v_mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalV = currentMix;
        }

        // --- AUDIO MIXING (CONCAT) ---
        let audioParts = [];
        visualClips.forEach((clip, i) => {
            const hasAudio = clip.type === 'video';
            const lbl = `a_chunk_${i}`;
            const duration = Math.max(0.1, parseFloat(clip.duration) || 5);
            
            if (hasAudio) {
                const start = clip.mediaStartOffset || 0;
                filterChain += `[${i}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[${lbl}];`;
            } else {
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${lbl}];`;
            }
            audioParts.push(`[${lbl}]`);
        });

        if (audioParts.length > 0) {
            filterChain += `${audioParts.join('')}concat=n=${audioParts.length}:v=0:a=1[outa]`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=1[outa]`;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalV,
            outputMapAudio: '[outa]'
        };
    }
};
