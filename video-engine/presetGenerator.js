/**
 * FFmpeg FULL PRESETS + MOVEMENTS
 * Production-safe version
 * FIXED: auto_scale, zero-size frames, filter reinit
 */

const FINAL_FILTER =
    'scale=1280:720:force_original_aspect_ratio=decrease,' +
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
    'setsar=1,format=yuv420p,fps=30';

module.exports = {
    /* =========================
       VIDEO / AUDIO
    ========================= */
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

    /* =========================
       EFFECT PRESETS (ALL)
    ========================= */
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            // Cinematic / Color
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.3:rs=-0.2:bs=-0.2,eq=contrast=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'boxblur=2:1,eq=brightness=0.1:saturation=1.2',
            'horror': 'hue=s=0,eq=contrast=1.5:brightness=-0.2,noise=alls=10:allf=t',
            'underwater': 'colorbalance=bs=0.4:gs=0.1:rs=-0.3',
            'sunset': 'colorbalance=rs=0.3:gs=-0.1:bs=-0.2,eq=saturation=1.3',
            'posterize': 'eq=contrast=2:saturation=1.5',
            'fade': 'eq=contrast=0.8:brightness=0.1',
            'vibrant': 'eq=saturation=2',
            'muted': 'eq=saturation=0.5',
            'bw': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',

            // Artistic
            'invert': 'negate',
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'ethereal': 'boxblur=3:1,eq=brightness=0.2',
            'deep-fried': 'eq=saturation=3:contrast=2,unsharp=5:5:2',

            // Retro / Noise
            'grain': 'noise=alls=15:allf=t',
            'dust': 'noise=alls=5:allf=t',
            'vhs': 'eq=saturation=1.2,noise=alls=10:allf=t'
        };

        return effects[effectId] || null;
    },

    /* =========================
       MOVEMENTS (ALL – SAFE)
    ========================= */
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const speed = parseFloat(config.speed || 1);
        const frames = Math.max(1, Math.ceil(durationSec * 30));
        const center = 'x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)';
        const base = `zoompan=d=1:s=1280x720:fps=30`;

        switch (moveId) {
            // Zooms
            case 'zoom-in':
                return `${base}:z='min(1+${0.4 * speed}*on/${frames},1.6)':${center}`;
            case 'zoom-out':
                return `${base}:z='max(1.6-${0.4 * speed}*on/${frames},1)':${center}`;
            case 'zoom-pulse':
                return `${base}:z='1+0.05*sin(on*0.15)':${center}`;

            // Pans
            case 'pan-left':
                return `${base}:z=1.1:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'pan-right':
                return `${base}:z=1.1:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'pan-up':
                return `${base}:z=1.1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${frames})'`;
            case 'pan-down':
                return `${base}:z=1.1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${frames})'`;

            // Shake / Glitch
            case 'shake':
                return `${base}:z=1.1:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*25':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*25'`;
            case 'glitch':
                return `${base}:z=1.05:x='iw/2-(iw/zoom/2)+(random(1)>0.8)*(random(1)-0.5)*120':y='ih/2-(ih/zoom/2)'`;

            // Rotate
            case 'spin':
                return `rotate=t*${0.4 * speed}:ow=iw:oh=ih:c=black`;

            default:
                return null;
        }
    },

    /* =========================
       TRANSITIONS (SAFE)
    ========================= */
    getTransitionXfade: (id) => {
        const map = {
            fade: 'fade',
            crossfade: 'fade',
            black: 'fadeblack',
            white: 'fadewhite',
            slideleft: 'slideleft',
            slideright: 'slideright',
            slideup: 'slideup',
            slidedown: 'slidedown',
            zoomin: 'zoomin',
            zoomout: 'zoomout',
            wipeleft: 'wipeleft',
            wiperight: 'wiperight'
        };
        return map[id] || 'fade';
    },

    /* =========================
       FINAL FILTER (MANDATORY)
    ========================= */
    getFinalVideoFilter: () => FINAL_FILTER
};
