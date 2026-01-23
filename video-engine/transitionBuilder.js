
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // Filtra e ordena clipes visuais
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        const audioOverlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) || 
            c.type === 'audio'
        );

        let preparedSegments = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            // Tratamento especial para clipes de texto (sem arquivo)
            if (!filePath && clip.type !== 'text') return;

            const duration = parseFloat(clip.duration) || 5;

            // --- INPUTS ---
            if (clip.type === 'image') {
                // Loop na imagem para garantir duração suficiente para transições
                inputs.push('-loop', '1', '-t', (duration + 3).toString(), '-i', filePath); 
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                // Input dummy transparente para texto
                inputs.push('-f', 'lavfi', '-t', (duration + 3).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`);
            }
            
            const idx = inputIndexCounter++;
            let vStream = `[${idx}:v]`;

            const addV = (f) => {
                if (!f) return;
                const lbl = `v${i}_${Math.random().toString(36).substr(2,4)}`;
                filterChain += `${vStream}${f}[${lbl}];`;
                vStream = `[${lbl}]`;
            };

            // --- 1. NORMALIZAÇÃO CRÍTICA (Corrige o erro auto_scale) ---
            // Força tudo para 1280x720 (720p), 30fps, pixel quadrado (SAR 1), formato yuv420p
            // Isso impede que o FFmpeg tente converter formatos incompatíveis durante o xfade/zoompan
            addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // --- 2. TRIM (Corte Temporal) ---
            if (clip.type === 'image') {
                // Reset PTS para imagem
                addV(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            } else {
                // Para vídeo, corta o trecho desejado
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addV(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            }

            // --- 3. EFEITOS (Cor) ---
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addV(fx);
            }

            // --- 4. MOVIMENTO (Zoom/Pan) ---
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(
                    clip.properties.movement.type, 
                    duration, 
                    clip.type === 'image',
                    clip.properties.movement.config
                );
                // Após o zoompan, forçamos novamente a escala e SAR, pois o zoompan pode alterar o SAR
                if (moveFilter) {
                    addV(moveFilter);
                    addV(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1`);
                }
            }

            // --- 5. TEXTO (Overlay Simples) ---
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                // Usando drawtext básico do FFmpeg para garantir compatibilidade
                addV(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }
            
            // --- 6. FORMATAÇÃO FINAL ANTES DO MIX ---
            addV(`setsar=1`);

            preparedSegments.push({
                label: vStream,
                duration: duration,
                transition: clip.transition
            });
        });

        // --- MIXAGEM DE VÍDEO (XFADE) ---
        let finalV = '[black_bg]';
        
        if (preparedSegments.length > 0) {
             let currentStream = preparedSegments[0].label;
             let accumulatedOffset = preparedSegments[0].duration;

             for (let i = 1; i < preparedSegments.length; i++) {
                 const nextSeg = preparedSegments[i];
                 const prevSeg = preparedSegments[i-1];
                 
                 // Transição padrão: fade de 0.5s se não especificado
                 const trans = prevSeg.transition || { id: 'fade', duration: 0.5 };
                 const transId = presetGenerator.getTransitionXfade(trans.id);
                 // Limita duração da transição para não exceder metade do clipe
                 const transDur = Math.min(trans.duration || 0.5, prevSeg.duration / 2, nextSeg.duration / 2);
                 
                 const offset = accumulatedOffset - transDur;
                 const outLabel = `mix_${i}`;
                 
                 filterChain += `${currentStream}${nextSeg.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${outLabel}];`;
                 
                 currentStream = `[${outLabel}]`;
                 accumulatedOffset = offset + transDur + (nextSeg.duration - transDur);
             }
             finalV = currentStream;
        } else {
             // Fallback se não houver clipes
             inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
             inputIndexCounter++;
             finalV = `[${inputIndexCounter-1}:v]`;
        }

        // --- ÁUDIO PRINCIPAL ---
        let audioStreamLabels = [];
        visualClips.forEach((clip, i) => {
            const hasAudio = clip.type === 'video'; 
            if(hasAudio) {
                 const start = parseFloat(clip.mediaStartOffset) || 0;
                 const duration = parseFloat(clip.duration);
                 const albl = `aud_${i}`;
                 // Mapeia áudio do vídeo original
                 filterChain += `[${i}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${albl}];`;
                 audioStreamLabels.push(`[${albl}]`);
            } else {
                 // Gera silêncio para imagens/texto para manter sincronia
                 const albl = `aud_silent_${i}`;
                 const duration = parseFloat(clip.duration);
                 filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${albl}];`;
                 audioStreamLabels.push(`[${albl}]`);
            }
        });

        let finalA = '[base_a]';
        if (audioStreamLabels.length > 0) {
            filterChain += `${audioStreamLabels.join('')}concat=n=${audioStreamLabels.length}:v=0:a=1[base_a];`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=1[base_a];`;
        }

        // --- ÁUDIO OVERLAY (Música/Voz) ---
        let audioOverlays = [];
        audioOverlayClips.forEach((clip, i) => {
             const filePath = fileMap[clip.fileName];
             if(!filePath) return;
             inputs.push('-i', filePath); 
             const idx = inputIndexCounter++; 
             
             const start = parseFloat(clip.start);
             const duration = parseFloat(clip.duration);
             const lbl = `overlay_aud_${i}`;
             // Delay em milissegundos
             const delay = Math.round(start * 1000);
             
             filterChain += `[${idx}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${clip.properties?.volume || 1},adelay=${delay}|${delay}[${lbl}];`;
             audioOverlays.push(`[${lbl}]`);
        });

        let outputAudioMap = finalA;
        if(audioOverlays.length > 0) {
            // Mixa áudio base com overlays
            const allAudios = `${finalA}${audioOverlays.join('')}`;
            // dropout_transition=0 evita queda de volume nas transições
            filterChain += `${allAudios}amix=inputs=${audioOverlays.length + 1}:duration=first:dropout_transition=0:weights=1${' 1'.repeat(audioOverlays.length)}[final_a_mix]`;
            outputAudioMap = '[final_a_mix]';
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalV,
            outputMapAudio: outputAudioMap
        };
    }
};
