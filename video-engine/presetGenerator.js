/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 * High-Precision Math (720p Internal) for stability.
 */

const FINAL_FILTER =
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p,fps=30';

module.exports = {

    // =========================
    // VIDEO / AUDIO ARGS
    // =========================

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

    // =========================
    // EFFECT PRESETS
    // =========================

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'gblur=sigma=2,eq=brightness=1.1',
            'horror': 'hue=s=0.2,eq=contrast=1.5:brightness=-0.2',
            'underwater': 'colorbalance=bs=0.4:gs=0.1,eq=brightness=-0.1',
            'sunset': 'colorbalance=rs=0.3:bs=-0.2,eq=saturation=1.4',

            'bw': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',

            'grain': 'noise=alls=10:allf=t',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'pixelate': 'scale=iw/10:ih/10:flags=neighbor,scale=iw:ih:flags=neighbor'
        };

        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            return `eq=contrast=${1 + (i % 5) * 0.1}:saturation=${1 + (i % 3) * 0.2}`;
        }

        return effects[effectId] || null;
    },

    // =========================
    // MOVEMENTS (ZOOMPAN)
    // =========================

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`;

        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`;

        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        if (!moveId) return `${base}:z=1`;

        if (moveId === 'kenBurns') {
            const sS = Number(config.startScale ?? 1);
            const eS = Number(config.endScale ?? 1.3);
            const z = `${sS}+(${eS - sS})*${progress}`;
            return `${base}:z='${z}':x='${centerX}':y='${centerY}'`;
        }

        if (moveId.includes('zoom-in')) {
            return `${base}:z='1+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        }

        if (moveId.includes('zoom-out')) {
            return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        }

        if (moveId.includes('shake')) {
            return `${base}:z=1.1:x='${centerX}+random(1)*10-5':y='${centerY}+random(1)*10-5'`;
        }

        return `${base}:z=1`;
    },

    // =========================
    // TRANSITIONS (XFADE)
    // =========================

    getTransitionXfade: (id = 'fade') => {
        const map = {
            fade: 'fade',
            crossfade: 'fade',
            dissolve: 'dissolve',
            wipeleft: 'wipeleft',
            wiperight: 'wiperight',
            wipeup: 'wipeup',
            wipedown: 'wipedown',
            slideleft: 'slideleft',
            slideright: 'slideright',
            slideup: 'slideup',
            slidedown: 'slidedown',
            zoomin: 'zoomin',
            distance: 'distance',
            circleopen: 'circleopen',
            circleclose: 'circleclose',
            radial: 'radial',
            pixelize: 'pixelize'
        };

        return map[id] || 'fade';
    },

    // =========================
    // FINAL FILTER
    // =========================

    getFinalVideoFilter: () => FINAL_FILTER
};
