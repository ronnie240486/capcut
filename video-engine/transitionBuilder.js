
import presetGenerator from './presetGenerator.js';

export default {
    /**
     * Constrói a timeline baseada em clipes.
     */
    buildTimeline: (clips, fileMap) => {
        let inputs = [];
        let filterChain = '';
        let streamLabels = [];
        
        let inputIndexCounter = 0;

        clips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            if (!filePath) {
                console.warn(`Arquivo não encontrado para o clipe: ${clip.fileName}`);
                return;
            }

            // Adiciona input
            inputs.push('-i', filePath);
            const currentInputIndex = inputIndexCounter;
            inputIndexCounter++;

            // Labels sequenciais para este clipe
            let currentStream = `[${currentInputIndex}:v]`;
            
            // Helper para adicionar filtro
            const addFilter = (filterText) => {
                const nextLabel = `tmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentStream}${filterText}[${nextLabel}];`;
                currentStream = `[${nextLabel}]`;
            };

            // --- 1. Normalização Inicial ---
            // Scale to 1280x720, pad if needed, enforce 30fps, SAR 1:1, format yuv420p
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // --- 2. Duração e Movimento ---
            const durationFrames = Math.ceil(clip.duration * 30); 
            
            if (clip.type === 'image') {
                // Imagens: Gerar vídeo com zoompan
                let zoomFilter = `zoompan=z=1:d=${durationFrames}:s=1280x720:fps=30`; // Default static

                if (clip.properties && clip.properties.movement) {
                    const dynamicZoom = presetGenerator.getMovementFilter(clip.properties.movement.type, durationFrames, true);
                    if (dynamicZoom) zoomFilter = dynamicZoom;
                }
                
                addFilter(zoomFilter);
            } else {
                // Vídeo: Trim
                const start = clip.mediaStartOffset || 0;
                // Important: setpts must reset timestamps so movements starting at 'on=0' work correctly
                addFilter(`trim=start=${start}:duration=${start + clip.duration},setpts=PTS-STARTPTS`);

                // Vídeo: Movimento
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, durationFrames, false);
                    if (moveFilter) {
                        addFilter(moveFilter);
                    }
                }
            }

            // --- 3. Efeitos Visuais (Cor / Filtros) ---
            let filtersToApply = [];
            
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) filtersToApply.push(fx);
            }

            if (clip.properties && clip.properties.adjustments) {
                const adj = clip.properties.adjustments;
                // Build eq filter parts
                let eqParts = [];
                if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                // Note: gamma is not directly exposed but can be used if needed.
                
                if (eqParts.length > 0) filtersToApply.push(`eq=${eqParts.join(':')}`);
                
                // Hue
                if (adj.hue !== 0) filtersToApply.push(`hue=h=${adj.hue}`);
            }

            if (clip.properties && clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                filtersToApply.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            if (filtersToApply.length > 0) {
                addFilter(filtersToApply.join(','));
            }

            // --- 4. Finalização do Clipe ---
            // Re-assert PTS to be safe for concat
            const finalLabel = `v${i}`;
            filterChain += `${currentStream}setpts=PTS-STARTPTS[${finalLabel}];`;
            streamLabels.push(`[${finalLabel}]`);
        });

        // --- 5. Concatenação ---
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
