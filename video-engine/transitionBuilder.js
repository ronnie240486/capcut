
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let videoStreamLabels = [];
        let audioStreamLabels = [];
        
        let inputIndexCounter = 0;

        clips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            if (!filePath) {
                console.warn(`[Builder] Arquivo faltando: ${clip.fileName}`);
                return;
            }

            inputs.push('-i', filePath);
            const currentInputIndex = inputIndexCounter;
            inputIndexCounter++;

            // --- PROCESSAMENTO DE VÍDEO ---
            let currentVideoStream = `[${currentInputIndex}:v]`;
            
            const addVideoFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentVideoStream}${filterText}[${nextLabel}];`;
                currentVideoStream = `[${nextLabel}]`;
            };

            const safeDuration = parseFloat(clip.duration) || 5;

            // 1. Preparação (Loop Imagem + Padronização)
            let prepFilters = [];
            if (clip.type === 'image') {
                prepFilters.push('loop=loop=-1:size=1:start=0');
            }
            // Importante: setsar=1 garante pixel aspect ratio quadrado
            prepFilters.push(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);
            
            addVideoFilter(prepFilters.join(','));

            // 2. Trim (Corte no tempo)
            if (clip.type === 'image') {
                addVideoFilter(`trim=duration=${safeDuration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addVideoFilter(`trim=start=${start}:duration=${start + safeDuration},setpts=PTS-STARTPTS`);
            }

            // 3. Efeitos de Cor
            let colorFilters = [];
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) colorFilters.push(fx);
            }
            if (clip.properties && clip.properties.adjustments) {
                const adj = clip.properties.adjustments;
                let eqParts = [];
                if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                
                if (eqParts.length > 0) colorFilters.push(`eq=${eqParts.join(':')}`);
                if (adj.hue !== 0) colorFilters.push(`hue=h=${adj.hue}`);
            }
            if (clip.properties && clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                colorFilters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }
            if (colorFilters.length > 0) {
                addVideoFilter(colorFilters.join(','));
            }

            // 4. Movimento
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, clip.type === 'image');
                if (moveFilter) addVideoFilter(moveFilter);
            }

            // Finaliza stream de vídeo para este clipe
            const finalVideoLabel = `v${i}`;
            // Se o movimento for Scale+Crop, a dimensão já é 1280x720. Se for Zoompan, também.
            // Executamos setsar=1 novamente por segurança.
            filterChain += `${currentVideoStream}setsar=1,setpts=PTS-STARTPTS[${finalVideoLabel}];`;
            videoStreamLabels.push(`[${finalVideoLabel}]`);


            // --- PROCESSAMENTO DE ÁUDIO ---
            const mediaInfo = mediaLibrary && mediaLibrary[clip.fileName];
            // FIX: Check explicit false, otherwise default to true for video/audio types
            let hasAudio = false;
            if (clip.type === 'audio') {
                hasAudio = true;
            } else if (clip.type === 'video') {
                if (mediaInfo && mediaInfo.hasAudio !== undefined) {
                    hasAudio = mediaInfo.hasAudio;
                } else {
                    hasAudio = true; // Assume true if unknown
                }
            }
            
            const finalAudioLabel = `a${i}`;

            if (hasAudio) {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                let audioFilters = [`atrim=start=${start}:duration=${start + safeDuration}`, `asetpts=PTS-STARTPTS`];
                
                if (clip.properties && clip.properties.volume !== undefined && clip.properties.volume !== 1) {
                    audioFilters.push(`volume=${clip.properties.volume}`);
                }
                
                // CRUCIAL: Padronizar formato de áudio para evitar falhas no concat
                audioFilters.push('aformat=sample_rates=44100:channel_layouts=stereo');
                
                filterChain += `[${currentInputIndex}:a]${audioFilters.join(',')}[${finalAudioLabel}];`;
            } else {
                // Gera silêncio compatível
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${safeDuration}[${finalAudioLabel}];`;
            }
            audioStreamLabels.push(`[${finalAudioLabel}]`);
        });

        // --- CONCATENAÇÃO ---
        if (videoStreamLabels.length > 0) {
            let concatInputs = '';
            for(let k=0; k < videoStreamLabels.length; k++) {
                concatInputs += `${videoStreamLabels[k]}${audioStreamLabels[k]}`;
            }
            // unsafe=1 ajuda com timestamps imperfeitos
            filterChain += `${concatInputs}concat=n=${videoStreamLabels.length}:v=1:a=1:unsafe=1[outv][outa]`;
        } else {
            return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: '[outv]',
            outputMapAudio: '[outa]'
        };
    }
};
