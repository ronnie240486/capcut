
const presetGenerator = require('./presetGenerator.js');

// Mapeamento completo das transições do Frontend para XFADE do FFmpeg
const TRANSITION_MAP = {
    // Básico & Fades
    'crossfade': 'fade',
    'mix': 'dissolve',
    'fade-classic': 'fade',
    'black': 'fadeblack',
    'flash-black': 'fadeblack', // Aproximação para Black Flash
    'white': 'fadewhite',
    'flash-white': 'fadewhite', // Aproximação para Flash
    'flash-bang': 'fadewhite',
    'luma-fade': 'luma',
    
    // Fumaça & Orgânico (Aproximações Visuais)
    'black-smoke': 'fadeblack', // Simula a escuridão da fumaça
    'white-smoke': 'fadewhite',
    'blood-mist': 'radial', // Vermelho seria ideal, mas radial simula a expansão
    'smoke-reveal': 'dissolve',
    'ink-splash': 'pixelize',
    'liquid-melt': 'wipetl', 
    'oil-paint': 'dissolve',
    'water-ripple': 'ripple',
    'bubble-pop': 'circleopen',
    'dreamy-zoom': 'circleopen',

    // Wipes & Geometria
    'wipe-left': 'wipeleft',
    'wipe-right': 'wiperight',
    'wipe-up': 'wipeup',
    'wipe-down': 'wipedown',
    'circle-open': 'circleopen',
    'circle-close': 'circleclose',
    'clock-wipe': 'clock',
    'wipe-radial': 'clock',
    'diamond-in': 'diamond',
    'diamond-out': 'diamond', // Invert not supported natively easily, using diamond
    'iris-in': 'iris',
    'iris-out': 'iris', // FFmpeg iris usually opens
    'checker-wipe': 'checkerboard',
    'checkerboard': 'checkerboard',
    'rect-crop': 'rectcrop',
    'plus-wipe': 'fade', // Plus not standard in all builds, fallback to fade
    'barn-door-h': 'hlslice', // Horizontal split
    'barn-door-v': 'vslice', // Vertical split
    'shutters': 'hlslice',
    'blinds-h': 'horzopen',
    'blinds-v': 'vertopen',
    'stripes-h': 'horzclose',
    'stripes-v': 'vertclose',
    'heart-wipe': 'fade', // Shape wipes require SVG in FFmpeg, fallback to fade
    'triangle-wipe': 'wipetl',

    // Slides & Push
    'slide-left': 'slideleft',
    'slide-right': 'slideright',
    'slide-up': 'slideup',
    'slide-down': 'slidedown',
    'push-left': 'slideleft',
    'push-right': 'slideright',
    'squeeze-h': 'squeezeh',
    'squeeze-v': 'squeezev',

    // Glitch & Cyber
    'glitch': 'pixelize', // Aproximação
    'pixel-sort': 'dissolve',
    'rgb-split': 'rgbscanline', // Se disponível, senão pixelize
    'hologram': 'pixelize',
    'pixelize': 'pixelize',
    'glitch-memories': 'hblur',
    'cyber-zoom': 'circleopen',
    'scan-line': 'wipedown',
    'datamosh': 'hblur',

    // Zoom & Warp
    'zoom-in': 'circleopen',
    'zoom-out': 'circleclose',
    'warp-speed': 'radial',
    'swirl': 'spiral',
    'kaleidoscope': 'spiral',
    'morph': 'dissolve',
    'blur-warp': 'hblur',
    'turbulence': 'wipetl',
    
    // 3D & Flip
    'cube-rotate-l': 'fade', // 3D transforms hard in simple xfade
    'flip-card': 'fade',
    'door-open': 'hblur',
    'page-turn': 'wipetl', // Page peel simulation
    'paper-rip': 'slideleft'
};

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary, audioPresenceMap) => {
        let inputs = [];
        let filterChain = '';
        
        // Listas para guardar os labels dos streams preparados [v0],[a0], [v1],[a1]...
        let preparedVideoStreams = [];
        let preparedAudioStreams = [];
        
        let inputIndexCounter = 0;

        // --- 1. PREPARAÇÃO DOS CLIPES (Escala, Trim, Efeitos, Movimento) ---
        clips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            
            if (!filePath) {
                console.warn(`[Builder] Arquivo faltando: ${clip.fileName}`);
                return;
            }

            inputs.push('-i', filePath);
            const currentInputIndex = inputIndexCounter;
            inputIndexCounter++;

            // === PROCESSAMENTO DE VÍDEO ===
            let currentVideoStream = `[${currentInputIndex}:v]`;
            
            const addVideoFilter = (filterText) => {
                if (!filterText) return;
                const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                filterChain += `${currentVideoStream}${filterText}[${nextLabel}];`;
                currentVideoStream = `[${nextLabel}]`;
            };

            const safeDuration = parseFloat(clip.duration) || 5;

            // 1.1 Padronização (Scale, FPS, SAR)
            let prepFilters = [];
            if (clip.type === 'image') {
                prepFilters.push('loop=loop=-1:size=1:start=0');
            }
            // Importante: settb e setpts para garantir timestamp correto para xfade
            prepFilters.push(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`);
            addVideoFilter(prepFilters.join(','));

            // 1.2 Corte (Trim)
            if (clip.type === 'image') {
                addVideoFilter(`trim=duration=${safeDuration},setpts=PTS-STARTPTS`);
            } else {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                addVideoFilter(`trim=start=${start}:duration=${start + safeDuration},setpts=PTS-STARTPTS`);
            }

            // 1.3 Efeitos Visuais (Cor, Brilho, Filtros)
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
                addVideoFilter(colorFilters.join(','));
            }

            // 1.4 Movimento (Ken Burns, Pan, Zoom)
            if (clip.properties && clip.properties.movement) {
                const moveFilter = presetGenerator.getMovementFilter(clip.properties.movement.type, safeDuration, false);
                if (moveFilter) addVideoFilter(moveFilter);
            }

            // Label final deste clipe de vídeo preparado
            const finalVideoLabel = `v_prep_${i}`;
            // Reforçar o SAR e PTS antes do xfade é crucial
            filterChain += `${currentVideoStream}setsar=1,setpts=PTS-STARTPTS[${finalVideoLabel}];`;
            preparedVideoStreams.push(`[${finalVideoLabel}]`);


            // === PROCESSAMENTO DE ÁUDIO ===
            const mediaInfo = mediaLibrary && mediaLibrary[clip.fileName];
            let hasAudio = false;
            
            if (clip.type === 'image') {
                hasAudio = false;
            } else if (audioPresenceMap && typeof audioPresenceMap[clip.fileName] === 'boolean') {
                hasAudio = audioPresenceMap[clip.fileName];
            } else if (mediaInfo && typeof mediaInfo.hasAudio === 'boolean') {
                hasAudio = mediaInfo.hasAudio;
            }
            
            const finalAudioLabel = `a_prep_${i}`;

            if (hasAudio) {
                const start = parseFloat(clip.mediaStartOffset) || 0;
                let audioFilters = [`atrim=start=${start}:duration=${start + safeDuration}`, `asetpts=PTS-STARTPTS`];
                if (clip.properties && clip.properties.volume !== undefined && clip.properties.volume !== 1) {
                    audioFilters.push(`volume=${clip.properties.volume}`);
                }
                // Padronizar sample rate para evitar falhas no acrossfade
                audioFilters.push('aformat=sample_rates=44100:channel_layouts=stereo');
                
                filterChain += `[${currentInputIndex}:a:0]${audioFilters.join(',')}[${finalAudioLabel}];`;
            } else {
                // Gerar silêncio com a MESMA duração do vídeo para que o XFADE/ACROSSFADE não desincronize
                filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${safeDuration}[${finalAudioLabel}];`;
            }
            preparedAudioStreams.push(`[${finalAudioLabel}]`);
        });

        if (preparedVideoStreams.length === 0) {
            return { inputs: [], filterComplex: null, outputMapVideo: null, outputMapAudio: null };
        }

        // --- 2. CHAINING COM XFADE (VÍDEO) E ACROSSFADE (ÁUDIO) ---
        
        let lastV = preparedVideoStreams[0];
        let lastA = preparedAudioStreams[0];
        
        // Offset acumulado é necessário para o xfade (que usa timestamp absoluto do primeiro stream)
        // O primeiro clipe começa em 0. O segundo começa em (Dur0 - TransDur).
        let currentOffset = parseFloat(clips[0].duration) || 5;

        // Se só tiver 1 clipe, retorna direto
        if (preparedVideoStreams.length === 1) {
            return {
                inputs,
                filterComplex: filterChain,
                outputMapVideo: lastV,
                outputMapAudio: lastA
            };
        }

        for (let i = 1; i < preparedVideoStreams.length; i++) {
            const nextV = preparedVideoStreams[i];
            const nextA = preparedAudioStreams[i];
            const clip = clips[i];
            const prevClip = clips[i-1];
            
            // A transição é definida no clipe ATUAL (entrada)
            // Se o clipe atual tem transição definida, usamos ela. Caso contrário, corte seco (mas implementado como xfade duration=0 para manter a chain)
            // OU: Podemos usar crossfade padrão se não definido.
            
            let transitionId = 'fade'; // Default
            let duration = 0; // Se 0, age como corte seco (na logica customizada abaixo)

            if (clip.transition) {
                transitionId = TRANSITION_MAP[clip.transition.id] || 'fade';
                duration = parseFloat(clip.transition.duration) || 1.0;
            }

            // Garantir que a transição não seja maior que metade da duração do clipe (regra de segurança do ffmpeg)
            const maxDuration = Math.min((parseFloat(prevClip.duration)||5)/2, (parseFloat(clip.duration)||5)/2);
            if (duration > maxDuration) duration = maxDuration;
            if (duration < 0) duration = 0;

            const nextMixV = `v_mix_${i}`;
            const nextMixA = `a_mix_${i}`;

            if (duration > 0) {
                // Calcular o offset exato para o xfade
                // O xfade começa em: (Fim do anterior) - (Duração da Transição)
                // O "Fim do anterior" é o currentOffset ACUMULADO até agora.
                const offset = currentOffset - duration;
                
                // XFADE para Vídeo
                filterChain += `${lastV}${nextV}xfade=transition=${transitionId}:duration=${duration}:offset=${offset}[${nextMixV}];`;
                
                // ACROSSFADE para Áudio (não usa offset absoluto, consome os streams)
                // acrossfade mistura o final do stream A com o início do B. 
                // A duração do resultado é: DurA + DurB - DurTrans
                filterChain += `${lastA}${nextA}acrossfade=d=${duration}:c1=tri:c2=tri[${nextMixA}];`;
                
                // Atualizar o offset para o próximo loop
                // O novo stream acumulado tem duração: (Offset atual) + (Duração deste clipe) - (Duração transição)
                // Basicamente, adicionamos a parte "nova" do clipe atual.
                // Parte nova = ClipDuration - TransitionDuration
                currentOffset += ((parseFloat(clip.duration)||5) - duration);

            } else {
                // Corte Seco (Concat simples para este par, ou xfade com duração mínima?)
                // Xfade com duração 0 as vezes falha ou não é permitido. Melhor usar concat filter se for corte seco.
                // Mas misturar concat e xfade na mesma chain é complexo.
                // Estratégia: Usar concat para corte seco.
                // Problema: Timestamp resets.
                // Estratégia Robusta: Usar xfade com duração muito pequena (0.1s) ou logica de timestamp manual.
                // Vamos usar concat neste segmento específico se possível, mas isso quebra a chain "lastV".
                // Solução: Concatena os dois streams [lastV][nextV] com n=2.
                
                filterChain += `${lastV}${nextV}concat=n=2:v=1:a=0[${nextMixV}];`;
                filterChain += `${lastA}${nextA}concat=n=2:v=0:a=1[${nextMixA}];`;
                
                currentOffset += (parseFloat(clip.duration)||5);
            }

            lastV = `[${nextMixV}]`;
            lastA = `[${nextMixA}]`;
        }

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: lastV,
            outputMapAudio: lastA
        };
    }
};
