/**
 * FFmpeg Stable Production Config
 * FIXED: auto_scale, filter reinit, invalid frames
 * SAFE FOR SERVER
 */

const FINAL_VIDEO_FILTER = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=30';

module.exports = {
    /* ===========================
       VIDEO / AUDIO
    ============================ */
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.1',
        '-preset', 'ultrafast',
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

    /* ===========================
       EFFECTS (SAFE)
    ============================ */
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'cinematic': 'eq=contrast=1.2:saturation=1.25',
            'noir': 'hue=s=0,eq=contrast=1.4:brightness=-0.05',
            'vintage': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=contrast=0.9',
            'vibrant': 'eq=saturation=1.8',
            'muted': 'eq=saturation=0.6',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'bw': 'hue=s=0',
            'grain': 'noise=alls=10:allf=t',
            'dreamy': 'boxblur=2:1,eq=brightness=0.05',
            'glitch-lite': 'noise=alls=15:allf=t'
        };

        return effects[effectId] || null;
    },

    /* ===========================
       MOVEMENTS (SAFE & FIXED)
    ============================ */
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const speed = parseFloat(config.speed || 1);
        const frames = Math.max(1, Math.ceil(durationSec * 30));

        const center = 'x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)';

        const zoomBase = `zoompan=d=1:s=1280x720:fps=30`;

        switch (moveId) {
            case 'zoom-in':
                return `${zoomBase}:z='min(1.0+${0.4 * speed}*on/${frames},1.5)':${center}`;

            case 'zoom-out':
                return `${zoomBase}:z='max(1.5-${0.4 * speed}*on/${frames},1.0)':${center}`;

            case 'pan-left':
                return `${zoomBase}:z=1.1:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'`;

            case 'pan-right':
                return `${zoomBase}:z=1.1:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;

            case 'shake':
                return `${zoomBase}:z=1.1:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*20':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*20'`;

            case 'pulse':
                return `${zoomBase}:z='1.0+0.05*sin(on*0.2)':${center}`;

            default:
                return null;
        }
    },

    /* ===========================
       TRANSITIONS (XFADE SAFE)
    ============================ */
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

    /* ===========================
       FINAL FILTER (MANDATORY)
    ============================ */
    getFinalVideoFilter: () => FINAL_VIDEO_FILTER
};
