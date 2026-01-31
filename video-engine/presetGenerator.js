// presets.js

// Lista de transições
export function getTransitionXfade(name) {
  const transitions = {
    fade: "fade",
    fadeblack: "fadeblack",
    fadewhite: "fadewhite",

    // Zoom
    zoom: "zoom",
    zoomin: "zoomin",
    zoomout: "zoomout",

    // Zoom negativo
    "zoom-neg": "zoomin",
    "zoomout-neg": "zoomout",

    // Slides
    left: "slideleft",
    right: "slideright",
    up: "slideup",
    down: "slidedown",

    // Slides negativo
    "left-neg": "slideleft",
    "right-neg": "slideright",
    "up-neg": "slideup",
    "down-neg": "slidedown",

    // Wipes
    circle: "circleopen",
    circlein: "circleclose",
    vertical: "vertopen",
    verticalin: "vertclose",
    horiz: "horzopen",
    horizin: "horzclose",

    // Wipes negativo
    "circle-neg": "circleopen",
    "circlein-neg": "circleclose",
    "vertical-neg": "vertopen",
    "verticalin-neg": "vertclose",
    "horiz-neg": "horzopen",
    "horizin-neg": "horzclose",
  };

  return transitions[name] || "fade";
}

// Detecta se a transição é negativa
export function isNegativeTransition(name) {
  return name.endsWith("-neg");
}

// Constrói a transição completa (com negativo se necessário)
export function buildXFade({ transition, duration, offset }) {
  const baseTransition = getTransitionXfade(transition);
  const negative = isNegativeTransition(transition);

  // Transição normal
  const xfade = `xfade=transition=${baseTransition}:duration=${duration}:offset=${offset}`;

  // Se não for negativa → retorna normal
  if (!negative) return xfade;

  // Se for negativa → aplica negativo SOMENTE na duração da transição
  const negate = `lutrgb=r=negval:g=negval:b=negval:enable='between(t,${offset},${offset + duration})'`;

  return `${xfade},${negate}`;
}
