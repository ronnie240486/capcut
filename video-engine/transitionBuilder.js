
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let streamLabels = [];
        
        let inputIndexCounter = 0;

        // Sort clips
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            // Special handling for text (no file)
            if (!filePath && clip.type !== 'text') return;

            const duration = parseFloat(clip.duration) || 5;

            // --- INPUT ---
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

            // 1. INITIAL NORMALIZATION (Safety)
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. TRIM (Cut)
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. COLOR EFFECTS
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. MOVEMENT (Zoom/Pan)
            let moveFilter = null;
            if (clip.properties && clip.properties.movement) {
                moveFilter = presetGenerator.getMovementFilter(
                    clip.properties.movement.type, 
                    duration, 
                    clip.type === 'image',
                    clip.properties.movement.config
                );
            } else if (clip.type === 'image') {
                // Static zoom for images to ensure they are video streams
                moveFilter = presetGenerator.getMovementFilter(null, duration, true);
            }

            if (moveFilter) {
                addFilter(moveFilter);
                // **CRITICAL**: Re-apply final scale after zoompan because zoompan can mess up SAR/dimensions
                addFilter(presetGenerator.getFinalVideoFilter());
            }

            // 5. TEXT OVERLAY
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                // Basic drawtext as placeholder
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            // 6. FINAL SAFEGUARD FILTER (Before Mixing)
            // Ensures strict 1280x720, SAR 1, yuv420p for xfade compatibility
            addFilter(presetGenerator.getFinalVideoFilter());

            streamLabels.push({
                label: currentStream,
                duration: duration,
                transition: clip.transition
            });
        });

        // --- VIDEO MIXING (XFADE) ---
        let finalV = '[black_bg]'; // fallback
        
        if (streamLabels.length > 0) {
            let currentMix = streamLabels[0].label;
            let accumulatedDuration = streamLabels[0].duration;

            for (let i = 1; i < streamLabels.length; i++) {
                const nextClip = streamLabels[i];
                const prevClip = streamLabels[i-1];
                
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 };
                const transId = presetGenerator.getTransitionXfade(trans.id);
                // Safety clamp: transition cannot be longer than half of either clip
                const transDur = Math.min(trans.duration || 0.5, prevClip.duration / 2, nextClip.duration / 2);
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalV = currentMix;
        } else {
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalV = `[${inputIndexCounter}:v]`;
        }

        // --- AUDIO MIXING (Simple Concat) ---
        // Safer strategy for MVP than complex amix which can cause memory issues
        let audioParts = [];
        let audioFilter = '';
        
        visualClips.forEach((clip, i) => {
            const hasAudio = clip.type === 'video';
            const lbl = `a_chunk_${i}`;
            
            if (hasAudio) {
                const start = clip.mediaStartOffset || 0;
                audioFilter += `[${i}:a]atrim=start=${start}:duration=${start + clip.duration},asetpts=PTS-STARTPTS[${lbl}];`;
            } else {
                // Generate silence for image/text clips to keep A/V sync
                audioFilter += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${clip.duration}[${lbl}];`;
            }
            audioParts.push(`[${lbl}]`);
        });

        let finalA = '[outa]';
        if (audioParts.length > 0) {
            audioFilter += `${audioParts.join('')}concat=n=${audioParts.length}:v=0:a=1[outa]`;
            filterChain += audioFilter;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=5[outa]`;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalV,
            outputMapAudio: finalA
        };
    }
};
