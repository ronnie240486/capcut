
import presetGenerator from './presetGenerator.js';

export default {
    buildTimeline: (clips, fileMap) => {
        let inputs = [];
        let filterChain = '';
        let streamLabels = [];
        
        let inputIndexCounter = 0;

        clips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            if (!filePath) {
                return;
            }

            inputs.push('-i', filePath);
            const currentInputIndex = inputIndexCounter;
            inputIndexCounter++;

            let currentStream = `[${currentInputIndex}:v]`;
            
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `tmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentStream}${filterText}[${nextLabel}];`;
                currentStream = `[${nextLabel}]`;
            };

            // 1. Pre-processamento: Escala e FPS fixos
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // 2. Corte (Trim) - Apenas para vídeo
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                // setpts=PTS-STARTPTS é crucial para que o vídeo comece do tempo 0 para os efeitos de movimento funcionarem
                addFilter(`trim=start=${start}:duration=${start + clip.duration},setpts=PTS-STARTPTS`);
            }

            // 3. Efeitos de Cor (Antes do Movimento para consistência)
            let filters = [];
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) filters.push(fx);
            }
            
            // Ajustes Manuais
            if (clip.properties && clip.properties.adjustments) {
                const adj = clip.properties.adjustments;
                let eq = [];
                if (adj.brightness !== 1) eq.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                if (adj.contrast !== 1) eq.push(`contrast=${adj.contrast.toFixed(2)}`);
                if (adj.saturate !== 1) eq.push(`saturation=${adj.saturate.toFixed(2)}`);
                
                if (eq.length > 0) filters.push(`eq=${eq.join(':')}`);
                if (adj.hue !== 0) filters.push(`hue=h=${adj.hue}`);
            }

            if (clip.properties?.opacity < 1) {
                filters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            if (filters.length > 0) {
                addFilter(filters.join(','));
            }

            // 4. Movimento (Zoom/Pan)
            // Se for imagem, isso gera o vídeo da duração correta.
            // Se for vídeo, aplica o zoom dinâmico.
            if (clip.type === 'image') {
                let zoomFilter = presetGenerator.getMovementFilter(null, clip.duration, true); // Estático default
                
                if (clip.properties?.movement) {
                    zoomFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, clip.duration, true);
                }
                addFilter(zoomFilter);
            } else {
                // Vídeo
                if (clip.properties?.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, clip.duration, false);
                    if (moveFilter) addFilter(moveFilter);
                }
            }

            // 5. Finalização do Clipe
            const finalLabel = `v${i}`;
            // Força SAR 1 e Scale novamente caso o zoompan tenha alterado as dimensões ou proporção de pixel
            filterChain += `${currentStream}scale=1280:720,setsar=1[${finalLabel}];`;
            streamLabels.push(`[${finalLabel}]`);
        });

        if (streamLabels.length > 0) {
            filterChain += `${streamLabels.join('')}concat=n=${streamLabels.length}:v=1:a=0:unsafe=1[outv]`;
        } else {
            return { inputs: [], filterComplex: null, outputMap: null };
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMap: '[outv]'
        };
    }
};
