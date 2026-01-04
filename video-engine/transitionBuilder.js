
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let videoStreamLabels = [];
        let audioStreamLabels = [];
        
        let inputIndexCounter = 0;

        // Separate Main Track (Video/Audio base) and Overlay Tracks (Text/Subtitles/Camada)
        // We consider track 'video' as the base layer.
        // Other tracks (camada, text, subtitle) are overlays.
        // Audio/Music/Narration/SFX are treated as audio mix.

        const mainClips = clips.filter(c => c.track === 'video');
        const overlayClips = clips.filter(c => ['camada', 'text', 'subtitle'].includes(c.track) || (c.track === 'video' && false)); // just explicitly video track for main
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track) || (c.track === 'video' && c.type === 'audio')); // video track items are visual, handled in mainClips/overlayClips

        // --- 1. BUILD MAIN VIDEO TRACK (CONCAT) ---
        // This creates the [base] video stream.
        
        if (mainClips.length === 0) {
            // If no video, create a black background of total duration or 5s default
            // But we need total duration. Let's assume max end time of any clip.
            const maxEnd = Math.max(...clips.map(c => c.start + c.duration), 5);
            filterChain += `color=c=black:s=1280x720:d=${maxEnd}[base];`;
        } else {
            // Process Main Clips for Concat
            mainClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                inputs.push('-i', filePath);
                const currentInputIndex = inputIndexCounter++;
                let currentStream = `[${currentInputIndex}:v]`;

                const nextLabel = `v${i}`;
                const safeDuration = parseFloat(clip.duration) || 5;

                // Prepare (Scale + Pad + SAR + FPS)
                let filters = [`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`];
                
                // Image Loop vs Video Trim
                if (clip.type === 'image') {
                    // For main track images, we loop them to duration
                    // We need to use -loop 1 input option or loop filter. 
                    // loop filter is easier here but less efficient for long durations if not careful.
                    // Actually, trim is applied after.
                    filters.unshift('loop=loop=-1:size=1:start=0'); 
                    filters.push(`trim=duration=${safeDuration}`);
                } else {
                    const start = parseFloat(clip.mediaStartOffset) || 0;
                    filters.push(`trim=start=${start}:duration=${start + safeDuration}`);
                }
                filters.push('setpts=PTS-STARTPTS');

                // Color Effects
                 if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) filters.push(fx);
                }
                if (clip.properties && clip.properties.adjustments) {
                    const adj = clip.properties.adjustments;
                    let eqParts = [];
                    if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                    if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                    if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                    if (eqParts.length > 0) filters.push(`eq=${eqParts.join(':')}`);
                    if (adj.hue !== 0) filters.push(`hue=h=${adj.hue}`);
                }

                // Movement
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, clip.type === 'image');
                    if (moveFilter) filters.push(moveFilter);
                }

                // Finalize Segment
                filters.push('setsar=1'); // Safety
                
                filterChain += `${currentStream}${filters.join(',')}[${nextLabel}];`;
                videoStreamLabels.push(`[${nextLabel}]`);

                // Audio for main clips (if video)
                if (clip.type === 'video') { // Assuming video track clips might have audio
                     const mediaInfo = mediaLibrary && mediaLibrary[clip.fileName];
                     const hasAudio = mediaInfo ? mediaInfo.hasAudio !== false : true;
                     const aLabel = `a${i}`;
                     if (hasAudio) {
                         const start = parseFloat(clip.mediaStartOffset) || 0;
                         filterChain += `[${currentInputIndex}:a]atrim=start=${start}:duration=${start + safeDuration},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[${aLabel}];`;
                     } else {
                         filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${safeDuration}[${aLabel}];`;
                     }
                     audioStreamLabels.push(`[${aLabel}]`);
                } else if (clip.type === 'image') {
                     const aLabel = `a${i}`;
                     filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${safeDuration}[${aLabel}];`;
                     audioStreamLabels.push(`[${aLabel}]`);
                }
            });
            
            // Concat Main Track
            if (videoStreamLabels.length > 0) {
                 filterChain += `${videoStreamLabels.join('')}${audioStreamLabels.join('')}concat=n=${videoStreamLabels.length}:v=1:a=1:unsafe=1[base_v][base_a];`;
            } else {
                 // Fallback if no main clips? Should not happen based on check above
                 filterChain += `color=c=black:s=1280x720:d=5[base_v];anullsrc=d=5[base_a];`;
            }
        }

        // --- 2. PROCESS OVERLAYS (TEXT, SUBTITLES, LAYERED IMAGES) ---
        // We chain overlays onto [base_v] -> [v1] -> [v2] ... -> [outv]
        
        let lastVideoStream = '[base_v]';
        
        // Sort overlays by start time to apply in order (though overlay filter order matters for Z-index, usually implies timeline order or track order)
        // Let's rely on array order.
        
        overlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const ovLabel = `ov${i}`;
            const safeDuration = parseFloat(clip.duration);
            
            // Prepare Overlay Stream (Scale/Transform)
            // Note: Text clips are already rendered to 1920x1080 transparent PNGs by frontend, 
            // but our pipeline scales to 720p. We should scale them to 1280x720 to match base.
            let filters = [`scale=1280:720`]; 
            
            // Apply Movement to overlay if needed (e.g. sticker movement)
            if (clip.properties && clip.properties.movement) {
                 const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, true);
                 if (moveFilter) filters.push(moveFilter);
            }
            
            // Loop image (if it's a static image acting as video overlay for duration)
            // filters.unshift(`loop=loop=-1:size=1:start=0`); // Only if we want to extend it. 
            // Actually, overlay filter handles static images fine without loop if EOF action is handled? 
            // Better to loop it to match duration to be safe.
            filters.unshift(`loop=loop=-1:size=1:start=0`);
            
            // Trim to duration (so loop doesn't go forever in filter graph logic sometimes)
            filters.push(`trim=duration=${safeDuration}`);
            filters.push('setpts=PTS-STARTPTS'); // Reset timestamp to 0 for the overlay stream itself
            
            // Apply Opacity if needed
            if (clip.properties && clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                 filters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            filterChain += `[${idx}:v]${filters.join(',')}[${ovLabel}_src];`;

            // Apply Overlay to Main Chain
            // enable='between(t,start,end)' handles the timing on the timeline
            const nextBase = `base_${i}`;
            // If it's the last one, we can call it [outv] if we want, but let's just chain.
            
            // Overlay filter
            // We use 'enable' to show it only at specific times.
            // Note: overlay inputs: [background][foreground]
            // If the foreground (overlay) stream starts at 0 (due to setpts=PTS-STARTPTS), 
            // and we use enable='between(t,...)', the overlay filter will pick frames from the foreground stream matching the main clock?
            // No, overlay syncs timestamps by default. If foreground starts at 0, it overlays at 0.
            // But we want it to start at clip.start.
            // We should offset the PTS of the overlay stream: setpts=PTS+START_TIME/TB
            // Let's redo the overlay stream processing.
            
            // Correct approach: Delay the overlay stream to start at clip.start
            // inputs.push('-itsoffset', clip.start, '-i', filePath) is one way, but we are using complex filters.
            // Filter setpts=PTS+START_TIME/TB works.
            
            // Redoing filter for this clip to include time shift
            // We remove 'setpts=PTS-STARTPTS' from above and replace with:
            // setpts=PTS-STARTPTS+${clip.start}/TB
            
            // Let's rewrite the filter chain for this item
            filters = [`loop=loop=-1:size=1:start=0`, `scale=1280:720`, `trim=duration=${safeDuration}`];
            
            // Movement logic inside the trimmed timeframe (0 to duration)
            if (clip.properties && clip.properties.movement) {
                 const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, true);
                 if (moveFilter) filters.push(moveFilter);
            }
            if (clip.properties?.opacity < 1) filters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            
            // NOW shift it to timeline position
            filters.push(`setpts=PTS-STARTPTS+${clip.start}/TB`);

            // We still need the transparency/format
            filters.push('format=yuva420p'); // Ensure alpha channel if supported, or rgba

            filterChain += `[${idx}:v]${filters.join(',')}[${ovLabel}_ready];`;
            
            // Overlay
            // enable is redundant if we shifted PTS, but 'enable' ensures it doesn't show up before/after if bits remain?
            // Actually, if we shifted PTS, frames exist only at that time range. 
            // Overlay filter simply places them.
            // However, to be safe against "freeze last frame", trim handles end.
            
            filterChain += `${lastVideoStream}[${ovLabel}_ready]overlay=x=0:y=0:eof_action=pass[${nextBase}];`;
            lastVideoStream = `[${nextBase}]`;
        });
        
        // Final video output label
        const finalVideoOut = '[outv]';
        filterChain += `${lastVideoStream}null${finalVideoOut};`;


        // --- 3. PROCESS ADDITIONAL AUDIO TRACKS (Mix) ---
        // We have [base_a] from main track. We need to mix in other audios.
        // audioClips contains standalone audio files.
        // Similar to overlays, we use 'amix' or 'adelay'. 'adelay' is better for positioning.
        
        let audioMixInputs = [];
        if (mainClips.length > 0) audioMixInputs.push('[base_a]');
        
        audioClips.forEach((clip, i) => {
             const filePath = fileMap[clip.fileName];
             if (!filePath) return;
             
             inputs.push('-i', filePath);
             const idx = inputIndexCounter++;
             const aLabel = `aud_add_${i}`;
             
             const safeDuration = parseFloat(clip.duration);
             const startOffset = parseFloat(clip.mediaStartOffset) || 0;
             const volume = clip.properties?.volume !== undefined ? clip.properties.volume : 1;
             
             // Filters: trim, volume, delay
             // delay: all channels. adelay=del|del
             const delayMs = Math.round(clip.start * 1000);
             
             let af = [`atrim=start=${startOffset}:duration=${startOffset+safeDuration}`, `asetpts=PTS-STARTPTS`];
             if (volume !== 1) af.push(`volume=${volume}`);
             
             af.push(`adelay=${delayMs}|${delayMs}`);
             
             filterChain += `[${idx}:a]${af.join(',')}[${aLabel}];`;
             audioMixInputs.push(`[${aLabel}]`);
        });
        
        const finalAudioOut = '[outa]';
        if (audioMixInputs.length > 0) {
            // amix accepts number of inputs. 
            // dropout_transition=0 helps maintain volume. normalize=0 prevents volume jumping.
            // However, amix ends when shortest input ends if duration=shortest. duration=longest is default or needed.
            // We want the full duration of main video or max audio.
            // Safer: amix=inputs=N:duration=first (if first is base video audio which is padded)
            // But if base video has no audio track, we created nullsrc.
            // Let's use duration=longest to capture all sound effects.
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0:normalize=0${finalAudioOut}`;
        } else {
             filterChain += `anullsrc=d=1${finalAudioOut}`; // Fallback
        }

        // --- RETURN ---
        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalVideoOut,
            outputMapAudio: finalAudioOut
        };
    }
};
