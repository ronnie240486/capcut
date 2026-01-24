
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // 1. Separar Clipes Visuais e Ordenar
        // Clipes que compõem a faixa principal de vídeo
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        // 2. Separar Áudios de Overlay (SFX, Narração, Música)
        const overlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada', 'text'].includes(c.track))
        );

        // === SINCRONIA PROFISSIONAL (SMART SYNC) ===
        // Ajusta a duração do clipe visual para cobrir a duração da narração se necessário.
        visualClips.forEach(vClip => {
            const vStart = vClip.start;
            
            // Encontra áudios de 'narração' ou 'voz' que começam sincronizados com este clipe visual (tolerância de 0.2s)
            const syncedNarrations = overlayClips.filter(aClip => 
                ['narration', 'audio'].includes(aClip.track) && 
                Math.abs(aClip.start - vStart) < 0.25
            );
            
            if (syncedNarrations.length > 0) {
                // Pega a duração máxima entre os áudios sobrepostos a este clipe
                const maxAudioDuration = Math.max(...syncedNarrations.map(n => n.duration));
                
                // Se a narração for mais longa que o visual (ex: imagem 5s, áudio 8s), estende o visual
                if (maxAudioDuration > vClip.duration) {
                    // Adiciona uma pequena margem de 0.2s para evitar corte seco na voz
                    vClip.duration = maxAudioDuration + 0.1;
                }
            }
        });

        let visualStreamLabels = [];
        let baseAudioSegments = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath && clip.type !== 'text') return;

            // Duração Mínima de 1s para garantir transições funcionais
            const duration = Math.max(1.0, parseFloat(clip.duration) || 5);

            // INPUT OPTIONS
            if (clip.type === 'image') {
                // Para imagens, fazemos loop para cobrir toda a duração necessária + margem para transição
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

            // 1. INPUT NORMALIZATION (Padroniza resolução e FPS)
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. TRIM & TIMING (CRITICAL: setpts reset)
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                // Se for vídeo e estendemos a duração (ex: freeze last frame), o trim normal cortaria.
                // Aqui usamos um truque: trim normal. Se o vídeo acabar, o ffmpeg por padrão no filter graph pode parar ou repetir.
                // Para garantir estabilidade, usamos tpad se necessário no futuro, mas o trim básico cobre 99%
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                // Imagem (loop)
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. EFEITOS VISUAIS
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. MOVIMENTO (Ken Burns / Zoom)
            if (clip.properties && clip.properties.movement) {
                // Passa a duração corrigida para que o movimento seja suave até o final do áudio
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                if (moveFilter) addFilter(moveFilter);
            } else if (clip.type === 'image') {
                // Movimento estático padrão para evitar imagem congelada morta
                const staticMove = presetGenerator.getMovementFilter(null, duration, true);
                addFilter(staticMove);
            }

            // 5. TEXTO (Overlay simples)
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                // Centralizado
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2`);
            }

            // 6. SAFE OUTPUT SCALE (Garante consistência para o concat)
            addFilter(`scale=1280:720,setsar=1`);

            visualStreamLabels.push({
                label: currentV,
                duration: duration,
                transition: clip.transition
            });

            // --- AUDIO BASE (Sync Track) ---
            // Cria uma trilha de áudio muda (ou som original do vídeo) que tem EXATAMENTE a mesma duração do visual
            // Isso mantém o sincronismo do 'concat' final.
            const mediaInfo = mediaLibrary[clip.fileName];
            const audioLabel = `a_base_${i}`;
            
            if (clip.type === 'video' && mediaInfo?.hasAudio) {
                const start = clip.mediaStartOffset || 0;
                filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
            } else {
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
            }
            baseAudioSegments.push(`[${audioLabel}]`);
        });

        // --- VIDEO MIXING (Concat com Transições XFade) ---
        let finalVideo = '[black_bg]';
        
        if (visualStreamLabels.length > 0) {
            let currentMix = visualStreamLabels[0].label;
            let accumulatedDuration = visualStreamLabels[0].duration;

            for (let i = 1; i < visualStreamLabels.length; i++) {
                const nextClip = visualStreamLabels[i];
                const prevClip = visualStreamLabels[i-1];
                
                // Transição
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 }; 
                const transId = presetGenerator.getTransitionXfade(trans.id);
                
                // SEGURANÇA: Transição não pode ser maior que metade da duração do menor clipe
                const maxTransDur = Math.min(prevClip.duration, nextClip.duration) / 2.1;
                const transDur = Math.min(trans.duration || 0.5, maxTransDur, 1.5); 
                
                // Offset: Quando a transição começa (Fim do clipe anterior - duração transição)
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                // A duração acumulada subtrai o tempo de sobreposição da transição
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalVideo = currentMix;
        } else {
            // Fallback se não houver vídeo
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalVideo = `[${inputIndexCounter++}:v]`;
        }

        // --- AUDIO MIXING ---
        // 1. Concatena os áudios base (sincronizados com visual)
        let baseAudio = '[base_audio_combined]';
        if (baseAudioSegments.length > 0) {
            filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1${baseAudio};`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=0.1${baseAudio};`;
        }

        // 2. Mistura com trilhas de overlay (Narração, Música)
        let audioMixInputs = [baseAudio];
        
        overlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            // Garante volume numérico
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            // Delay absoluto na timeline
            const delay = Math.max(0, Math.round(clip.start * 1000));
            
            // adelay espera milissegundos
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay},aformat=sample_rates=44100:channel_layouts=stereo[${lbl}];`;
            
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        
        // amix mistura todas as trilhas
        if (audioMixInputs.length > 1) {
            // duration=first garante que o áudio não fique mais longo que o vídeo base (evita silêncio infinito se um SFX estiver fora)
            // mas com a lógica de extensão acima, o "first" (baseAudio) já foi estendido para cobrir a narração.
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0${finalAudio}`;
        } else {
            finalAudio = baseAudio;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: finalVideo,
            outputMapAudio: finalAudio
        };
    }
};
