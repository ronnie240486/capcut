
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // 1. Separate Visual (Base) and Audio (Overlay) Clips
        // Visual clips form the structure/length of the video via CONCAT.
        // Audio clips are mixed on top via AMIX.
        const visualClips = clips.filter(c => 
            ['video', 'camada'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image')
        ).sort((a, b) => a.start - b.start);

        const audioOverlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) || 
            c.type === 'audio'
        );

        // --- PART 1: VISUAL BACKBONE (CONCAT) ---
        let videoStreamLabels = [];
        let audioStreamLabels = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) {
                console.warn(`[Builder] Arquivo visual faltando: ${clip.fileName}`);
                return;
            }

            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;

            // Video Processing
            let vStream = `[${idx}:v]`;
            const addV = (f) => {
                const lbl = `v${i}_${Math.random().toString(36).substr(2,4)}`;
                filterChain += `${vStream}${f}[${lbl}];`;
                vStream = `[${lbl}]`;
            };

            const duration = parseFloat(clip.duration) || 5;
            
            // Loop image / Scale
            let prep = [];
            if (clip.type === 'image') prep.push('loop=loop=-1:size=1:start=0');
            prep.push(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);
            addV(prep.join(','));

            // Trim
            if (clip.type === 'image') {
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            }

            // Effects & Motion (Simplified)
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }
            // Add Movement
             if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image');
                if (moveFilter) addV(moveFilter);
            }

            // Finalize Video Segment
            const finalV = `seg_v${i}`;
            // Ensure SAR/PTS are perfect for concat
            filterChain += `${vStream}setsar=1,setpts=PTS-STARTPTS[${finalV}];`;
            videoStreamLabels.push(`[${finalV}]`);


            // Audio Processing (For visual clip)
            const finalA = `seg_a${i}`;
            const mediaInfo = mediaLibrary && mediaLibrary[clip.fileName];
            let hasAudioStream = clip.type === 'video' && (mediaInfo ? mediaInfo.hasAudio !== false : true);

            if (hasAudioStream) {
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 let af = [`atrim=start=${start}:duration=${start + duration}`, `asetpts=PTS-STARTPTS`];
                 if (clip.properties?.volume !== undefined) af.push(`volume=${clip.properties.volume}`);
                 af.push('aformat=sample_rates=44100:channel_layouts=stereo');
                 filterChain += `[${idx}:a]${af.join(',')}[${finalA}];`;
            } else {
                // Generate silence for image/silent video
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${finalA}];`;
            }
            audioStreamLabels.push(`[${finalA}]`);
        });

        // Concat Visuals
        let baseVideo = '[outv]';
        let baseAudio = '[base_a]';
        
        if (videoStreamLabels.length > 0) {
            let concatStr = '';
            for(let k=0; k<videoStreamLabels.length; k++) concatStr += `${videoStreamLabels[k]}${audioStreamLabels[k]}`;
            filterChain += `${concatStr}concat=n=${videoStreamLabels.length}:v=1:a=1:unsafe=1[outv][base_a];`;
        } else {
            // No visuals? Return empty or dummy
            return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        // --- PART 2: AUDIO OVERLAYS (AMIX) ---
        let audioOverlayLabels = [];
        
        audioOverlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            
            const startOffset = parseFloat(clip.start) || 0;
            const mediaStart = parseFloat(clip.mediaStartOffset) || 0;
            const duration = parseFloat(clip.duration) || 5;
            
            // 1. Trim source
            // 2. Volume
            // 3. Delay (position in timeline)
            
            let af = [];
            af.push(`atrim=start=${mediaStart}:duration=${mediaStart + duration}`);
            af.push(`asetpts=PTS-STARTPTS`);
            
            if (clip.properties?.volume !== undefined) af.push(`volume=${clip.properties.volume}`);
            
            // adelay uses milliseconds. '|' allows separating channels but we use same delay for both.
            // If start is 0, adelay might be skipped or 0.
            const delayMs = Math.round(startOffset * 1000);
            if (delayMs > 0) af.push(`adelay=${delayMs}|${delayMs}`);
            
            af.push('aformat=sample_rates=44100:channel_layouts=stereo');

            const label = `overlay_a${i}`;
            filterChain += `[${idx}:a]${af.join(',')}[${label}];`;
            audioOverlayLabels.push(`[${label}]`);
        });

        // --- FINAL MIX ---

