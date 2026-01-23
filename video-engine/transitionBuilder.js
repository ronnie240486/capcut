
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
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); // Buffer for transitions
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                // Transparent input for text
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black@0.0:s=1920x1080:r=30`);
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
            
            // 1. Standardize (1080p Processing for Stability)
            // Use safe scaling with padding to prevent odd-dimension errors
            // setsar=1 ensures square pixels
            addV(`scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. Trim & Reset PTS
            if (clip.type === 'image') {
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            }

            // 3. Effects (Colors, Filters)
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }

            // 4. Movement (Zoom/Pan/Rotate)
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(
                    clip.properties.movement.type, 
                    duration, 
                    clip.type === 'image',
                    clip.properties.movement.config // Pass config here
                );
                if (moveFilter) {
                    addV(moveFilter);
                    // After zoompan, enforce 1080p again to handle any zoompan scaling side effects
                    addV(`scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1`);
                }
            }

            // 5. Text Overlay (Burn-in)
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:'); // Escape colons
                const design = clip.properties.textDesign || {};
                const fontColor = design.color || 'white';
                // Basic drawtext fallback for backend
                addV(`drawtext=text='${txt}':fontcolor=${fontColor}:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }
            
            // 6. Final Format Check (Crucial for xfade)
            // Strict enforcement before mixing
            addV(`scale=1920:1080,setsar=1,format=yuv420p`);

            // Store for mixing
            preparedSegments.push({
                label: vStream,
                duration: duration,
                transition: clip.transition
            });
        });

        // Mix Video Segments with XFade
        let finalV = '[black_bg]';
        
        if (preparedSegments.length > 0) {
             let currentStream = preparedSegments[0].label;
             let accumulatedOffset = preparedSegments[0].duration;

             for (let i = 1; i < preparedSegments.length; i++) {
                 const nextSeg = preparedSegments[i];
                 const prevSeg = preparedSegments[i-1];
                 
                 // Determine transition
                 const trans = prevSeg.transition || { id: 'fade', duration: 0.5 };
                 const transId = presetGenerator.getTransitionXfade(trans.id);
                 const transDur = Math.min(trans.duration || 0.5, prevSeg.duration / 2, nextSeg.duration / 2); // Safety clamp
                 
                 const offset = accumulatedOffset - transDur;
                 
                 const outLabel = `mix_${i}`;
                 filterChain += `${currentStream}${nextSeg.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${outLabel}];`;
                 
                 currentStream = `[${outLabel}]`;
                 accumulatedOffset = offset + transDur + (nextSeg.duration - transDur);
             }
             
             finalV = currentStream;
        } else {
             // Fallback if no visual clips
             inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=5');
             inputIndexCounter++; // Consume input index
             finalV = `[${inputIndexCounter-1}:v]`;
        }

        // Process Audio
        let audioStreamLabels = [];
        visualClips.forEach((clip, i) => {
            const hasAudio = clip.type === 'video'; 
            if(hasAudio) {
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 const duration = parseFloat(clip.duration);
                 const albl = `aud_${i}`;
                 // We must try/catch audio mapping issues in complex graph. 
                 // Assuming index i maps to input i.
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
            filterChain += `${audioStreamLabels.join('')}concat=n=${audioStreamLabels.length}:v=0:a=1[base_a];`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=1[base_a];`;
        }

        // Mix Overlay Audio (Music/SFX)
        let audioOverlays = [];
        audioOverlayClips.forEach((clip, i) => {
             const filePath = fileMap[clip.fileName];
             if(!filePath) return;
             inputs.push('-i', filePath); 
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
