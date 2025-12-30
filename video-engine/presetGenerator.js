
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

    getSafeScaleFilter: () => 'scale=trunc(iw/2)*2:trunc(ih/2)*2',

    getFFmpegFilterFromEffect: (effectId) => {
        // Mapeamento COMPLETO dos efeitos do frontend (constants.ts) para filtros FFmpeg
        const effects = {
            // Cinematic Pro
            'teal-orange': 'eq=contrast=1.2:saturation=1.3,hue=h=-10,colorbalance=rs=0.2:bs=-0.2',
            'matrix': 'colorbalance=gs=0.3:rs=-0.1:bs=-0.1,eq=contrast=1.2:saturation=1.2:gamma_g=1.1',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma_r=1.1:saturation=1.2',
            'cool-morning': 'hue=h=180,eq=brightness=0.1,colorbalance=bs=0.2',
            'cyberpunk': 'eq=contrast=1.4:saturation=2.0,hue=h=20',
            'dreamy-blur': 'boxblur=2:1,eq=brightness=0.1:saturation=0.8',
            'horror': 'hue=s=0,eq=contrast=1.5:brightness=-0.2,colorbalance=rs=0.1',
            'underwater': 'eq=brightness=-0.2:contrast=1.2,colorbalance=rs=-0.2:gs=0.1:bs=0.4',
            'sunset': 'colorbalance=rs=0.3:bs=-0.2,eq=saturation=1.5',
            'posterize': 'curves=posterize', 
            'fade': 'eq=contrast=0.8:brightness=0.1',
            'vibrant': 'eq=saturation=2.5:contrast=1.1',
            'muted': 'eq=saturation=0.5:contrast=0.9',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'golden-hour': 'colorbalance=rs=0.3:gs=0.1:bs=-0.2,eq=saturation=1.4',
            'cold-blue': 'colorbalance=bs=0.3:rs=-0.1,eq=saturation=0.8',
            'night-vision': 'hue=s=0,eq=contrast=1.2,colorbalance=gs=0.5:rs=-0.2:bs=-0.2',
            'scifi': 'eq=contrast=1.3,hue=h=180',
            'pastel': 'eq=brightness=0.1:saturation=0.7:contrast=0.9',

            // Estilos Artísticos
            'pop-art': 'eq=saturation=3.0:contrast=1.5',
            'sketch-sim': 'hue=s=0,eq=contrast=5.0:brightness=0.2',
            'invert': 'negate',
            'sepia-max': 'colorbalance=rs=.39:gs=.76:bs=.18,hue=s=0', // Sepia approx
            'high-contrast': 'eq=contrast=3.0',
            'low-light': 'eq=brightness=-0.5:contrast=1.5',
            'overexposed': 'eq=brightness=0.5:contrast=0.8',
            'radioactive': 'hue=h=90,eq=saturation=3.0',
            'deep-fried': 'eq=contrast=2.0:saturation=3.0,unsharp=5:5:2.0',
            'ethereal': 'eq=brightness=0.3:contrast=0.8:saturation=0.5',

            // Filtros Básicos
            'warm': 'colorbalance=rs=0.1:bs=-0.1,eq=saturation=1.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1,eq=saturation=1.1',
            'vivid': 'eq=saturation=1.8:contrast=1.2',
            'mono': 'hue=s=0',
            'vintage': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=0.9',
            'dreamy': 'boxblur=1:1,eq=brightness=0.1:saturation=0.8'
        };

        if (effects[effectId]) return effects[effectId];
        
        // Fallbacks inteligentes baseados no nome
        if (effectId.includes('bw') || effectId.includes('noir') || effectId.includes('mono')) return 'hue=s=0';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        if (effectId.includes('sepia')) return 'colorbalance=rs=.3:gs=.2:bs=-.2';
        if (effectId.includes('blur')) return 'boxblur=2:1';
        
        return null;
    },

    getMovementFilter: (moveId, d, isImage = true) => {
        // For video: d=1 keeps 1:1 frame mapping. 'on' counts frames processed.
        const durationParam = isImage ? `:d=${d}` : ':d=1';
        const fpsParam = ':fps=30';
        const sizeParam = ':s=1280x720'; // Standardize size
        const common = `${durationParam}${sizeParam}${fpsParam}`;
        
        const totalFrames = d || 100; // Total duration in frames for calc

        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                return `zoompan=z='1+(0.5*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-fast-in':
                return `zoompan=z='1+(1.0*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                return `zoompan=z='1.5-(0.5*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-bounce':
                return `zoompan=z='1+0.1*sin(on/30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'pan-left':
            case 'slide-left':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)'${common}`;

            case 'handheld-1':
            case 'handheld-2':
            case 'shake':
            case 'shake-hard':
            case 'earthquake':
            case 'jitter':
                // Shake effect using random displacement
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(1)*20-10':y='ih/2-(ih/zoom/2)+random(1)*20-10'${common}`;

            case 'dolly-zoom':
                return `zoompan=z='1+0.3*sin(on/${totalFrames}*3.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            default:
                if (isImage) return `zoompan=z=1${common}`; // Static image to video
                return null;
        }
    }
};
