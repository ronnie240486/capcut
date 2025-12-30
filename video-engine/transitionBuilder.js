
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
                console.warn(`[Builder] Arquivo faltando: ${clip.fileName}`);
                return;
            }

            inputs.push('-i', filePath);
            const currentInputIndex = inputIndexCounter;
            inputIndexCounter++;

            // Stream inicial deste clipe
            let currentStream = `[${currentInputIndex}:v]`;
            
            // Função utilitária para encadear filtros
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `tmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentStream}${filterText}[${nextLabel}];`;
                currentStream = `[${nextLabel}]`;
            };

            // --- 1. PADRONIZAÇÃO INICIAL ---
            // Escala para 720p, 30fps, formato de pixel compatível
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);

            // Garantir que duração seja número
            const safeDuration = parseFloat(clip.duration) || 5;

            // --- 2. TRIM (Corte de Tempo) ---
            if (clip.type !== 'image') {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                // setpts=PTS-STARTPTS reinicia o relógio do vídeo para 0
                addFilter(`trim=start=${start}:duration=${start + safeDuration},setpts=PTS-STARTPTS`);
            }

            // --- 3. EFEITOS DE COR (Color Grading) ---
            // Aplicamos antes do zoom para garantir que a cor pegue na imagem toda
            let colorFilters = [];
            
            // Filtro Predefinido (Ex: Matrix)
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) colorFilters.push(fx);
            }
            
            // Ajustes Manuais (Brilho, Contraste)
            if (clip.properties && clip.properties.adjustments) {
                const adj = clip.properties.adjustments;
                let eqParts = [];
                // EQ filter syntax: brightness=-1.0 to 1.0, contrast=-2.0 to 2.0, saturation=0.0 to 3.0
                if (adj.brightness !== 1) eqParts.push(`brightness=${(adj.brightness - 1).toFixed(2)}`);
                if (adj.contrast !== 1) eqParts.push(`contrast=${adj.contrast.toFixed(2)}`);
                if (adj.saturate !== 1) eqParts.push(`saturation=${adj.saturate.toFixed(2)}`);
                
                if (eqParts.length > 0) colorFilters.push(`eq=${eqParts.join(':')}`);
                if (adj.hue !== 0) colorFilters.push(`hue=h=${adj.hue}`);
            }

            // Opacidade
            if (clip.properties && clip.properties.opacity !== undefined && clip.properties.opacity < 1) {
                colorFilters.push(`colorchannelmixer=aa=${clip.properties.opacity}`);
            }

            if (colorFilters.length > 0) {
                addFilter(colorFilters.join(','));
            }

            // --- 4. MOVIMENTO (Zoom / Pan) ---
            // Se for imagem, isso GERA o vídeo. Se for vídeo, aplica o zoom dinâmico.
            if (clip.type === 'image') {
                let zoomFilter = presetGenerator.getMovementFilter(null, safeDuration, true); // Static default
                
                if (clip.properties && clip.properties.movement) {
                    zoomFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, true);
                }
                addFilter(zoomFilter);
            } else {
                // Vídeo
                if (clip.properties && clip.properties.movement) {
                    const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, false);
                    if (moveFilter) addFilter(moveFilter);
                }
            }

            // --- 5. PADRONIZAÇÃO FINAL (A CORREÇÃO MÁGICA) ---
            // Adicionamos 'setpts=PTS-STARTPTS' aqui.
            // Isso garante que, independentemente do que o zoompan ou trim fizeram, 
            // este clipe começará no tempo 0 relativo a si mesmo antes de entrar no concat.
            // Sem isso, o concat pode descartar clipes que acha que estão sobrepostos.
            const finalLabel = `v${i}`;
            filterChain += `${currentStream}scale=1280:720,setsar=1,setpts=PTS-STARTPTS[${finalLabel}];`;
            streamLabels.push(`[${finalLabel}]`);
        });

        // --- 6. CONCATENAÇÃO ---
        if (streamLabels.length > 0) {
            // unsafe=1 permite concatenar segmentos que podem ter pequenas variações
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
