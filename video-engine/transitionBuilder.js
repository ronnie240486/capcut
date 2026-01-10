
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        const audioOverlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) || 
            c.type === 'audio'
        );

        let videoStreamLabels = [];
        let audioStreamLabels = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath && clip.type !== 'text') return;

            const duration = parseFloat(clip.duration) || 5;

            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 1).toString(), '-i', filePath);
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                inputs.push('-f', 'lavfi', '-t', duration.toString(), '-i', `color=c=black:s=1280x720:r=30`);
            }
            
            const idx = inputIndexCounter++;
            let vStream = `[${idx}:v]`;

            const addV = (f) => {
                if (!f) return;
                const lbl = `v${i}_${Math.random().toString(36).substr(2,4)}`;
                filterChain += `${vStream}${f}[${lbl}];`;
                vStream = `[${lbl}]`;
            };
            
            // 1. Padronização Global
            addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // 2. Trim e Reset de PTS (Essencial para animações começarem no tempo certo)
            if (clip.type === 'image') {
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            }

            // 3. Efeitos Visuais (Color Grade)
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }

            // 4. Aplicação de Todos os Movimentos (O "Tudo sem Exceção")
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration);
                if (moveFilter) addV(moveFilter);
            }

            // 5. Overlays de Texto
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '');
                const fontColor = clip.properties.textDesign?.color || 'white';
                addV(`drawtext=text='${txt}':fontcolor=${fontColor}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            const finalV = `seg_v${i}`;
            filterChain += `${vStream}setsar=1,setpts=PTS-STARTPTS[${finalV}];`;
            videoStreamLabels.push(`[${finalV}]`);

            // 6. Áudio do Clipe
            const finalA = `seg_a${i}`;
            const mediaInfo = mediaLibrary && mediaLibrary[clip.fileName];
            let hasAudioStream = clip.type === 'video' && (mediaInfo ? mediaInfo.hasAudio !== false : true);

            if (hasAudioStream) {
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,volume=${clip.properties?.volume || 1},aformat=sample_rates=44100:channel_layouts=stereo[${finalA}];`;
            } else {
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${finalA}];`;
            }
            audioStreamLabels.push(`[${finalA}]`);
        });

        if (videoStreamLabels.length > 0) {
            let concatStr = '';
            for(let k=0; k<videoStreamLabels.length; k++) {
                concatStr += `${videoStreamLabels[k]}${audioStreamLabels[k]}`;
            }
            filterChain += `${concatStr}concat=n=${videoStreamLabels.length}:v=1:a=1:unsafe=1[outv][base_a];`;
        } else {
            return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        // Mixagem de Áudio Overlays (Música, Narração, etc)
        let finalAudioMap = '[base_a]';
        if (audioOverlayClips.length > 0) {
            let audioOverlayLabels = [];
            audioOverlayClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;
                inputs.push('-i', filePath);
                const idx = inputIndexCounter++;
                const timelineStart = parseFloat(clip.start) || 0;
                const duration = parseFloat(clip.duration) || 5;
                const label = `overlay_a${i}`;
                const delayMs = Math.round(timelineStart * 1000);
                filterChain += `[${idx}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${clip.properties?.volume || 1},adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=stereo[${label}];`;
                audioOverlayLabels.push(`[${label}]`);
            });
            const allAudio = `[base_a]${audioOverlayLabels.join('')}`;
            filterChain += `${allAudio}amix=inputs=${audioOverlayLabels.length + 1}:duration=first:dropout_transition=0,volume=2[mixed_a]`;
            finalAudioMap = '[mixed_a]';
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: '[outv]',
            outputMapAudio: finalAudioMap
        };
    }
};
