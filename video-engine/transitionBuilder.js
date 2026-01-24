
const presetGenerator = require('./presetGenerator.js');

module.exports = {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        
        let inputIndexCounter = 0;

        // 1. Separar Clipes Visuais
        const visualClips = clips.filter(c => 
            ['video', 'camada', 'text', 'subtitle'].includes(c.track) || 
            (c.type === 'video' || c.type === 'image' || c.type === 'text')
        ).sort((a, b) => a.start - b.start);

        // 2. Separar Áudios de Overlay
        const overlayClips = clips.filter(c => 
            ['audio', 'narration', 'music', 'sfx'].includes(c.track) ||
            (c.type === 'audio' && !['video', 'camada'].includes(c.track))
        );

        let visualStreamLabels = [];
        let baseAudioSegments = [];

        visualClips.forEach((clip, i) => {
            const filePath = fileMap[clip.fileName];
            if (!filePath && clip.type !== 'text') return;

            // Duração Mínima de 1s para garantir transições
            const duration = Math.max(1.0, parseFloat(clip.duration) || 5);

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

            // 1. INPUT NORMALIZATION
            addFilter(`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`);

            // 2. TRIM (CRITICAL: setpts reset)
            if (clip.type !== 'image') {
                const start = clip.mediaStartOffset || 0;
                addFilter(`trim=start=${start}:duration=${start + duration},setpts=PTS-STARTPTS`);
            } else {
                addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
            }

            // 3. EFEITOS (Agora com mapeamento completo)
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
                // Simplificação: apenas drawtext básico por segurança
                addFilter(`drawtext=text='${txt}':fontcolor=${color}:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2`);
            }

            // 6. SAFE OUTPUT SCALE
            addFilter(`scale=1280:720,setsar=1`);

            visualStreamLabels.push({
                label: currentV,
                duration: duration,
                transition: clip.transition
            });

            // --- AUDIO BASE ---
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

        // --- XFADE MIXING ---
        let finalVideo = '[black_bg]';
        
        if (visualStreamLabels.length > 0) {
            let currentMix = visualStreamLabels[0].label;
            let accumulatedDuration = visualStreamLabels[0].duration;

            for (let i = 1; i < visualStreamLabels.length; i++) {
                const nextClip = visualStreamLabels[i];
                const prevClip = visualStreamLabels[i-1];
                
                // Pega transição OU usa 'fade' padrão
                const trans = prevClip.transition || { id: 'fade', duration: 0.5 }; 
                const transId = presetGenerator.getTransitionXfade(trans.id);
                
                // SEGURANÇA: Duração da transição não pode ser maior que metade do clipe
                // Senão o vídeo congela ou corta
                const maxTransDur = Math.min(prevClip.duration, nextClip.duration) / 2.1;
                const transDur = Math.min(trans.duration || 0.5, maxTransDur, 1.5); 
                
                const offset = accumulatedDuration - transDur;
                const nextLabel = `mix_${i}`;
                
                filterChain += `${currentMix}${nextClip.label}xfade=transition=${transId}:duration=${transDur}:offset=${offset}[${nextLabel}];`;
                
                currentMix = `[${nextLabel}]`;
                accumulatedDuration = offset + transDur + (nextClip.duration - transDur);
            }
            finalVideo = currentMix;
        } else {
            inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
            finalVideo = `[${inputIndexCounter++}:v]`;
        }

        // --- AUDIO MIXING ---
        let baseAudio = '[base_audio_combined]';
        if (baseAudioSegments.length > 0) {
            filterChain += `${baseAudioSegments.join('')}concat=n=${baseAudioSegments.length}:v=0:a=1${baseAudio};`;
        } else {
            filterChain += `anullsrc=channel_layout=stereo:sample_rate=44100:d=0.1${baseAudio};`;
        }

        let audioMixInputs = [baseAudio];
        
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

        let finalAudio = '[final_audio_out]';
        
        if (audioMixInputs.length > 1) {
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
