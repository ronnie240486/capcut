
import presetGenerator from './presetGenerator.js';

export default {
    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // 1. CONFIGURAÇÃO DE ALTA PRECISÃO
        const resMap = {
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 }
        };
        
        const targetRes = resMap[exportConfig.resolution] || resMap['1080p']; 
        const targetFps = parseInt(exportConfig.fps) || 30;
        
        // Separação de Trilhas
        // Main Track: Vídeos e Imagens que formam a base da narrativa
        const mainTrackClips = clips.filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video')).sort((a, b) => a.start - b.start);
        
        // Overlays: Textos, Legendas, Sticker (Camada Imagem)
        const overlayClips = clips.filter(c => (['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image'))).sort((a,b) => a.start - b.start);
        
        // Audio Tracks: Efeitos, Música, Narração (Tratados como mixagem paralela)
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track)).sort((a,b) => a.start - b.start);

        // Arrays para armazenar os labels dos streams processados de cada clipe principal
        let processedSegments = []; 

        // --- 1. PROCESSAMENTO DE VÍDEO E ÁUDIO BASE (NORMALIZAÇÃO) ---
        if (mainTrackClips.length === 0) {
            // Placeholder preto e silencioso se não houver vídeo
            inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            processedSegments.push({ video: `[${inputIndexCounter++}:v]`, audio: `[${inputIndexCounter++}:a]`, duration: 5, transition: null });
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return; 

                // Garantir duração mínima para evitar erros de concatenação
                const duration = Math.max(0.1, parseFloat(clip.duration));

                // Input Args
                if (clip.type === 'image') {
                    // Imagens precisam de loop. Adicionamos margem de segurança para transições.
                    inputs.push('-loop', '1', '-t', (duration + 3).toString(), '-i', filePath); 
                } else {
                    inputs.push('-i', filePath);
                }
                const inputIdx = inputIndexCounter++;

                // -- VÍDEO --
                let currentV = `[${inputIdx}:v]`;
                const addVFilter = (txt) => {
                    const next = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${txt}[${next}];`;
                    currentV = `[${next}]`;
                };

                // 1. Scale/Pad/FPS Normalization (CRÍTICO PARA SYNC)
                // Usamos setsar=1 para garantir pixels quadrados
                addVFilter(`scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${targetFps},format=yuv420p`);

                // 2. Trim (Corte preciso)
                // setpts=PTS-STARTPTS reseta o relógio do clipe para 0
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    addVFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addVFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // 3. Efeitos Visuais
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addVFilter(fx);
                }

                // -- ÁUDIO BASE (Sincronizado com o Vídeo) --
                let currentA = '';
                const mediaInfo = mediaLibrary[clip.fileName];
                const hasAudio = clip.type === 'video' && mediaInfo?.hasAudio;
                const clipVol = clip.properties.volume !== undefined ? clip.properties.volume : 1;

                if (hasAudio && clipVol > 0) {
                    const start = clip.mediaStartOffset || 0;
                    const audioLabel = `atmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    
                    // IMPORTANTE: aresample=async=1 corrige pequenos desvios de relógio (drift)
                    // atrim deve bater exatamente com o trim do vídeo
                    filterChain += `[${inputIdx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,aresample=44100:async=1,volume=${clipVol}[${audioLabel}];`;
                    currentA = `[${audioLabel}]`;
                } else {
                    // Se for imagem ou vídeo mudo, GERA SILÊNCIO com a duração EXATA do vídeo
                    // Isso mantém o "bloco" de áudio do mesmo tamanho do bloco de vídeo
                    const silentLabel = `asilent${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${silentLabel}];`;
                    currentA = `[${silentLabel}]`;
                }

                processedSegments.push({ 
                    video: currentV, 
                    audio: currentA, 
                    duration: duration, 
                    transition: clip.transition 
                });
            });
        }

        // --- 2. CONCATENAÇÃO INTELIGENTE (XFADE + ACROSSFADE) ---
        // Aqui está o segredo da sincronia total.
        // Se usamos xfade no vídeo (que come tempo), DEVEMOS usar acrossfade no áudio (que come o mesmo tempo).
        
        let mainVideoStream = processedSegments[0].video;
        let mainAudioStream = processedSegments[0].audio;
        let accumulatedDuration = processedSegments[0].duration;

        for (let i = 1; i < processedSegments.length; i++) {
            const nextClip = processedSegments[i];
            const prevClip = processedSegments[i-1];
            
            // Determinar duração da transição
            // Não pode ser maior que a duração dos clipes envolvidos
            let transDur = 0;
            let transId = 'fade';
            
            if (prevClip.transition && prevClip.transition.duration > 0) {
                // Limitar transição para evitar erro "transition duration > clip duration"
                // Safe margin: metade do clipe
                const maxDur = Math.min(prevClip.transition.duration, prevClip.duration / 2, nextClip.duration / 2);
                transDur = Math.max(0.1, maxDur); // Mínimo 0.1s se existir transição
                transId = presetGenerator.getTransitionXfade(prevClip.transition.id);
            }

            const nextVLabel = `main_v_${i}`;
            const nextALabel = `main_a_${i}`;

            if (transDur > 0) {
                // XFADE (Vídeo)
                // Offset é onde a transição começa no stream acumulado
                const offset = accumulatedDuration - transDur;
                filterChain += `${mainVideoStream}${nextClip.video}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextVLabel}];`;
                
                // ACROSSFADE (Áudio) - Sync Perfeito
                // acrossfade sobrepõe o final do A com o início do B. d=duration.
                // Diferente do xfade video que usa offset absoluto, acrossfade funciona stream a stream.
                // Mas como estamos construindo sequencialmente, funciona perfeitamente.
                // c1=tri, c2=tri suaviza a mixagem.
                filterChain += `${mainAudioStream}${nextClip.audio}acrossfade=d=${transDur}:c1=tri:c2=tri[${nextALabel}];`;
                
                // Atualiza duração acumulada: (A + B) - overlap
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            } else {
                // CORTE SECO (Concat simples mas seguro via filtro)
                // concat=n=2:v=1:a=0 (Vídeo) e concat=n=2:v=0:a=1 (Áudio)
                // Isso garante que timestamps sejam reescritos corretamente
                filterChain += `${mainVideoStream}${nextClip.video}concat=n=2:v=1:a=0[${nextVLabel}];`;
                filterChain += `${mainAudioStream}${nextClip.audio}concat=n=2:v=0:a=1[${nextALabel}];`;
                
                accumulatedDuration += nextClip.duration;
            }

            mainVideoStream = `[${nextVLabel}]`;
            mainAudioStream = `[${nextALabel}]`;
        }

        // --- 3. OVERLAYS (Sobreposições visuais) ---
        // Agora que temos o stream principal de vídeo sincronizado, aplicamos os overlays
        let finalComp = mainVideoStream;
        
        if (overlayClips.length > 0) {
            overlayClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return;

                inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                const idx = inputIndexCounter++;
                const imgLabel = `img_ov_${i}`;
                
                const ovScale = clip.track === 'subtitle' ? targetRes.w : Math.round(targetRes.w * 0.4);
                
                filterChain += `[${idx}:v]scale=${ovScale}:-1:flags=bilinear[${imgLabel}];`;
                
                const nextCompLabel = `comp_${i}`;
                const startTime = clip.start;
                
                // enable='between...' garante que apareça no tempo exato da timeline
                filterChain += `${finalComp}[${imgLabel}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
                finalComp = `[${nextCompLabel}]`;
            });
        }

        // --- 4. MIXAGEM DE TRILHAS ADICIONAIS (Música/SFX/Narração Extra) ---
        // O `mainAudioStream` contém o áudio síncrono dos vídeos.
        // Agora misturamos com músicas e efeitos sonoros usando `amix`.
        
        let audioMixInputs = [mainAudioStream];
        
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            const delay = Math.round(clip.start * 1000); 
            const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;

            // Prepara o clipe de áudio extra: corta, resample, volume e delay
            filterChain += `[${idx}:a]atrim=duration=${clip.duration},asetpts=PTS-STARTPTS,aresample=44100:async=1,volume=${vol},adelay=${delay}|${delay}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        
        if (audioMixInputs.length > 1) {
            // amix mistura tudo. duration=first garante que o áudio final tenha a duração do mainAudioStream (vídeo)
            // (Se a música for maior que o vídeo, corta a música. Se vídeo for maior, silêncio no final)
            // normalize=0 evita que o volume flutue
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            finalAudio = mainAudioStream;
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);
        
        return { inputs, filterComplex: filterChain, outputMapVideo: finalComp, outputMapAudio: finalAudio };
    }
};
