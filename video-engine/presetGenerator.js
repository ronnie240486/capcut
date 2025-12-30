
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
            'night-vision': 'hue=s=0,eq=g=1.5:r=0.1:b=0.1',
            // Matrix Effect: Green Tint + Contrast + Saturation
            'matrix': 'colorbalance=gs=0.3:rs=-0.1:bs=-0.1,eq=contrast=1.2:saturation=1.2',
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.2'
        };

        if (effects[effectId]) return effects[effectId];
        
        if (effectId.includes('bw') || effectId.includes('noir')) return 'hue=s=0';
        if (effectId.includes('contrast')) return 'eq=contrast=1.3';
        if (effectId.includes('sepia')) return 'colorbalance=rs=.3:gs=.2:bs=-.2';
        
        return null;
    },

    /**
     * Generates a zoompan filter.
     * Uses deterministic math based on 'on' (frame number) for video stability.
     * 'd' is the total duration frames.
     */
    getMovementFilter: (moveId, d, isImage = true) => {
        // If image, we extend duration 'd'. If video, zoompan usually processes stream 1:1, so d=1 per input frame essentially
        // but we use 'on' (output frame number) to drive animation.
        const durationParam = isImage ? `:d=${d}` : ':d=1';
        const fpsParam = ':fps=30';
        const sizeParam = ':s=1280x720';
        const common = `${durationParam}${sizeParam}${fpsParam}`;
        
        // For video zoom, we use a formula: start + (total_change * current_frame / total_frames)
        // 'on' is current frame index. 'd' is passed as total frames of clip.
        // We use a safe fallback of 100 frames if d is 0 to avoid division by zero.
        const totalFrames = d || 100;

        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                // Zoom from 1.0 to 1.5
                return `zoompan=z='1+(0.5*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-fast-in':
                // Zoom from 1.0 to 2.0
                return `zoompan=z='1+(1.0*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                // Zoom from 1.5 down to 1.0
                return `zoompan=z='1.5-(0.5*on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'zoom-bounce':
                // Sine wave zoom
                return `zoompan=z='1+0.1*sin(on/30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${common}`;

            case 'pan-left':
            case 'slide-left':
                // Move X from right to left. z=1.2 to allow panning without black bars.
                // x goes from 0 to (iw-iw/zoom)
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)'${common}`;
            
            case 'pan-right':
            case 'slide-right':
                // Move X from left to right.
                // x goes from (iw-iw/zoom) down to 0
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)'${common}`;

            case 'shake':
            case 'shake-hard':
            case 'earthquake':
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(1)*20-10':y='ih/2-(ih/zoom/2)+random(1)*20-10'${common}`;

            default:
                if (isImage) return `zoompan=z=1${common}`;
                return null;
        }
    }
};
