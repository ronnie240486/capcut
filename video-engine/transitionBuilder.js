
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // 1. Separar Clipes Visuais (Formam a espinha dorsal da timeline)
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        // 2. Separar Clipes de Áudio Independentes (Overlays)
        const audioClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada'].includes(c.track))
        );

        // --- PROCESSAMENTO VISUAL & ÁUDIO BASE ---
        let visualStreamLabels = [];
        let baseAudioSegments = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            // Tratamento para texto (sem arquivo) vs midia
            if (!filePath && clip.type !== 'text') return;

            const duration = parseFloat(clip.duration) || 5;

            // Input Logic
            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); 
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`);
            }

            const currentInputIndex = inputIndexCounter++;
            let currentV = `[${currentInputIndex}:v]`;
            
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentV}${filterText}[${nextLabel}];`;
                currentV = `[${nextLabel}]`;
            };

            // --- VIDEO PIPELINE ---
            // 1. Normalização Inicial
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. Trim (Vídeo)
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. Efeitos
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. Movimento
            let moveFilter = null;
            if (clip.properties && clip.properties.movement) {
                moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
            } else if (clip.type === 'image') {
                moveFilter = presetGenerator.getMovementFilter(null, duration, true);
            }

            if (moveFilter) {
                addFilter(moveFilter);
                addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1`);
            }

            // 5. Texto
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            // 6. Formato Final para XFade
            addFilter(presetGenerator.getFinalVideoFilter().replace(',fps=30', '')); 

            visualStreamLabels.push({
                label: currentV,
                duration: duration,
                transition: clip.transition
            });

            // --- ÁUDIO BASE (Sincronizado com Vídeo) ---
            const mediaInfo = mediaLibrary[clip.fileName];
            const albl = `a_base_${i}`;
            
            // Se for vídeo e tiver áudio, usamos o áudio original. Caso contrário, geramos silêncio.
            // Isso garante que a faixa de áudio base tenha exatamente o mesmo comprimento da faixa de vídeo.
            if (clip.type === 'video' && mediaInfo?.hasAudio) {
                const start = clip.mediaStartOffset || 0;
                // atrim sincronizado com o vídeo
                filterChain += `[${currentInputIndex}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${albl}];`;
            } else {
                // Silêncio
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${albl}];`;
            }
            baseAudioSegments.push(`[${albl}]`);
        });

        // --- MIXAGEM DE VÍDEO (XFADE / CONCAT) ---
        let finalV = '[black_bg]';
        
        if (visualStreamLabels.length > 0) {
            let currentMix = visualStreamLabels[0].label;
            let accumulatedDuration = visualStreamLabels[0].duration;

            for (let i = 1; i < visualStreamLabels.length; i++) {
                const nextClip = visualStreamLabels[i];
                const prevClip = visualStreamLabels[i-1];
                
                // Se houver transição, usamos xfade. Se não, usamos xfade rápido (corte suave) ou concat se implementado.
                // Aqui usamos xfade sempre para simplicidade da pipeline.
                const trans = prevClip.transition || { id: 'fade', duration: 0.1 }; 
                const transId = presetGenerator.getTransitionXfade(trans.id);
                // Clamp duration para segurança
                const transDur = Math.min(trans.duration || 0.1, prevClip.duration / 2, nextClip.duration / 2);
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalV = currentMix;
        } else {
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalV = `[${inputIndexCounter++}:v]`;
        }

        // --- CONCATENAÇÃO DO ÁUDIO BASE ---
        let baseAudioLabel = '[base_audio_concat]';
        if (baseAudioSegments.length > 0) {
            // Concatena todos os segmentos (áudio do vídeo + silêncio das imagens)
            filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1${baseAudioLabel};`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=0.1${baseAudioLabel};`;
        }

        // --- ÁUDIOS OVERLAY (Música, Narração, SFX) ---
        let overlayLabels = [];
        
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `aud_ov_${i}`;
            
            const start = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delay = Math.round(clip.start * 1000); // adelay usa milissegundos
            
            // Pipeline: Trim -> Volume -> Delay (Posicionamento)
            // asetpts=PTS-STARTPTS reseta o tempo interno antes do delay
            filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[${lbl}];`;
            
            overlayLabels.push(`[${lbl}]`);
        });

        // --- MIXAGEM FINAL DE ÁUDIO ---
        let finalA = '[final_audio_out]';
        
        if (overlayLabels.length > 0) {
            // Mistura o áudio base (vídeos) com os overlays (música/efeitos)
            // inputs = 1 (base) + N (overlays)
            // duration=first: Garante que o áudio não exceda a duração do vídeo principal (base)
            // dropout_transition=0: Evita fades automáticos estranhos
            // normalize=0: Evita que o volume caia drasticamente ao somar faixas
            filterChain += `${baseAudioLabel}${overlayLabels.join('')}amix=inputs=${overlayLabels.length + 1}:duration=first:dropout_transition=0:normalize=0[mixed_a];`;
            
            // Garantir formato seguro
            filterChain += `[mixed_a]aformat=sample_rates=44100:channel_layouts=stereo${finalA}`;
        } else {
            finalA = baseAudioLabel;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalV,
            outputMapAudio: finalA
        };
    }
};
