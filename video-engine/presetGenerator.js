
module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100'
    ],

    getAudioExtractArgs: () => [
        '-vn', 
        '-acodec', 'libmp3lame', 
        '-q:a', '2'
    ],

    // Mapeamento de Efeitos Visuais (React ID -> FFmpeg Filter)
    getFFmpegFilterFromEffect: (effectId) => {
        // Nota: usamos ':' para separar parametros internos e ',' para separar filtros
        const effects = {
            // Cinematic
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,curves=contrast',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2', 
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'posterize': 'curves=posterize',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            
            // Basics
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            
            // Fallbacks
            'dreamy': 'boxblur=2:1,eq=brightness=0.1'
        };

        if (effects[effectId]) return effects[effectId];
        
        // Match parcial para garantir que algo seja aplicado
        if (effectId.includes('bw') || effectId.includes('noir')) return 'hue=s=0';
        if (effectId.includes('matrix')) return 'colorbalance=gs=0.3';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        if (effectId.includes('sepia')) return 'colorbalance=rs=.3:gs=.2:bs=-.2';
        
        return null;
    },

    // Gerador de Movimento (Zoom/Pan)
    getMovementFilter: (moveId, durationSec, isImage = true) => {
        // FPS fixo para calculo
        const fps = 30;
        // Duração segura em frames
        const d = Math.ceil((durationSec || 5) * fps);
        
        // Para imagens: d=totalFrames (cria vídeo dessa duração)
        // Para vídeos: d=1 (processa frame a frame, mantendo a stream original)
        const dParam = isImage ? `:d=${d}` : ':d=1';
        const sParam = ':s=1280x720';
        const fpsParam = ':fps=30';
        const common = `${dParam}${sParam}${fpsParam}`;

        // 'time' é o tempo atual em segundos. durationSec é a duração total.
        // Fórmulas lineares baseadas no tempo para evitar "pulos"
        
        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                // Zoom 1.0 -> 1.5
                return `zoompan=z='min(1.0+(0.5*time/${durationSec}),1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-fast-in':
                // Zoom 1.0 -> 2.0
                return `zoompan=z='min(1.0+(1.0*time/${durationSec}),2.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                // Zoom 1.5 -> 1.0
                return `zoompan=z='max(1.5-(0.5*time/${durationSec}),1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-bounce':
                // Zoom pulsante (Senoide)
                return `zoompan=z='1+0.1*sin(time*2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'pan-left':
            case 'slide-left':
                // Pan da direita para esquerda (viewport move para direita)
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(time/${durationSec})':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
                // Pan da esquerda para direita (viewport move para esquerda)
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(time/${durationSec}))':y='ih/2-(ih/zoom/2)'${common}`;

            case 'shake':
            case 'earthquake':
            case 'handheld-1':
                // Tremor randomico
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(1)*20-10':y='ih/2-(ih/zoom/2)+random(1)*20-10'${common}`;

            default:
                if (isImage) return `zoompan=z=1${common}`;
                return null;
        }
    }
};
