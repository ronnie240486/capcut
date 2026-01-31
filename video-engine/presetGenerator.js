/**
 * FFmpeg FULL PRESETS + MOVEMENT & XFADE ENGINE
 * Compatível com FFmpeg 6+
 */

module.exports = {
    // --------------------------
    //  VIDEO PRESETS
    // --------------------------
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
    ],

    // --------------------------
    //  AUDIO PRESETS
    // --------------------------
    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2'
    ],

    // --------------------------
    //  AUDIO EXTRACT / PODCAST
    // --------------------------
    getAudioExtractArgs: () => [
        '-vn',
        '-acodec', 'libmp3lame',
        '-q:a', '2'
    ],

    // --------------------------
    //  EFFECT FILTERS
    // --------------------------
    getFFmpegFilterFromEffect: (id) => {
        if (!id) return null;

        const FX = {
            bw: 'hue=s=0',
            mono: 'hue=s=0',
            vivid: 'eq=saturation=1.5:contrast=1.1',
            sepia: 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            invert: 'negate',
            grain: 'noise=alls=10',
            blur: 'gblur=sigma=2',
            cyberpunk: 'eq=contrast=1.3:saturation=1.5',
            noir: 'hue=s=0,eq=contrast=1.4',
            warm: 'colorbalance=rs=0.1:bs=-0.1',
            cool: 'colorbalance=bs=0.1:rs=-0.1',
            pixelate: 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor'
        };

        return FX[id] || null;
    },

    // --------------------------
    //  MOVEMENT FILTERS
    // --------------------------
    getMovementFilter(moveId, durationSec = 5, isImage = false, cfg = {}, targetRes = {w: 1280, h: 720}, fps = 30) {

        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`;

        const base = `zoompan=d=${isImage ? frames : 1}:s=${targetRes.w}x${targetRes.h}:fps=${fps}`;
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // Zoom In
        if (moveId === 'zoom-in')
            return `${base}:z='1.0+(0.5*${progress})':x='${centerX}':y='${centerY}'`;

        // Zoom Out
        if (moveId === 'zoom-out')
            return `${base}:z='1.5-(0.5*${progress})':x='${centerX}':y='${centerY}'`;

        // Pan esquerda
        if (moveId === 'pan-left')
            return `${base}:z='1.2':x='iw*(0.4+0.2*${progress})-(iw/zoom/2)':y='${centerY}'`;

        // Pan direita
        if (moveId === 'pan-right')
            return `${base}:z='1.2':x='iw*(0.6-0.2*${progress})-(iw/zoom/2)':y='${centerY}'`;

        // Shake leve
        if (moveId === 'shake')
            return `${base}:z=1.1:x='${centerX}+random(1)*5-2.5':y='${centerY}+random(1)*5-2.5'`;

        // Efeito padrão para imagens
        if (isImage) return `${base}:z=1`;

        return null;
    },

    // --------------------------
    //  XFADE TRANSITIONS (FFmpeg 6+ SAFE)
    // --------------------------
    getTransitionXfade: (id) => {
        if (!id) return 'fade';

        const XFADE = {
            "fade": "fade",
            "dissolve": "dissolve",
            "white": "fadewhite",
            "black": "fadeblack",
            "fadewhite": "fadewhite",
            "fadeblack": "fadeblack",

            // slides
            "slide-left": "slideleft",
            "slide-right": "slideright",
            "slide-up": "slideup",
            "slide-down": "slidedown",

            // wipes
            "wipe-left": "wipeleft",
            "wipe-right": "wiperight",
            "wipe-up": "wipeup",
            "wipe-down": "wipedown",

            // circle / geometry
            "circle-open": "circleopen",
            "circle-close": "circleclose",
            "diag-tl": "diagtl",
            "diag-tr": "diagtr",
            "diag-bl": "diagbl",
            "diag-br": "diagbr",

            // digital
            "pixelize": "pixelize",
            "radial": "radial",

            // avançados
            "smooth-left": "smoothleft",
            "smooth-right": "smoothright",
            "smooth-up": "smoothup",
            "smooth-down": "smoothdown",

            // moderno FFmpeg 6
            "distance": "distance"
        };

        return XFADE[id] || 'fade';
    }
};
