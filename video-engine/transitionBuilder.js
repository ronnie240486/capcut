
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // 1. Separate Visual Clips (Base) and Audio Overlays
        const visualClips = clips.filter(c => 
            ['video', 'camada'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image')
        ).sort((a, b) => a.start - b.start);

        const audioOverlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) || 
            c.type === 'audio'
        );

        // --- PART 1: VISUAL BASE (CONCAT) ---
        let videoStreamLabels = [];
        let audioStreamLabels = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            const duration = parseFloat(clip.duration) || 5;

            // FIX: Loop images at input level
            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath);
            } else {
                inputs.push('-i', filePath);
            }
            
            const idx = inputIndexCounter++;

            // --- VIDEO PROCESSING ---
            let vStream = `[${idx}:v]`;
            const addV = (f) => {
                if (!f) return;
                const lbl = `v${i}_${Math.random().toString(36).substr(2,4)}`;
                filterChain += `${vStream}${f}[${lbl}];`;
                vStream = `[${lbl}]`;
            };
            
            // 1. Standardize (Scale, FPS, SAR)
            addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // 2. Trim
            if (clip.type === 'image') {
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
                // Pass false for isImage because we converted images to video streams via loop
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, false);
                if (moveFilter) addV(moveFilter);
            }

            const finalV = `seg_v${i}`;
            filterChain += `${vStream}setsar=1,setpts=PTS-STARTPTS[${finalV}];`;
            videoStreamLabels.push(`[${finalV}]`);


            // --- AUDIO PROCESSING FOR VIDEO CLIPS ---
            const finalA = `seg_a${i}`;
            const mediaInfo = mediaLibrary && mediaLibrary[clip.fileName];
            let hasAudioStream = clip.type === 'video' && (mediaInfo ? mediaInfo.hasAudio !== false : true);

            if (hasAudioStream) {
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 let af = [];
                 af.push(`atrim=start=${start}:duration=${start + duration}`);
                 af.push(`asetpts=PTS-STARTPTS`);
                 if (clip.properties?.volume !== undefined) af.push(`volume=${clip.properties.volume}`);
                 af.push('aformat=sample_rates=44100:channel_layouts=stereo');
                 
                 filterChain += `[${idx}:a]${af.join(',')}[${finalA}];`;
            } else {
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${finalA}];`;
            }
            audioStreamLabels.push(`[${finalA}]`);
        });

        // --- CONCAT ---
        let baseVideo = '[outv]';
        let baseAudio = '[base_a]';
        
        if (videoStreamLabels.length > 0) {
            let concatStr = '';
            for(let k=0; k<videoStreamLabels.length; k++) {
                concatStr += `${videoStreamLabels[k]}${audioStreamLabels[k]}`;
            }
            filterChain += `${concatStr}concat=n=${videoStreamLabels.length}:v=1:a=1:unsafe=1[concat_v][concat_a];`;
            filterChain += `[concat_v]fps=30,format=yuv420p[outv];`;
            filterChain += `[concat_a]aformat=sample_rates=44100:channel_layouts=stereo[base_a];`;
        } else {
            return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        // --- PART 2: AUDIO OVERLAYS ---
        let audioOverlayLabels = [];
        
        audioOverlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            
            const timelineStart = parseFloat(clip.start) || 0;
            const mediaStart = parseFloat(clip.mediaStartOffset) || 0;
            const duration = parseFloat(clip.duration) || 5;
            
            let af = [];
            af.push(`atrim=start=${mediaStart}:duration=${mediaStart + duration}`);
            af.push(`asetpts=PTS-STARTPTS`);
            if (clip.properties?.volume !== undefined) af.push(`volume=${clip.properties.volume}`);
            
            const delayMs = Math.round(timelineStart * 1000);
            if (delayMs > 0) af.push(`adelay=${delayMs}|${delayMs}`);
            
            af.push('aformat=sample_rates=44100:channel_layouts=stereo');

            const label = `overlay_a${i}`;
            filterChain += `[${idx}:a]${af.join(',')}[${label}];`;
            audioOverlayLabels.push(`[${label}]`);
        });

        // --- FINAL MIX ---
        let finalAudioMap = baseAudio;
        
        if (audioOverlayLabels.length > 0) {
            const allAudioInputs = [baseAudio, ...audioOverlayLabels];
            const count = allAudioInputs.length;
            filterChain += `${allAudioInputs.join('')}amix=inputs=${count}:duration=first:dropout_transition=0,volume=2[mixed_a];`;
            finalAudioMap = '[mixed_a]';
        }

        // --- CLEANUP ---
        // Remove trailing semicolon to prevent "No such filter: ''" error
        if (filterChain.endsWith(';')) {
            filterChain = filterChain.slice(0, -1);
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: baseVideo,
            outputMapAudio: finalAudioMap
        };
    }
};
