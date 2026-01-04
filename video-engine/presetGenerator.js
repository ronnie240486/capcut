
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

    // Gerador de Movimento (Zoom/Pan/Shake)
    getMovementFilter: (moveId, durationSec, isImage = true) => {
        const fps = 30;
        const totalDuration = durationSec || 5;
        const dParam = isImage ? `:d=${Math.ceil(totalDuration * fps)}` : ':d=1';
        const sParam = ':s=1280x720';
        const fpsParam = ':fps=30';
        const common = `${dParam}${sParam}${fpsParam}`;
        const center = ":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

        switch (moveId) {
            case 'shake':
            case 'handheld-1':
            case 'jitter':
                return `scale=1344:756,crop=1280:720:(iw-ow)/2+10*sin(t*10):(ih-oh)/2+10*cos(t*15)`;

            case 'earthquake':
            case 'mov-shake-violent':
            case 'shake-hard':
                return `scale=1408:792,crop=1280:720:(iw-ow)/2+30*sin(t*30):(ih-oh)/2+30*cos(t*35)`;

            case 'handheld-2':
                return `scale=1344:756,crop=1280:720:(iw-ow)/2+15*sin(t*5):(ih-oh)/2+15*cos(t*4)`;

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
                return `zoompan=z='1.0+0.1*sin(time*2)'${center}${common}`;

            case 'pop-in':
            case 'pop-up':
            case 'mov-pop-up':
            case 'mov-zoom-crash-in':
                return `zoompan=z='min(1.0+(1.6*time/0.5),1.8)'${center}${common}`;

            case 'mov-zoom-crash-out':
                return `zoompan=z='max(1.8-(1.6*time/0.5),1.0)'${center}${common}`;

            case 'mov-flash-pulse':
                return `zoompan=z='1.0+0.05*sin(time*10)'${center}${common}`;

            case 'pan-left':
            case 'slide-left':
            case 'mov-pan-slow-l':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(time/${totalDuration})':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
            case 'mov-pan-slow-r':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(time/${totalDuration}))':y='ih/2-(ih/zoom/2)'${common}`;

            case 'mov-pan-slow-u':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(time/${totalDuration}))'${common}`;

            case 'mov-pan-slow-d':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(time/${totalDuration})'${common}`;

            default:
                // FIX: Return null instead of zoompan z=1 to prevent jitter/shaking on static images
                return null; 
        }
    }
};
