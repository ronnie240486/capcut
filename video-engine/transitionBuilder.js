const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;
        const fileToIndexMap = {};

        // 1. Coleta arquivos únicos
        clips.forEach(clip => {
            if (clip.fileName && !fileToIndexMap.hasOwnProperty(clip.fileName)) {
                const filePath = fileMap[clip.fileName];
                if (filePath) {
                    inputs.push('-i', filePath);
                    fileToIndexMap[clip.fileName] = inputIndexCounter++;
                }
            }
        });

        // 2. Processamento Visual (Vídeo/Imagem)
        // Filtramos clips que ocupam espaço na tela e ordenamos por tempo
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        let videoStreamLabels = [];
        visualClips.forEach((clip, i) => {
            const inputIdx = fileToIndexMap[clip.fileName];
            const duration = Math.max(0.1, parseFloat(clip.duration));
            let currentStream = '';

            if (clip.type === 'text') {
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

            // Normalização de entrada
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // Movimento (Crucial: Aplicar antes do trim para imagens pois o zoompan gera a duração)
            if (clip.type === 'image') {
                const moveType = clip.properties?.movement?.type || null;
                const moveFilter = presetGenerator.getMovementFilter(moveType, duration, true, clip.properties?.movement?.config || {});
                addFilter(moveFilter);
            } else {
                // Vídeo: Trim primeiro, depois movimento se houver
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`);
                if (clip.properties?.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, false, clip.properties.movement.config || {});
                    if (moveFilter) addFilter(moveFilter);
                }
            }

            // Efeitos extras (FX)
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }

            // Textos sobrepostos (Drawtext)
            if (clip.properties?.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            const finalLabel = `v_fin_${i}`;
            filterChain += `${currentStream}scale=1280:720,setsar=1[${finalLabel}];`;
            videoStreamLabels.push({ label: `[${finalLabel}]`, duration });
        });

        // Concatenação de Vídeo
        if (videoStreamLabels.length > 0) {
            filterChain += videoStreamLabels.map(l => l.label).join('') + `concat=n=${videoStreamLabels.length}:v=1:a=0[outv];`;
        } else {
            filterChain += `color=c=black:s=1280x720:r=30:d=1[outv];`;
        }

        // 3. Processamento de Áudio
        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'video' && (mediaLibrary[c.fileName]?.hasAudio !== false))
        );

        let audioStreamLabels = [];
        audioClips.forEach((clip, i) => {
            const inputIdx = fileToIndexMap[clip.fileName];
            if (inputIdx === undefined) return;

            const duration = Math.max(0.1, parseFloat(clip.duration));
            const start = clip.start || 0;
            const mediaOffset = clip.mediaStartOffset || 0;
            const volume = clip.properties?.volume ?? 1;
            
            const label = `a_raw_${i}`;
            const delayedLabel = `a_del_${i}`;
            
            // Trim e resample
            filterChain += `[${inputIdx}:a]atrim=start=${mediaOffset}:duration=${duration},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume}[${label}];`;
            // Atraso para posição na timeline
            filterChain += `[${label}]adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[${delayedLabel}];`;
            
            audioStreamLabels.push(`[${delayedLabel}]`);
        });

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
