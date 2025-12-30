
const presetGenerator = require('./presetGenerator');

module.exports = {
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

            // Labels temporários
            let lastLabel = `[${currentInputIndex}:v]`;
            let nextLabel = `tmp${i}_a`; 

            // --- 1. Normalização Inicial (Scale / Pad / Format / FPS) ---
            // Forçamos fps=30 aqui para garantir que todos os inputs tenham o mesmo frame rate antes do concat
            filterChain += `${lastLabel}scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[${nextLabel}];`;
            lastLabel = `[${nextLabel}]`;
            nextLabel = `tmp${i}_b`;

            // --- 2. Duração e Movimento ---
            const durationFrames = Math.ceil(clip.duration * 30); // 30fps fixo
            
            if (clip.type === 'image') {
                // Imagens: ZoomPan cria o vídeo com a duração correta
                let zoomFilter = `zoompan=z=1:d=${durationFrames}:s=1280x720:fps=30`; // Estático por padrão

                if (clip.properties && clip.properties.movement) {
                    zoomFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, durationFrames);
                } else {
                    // Fallback para estático se não houver movimento definido
                    zoomFilter = `zoompan=z=1:d=${durationFrames}:s=1280x720:fps=30`;
                }
                
                filterChain += `${lastLabel}${zoomFilter}[${nextLabel}];`;
                lastLabel = `[${nextLabel}]`;
                nextLabel = `tmp${i}_c`;
            } else {
                // Vídeo: Trim (Corte)
                const start = clip.mediaStartOffset || 0;
                filterChain += `${lastLabel}trim=start=${start}:duration=${start + clip.duration},setpts=PTS-STARTPTS[${nextLabel}];`;
                lastLabel = `[${nextLabel}]`;
                nextLabel = `tmp${i}_d`;
            }

            // --- 3. Efeitos Visuais (Cor / Brilho) ---
            const effectFilters = [];
            
            if (clip.effect) {
                const fxFilter = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fxFilter) effectFilters.push(fxFilter);
            }

            if (clip.properties && clip.properties.adjustments) {
                const adj = clip.properties.adjustments;
                const eqParts = [];
                if (adj.brightness !== undefined && adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                if (adj.contrast !== undefined && adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                if (adj.saturate !== undefined && adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                
                if (eqParts.length > 0) effectFilters.push(`eq=${eqParts.join(':')}`);
                if (adj.hue !== undefined && adj.hue !== 0) effectFilters.push(`hue=h=${adj.hue}`);
            }

            if (clip.properties && clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                effectFilters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            if (effectFilters.length > 0) {
                filterChain += `${lastLabel}${effectFilters.join(',')}[${nextLabel}];`;
                lastLabel = `[${nextLabel}]`;
                nextLabel = `tmp${i}_e`;
            }

            // --- 4. Finalização (Reset PTS) ---
            // Garante que o timestamp comece do zero para cada segmento antes da concatenação
            const finalLabel = `v${i}`;
            filterChain += `${lastLabel}setpts=PTS-STARTPTS[${finalLabel}];`;
            streamLabels.push(`[${finalLabel}]`);
        });

        // --- 5. Concatenação ---
        if (streamLabels.length > 0) {
            // unsafe=1 ajuda a evitar falhas se houver pequenos gaps de precisão
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
