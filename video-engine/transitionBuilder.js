
const presetGenerator = require('./presetGenerator');

module.exports = {
    /**
     * Constrói a timeline baseada em clipes.
     * Corrige problemas de duração de imagens e aplicação de efeitos.
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

            // Labels temporários para construir a cadeia
            let lastLabel = `[${currentInputIndex}:v]`;
            let nextLabel = `tmp${i}_a`; 

            // --- 1. Normalização Inicial (Scale / Pad / Format) ---
            // Padroniza tudo para 1280x720 antes de qualquer coisa para evitar erro no Concat
            filterChain += `${lastLabel}scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[${nextLabel}];`;
            lastLabel = `[${nextLabel}]`;
            nextLabel = `tmp${i}_b`;

            // --- 2. Duração e Movimento (ZoomPan) ---
            const durationFrames = Math.ceil(clip.duration * 30); // 30fps fixo
            
            if (clip.type === 'image') {
                // Imagens PRECISAM do zoompan (ou loop) para criar duração
                let zoomFilter = `zoompan=z=1:d=${durationFrames}:s=1280x720:fps=30`; // Estático por padrão

                if (clip.properties && clip.properties.movement) {
                    zoomFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, durationFrames);
                } else {
                    // Se não tem movimento explícito, mantém estático
                    // Importante: movementId 'none' ou undefined cai aqui
                    zoomFilter = `zoompan=z=1:d=${durationFrames}:s=1280x720:fps=30`;
                }
                
                filterChain += `${lastLabel}${zoomFilter}[${nextLabel}];`;
                lastLabel = `[${nextLabel}]`;
                nextLabel = `tmp${i}_c`;
            } else {
                // Vídeo: Aplica Trim
                const start = clip.mediaStartOffset || 0;
                // Para vídeos, o zoompan é opcional e complexo (pode quebrar frame rate), 
                // então aplicamos apenas se houver movimento explícito tipo Ken Burns, 
                // caso contrário apenas Trim.
                filterChain += `${lastLabel}trim=start=${start}:duration=${start + clip.duration},setpts=PTS-STARTPTS[${nextLabel}];`;
                lastLabel = `[${nextLabel}]`;
                nextLabel = `tmp${i}_d`;
                
                // TODO: Adicionar suporte a ZoomPan em vídeo se necessário, 
                // mas requer cuidado para não alterar a duração do vídeo original.
            }

            // --- 3. Efeitos Visuais (Cor / Brilho / Filtros) ---
            const effectFilters = [];
            
            // Filtro de Preset (ex: sepia, bw)
            if (clip.effect) {
                const fxFilter = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fxFilter) effectFilters.push(fxFilter);
            }

            // Ajustes Manuais
            if (clip.properties && clip.properties.adjustments) {
                const adj = clip.properties.adjustments;
                const eqParts = [];
                // FFmpeg brightness: -1.0 a 1.0 (0 é neutro). Frontend envia 0 a 2 (1 é neutro).
                if (adj.brightness !== undefined && adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                if (adj.contrast !== undefined && adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                if (adj.saturate !== undefined && adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                
                if (eqParts.length > 0) effectFilters.push(`eq=${eqParts.join(':')}`);
                if (adj.hue !== undefined && adj.hue !== 0) effectFilters.push(`hue=h=${adj.hue}`);
            }

            // Opacidade
            if (clip.properties && clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                effectFilters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            if (effectFilters.length > 0) {
                filterChain += `${lastLabel}${effectFilters.join(',')}[${nextLabel}];`;
                lastLabel = `[${nextLabel}]`;
                nextLabel = `tmp${i}_e`;
            }

            // --- 4. Finalização do Clipe (Reset PTS) ---
            // Essencial para o Concat funcionar corretamente
            const finalLabel = `v${i}`;
            filterChain += `${lastLabel}setpts=PTS-STARTPTS[${finalLabel}];`;
            streamLabels.push(`[${finalLabel}]`);
        });

        // --- 5. Concatenação ---
        if (streamLabels.length > 0) {
            // unsafe=1 permite concatenar segmentos que podem ter pequenas variações, mas nossa normalização deve prevenir isso
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
