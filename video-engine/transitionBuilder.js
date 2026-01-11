
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // Sort visual clips by start time
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        const audioOverlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) || 
            c.type === 'audio'
        );

        // Process Visual Clips
        let preparedSegments = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath && clip.type !== 'text') return;

            const duration = parseFloat(clip.duration) || 5;

            // Input Logic
            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); // +2s buffer for transition
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black:s=1280x720:r=30`);
            }
            
            const idx = inputIndexCounter++;
            let vStream = `[${idx}:v]`;

            // Helper to append filter
            const addV = (f) => {
                if (!f) return;
                const lbl = `v${i}_${Math.random().toString(36).substr(2,4)}`;
                filterChain += `${vStream}${f}[${lbl}];`;
                vStream = `[${lbl}]`;
            };
            
            // 1. Standardize
            addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // 2. Trim
            // Note: For xfade, we need overlaps. We DON'T setpts=PTS-STARTPTS here if we want to offset later, 
            // but typical xfade usage prepares clean 0-start clips and uses offset parameter.
            if (clip.type === 'image') {
                // Images generated with loop already, just ensure duration
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            }

            // 3. Effects
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }

            // 4. Movement
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration);
                if (moveFilter) addV(moveFilter);
            }

            // 5. Text Overlay
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '');
                const fontColor = clip.properties.textDesign?.color || 'white';
                addV(`drawtext=text='${txt}':fontcolor=${fontColor}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            // Store the final stream label and metadata for mixing
            preparedSegments.push({
                label: vStream,
                duration: duration,
                transition: clip.transition
            });
        });

        // Mix Video Segments with XFade
        let finalV = '[black_bg]'; // Fallback
        
        if (preparedSegments.length > 0) {
             // Create a black background to start (optional, but good for safety)
             // Or simpler: Start with first clip
             let currentStream = preparedSegments[0].label;
             let accumulatedOffset = preparedSegments[0].duration;

             for (let i = 1; i < preparedSegments.length; i++) {
                 const nextSeg = preparedSegments[i];
                 const prevSeg = preparedSegments[i-1];
                 
                 // Determine transition
                 const trans = prevSeg.transition || { id: 'fade', duration: 0.5 }; // Default simple cut/fade if logic requires
                 const transId = presetGenerator.getTransitionXfade(trans.id);
                 const transDur = trans.duration || 0.5;
                 
                 // Calculate offset: Where the NEXT clip starts relative to TOTAL time.
                 // Xfade offset is the timestamp in the first input where the transition begins.
                 // accumulatedOffset represents the end of the current chain.
                 // We want transition to start at (End of Prev - Transition Duration).
                 const offset = accumulatedOffset - transDur;
                 
                 const outLabel = `mix_${i}`;
                 filterChain += `${currentStream}${nextSeg.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${outLabel}];`;
                 
                 currentStream = `[${outLabel}]`;
                 // Update total duration: (Previous End) + (Next Duration) - (Overlap)
                 accumulatedOffset = offset + transDur + (nextSeg.duration - transDur);
             }
             
             finalV = currentStream;
        } else {
             // No video clips, create black
             filterChain += `color=c=black:s=1280x720:d=5[black_bg];`;
        }

        // Process Audio (Standard Concatenation/Mixing for now, xfade audio is 'acrossfade' which is complex to sync with video xfade loop above)
        // For this MVP, we will mix all audio streams simply.
        let audioStreamLabels = [];
        // Re-iterate clips to find audio
        visualClips.forEach((clip, i) => {
            // Re-find index (it matches inputIndex order for visual clips if we assume audio comes from same file input)
            // But we pushed inputs sequentially. The index `i` in visualClips aligns with `i` in preparedSegments.
            // We need the input index. visualClips are 0..N. Inputs are 0..N.
            // Assuming 1:1 mapping of visual clip to input.
            const hasAudio = clip.type === 'video'; 
            if(hasAudio) {
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 const duration = parseFloat(clip.duration);
                 const albl = `aud_${i}`;
                 // Note: Input index is `i` because we pushed exactly one input per visual clip
                 filterChain += `[${i}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${albl}];`;
                 audioStreamLabels.push(`[${albl}]`);
            } else {
                 const albl = `aud_silent_${i}`;
                 const duration = parseFloat(clip.duration);
                 filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${albl}];`;
                 audioStreamLabels.push(`[${albl}]`);
            }
        });

        let finalA = '[base_a]';
        if (audioStreamLabels.length > 0) {
            // Concat audio (hard cuts, syncs better than mixing for timeline logic usually)
            // acrossfade is better but requires overlapping logic similar to video
            filterChain += `${audioStreamLabels.join('')}concat=n=${audioStreamLabels.length}:v=0:a=1[base_a];`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=1[base_a];`;
        }

        // Mix Overlay Audio
        let audioOverlays = [];
        audioOverlayClips.forEach((clip, i) => {
             const filePath = fileMap[clip.fileName];
             if(!filePath) return;
             inputs.push('-i', filePath); // Add new input
             const idx = inputIndexCounter++; 
             
             const start = parseFloat(clip.start);
             const duration = parseFloat(clip.duration);
             const lbl = `overlay_aud_${i}`;
             const delay = Math.round(start * 1000);
             
             filterChain += `[${idx}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${clip.properties?.volume || 1},adelay=${delay}|${delay},aformat=sample_rates=44100:channel_layouts=stereo[${lbl}];`;
             audioOverlays.push(`[${lbl}]`);
        });

        let outputAudioMap = finalA;
        if(audioOverlays.length > 0) {
            const allAudios = `${finalA}${audioOverlays.join('')}`;
            filterChain += `${allAudios}amix=inputs=${audioOverlays.length + 1}:duration=first:dropout_transition=0,volume=2[final_a_mix]`;
            outputAudioMap = '[final_a_mix]';
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalV,
            outputMapAudio: outputAudioMap
        };
    }
};
