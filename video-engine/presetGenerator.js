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

    const baseTransitions = {
        fade: "fade",
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
        dissolve: "dissolve",
        pixelize: "pixelize",
        radial: "radial",
        "smooth-left": "smoothleft",
        "smooth-right": "smoothright",
        "smooth-up": "smoothup",
        "smooth-down": "smoothdown",
        "circle-crop": "circlecrop",
        "rect-crop": "rectcrop",
        distance: "distance",
        "fade-black": "fadeblack",
        "fade-white": "fadewhite",
        "fade-gray": "fadegrayscale",
        zoom: "zoom",
        "zoom-in": "zoomin",
        "zoom-out": "zoomout",
        swap: "swap",
        rotate: "rotate",
        dreamy: "dreamy",
        "cross-warp": "crosswarp",
        "warp-zoom": "warpzoom",
        wind: "wind",
        heart: "heart",
        cube: "cube",
        doorway: "doorway",
        squeeze: "squeeze",
        "tv-off": "tvturnoff",
        "tv-static": "tvstatic",
        polkadots: "polkadots",
        ripple: "ripple",
        waterdrop: "waterdrop"
    };

    // Tabela para variantes compostas com +filtros
    const composite = {
        "invert": { base: "fade", extra: ["negate"] },
        "negative": { base: "fade", extra: ["negate"] },

        "invert-slide": { base: "slideleft", extra: ["negate"] },
        "invert-zoom": { base: "zoomin", extra: ["negate"] },

        "zoom-fade": { base: "zoomin", extra: ["fade"] },
        "slide-fade": { base: "slideleft", extra: ["fade"] },
        "dream-fade": { base: "dreamy", extra: ["fade"] },
        "pixel-fade": { base: "pixelize", extra: ["fade"] },
        "warp-fade": { base: "warpzoom", extra: ["fade"] },
        "cube-fade": { base: "cube", extra: ["fade"] }
    };

    // 1) Se é base FFmpeg
    if (baseTransitions[id]) {
        return {
            base: baseTransitions[id],
            extra: []
        };
    }

    // 2) Se é composto oficial
    if (composite[id]) return composite[id];

    // 3) Fallback inteligente
    const fallbackRules = [
        { match: "neg", base: "fade", extra: ["negate"] },
        { match: "invert", base: "fade", extra: ["negate"] },
        { match: "slide", base: "slideleft", extra: [] },
        { match: "zoom", base: "zoomin", extra: [] },
        { match: "fade", base: "fade", extra: [] },
        { match: "pixel", base: "pixelize", extra: [] },
        { match: "dream", base: "dreamy", extra: [] },
        { match: "warp", base: "warpzoom", extra: [] },
    ];

    for (const rule of fallbackRules) {
        if (id.includes(rule.match)) return rule;
    }

    // fallback final
    return { base: "fade", extra: [] };
}
