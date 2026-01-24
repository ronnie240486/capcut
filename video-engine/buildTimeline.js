const preset = require('./presetGenerator');
const transitions = require('./transitionMap');

module.exports = {

  build: (clips, fileMap) => {
    let inputs = [];
    let fc = '';
    let idx = 0;
    let visuals = [];

    clips.forEach((c, i) => {
      if (!fileMap[c.file]) return;

      inputs.push('-i', fileMap[c.file]);
      const vIn = `[${idx++}:v]`;
      let cur = vIn;
      const out = `v_${i}`;

      fc += `${cur}scale=1280:720,setsar=1,fps=30,trim=duration=${c.duration},setpts=PTS-STARTPTS`;

      if (c.effect) {
        const fx = preset.getFFmpegFilterFromEffect(c.effect);
        if (fx) fc += `,${fx}`;
      }

      if (c.movement) {
        const mv = preset.getMovementFilter(c.movement, c.duration);
        if (mv) fc += `,${mv}`;
      }

      fc += `[${out}];`;
      visuals.push({ label: `[${out}]`, duration: c.duration, transition: c.transition });
    });

    let current = visuals[0].label;
    let acc = visuals[0].duration;

    for (let i = 1; i < visuals.length; i++) {
      const t = visuals[i - 1].transition || { id: 'fade', duration: 0.3 };
      const type = transitions.getXfade(t.id);
      const d = Math.min(t.duration, visuals[i - 1].duration / 2);
      const off = acc - d;
      const lbl = `mix_${i}`;

      fc += `${current}${visuals[i].label}xfade=transition=${type}:duration=${d}:offset=${off}[${lbl}];`;
      current = `[${lbl}]`;
      acc += visuals[i].duration - d;
    }

    return {
      inputs,
      filterComplex: fc,
      mapVideo: current
    };
  }

};
