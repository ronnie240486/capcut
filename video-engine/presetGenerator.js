
module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // Prioriza velocidade
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
            'bw': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5',
            'invert': 'negate',
            'night-vision': 'hue=s=0,eq=brightness=0.1,colorbalance=gs=0.5,noise=alls=20:allf=t'
        };

        if (effects[effectId]) return effects[effectId];
        
        // Fallbacks simples
        if (effectId.includes('bw') || effectId.includes('noir')) return 'hue=s=0';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        
        return null;
    },

    getMovementFilter: (moveId, durationSec, isImage, config = {}) => {
        // Força resolução 720p e duração segura
        const d = parseFloat(durationSec) || 5.0; 
        const totalFrames = Math.ceil(d * 30);
        
        // s=1280x720 é CRUCIAL para evitar o erro [auto_scale]
        const base = `:d=1:s=1280x720:fps=30`; 
        
        const esc = (s) => s.replace(/,/g, '\\,');
        const center = "x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)";
        const speed = parseFloat(config.speed || config.intensity || 1);

        switch (moveId) {
            case 'kenBurns':
            case 'zoom-in':
            case 'zoom-slow-in':
                return `zoompan=z=${esc(`min(1.0+(0.5*${speed}*on/${totalFrames}),1.5)`)}:${center}${base}`;
            
            case 'zoom-fast-in':
            case 'mov-zoom-crash-in':
                return `zoompan=z=${esc(`min(1.0+(1.0*${speed}*on/${totalFrames}),2.0)`)}:${center}${base}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                return `zoompan=z=${esc(`max(1.5-(0.5*${speed}*on/${totalFrames}),1.0)`)}:${center}${base}`;
            
            case 'pan-left':
            case 'mov-pan-slow-l': 
                return `zoompan=z=${1.2}:x=${esc(`(iw-iw/zoom)*(on/${totalFrames})`)}:y=ih/2-(ih/zoom/2)${base}`;
            
            case 'pan-right':
            case 'mov-pan-slow-r': 
                return `zoompan=z=${1.2}:x=${esc(`(iw-iw/zoom)*(1-(on/${totalFrames}))`)}:y=ih/2-(ih/zoom/2)${base}`;

            case 'shake':
            case 'earthquake':
                return `zoompan=z=1.1:x=${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*20*${speed}`)}:y=${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*20*${speed}`)}${base}`;

            default:
                // Retorna um zoompan estático se for imagem, para garantir formato de vídeo
                if (isImage) return `zoompan=z=1${base}`;
                return null;
        }
    },

    getTransitionXfade: (transId) => {
        const map = {
            'fade-classic': 'fade', 'crossfade': 'fade', 'mix': 'fade',
            'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose',
            'pixelize': 'pixelize', 'glitch': 'pixelize', // Fallback seguro
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout'
        };
        return map[transId] || 'fade';
    }
};
