/**
 * PRESET ENGINE – VERSÃO PROFISSIONAL COMPLETA
 * Compatível com FFmpeg 5/6/7
 */

const resolutions = {
    "720p":  { w: 1280, h: 720 },
    "1080p": { w: 1920, h: 1080 },
    "4k":    { w: 3840, h: 2160 }
};

// =============================
// 1. QUALITY PRESETS
// =============================
const videoPresets = {
    pro: {
        preset: "slow",
        crf: "16",
    },
    balanced: {
        preset: "medium",
        crf: "18",
    }
};

// =============================
// 2. VIDEO ARGUMENTS
// =============================
function getVideoArgs(mode = "balanced") {
    const p = videoPresets[mode] || videoPresets.balanced;

    return [
        "-c:v", "libx264",
        "-preset", p.preset,
        "-crf", p.crf,
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-r", "30"
    ];
}

// =============================
// 3. AUDIO ARGUMENTS
// =============================
function getAudioArgs(mode = "pro") {
    return [
        "-c:a", "aac",
        "-b:a", mode === "pro" ? "256k" : "192k",
        "-ar", "48000",
        "-ac", "2"
    ];
}

// =============================
// 4. FINAL VIDEO FILTER
// =============================
function getFinalVideoFilter(res = "720p") {
    const R = resolutions[res] || resolutions["720p"];

    return [
        `scale=${R.w}:${R.h}:force_original_aspect_ratio=decrease`,
        `pad=${R.w}:${R.h}:(ow-iw)/2:(oh-ih)/2:black`,
        "unsharp=5:5:1.2:5:5:0.8",       // nitidez profissional
        "hqdn3d=1.5:1.5:6:6",            // denoise leve
        "colorspace=bt709:iall=bt601-6-625",
        "setsar=1",
        "format=yuv420p",
        "fps=30"
    ].join(",");
}

// =============================
// 5. COLOR EFFECTS
// =============================
function getColorEffect(effectId) {
    if (!effectId) return null;

    const map = {
        "teal-orange": "curves=r=0/0 0.25/0.15 0.5/0.5 0.75/0.85 1/1:b=0/0 0.25/0.35 0.5/0.5 0.75/0.65 1/1",
        "noir": "hue=s=0,contrast=1.2",
        "mono": "hue=s=0",
        "sepia": "colorchannelmixer=.393:.769:.189:.349:.686:.168:.272:.534:.131",
        "cyberpunk": "cas=0.6,vibra=50,curves=g=0/0 0.5/0.4 1/1",
        "dreamy": "gblur=sigma=2,curves=all=0/0 0.5/0.6 1/1",
        "vibrant": "vibra=intensity=0.6:saturation=1.5",
        "golden-hour": "curves=r=0/0 1/1:g=0/0 1/0.8:b=0/0 1/0.7",
        "night-vision": "hue=s=0,curves=g=0/0 1/1,noise=alls=30",
        "pixelate": "scale=iw/10:-1,scale=iw*10:-1:flags=neighbor",
        "invert": "negate",
        "deep-fried": "eq=saturation=3:contrast=2,unsharp=5:5:2.0"
    };

    if (map[effectId]) return map[effectId];

    // fallback por categorias
    if (effectId.includes("vintage")) return map["sepia"];
    if (effectId.includes("neon")) return map["cyberpunk"];

    return null;
}

// =============================
// 6. MOVIMENTOS (KEN BURNS + EASING)
// =============================
function getMovementFilter(moveId, durationSec = 5, isImage = false) {
    const fps = 30;
    const frames = Math.max(1, Math.ceil(durationSec * fps));

    const progress = `(on/${frames})`;
    const easing = `(1-(1-${progress})*(1-${progress}))`; // ease-out

    const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`;
    const centerX = `(iw/2)-(iw/zoom/2)`;
    const centerY = `(ih/2)-(ih/zoom/2)`;

    const map = {
        "kenBurns": `${base}:z='1.0+(0.3)*${easing}':x='${centerX}':y='${centerY}'`,
        "zoom-in": `${base}:z='1.0+(0.5)*${easing}':x='${centerX}':y='${centerY}'`,
        "zoom-out": `${base}:z='1.5-(0.5)*${easing}':x='${centerX}':y='${centerY}'`,
        "shake": `crop=w=iw*0.9:h=ih*0.9:x='(iw-ow)/2+((random(1)-0.5)*15)':y='(ih-oh)/2+((random(2)-0.5)*15)',scale=1280:720`
    };

    if (map[moveId]) return map[moveId];

    if (isImage) return `${base}:z='1.0+(0.05)*${easing}':x='${centerX}':y='${centerY}'`;

    return null;
}

// =============================
// 7. TRANSIÇÕES PROFISSIONAIS
// =============================
function getTransitionXfade(id) {
    const map = {
        "fade": "fade",
        "crossfade": "fade",
        "black": "fadeblack",
        "white": "fadewhite",
        "dissolve": "dissolve",
        "slide-left": "slideleft",
        "slide-right": "slideright",
        "slide-up": "slideup",
        "slide-down": "slidedown",
        "zoom-in": "zoomin",
        "zoom-out": "zoomout",
        "radial": "radial",
        "circle-open": "circleopen",
        "circle-close": "circleclose",

        // negativos corrigidos
        "negative": "fade,negate",
        "invert": "fade,negate",
        "zoom-neg": "zoomin,negate"
    };

    if (map[id]) return map[id];

    // fallback automático
    if (id.includes("neg")) return "fade,negate";
    if (id.includes("slide")) return "slideleft";
    if (id.includes("zoom")) return "zoomin";
    if (id.includes("flash")) return "fadewhite";

    return "fade";
}

module.exports = {
    getVideoArgs,
    getAudioArgs,
    getColorEffect,
    getMovementFilter,
    getTransitionXfade,
    getFinalVideoFilter
};
