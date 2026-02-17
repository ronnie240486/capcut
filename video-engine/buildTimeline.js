// videoBuilderFull.js

const preset = require('./presetGenerator');
const transitions = require('./transitionMap');

module.exports = {

  build: (clips, fileMap, exportConfig = {}) => {
    let inputs = [];
    let fc = '';
    let idx = 0;
    let visuals = [];
    let audioLabels = [];

    const targetRes = exportConfig.resolution || { width: 1280, height: 720 };
    const targetFps = exportConfig.fps || 30;

    // --- 1. PROCESSAR VIDEO PRINCIPAL ---
    clips.forEach((c, i) => {
      if (!fileMap[c.file]) return;

      inputs.push('-i', fileMap[c.file]);
      const vIn = `[${idx++}:v]`;
      let cur = vIn;
      const out = `v_${i}`;

      // Normalização e efeitos
      fc += `${cur}format=yuv420p`;
      if (c.effect) {
        const fx = preset.getFFmpegFilterFromEffect(c.effect);
        if (fx) fc += `,${fx}`;
      }

      if (c.movement) {
        const mv = preset.getMovementFilter(c.movement, c.duration);
        if (mv) fc += `,${mv}`;
      }

      // Escala final e trim
      const finalScale = preset.getFinalScaleFilter(targetRes, targetFps);
      fc += `,${finalScale},trim=duration=${c.duration},setpts=PTS-STARTPTS[${out}];`;

      visuals.push({ label: `[${out}]`, duration: c.duration, transition: c.transition });

      // Mapear áudio do vídeo se existir
      const aIn = `[${idx - 1}:a]`;
      audioLabels.push(aIn);
    });

    // --- 2. APLICAR TRANSIÇÕES ---
    if (visuals.length > 0) {
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
      var finalVideo = current;
    } else {
      var finalVideo = null;
    }

    // --- 3. MIXAR ÁUDIO ---
    let finalAudio = null;
    if (audioLabels.length > 0) {
      const amixLabel = 'final_audio';
      fc += `${audioLabels.join('')}amix=inputs=${audioLabels.length}:dropout_transition=0[${amixLabel}];`;
      finalAudio = `[${amixLabel}]`;
    } else {
      // Silêncio se nenhum áudio existir
      inputs.push('-f', 'lavfi', '-t', acc || 5, '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      finalAudio = `[${idx++}:a]`;
    }

    return {
      inputs,
      filterComplex: fc,
      mapVideo: finalVideo,
      mapAudio: finalAudio,
      outputOptions: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', `${targetFps}`, '-c:a', 'aac', '-b:a', '192k']
    };
  }
};
