
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
        
        if (effectId.includes('bw') || effectId.includes('noir')) return 'hue=s=0';
        if (effectId.includes('matrix')) return 'colorbalance=gs=0.3';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        if (effectId.includes('sepia')) return 'colorbalance=rs=.3:gs=.2:bs=-.2';
        
        return null;
    },

    // Gerador de Movimento (Zoom/Pan)
    getMovementFilter: (moveId, durationSec, isImage = true) => {
        const fps = 30;
        const totalDuration = durationSec || 5;
        // Para imagens estáticas criamos vídeo; para vídeos processamos frame a frame (d=1)
        const dParam = isImage ? `:d=${Math.ceil(totalDuration * fps)}` : ':d=1';
        const sParam = ':s=1280x720';
        const fpsParam = ':fps=30';
        const common = `${dParam}${sParam}${fpsParam}`;

        // Helper para zoom centralizado
        const center = ":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

        switch (moveId) {
            // --- ZOOMS BÁSICOS ---
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                return `zoompan=z='min(1.0+(0.5*time/${totalDuration}),1.5)'${center}${common}`;
            
            case 'zoom-fast-in':
                return `zoompan=z='min(1.0+(1.0*time/${totalDuration}),2.0)'${center}${common}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                return `zoompan=z='max(1.5-(0.5*time/${totalDuration}),1.0)'${center}${common}`;
            
            case 'zoom-bounce':
            case 'mov-zoom-bounce-in':
                // Pulsa: zoom in e out suavemente
                return `zoompan=z='1.0+0.1*sin(time*2)'${center}${common}`;

            // --- POP & EFEITOS RÁPIDOS ---
            case 'pop-in':
            case 'pop-up':
            case 'mov-pop-up':
            case 'mov-zoom-crash-in':
                // Zoom rápido de 1.0 a 1.8 em 0.5s e mantém
                return `zoompan=z='min(1.0+(1.6*time/0.5),1.8)'${center}${common}`;

            case 'mov-zoom-crash-out':
                return `zoompan=z='max(1.8-(1.6*time/0.5),1.0)'${center}${common}`;

            case 'mov-flash-pulse':
                // Zoom pulsante rápido
                return `zoompan=z='1.0+0.05*sin(time*10)'${center}${common}`;

            // --- PANS DIRECIONAIS (MOV-*) ---
            // Nota: Para dar pan para a ESQUERDA, a câmera (viewport) deve mover para a DIREITA
            case 'pan-left':
            case 'slide-left':
            case 'mov-pan-slow-l':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(time/${totalDuration})':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
            case 'mov-pan-slow-r':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(time/${totalDuration}))':y='ih/2-(ih/zoom/2)'${common}`;

            case 'mov-pan-slow-u': // Pan Up (Câmera sobe, imagem desce) -> Viewport sobe (y diminui)
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(time/${totalDuration}))'${common}`;

            case 'mov-pan-slow-d': // Pan Down (Câmera desce, imagem sobe) -> Viewport desce (y aumenta)
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(time/${totalDuration})'${common}`;

            // --- SHAKES & TERREMOTOS ---
            case 'shake':
            case 'handheld-1':
            case 'jitter':
                // Tremor leve
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(1)*10-5':y='ih/2-(ih/zoom/2)+random(1)*10-5'${common}`;

            case 'earthquake':
            case 'mov-shake-violent':
            case 'shake-hard':
                // Tremor forte (precisa de mais zoom (1.2) para não mostrar bordas pretas)
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(1)*40-20':y='ih/2-(ih/zoom/2)+random(1)*40-20'${common}`;

            case 'handheld-2':
                // Tremor médio
                return `zoompan=z=1.15:x='iw/2-(iw/zoom/2)+random(1)*20-10':y='ih/2-(ih/zoom/2)+random(1)*20-10'${common}`;

            // --- PADRÃO ---
            default:
                // Se for imagem e não tiver movimento, aplica um zoom imperceptível para manter o formato de vídeo
                if (isImage) return `zoompan=z=1${common}`;
                return null;
        }
    }
};
