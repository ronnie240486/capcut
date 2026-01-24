
/**
 * FFmpeg FULL PRESETS + MOVEMENTS
 * Production-safe version
 */

const FINAL_FILTER = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p,fps=30';

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
        // Simple mapping, can be expanded
        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'bw': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'vibrant': 'eq=saturation=1.5'
        };
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const speed = parseFloat(config.speed || config.intensity || 1);
        const frames = Math.max(1, Math.ceil(durationSec * 30));
        
        // CRITICAL: Ensure s=1280x720 is always present to match timeline expectations
        const base = `zoompan=d=1:s=1280x720:fps=30`; 

        switch (moveId) {
            case 'zoom-in':
            case 'kenBurns':
                return `${base}:z='min(1+${0.4 * speed}*on/${frames},1.6)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'zoom-out':
                return `${base}:z='max(1.6-${0.4 * speed}*on/${frames},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'pan-left':
                return `${base}:z=1.2:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'pan-right':
                return `${base}:z=1.2:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
            default:
                if (isImage) return `${base}:z=1`; // Static image fix
                return null;
        }
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade-classic': 'fade', 'crossfade': 'fade', 'mix': 'fade', 
            'black': 'fadeblack', 'white': 'fadewhite',
            'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose',
            'zoomin': 'zoomin', 'zoomout': 'zoomout',
            'pixelize': 'pixelize', 'glitch': 'pixelize'
        };
        return map[id] || 'fade';
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
