/**
 * PRESET GENERATOR COMPLETO PARA FFMPEG 6+
 * Transições, movimentos e efeitos 100% compatíveis com seu pipeline.
 */

//
// --------------------------------------------------------
// 1. TRANSIÇÕES XFADE FFmpeg 6+ (com fallback)
// --------------------------------------------------------
//

function getTransitionXfade(id) {
    const map = {
        // FFmpeg 6 oficiais
        "fade": "fade",
        "wipe-left": "wipeleft",
        "wipe-right": "wiperight",
        "wipe-up": "wipeup",
        "wipe-down": "wipedown",
        "slide-left": "slideleft",
        "slide-right": "slideright",
        "slide-up": "slideup",
        "slide-down": "slidedown",
        "circle-open": "circleopen",
        "circle-close": "circleclose",
        "vert-open": "vertopen",
        "vert-close": "vertclose",
        "horz-open": "horzopen",
        "horz-close": "horzclose",
        "dissolve": "dissolve",
        "pixelize": "pixelize",
        "radial": "radial",
        "smooth-left": "smoothleft",
        "smooth-right": "smoothright",
        "smooth-up": "smoothup",
        "smooth-down": "smoothdown",
        "circle-crop": "circlecrop",
        "rect-crop": "rectcrop",
        "distance": "distance",
        "fade-black": "fadeblack",
        "fade-white": "fadewhite",
        "fade-gray": "fadegrayscale",
        "zoom": "zoom",
        "zoom-in": "zoomin",
        "zoom-out": "zoomout",
        "swap": "swap",
        "rotate": "rotate",
        "dreamy": "dreamy",
        "cross-warp": "crosswarp",
        "warp-zoom": "warpzoom",
        "wind": "wind",
        "heart": "heart",
        "cube": "cube",
        "doorway": "doorway",
        "squeeze": "squeeze",
        "tv-off": "tvturnoff",
        "tv-static": "tvstatic",
        "polkadots": "polkadots",
        "ripple": "ripple",
        "waterdrop": "waterdrop",

        // VARIANTES NEGATIVAS
        "neg": "fade,negate",
        "negative": "fade,negate",
        "invert": "fade,negate",
        "invert-slide": "slideleft,negate",
        "invert-zoom": "zoomin,negate",

        // COMPOSTAS
        "zoom-neg": "zoomin,negate",
        "zoom-fade": "zoomin,fade",
        "zoom-pixel": "zoomin,pixelize",
        "slide-neg": "slideleft,negate",
        "pixel-fade": "pixelize,fade",
        "dream-fade": "dreamy,fade",
        "cube-fade": "cube,fade",
        "warp-fade": "warpzoom,fade"
    };

    if (map[id]) return map[id];

    // FALLBACKS automáticos
    if (id.includes("neg")) return "fade,negate";
    if (id.includes("invert")) return "fade,negate";
    if (id.includes("zoom")) return "zoomin";
    if (id.includes("slide")) return "slideleft";
    if (id.includes("fade")) return "fade";
    if (id.includes("pixel")) return "pixelize";
    if (id.includes("dream")) return "dreamy";
    if (id.includes("warp")) return "warpzoom";

    return "fade";
}

//
// --------------------------------------------------------
// 2. MOVEMENTS (Zoom / Pan / Ken Burns / Shake / Slide)
// --------------------------------------------------------
//

function getMovementFilter(type, duration, isImage, config = {}, targetRes, fps) {
    if (!type && isImage) {
        // Imagem estática com zoom neutro (garante buffer fixo)
        return `zoompan=z=1:d=${Math.round(duration * fps)}:fps=${fps}`;
    }

    switch (type) {

        case "kenburns-in":
            return `zoompan=z='1+0.1*t/${duration}':x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':fps=${fps}:d=${Math.round(duration*fps)}`;

        case "kenburns-out":
            return `zoompan=z='1.1-0.1*t/${duration}':x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':fps=${fps}:d=${Math.round(duration*fps)}`;

        case "zoom-in":
            return `zoompan=z='1+0.15*t/${duration}':fps=${fps}:d=${Math.round(duration*fps)}`;

        case "zoom-out":
            return `zoompan=z='1.15-0.15*t/${duration}':fps=${fps}:d=${Math.round(duration*fps)}`;

        case "pan-left":
            return `zoompan=z=1:x='t*20':fps=${fps}:d=${Math.round(duration*fps)}`;

        case "pan-right":
            return `zoompan=z=1:x='-t*20':fps=${fps}:d=${Math.round(duration*fps)}`;

        case "shake":
            return `tblend=all_mode=difference,eq=brightness=0.03:saturation=1.4`;

        default:
            return null;
    }
}

//
// --------------------------------------------------------
// 3. EFFECTS (Color, blur, glitch, chroma, etc.)
// --------------------------------------------------------
//

function getFFmpegFilterFromEffect(effect) {
    if (!effect) return "";

    switch (effect) {

        case "bw":
        case "blackwhite":
            return "format=gray";

        case "sepia":
            return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";

        case "vintage":
            return `curves=preset=vintage`;

        case "blur":
            return "boxblur=10";

        case "gaussian-blur":
            return "gblur=sigma=8";

        case "edge":
            return "edgedetect=low=0.1:high=0.3";

        case "cartoon":
            return "toon";

        case "glitch":
            return "shuffleframes=pattern='2 3 1'";

        case "chromatic":
            return "chromashift=rh=5:bh=-5";

        case "vibrance":
            return "eq=saturation=1.6";

        case "exposure-up":
            return "eq=brightness=0.08:contrast=1.15";

        case "exposure-down":
            return "eq=brightness=-0.08:contrast=0.85";

        case "invert":
        case "negative":
            return "negate";

        default:
            return "";
    }
}

//
// --------------------------------------------------------
// EXPORTAÇÃO 100% COMPATÍVEL
// --------------------------------------------------------
//

module.exports = {
    getTransitionXfade,
    getMovementFilter,
    getFFmpegFilterFromEffect
};
