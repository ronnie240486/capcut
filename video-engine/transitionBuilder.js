
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // Filtramos clipes visuais (Vídeos e Imagens) ordenados pelo tempo de início na timeline
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'image'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image')
        ).sort((a, b) => a.start - b.start);

        const audioOverlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) || 
            c.type === 'audio'
        );

        if (visualClips.length === 0) {
             return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        // 1. Processar cada clipe visual individualmente (Pre-processing)
        let processedVideoLabels = [];
        let processedAudioLabels = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;

            const duration = parseFloat(clip.duration) || 5;
            
            // Adicionar input
            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath);
            } else {
                inputs.push('-i', filePath);
            }
            
            const idx = inputIndexCounter++;
            let vStream = `[${idx}:v]`;
            let aStream = `[${idx}:a]`;

            // Helper para adicionar filtros de vídeo
            const addV = (f) => {
                const lbl = `v_pre_${i}_${Math.random().toString(36).substr(2,4)}`;
                filterChain += `${vStream}${f}[${lbl}];`;
                vStream = `[${lbl}]`;
            };

            // A. Padronização (Escala, FPS, Formato)
            addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // B. Trim (Vídeos precisam de offset de mídia)
            if (clip.type === 'image') {
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                const mediaStart = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${mediaStart}:duration=${duration},setpts=PTS-STARTPTS`);
            }

            // C. Efeitos Visuais
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }

            // D. Movimentos (Zoompan)
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration);
                if (moveFilter) addV(moveFilter);
            }

            const finalV = `v_ready_${i}`;
            filterChain += `${vStream}null[${finalV}];`;
            processedVideoLabels.push(finalV);

            // E. Áudio do clipe
            const finalA = `a_ready_${i}`;
            const mediaInfo = mediaLibrary[clip.fileName];
            const hasAudio = clip.type === 'video' && (mediaInfo ? mediaInfo.hasAudio !== false : true);

            if (hasAudio) {
                const mediaStart = parseFloat(clip.mediaStartOffset) || 0;
                filterChain += `${aStream}atrim=start=${mediaStart}:duration=${duration},asetpts=PTS-STARTPTS,volume=${clip.properties?.volume || 1}[${finalA}];`;
            } else {
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${finalA}];`;
            }
            processedAudioLabels.push(finalA);
        });

        // 2. Encadeamento de clipes com Transições (xfade)
        let lastV = processedVideoLabels[0];
        let lastA = processedAudioLabels[0];
        let currentOffset = visualClips[0].duration;

        for (let i = 1; i < visualClips.length; i++) {
            const clip = visualClips[i];
            const prevClip = visualClips[i-1];
            const nextV = processedVideoLabels[i];
            const nextA = processedAudioLabels[i];

            // Verificamos se o clipe atual tem uma transição definida
            const trans = clip.transition;
            const transDur = trans ? Math.min(parseFloat(trans.duration), prevClip.duration, clip.duration) : 0;

            if (transDur > 0) {
                const transType = presetGenerator.getTransitionType(trans.id);
                const outV = `v_trans_${i}`;
                const outA = `a_trans_${i}`;
                
                // Cálculo do offset para o xfade: Fim do clipe anterior menos a duração da transição
                const xfadeOffset = currentOffset - transDur;
                
                filterChain += `[${lastV}][${nextV}]xfade=transition=${transType}:duration=${transDur}:offset=${xfadeOffset}[${outV}];`;
                // Transição de áudio (acrossfade simples para suavidade)
                filterChain += `[${lastA}][${nextA}]acrossfade=d=${transDur}[${outA}];`;
                
                lastV = outV;
                lastA = outA;
                currentOffset = xfadeOffset + clip.duration;
            } else {
                // Sem transição: Concatenação simples
                const outV = `v_cat_${i}`;
                const outA = `a_cat_${i}`;
                filterChain += `[${lastV}][${nextV}]concat=n=2:v=1:a=0[${outV}];`;
                filterChain += `[${lastA}][${nextA}]concat=n=2:v=0:a=1[${outA}];`;
                
                lastV = outV;
                lastA = outA;
                currentOffset += clip.duration;
            }
        }

        // 3. Adicionar Overlays de Áudio (Música, Narração)
        let finalAudioMap = `[${lastA}]`;
        if (audioOverlayClips.length > 0) {
            let overlayLabels = [];
            audioOverlayClips.forEach((aclip, j) => {
                const filePath = fileMap[aclip.fileName];
                if (!filePath) return;

                inputs.push('-i', filePath);
                const idx = inputIndexCounter++;
                const delayMs = Math.round(parseFloat(aclip.start) * 1000);
                const aLabel = `a_ov_${j}`;
                
                // adelay aplica o atraso para sincronizar com a timeline
                filterChain += `[${idx}:a]volume=${aclip.properties?.volume || 1},adelay=${delayMs}|${delayMs}[${aLabel}];`;
                overlayLabels.push(aLabel);
            });

            const mixedA = `a_mixed_final`;
            const amixInputs = overlayLabels.length + 1;
            filterChain += `[${lastA}]${overlayLabels.map(l => `[${l}]`).join('')}amix=inputs=${amixInputs}:duration=first:dropout_transition=0,volume=${amixInputs}[${mixedA}];`;
            finalAudioMap = `[${mixedA}]`;
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: `[${lastV}]`,
            outputMapAudio: finalAudioMap
        };
    }
};
