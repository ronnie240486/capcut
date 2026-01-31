function getTransitionXfade(id) {

    const map = {
        // TRANSIÇÕES OFICIAIS COMPLETAS DO FFMPEG 6+
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

        // VARIANTES NEGATIVAS / INVERTIDAS
        "invert": "fade,negate",
        "negative": "fade,negate",
        "invert-slide": "slideleft,negate",
        "invert-zoom": "zoomin,negate",

        // VARIANTES COMPOSTAS (efeitos extras)
        "zoom-fade": "zoomin,fade",
        "slide-fade": "slideleft,fade",
        "dream-fade": "dreamy,fade",
        "pixel-fade": "pixelize,fade",
        "warp-fade": "warpzoom,fade",
        "cube-fade": "cube,fade"
    };

    // Se existir no mapa oficial, retorna direto
    if (map[id]) return map[id];

    // FALLBACKS INTELIGENTES
    if (id.includes("neg")) return "fade,negate";
    if (id.includes("invert")) return "fade,negate";
    if (id.includes("slide")) return "slideleft";
    if (id.includes("zoom")) return "zoomin";
    if (id.includes("fade")) return "fade";
    if (id.includes("pixel")) return "pixelize";
    if (id.includes("dream")) return "dreamy";
    if (id.includes("warp")) return "warpzoom";

    // fallback final
    return "fade";
}
