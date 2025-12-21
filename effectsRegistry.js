// effectsRegistry.js
const FPS = 30;
const frames = (d) => Math.max(1, Math.round(d * FPS));

/* =========================
   MOVIMENTOS (100)
========================= */
const movements = {};

for (let i = 1; i <= 34; i++) {
  movements[`zoom_in_${i}`] =
    (d, w, h) =>
      `zoompan=z='min(zoom+${0.0008*i},${1+0.02*i})':d=${frames(d)}:s=${w}x${h}`;

  movements[`zoom_out_${i}`] =
    (d, w, h) =>
      `zoompan=z='max(zoom-${0.0008*i},1)':d=${frames(d)}:s=${w}x${h}`;

  movements[`shake_${i}`] =
    (_, w, h) =>
      `crop=w=iw-${i}:h=ih-${i}:x='${i/2}*sin(2*PI*8*t)':y='${i/2}*cos(2*PI*8*t)',scale=${w}:${h}`;
}

/* =========================
   FILTROS (100)
========================= */
const filters = {};

for (let i = 1; i <= 34; i++) {
  filters[`cinematic_${i}`] =
    `eq=contrast=${1+i*0.01}:saturation=${1-i*0.003}`;

  filters[`vivid_${i}`] =
    `eq=contrast=${1.1+i*0.01}:saturation=${1.2+i*0.01}`;

  filters[`noir_${i}`] =
    `hue=s=0,eq=contrast=${1.2+i*0.02}`;
}

/* =========================
   TRANSIÇÕES (100)
========================= */
const transitions = {};
const types = [
  "fade","dissolve","slideleft","slideright",
  "slideup","slidedown","wipeleft","wiperight",
  "circleopen","circleclose","pixelize"
];

let count = 0;
types.forEach(type => {
  [0.3,0.5,0.8,1,1.2].forEach(d => {
    if (count < 100) {
      transitions[`${type}_${d}`] =
        (offset) =>
          `xfade=transition=${type}:duration=${d}:offset=${offset}`;
      count++;
    }
  });
});

module.exports = {
  movements,
  filters,
  transitions
};
