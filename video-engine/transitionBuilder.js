
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
        // Estes não fazem parte da concatenação visual, são mixados por cima
        const overlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada'].includes(c.track))
        );

        // --- PIPELINE VISUAL & ÁUDIO BASE ---
        let visualStreamLabels = [];
        let baseAudioSegments = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            // Texto não tem arquivo, tratamos diferente
            if (!filePath && clip.type !== 'text') return;

            // Duração segura
            const duration = Math.max(0.5, parseFloat(clip.duration) || 5);

            // --- INPUT ---
            if (clip.type === 'image') {
                // Loop de imagem com margem de segurança
                inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); 
            } else if (clip.type === 'video') {
                inputs.push('-i', filePath);
            } else if (clip.type === 'text') {
                // Input dummy para texto
                inputs.push('-f', 'lavfi', '-t', (duration + 2).toString(), '-i', `color=c=black@0.0:s=1280x720:r=30`);
            }

            const idx = inputIndexCounter++;
            let currentV = `[${idx}:v]`;
            
            // Função para encadear filtros de vídeo
            const addFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentV}${filterText}[${nextLabel}];`;
                currentV = `[${nextLabel}]`;
            };

            // 1. NORMALIZAÇÃO DE ENTRADA (CRÍTICO PARA EVITAR CRASH)
            // Força tudo para 1280x720, 30fps, YUV420P agora mesmo.
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. TRIM (Corte no tempo correto)
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. EFEITOS VISUAIS
            if (clip.effect) {
                const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                if (fx) addFilter(fx);
            }
            
            // 4. MOVIMENTO (ZOOM/PAN)
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, duration, clip.type === 'image', clip.properties.movement.config);
                if (moveFilter) addFilter(moveFilter);
            } else if (clip.type === 'image') {
                // Movimento padrão para imagens estáticas
                const staticMove = presetGenerator.getMovementFilter(null, duration, true);
                addFilter(staticMove);
            }

            // 5. TEXTO OVERLAY
            if (clip.type === 'text' && clip.properties.text) {
                const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
                const color = clip.properties.textDesign?.color || 'white';
                // Usar fonte padrão simples para evitar erro de path de fonte
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`);
            }

            // 6. RE-NORMALIZAÇÃO PRÉ-MIX (A CURA DO BUG AUTO_SCALE)
            // ZoomPan às vezes altera o SAR ou arredonda pixels errados. Forçamos de novo 1280x720.
            addFilter(`scale=1280:720,setsar=1`);

            visualStreamLabels.push({
                label: currentV,
                duration: duration,
                transition: clip.transition
            });

            // --- ÁUDIO DA FAIXA BASE ---
            // Cria um segmento de áudio para cada clipe visual.
            // Se o vídeo tem som, usa. Se é imagem ou vídeo mudo, gera silêncio.
            const mediaInfo = mediaLibrary[clip.fileName];
            const audioLabel = `a_base_${i}`;
            
            if (clip.type === 'video' && mediaInfo?.hasAudio) {
                const start = clip.mediaStartOffset || 0;
                // Extrai áudio, corta e reseta timestamp
                filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS[${audioLabel}];`;
            } else {
                // Gera silêncio exato
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
            }
            baseAudioSegments.push(`[${audioLabel}]`);
        });

        // --- PROCESSAMENTO VISUAL (XFADE) ---
        let finalVideo = '[black_bg]';
        
        if (visualStreamLabels.length > 0) {
            let currentMix = visualStreamLabels[0].label;
            let accumulatedDuration = visualStreamLabels[0].duration;

            for (let i = 1; i < visualStreamLabels.length; i++) {
                const nextClip = visualStreamLabels[i];
                const prevClip = visualStreamLabels[i-1];
                
                // Transição
                const trans = prevClip.transition || { id: 'fade', duration: 0.1 }; 
                const transId = presetGenerator.getTransitionXfade(trans.id);
                // Duração segura (máximo metade do menor clipe)
                const transDur = Math.min(trans.duration || 0.1, prevClip.duration / 2.1, nextClip.duration / 2.1);
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                // Ajusta duração acumulada considerando a sobreposição do xfade
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalVideo = currentMix;
        } else {
            // Fallback se não houver vídeo
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalVideo = `[${inputIndexCounter++}:v]`;
        }

        // --- CONCATENAÇÃO ÁUDIO BASE ---
        let baseAudio = '[base_audio_combined]';
        if (baseAudioSegments.length > 0) {
            // Concatena todos os segmentos síncronos
            filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1${baseAudio};`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=0.1${baseAudio};`;
        }

        // --- PROCESSAMENTO DE ÁUDIO OVERLAY (Música/SFX) ---
        let audioMixInputs = [baseAudio]; // Começa com o áudio base
        
        overlayClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const startTrim = clip.mediaStartOffset || 0;
            const volume = clip.properties.volume !== undefined ? clip.properties.volume : 1;
            // Delay em milissegundos
            const delay = Math.max(0, Math.round(clip.start * 1000));
            
            // Pipeline SFX: Trim -> Volume -> Delay
            // aformat=sample_rates=44100 garante compatibilidade
            filterChain += `[${idx}:a]atrim=start=${startTrim}:duration=${startTrim + clip.duration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay},aformat=sample_rates=44100:channel_layouts=stereo[${lbl}];`;
            
            audioMixInputs.push(`[${lbl}]`);
        });

        // --- MIXAGEM FINAL DE ÁUDIO ---
        let finalAudio = '[final_audio_out]';
        
        if (audioMixInputs.length > 1) {
            // Mistura base + overlays
            // duration=first: O áudio acaba quando o vídeo acaba (baseAudio é o primeiro)
            // dropout_transition=0: Evita fades estranhos
            // normalize=0: Evita redução de volume
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
