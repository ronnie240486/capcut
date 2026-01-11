
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
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`); // Transparent bg for text
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
            
            // 1. Standardize (Scale/Pad)
            addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // 2. Trim & Reset PTS
            // Crucial: setpts=PTS-STARTPTS makes every clip start at timestamp 0 for filter math
            if (clip.type === 'image') {
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            }

            // 3. Static Adjustments (Transform/Color)
            if (clip.properties) {
                const p = clip.properties;
                let adjFilters = [];
                
                // Flip
                if (p.mirror) adjFilters.push('hflip');
                
                // Opacity handled later if needed, mostly for overlays
                
                // Color Adjustments
                if (p.adjustments) {
                    const adj = p.adjustments;
                    if (adj.brightness !== 1 || adj.contrast !== 1 || adj.saturate !== 1) {
                         adjFilters.push(`eq=brightness=${adj.brightness-1}:contrast=${adj.contrast}:saturation=${adj.saturate}`);
                    }
                    if (adj.hue !== 0) adjFilters.push(`hue=h=${adj.hue}`);
                }
                
                if(adjFilters.length > 0) addV(adjFilters.join(','));
            }

            // 4. Effects (Filters like Noir, Matrix)
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }

            // 5. Movements (ZoomPan, Shake)
            // Applied AFTER standardized scale/trim so 'on' (frame number) and 'time' count from 0
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration);
                if (moveFilter) {
                     addV(moveFilter);
                     // Zoompan sometimes resets SAR or format, force standardize again
                     addV(`scale=1280:720,setsar=1`); 
                }
            }

            // 6. Text Overlay (Burn-in)
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const design = clip.properties.textDesign || {};
                const fontColor = design.color || 'white';
                const fontSize = 80; // Fixed size relative to 720p
                const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"; // Assuming linux env or default
                
                // Simple positioning
                const x = '(w-text_w)/2';
                const y = '(h-text_h)/2';
                
                // shadow
                const shadow = `shadowcolor=black:shadowx=2:shadowy=2`;
                
                addV(`drawtext=text='${txt}':fontcolor=${fontColor}:fontsize=${fontSize}:x=${x}:y=${y}:${shadow}`);
            }

            // Store the final stream label and metadata for mixing
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
             filterChain += `color=c=black:s=1280:720:d=5[black_bg];`;
        }

        // Process Audio
        // Strategy: Concat audio streams matching visual clips. Overlay separate audio tracks using amix.
        let mainAudioSegments = [];
        
        visualClips.forEach((clip, i) => {
            // Find inputs
            // We pushed inputs sequentially. visualClip[i] corresponds to input index 'i' relative to start of visual clips.
            // But audioOverlays added inputs too. We need accurate indexing.
            // However, preparedSegments loop pushed inputs exactly 1 per clip.
            // So input index = i.
            
            const hasAudio = clip.type === 'video' || clip.type === 'audio'; // Text/Image no audio stream
            const duration = parseFloat(clip.duration);
            const albl = `aud_seg_${i}`;

            if(hasAudio && clip.type === 'video') {
                 // Check if video file actually has audio? Assuming yes for safety or using anullsrc fallback logic in filterBuilder usually.
                 // Here we assume input 'i' has 'a' stream. If not, map generic silence.
                 // Safest is to use `[i:a]` if exists.
                 // We will simply try to map. If it fails, user gets silence.
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 filterChain += `[${i}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${albl}];`;
                 mainAudioSegments.push(`[${albl}]`);
            } else {
                 // Silence for images/text
                 filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${albl}];`;
                 mainAudioSegments.push(`[${albl}]`);
            }
        });
        
        let baseAudio = '[base_a]';
        if (mainAudioSegments.length > 0) {
            filterChain += `${mainAudioSegments.join('')}concat=n=${mainAudioSegments.length}:v=0:a=1[base_a];`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=1[base_a];`;
        }

        // Overlay Tracks (Music/SFX)
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
             
             filterChain += `[${idx}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${clip.properties?.volume || 1},adelay=${delay}|${delay}[${lbl}];`;
             audioOverlays.push(`[${lbl}]`);
        });

        let outputAudioMap = baseAudio;
        if(audioOverlays.length > 0) {
            const allAudios = `${baseAudio}${audioOverlays.join('')}`;
            // amix: inputs=N. duration=first (base video length usually). 
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
