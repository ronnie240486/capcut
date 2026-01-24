
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // 1. Separar Clipes Visuais (Base da Timeline)
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        // 2. Separar Áudios de Overlay (Música, SFX)
        const overlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada'].includes(c.track))
        );

        let visualStreamLabels = [];
        let baseAudioSegments = [];

        // --- PROCESSAMENTO INICIAL DOS CLIPES ---
        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            // Texto não tem arquivo, tratamos diferente
            if (!filePath && clip.type !== 'text') return;

            // Duração segura (mínimo 1s para permitir transições)
            const duration = Math.max(1.0, parseFloat(clip.duration) || 5);

            // --- INPUT ---
            if (clip.type === 'image') {
                inputs.push('-loop', '1', '-t', (duration + 3).toString(), '-i', filePath); 
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                inputs.push('-f', 'lavfi', '-t', (duration + 3).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`);
            }

            const idx = inputIndexCounter++;
            let currentV = `[${idx}:v]`;
            
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentV}${filterText}[${nextLabel}];`;
                currentV = `[${nextLabel}]`;
            };

            // 1. NORMALIZAÇÃO DE VÍDEO
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. TRIM VÍDEO
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. EFEITOS
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. MOVIMENTO
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                if (moveFilter) addFilter(moveFilter);
            } else if (clip.type === 'image') {
                const staticMove = presetGenerator.getMovementFilter(null, duration, true);
                addFilter(staticMove);
            }

            // 5. TEXTO
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2`);
            }

            // 6. SAFE OUTPUT SCALE
            addFilter(`scale=1280:720,setsar=1`);

            visualStreamLabels.push({
                label: currentV,
                duration: duration,
                transition: clip.transition
            });

            // --- ÁUDIO DA FAIXA BASE (SICRONIZADO) ---
            const mediaInfo = mediaLibrary[clip.fileName];
            const audioLabel = `a_base_${i}`;
            
            if (clip.type === 'video' && mediaInfo?.hasAudio) {
                const start = clip.mediaStartOffset || 0;
                // Importante: aformat garante que todos os áudios tenham o mesmo formato para o acrossfade funcionar
                filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[${audioLabel}];`;
            } else {
                // Silêncio deve ter o mesmo formato
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
            }
            baseAudioSegments.push(`[${audioLabel}]`);
        });

        // --- MIXAGEM DE VÍDEO E ÁUDIO (XFADE + ACROSSFADE) ---
        let finalVideo = '[black_bg]';
        let finalAudioBase = null;
        
        if (visualStreamLabels.length > 0) {
            let currentMix = visualStreamLabels[0].label;
            let currentAudioMix = baseAudioSegments[0]; // Áudio correspondente ao primeiro clipe

            let accumulatedDuration = visualStreamLabels[0].duration;

            for (let i = 1; i < visualStreamLabels.length; i++) {
                const nextClip = visualStreamLabels[i];
                const prevClip = visualStreamLabels[i-1];
                const nextAudioLabel = baseAudioSegments[i]; // Áudio do próximo clipe
                
                // Configuração da Transição
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 }; 
                const transId = presetGenerator.getTransitionXfade(trans.id);
                
                // Duração Segura
                const maxTransDur = Math.min(prevClip.duration, nextClip.duration) / 2.1;
                const transDur = Math.min(trans.duration || 0.5, maxTransDur, 1.5); 
                
                const offset = accumulatedDuration - transDur;
                
                // 1. Transição de Vídeo (XFADE)
                const nextLabel = `mix_${i}`;
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                currentMix = `[${nextLabel}]`;
                
                // 2. Transição de Áudio (ACROSSFADE) - Sincronizada com o vídeo
                // acrossfade mistura o final do audio1 com o inicio do audio2, reduzindo a duração total exatamente como o xfade
                const nextAudioMixLabel = `amix_${i}`;
                filterChain += `${currentAudioMix}${nextAudioLabel}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextAudioMixLabel}];`;
                currentAudioMix = `[${nextAudioMixLabel}]`;

                // Atualiza duração acumulada (igual para áudio e vídeo)
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            
            finalVideo = currentMix;
            finalAudioBase = currentAudioMix;
        } else {
            // Fallback caso não haja clipes
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalVideo = `[${inputIndexCounter++}:v]`;
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=5[asilence];`;
            finalAudioBase = `[asilence]`;
        }

        // --- PROCESSAMENTO DE ÁUDIO OVERLAY (Música/SFX) ---
        let audioMixInputs = [finalAudioBase]; // Começa com o áudio base processado
        
        overlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            const delay = Math.max(0, Math.round(clip.start * 1000));
            
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay},aformat=sample_rates=44100:channel_layouts=stereo[${lbl}];`;
            
            audioMixInputs.push(`[${lbl}]`);
        });

        // --- MIXAGEM FINAL ---
        let finalAudio = '[final_audio_out]';
        
        if (audioMixInputs.length > 1) {
            // duration=first: Garante que o áudio não ultrapasse o vídeo (baseado na faixa principal)
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0${finalAudio}`;
        } else {
            finalAudio = finalAudioBase;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalVideo,
            outputMapAudio: finalAudio
        };
    }
};
