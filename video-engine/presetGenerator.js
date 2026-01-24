
export default {
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

    // Mapeamento de Efeitos Visuais
    getFFmpegFilterFromEffect: (effectId) => {
        // Sintaxe: usar : para separar parâmetros de um mesmo filtro
        // Usar , para separar filtros diferentes dentro da string de retorno (será processado pelo builder)
        const effects = {
            // Cinematic
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,curves=contrast',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2', // Mais verde, menos vermelho/azul
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            
            // Basics
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'sepia-max': 'colorbalance=rs=0.4:gs=0.2:bs=-0.4',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'posterize': 'curves=posterize',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5' // Verde monocromático
        };

        if (effects[effectId]) return effects[effectId];
        
        // Fallbacks baseados em texto
        if (effectId.includes('bw') || effectId.includes('noir')) return 'hue=s=0';
        if (effectId.includes('matrix')) return 'colorbalance=gs=0.3';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        if (effectId.includes('sepia')) return 'colorbalance=rs=.3:gs=.2:bs=-.2';
        
        return null;
    },

    // Gerador de Movimento (Zoom/Pan)
    // d = duração total em segundos (não frames) para cálculo baseado em tempo
    getMovementFilter: (moveId, durationSec, isImage = true) => {
        // Para vídeo, usamos d=1 para processar frame a frame, mas a matemática usa 'time' (segundos atuais)
        // Para imagem, d é a duração total em frames * 30fps
        
        const fps = 30;
        const totalDuration = durationSec || 8; // UPDATED: Fallback to 8s
        const dParam = isImage ? `:d=${Math.ceil(totalDuration * fps)}` : ':d=1';
        const sParam = ':s=1280x720';
        const fpsParam = ':fps=30';
        const common = `${dParam}${sParam}${fpsParam}`;

        // Fórmulas baseadas em 'time' (t) para suavidade
        // zoompad padrão: z='...' x='...' y='...'
        
        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                // Zoom de 1.0 a 1.5
                return `zoompan=z='min(1.0+(0.5*time/${totalDuration}),1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-fast-in':
                // Zoom de 1.0 a 2.0
                return `zoompan=z='min(1.0+(1.0*time/${totalDuration}),2.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                // Zoom de 1.5 a 1.0
                return `zoompan=z='max(1.5-(0.5*time/${totalDuration}),1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-bounce':
                return `zoompan=z='1+0.1*sin(time*2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'pan-left':
            case 'slide-left':
                // Move da direita para esquerda (x diminui? não, x aumenta para mostrar o lado esquerdo da imagem se a imagem for maior, ou viewport move... zoompan move o viewport)
                // Se z=1.2, temos folga.
                // x='(iw-iw/zoom)*(time/duration)' move o viewport da esquerda (0) para direita (max).
                // Para pan left (imagem move para esquerda), o viewport deve mover para a direita.
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(time/${totalDuration})':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(time/${totalDuration}))':y='ih/2-(ih/zoom/2)'${common}`;

            case 'shake':
            case 'earthquake':
                // Tremor aleatório
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(1)*20-10':y='ih/2-(ih/zoom/2)+random(1)*20-10'${common}`;

            default:
                if (isImage) return `zoompan=z=1${common}`;
                return null;
        }
    }
};
