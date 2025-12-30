
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

            const safeDuration = parseFloat(clip.duration) || 5;

            // --- 1. PREPARAÇÃO & DURAÇÃO (CORREÇÃO CRÍTICA) ---
            let prepFilters = [];
            
            // Transforma imagem estática em vídeo infinito IMEDIATAMENTE
            // Isso garante que o FFmpeg tenha "frames" suficientes para aplicar efeitos de tempo e movimento
            if (clip.type === 'image') {
                prepFilters.push('loop=loop=-1:size=1:start=0');
            }
            
            // Padronização de escala, fps e formato
            prepFilters.push(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);
            
            addFilter(prepFilters.join(','));

            // Definir a duração exata usando TRIM
            if (clip.type === 'image') {
                // Corta o loop infinito na duração exata definida na timeline
                // setpts=PTS-STARTPTS reinicia o relógio do clipe para 0
                addFilter(`trim=duration=${safeDuration},setpts=PTS-STARTPTS`);
            } else {
                // Para vídeos, corta o segmento desejado
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addFilter(`trim=start=${start}:duration=${start + safeDuration},setpts=PTS-STARTPTS`);
            }

            // --- 2. EFEITOS DE COR ---
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
                addFilter(colorFilters.join(','));
            }

            // --- 3. MOVIMENTO (Zoom / Pan) ---
            // Como agora já convertemos imagens em vídeo (via loop+trim),
            // tratamos tudo como vídeo (isImage=false) para o presetGenerator.
            // Isso fará o zoompan calcular frame a frame (d=1) de forma suave.
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, false);
                if (moveFilter) addFilter(moveFilter);
            }

            // --- 4. FINALIZAÇÃO ---
            const finalLabel = `v${i}`;
            // Garantimos que o stream esteja limpo para concatenação
            filterChain += `${currentStream}scale=1280:720,setsar=1,setpts=PTS-STARTPTS[${finalLabel}];`;
            streamLabels.push(`[${finalLabel}]`);
        });

        // --- 5. CONCATENAÇÃO ---
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
