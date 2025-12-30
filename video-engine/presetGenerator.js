
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

    getSafeScaleFilter: () => 'scale=trunc(iw/2)*2:trunc(ih/2)*2',

    getFFmpegFilterFromEffect: (effectId) => {
        const effects = {
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=.3:gs=.2:bs=-.2',
            'sepia-max': 'colorbalance=rs=.4:gs=.2:bs=-.4,hue=s=0.5',
            'vintage': 'curves=vintage', 
            'vintage-warm': 'colorbalance=rs=.2:bs=-.2,eq=g=1.1',
            'warm': 'colorbalance=rs=.1:bs=-.1',
            'cool': 'colorbalance=bs=.1:rs=-.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'cyberpunk': 'colorbalance=rs=.2:bs=.2:gs=-.1,eq=contrast=1.2:saturation=1.5',
            'pop-art': 'eq=saturation=2:contrast=1.3',
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'posterize': 'curves=posterize',
            'dreamy': 'boxblur=2:1,eq=brightness=0.1',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'night-vision': 'hue=s=0,eq=g=1.5:r=0.1:b=0.1'
        };

        if (effects[effectId]) return effects[effectId];
        
        if (effectId.includes('bw') || effectId.includes('noir')) return 'hue=s=0';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        if (effectId.includes('sepia')) return 'colorbalance=rs=.3:gs=.2:bs=-.2';
        
        return null;
    },

    getMovementFilter: (moveId, d) => {
        const common = `:d=${d}:s=1280x720:fps=30`;
        const center = ":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
        
        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                return `zoompan=z='min(zoom+0.0015,1.5)'${common}${center}`;
            
            case 'zoom-fast-in':
                return `zoompan=z='min(zoom+0.005,2.0)'${common}${center}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                return `zoompan=z='if(eq(on,1),1.5,max(zoom-0.0015,1.0))'${common}${center}`;
            
            case 'zoom-bounce':
                return `zoompan=z='1+0.1*sin(on/30)'${common}${center}`;

            case 'pan-left':
            case 'slide-left':
                return `zoompan=z=1.2:x='if(eq(on,1),x,x+1)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
                return `zoompan=z=1.2:x='if(eq(on,1),x,x-1)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'shake':
            case 'shake-hard':
            case 'earthquake':
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(1)*20-10':y='ih/2-(ih/zoom/2)+random(1)*20-10'${common}`;

            default:
                return `zoompan=z=1${common}`;
        }
    }
};
