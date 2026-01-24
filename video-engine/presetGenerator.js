/**
 * FFmpeg FULL PRESETS + MOVEMENTS
 * Versão otimizada para movimentos suaves e sincronia perfeita
 */

const FINAL_FILTER =
    'scale=1280:720:force_original_aspect_ratio=decrease,' +
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
    'setsar=1,format=yuv420p,fps=30';

module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', 
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2'
    ],

    getAudioExtractArgs: () => [
        '-vn',
        '-acodec', 'libmp3lame',
        '-q:a', '2'
    ],

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.3:rs=-0.2:bs=-0.2,eq=contrast=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'boxblur=2:1,eq=brightness=0.1:saturation=1.2',
            'horror': 'hue=s=0,eq=contrast=1.5:brightness=-0.2,noise=alls=10:allf=t',
            'underwater': 'colorbalance=bs=0.4:gs=0.1:rs=-0.3,eq=contrast=0.9',
            'sunset': 'colorbalance=rs=0.3:gs=-0.1:bs=-0.2,eq=saturation=1.3',
            'vibrant': 'eq=saturation=2.0',
            'mono': 'hue=s=0',
            'vintage': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=contrast=0.9',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2'
        };

        if (effects[effectId]) return effects[effectId];
        return null;
    },

    /**
     * Gerador de Movimento Suave (Smooth Zoom)
     * Para imagens: d deve ser igual ao total de frames (duration * fps)
     * Para vídeos: d deve ser 1 (aplica por frame do vídeo)
     */
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const speed = parseFloat(config.speed || config.intensity || 1);
        const fps = 30;
        const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
        
        // d define quantos frames o filtro vai gerar a partir de 1 frame de entrada (imagem)
        // Se for vídeo, d=1 pois o FFmpeg processa frame a frame da fonte
        const dValue = isImage ? totalFrames : 1;
        const base = `zoompan=d=${dValue}:s=1280x720:fps=${fps}`; 

        // x e y usam 'trunc' para evitar o jitter (tremido) do zoompan
        // zoom linear progressivo baseado no frame atual 'on'
        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                const zIn = `min(zoom+(${0.0015 * speed}),1.5)`;
                return `${base}:z='${zIn}':x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))'`;
            
            case 'zoom-fast-in':
            case 'mov-zoom-crash-in':
                const zCrash = `min(zoom+(${0.005 * speed}),2.0)`;
                return `${base}:z='${zCrash}':x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))'`;

            case 'zoom-out':
            case 'zoom-slow-out':
                // Começa em 1.5 e desce até 1.0
                return `${base}:z='if(eq(on,1),1.5,max(zoom-0.0015,1))':x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))'`;

            case 'pan-left':
            case 'mov-pan-slow-l':
                return `${base}:z=1.2:x='trunc((iw-iw/zoom)*(on/${totalFrames}))':y='trunc(ih/2-(ih/zoom/2))'`;

            case 'pan-right':
            case 'mov-pan-slow-r':
                return `${base}:z=1.2:x='trunc((iw-iw/zoom)*(1-on/${totalFrames}))':y='trunc(ih/2-(ih/zoom/2))'`;

            case 'shake':
            case 'mov-shake-violent':
                return `${base}:z=1.1:x='trunc(iw/2-(iw/zoom/2)+(random(1)-0.5)*${20 * speed})':y='trunc(ih/2-(ih/zoom/2)+(random(1)-0.5)*${20 * speed})'`;

            default:
                // Se for imagem e não tiver movimento, gera um vídeo estático da duração correta
                if (isImage) return `${base}:z=1:x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))'`;
                return null;
        }
    }
};
