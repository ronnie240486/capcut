
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
        const mainTrackClips = clips.filter(c => c.track === 'video' || (c.track === 'camada' && c.type === 'video')).sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => (['text', 'subtitle'].includes(c.track) || (c.track === 'camada' && c.type === 'image'))).sort((a,b) => a.start - b.start);
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track)).sort((a,b) => a.start - b.start);

        let mainTrackLabels = [];
        let baseAudioSegments = [];
        
        // --- 1. PROCESSAMENTO DE VÍDEO (SYNC PERFECT) ---
        if (mainTrackClips.length === 0) {
            // Placeholder preto se não houver vídeo
            inputs.push('-f', 'lavfi', '-t', '5', '-i', `color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            mainTrackLabels.push({ label: `[${inputIndexCounter++}:v]`, duration: 5 });
            
            // Placeholder áudio silencioso para garantir stream
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            baseAudioSegments.push(`[${inputIndexCounter++}:a]`);
        } else {
            mainTrackClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath) return; 

                // Garantir duração mínima para evitar erros de concatenação
                const duration = Math.max(0.1, parseFloat(clip.duration));

                // Input Args
                if (clip.type === 'image') {
                    // Loop de imagem precisa de tempo maior que a duração para segurança no trim
                    inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath); 
                } else {
                    inputs.push('-i', filePath);
                }

                const idx = inputIndexCounter++;
                let currentV = `[${idx}:v]`;
                
                const addFilter = (filterText) => {
                    if (!filterText) return;
                    const nextLabel = `vtmp${i}_${Math.random().toString(36).substr(2, 5)}`;
                    filterChain += `${currentV}${filterText}[${nextLabel}];`;
                    currentV = `[${nextLabel}]`;
                };

                // --- OTIMIZAÇÃO CRÍTICA DE VÍDEO ---
                // 1. Scale (Bilinear para performance, mas mantendo resolução alvo)
                // 2. Pad (Centralizar)
                // 3. FPS (Forçar Constant Frame Rate para evitar desync)
                // 4. Format (Garantir pixel format compatível)
                addFilter(`scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=bilinear,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black,fps=${targetFps},format=yuv420p`);

                // Trim preciso
                if (clip.type !== 'image') {
                    const start = clip.mediaStartOffset || 0;
                    // setpts=PTS-STARTPTS é crucial para resetar o relógio do vídeo
                    addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
                } else {
                    addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
                }

                // Efeitos Visuais
                if (clip.effect) {
                    const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
                    if (fx) addFilter(fx);
                }

                mainTrackLabels.push({ label: currentV, duration: duration, transition: clip.transition });

                // --- PROCESSAMENTO DE ÁUDIO EMBUTIDO (VIDEO) ---
                const mediaInfo = mediaLibrary[clip.fileName];
                const audioLabel = `a_base_${i}`;
                
                if (clip.type === 'video' && mediaInfo?.hasAudio && (clip.properties.volume === undefined || clip.properties.volume > 0)) {
                    const start = clip.mediaStartOffset || 0;
                    const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;
                    
                    // aresample=async=1 corrige drift de áudio causado por perda de pacotes ou VFR
                    filterChain += `[${idx}:a]atrim=start=${start}:duration=${start + duration},asetpts=PTS-STARTPTS,aresample=44100:async=1,volume=${vol}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                } else {
                    // Preencher buracos com silêncio para manter a integridade da concatenação
                    filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}[${audioLabel}];`;
                    baseAudioSegments.push(`[${audioLabel}]`);
                }
            });
        }

        // --- 2. CONCATENAÇÃO DE VÍDEO + TRANSIÇÕES ---
        let mainVideoStream = '[black_bg]';
        
        if (mainTrackLabels.length === 1) {
             mainVideoStream = mainTrackLabels[0].label;
        } else if (mainTrackLabels.length > 1) {
            let currentMix = mainTrackLabels[0].label;
            let accumulatedDuration = mainTrackLabels[0].duration;
            
            for (let i = 1; i < mainTrackLabels.length; i++) {
                const nextClip = mainTrackLabels[i];
                const prevClip = mainTrackLabels[i-1]; 
                
                // Lógica de XFADE
                const trans = prevClip.transition || { id: 'fade', duration: 0 };
                const transDur = trans.duration > 0 ? Math.min(trans.duration, 1.0) : 0;
                
                if (transDur > 0) {
                    let transId = presetGenerator.getTransitionXfade(trans.id);
                    const offset = accumulatedDuration - transDur;
                    const nextLabel = `mix_${i}`;
                    
                    filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                    currentMix = `[${nextLabel}]`;
                    accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
                } else {
                    // Concatenação simples via filtro se não houver transição (mais seguro que concat demuxer para sync)
                    // Mas como estamos construindo um stream contínuo, precisamos usar xfade com duração mínima ou lógica de concat
                    // Simplificação: Vamos assumir que sempre usamos xfade ou ajustar o offset para corte seco.
                    // Para corte seco perfeito no filtro complexo, usamos concat
                    // Mas misturar concat e xfade é complexo. 
                    // Solução Robusta: Usar xfade com duração muito pequena (0.1) ou overlay para simular corte se necessário, 
                    // OU concatenar tudo se não houver transições. 
                    // AQUI: Usamos uma abordagem híbrida robusta.
                    
                    // Fallback para corte seco simulado via concatfilter se implementado, mas aqui manteremos o fluxo.
                    // Se a duração for 0, o loop visual continua, mas sem efeito xfade.
                    // Vamos forçar um concat padrão se não houver transição para economizar processamento?
                    // Não, para consistência, vamos manter o pipeline.
                    
                    const nextLabel = `concat_v_${i}`;
                    // Concat filter manual para garantir sync
                    filterChain += `${currentMix}${nextClip.label}concat=n=2:v=1:a=0[${nextLabel}];`;
                    currentMix = `[${nextLabel}]`;
                    accumulatedDuration += nextClip.duration;
                }
            }
            mainVideoStream = currentMix;
        }

        // --- 3. OVERLAYS (Texto e Imagens Sobrepostas) ---
        let finalComp = mainVideoStream;
        
        if (overlayClips.length > 0) {
            overlayClips.forEach((clip, i) => {
                const filePath = fileMap[clip.fileName];
                if (!filePath && clip.type !== 'text') return; // Texto pode ser gerado internamente (futuro)
                if (!filePath) return;

                inputs.push('-loop', '1', '-t', clip.duration.toString(), '-i', filePath);
                const idx = inputIndexCounter++;
                const imgLabel = `img_ov_${i}`;
                
                // Redimensionar overlay para algo razoável (ex: 40% da tela se for imagem)
                // Se for legenda/texto full, manter tamanho
                const ovScale = clip.track === 'subtitle' ? targetRes.w : Math.round(targetRes.w * 0.4);
                
                filterChain += `[${idx}:v]scale=${ovScale}:-1:flags=bilinear[${imgLabel}];`;
                
                const nextCompLabel = `comp_${i}`;
                const startTime = clip.start;
                
                // Usar 'enable' para precisão temporal
                filterChain += `${finalComp}[${imgLabel}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${startTime},${startTime + clip.duration})':eof_action=pass[${nextCompLabel}];`;
                finalComp = `[${nextCompLabel}]`;
            });
        }

        // --- 4. MIXAGEM DE ÁUDIO (PRECISÃO MÁXIMA) ---
        // Primeiro, concatenamos o áudio da trilha principal para formar a "espinha dorsal"
        if (baseAudioSegments.length > 0) {
             filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1[base_audio_seq];`;
        } else {
             // Silêncio base se não houver áudio no vídeo principal
             filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=${totalVideoDuration}[base_audio_seq];`;
        }

        let audioMixInputs = ['[base_audio_seq]'];
        
        audioClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath) return;
            inputs.push('-i', filePath);
            const idx = inputIndexCounter++;
            const lbl = `sfx_${i}`;
            
            // Delay em milissegundos (inteiro)
            const delay = Math.round(clip.start * 1000); 
            const vol = clip.properties.volume !== undefined ? clip.properties.volume : 1;

            // atrim: corta o áudio original
            // adelay: posiciona na timeline
            // aresample: evita problemas de frequência (chipmunk effect)
            filterChain += `[${idx}:a]atrim=duration=${clip.duration},asetpts=PTS-STARTPTS,aresample=44100:async=1,volume=${vol},adelay=${delay}|${delay}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio = '[final_audio_out]';
        
        if (audioMixInputs.length > 1) {
            // duration=longest garante que o áudio não seja cortado se o vídeo for menor (ou vice-versa, ajustaremos no export)
            // dropout_transition=0 evita "dips" de volume nas junções
            filterChain += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0:normalize=0[final_audio_out];`;
        } else {
            finalAudio = '[base_audio_seq]';
        }

        if (filterChain.endsWith(';')) filterChain = filterChain.slice(0, -1);
        
        return { inputs, filterComplex: filterChain, outputMapVideo: finalComp, outputMapAudio: finalAudio };
    }
};
