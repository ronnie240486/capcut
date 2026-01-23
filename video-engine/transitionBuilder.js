
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let streamLabels = [];
        
        let inputIndexCounter = 0;

        // Filtra clipes visuais e ordena por tempo
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            // Tratamento para texto (sem arquivo) vs midia
            if (!filePath && clip.type !== 'text') return;

            const duration = parseFloat(clip.duration) || 5;

            // --- INPUT LOGIC ---
            if (clip.type === 'image') {
                // Loop de imagem com duração fixa
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); 
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                // Dummy input para texto
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`);
            }

            const currentInputIndex = inputIndexCounter++;
            let currentStream = `[${currentInputIndex}:v]`;
            
            // Função auxiliar para encadear filtros
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `tmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentStream}${filterText}[${nextLabel}];`;
                currentStream = `[${nextLabel}]`;
            };

            // 1. NORMALIZAÇÃO DE ENTRADA (CRÍTICO)
            // Força tudo para 720p ANTES de qualquer coisa. Evita erro auto_scale.
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. CORTE / TRIM
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. EFEITOS DE COR
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. MOVIMENTO (ZOOM/PAN)
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(
                    clip.properties.movement.type, 
                    duration, 
                    clip.type === 'image',
                    clip.properties.movement.config
                );
                
                if (moveFilter) {
                    addFilter(moveFilter);
                    // 5. RE-NORMALIZAÇÃO PÓS-MOVIMENTO (CRÍTICO)
                    // Zoompan pode alterar SAR ou dimensões. Resetamos para garantir compatibilidade com XFADE.
                    addFilter(`scale=1280:720,setsar=1`); 
                }
            } else if (clip.type === 'image') {
                // Imagens estáticas precisam de zoompan estático para virarem vídeo
                addFilter(presetGenerator.getMovementFilter(null, duration, true));
                addFilter(`scale=1280:720,setsar=1`);
            }

            // 6. TEXTO (Overlay simples se necessário)
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            streamLabels.push({
                label: currentStream,
                duration: duration,
                transition: clip.transition
            });
        });

        // --- MIXAGEM (XFADE) ---
        let finalV = '[black_bg]';
        
        if (streamLabels.length > 0) {
            let currentMix = streamLabels[0].label;
            let accumulatedDuration = streamLabels[0].duration;

            for (let i = 1; i < streamLabels.length; i++) {
                const nextClip = streamLabels[i];
                const prevClip = streamLabels[i-1];
                
                // Configuração da transição
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 };
                const transId = presetGenerator.getTransitionXfade(trans.id);
                const transDur = Math.min(trans.duration || 0.5, prevClip.duration / 2, nextClip.duration / 2);
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalV = currentMix;
        } else {
            // Fallback se timeline vazia
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalV = `[${inputIndexCounter}:v]`;
        }

        // --- ÁUDIO (SIMPLES CONCAT) ---
        // Para simplificar e evitar erros de memória, usamos concat simples para áudio nesta versão "safe"
        // Em produção real, usaria amix/adelay, mas concat é mais robusto para MVP
        let audioParts = [];
        let audioFilter = '';
        
        // Criar faixas de silêncio ou áudio para cada clipe visual para manter sincronia
        visualClips.forEach((clip, i) => {
            const hasAudio = clip.type === 'video';
            const lbl = `a_chunk_${i}`;
            
            if (hasAudio) {
                const start = clip.mediaStartOffset || 0;
                audioFilter += `[${i}:a]atrim=start=${start}:duration=${start + clip.duration},asetpts=PTS-STARTPTS[${lbl}];`;
            } else {
                audioFilter += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${clip.duration}[${lbl}];`;
            }
            audioParts.push(`[${lbl}]`);
        });

        if (audioParts.length > 0) {
            audioFilter += `${audioParts.join('')}concat=n=${audioParts.length}:v=0:a=1[outa]`;
            filterChain += audioFilter;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=5[outa]`;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalV,
            outputMapAudio: '[outa]'
        };
    }
};
