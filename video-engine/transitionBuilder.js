const presetGenerator = require('./presetGenerator.js');

module.exports = {
  buildTimeline: (clips, fileMap, mediaLibrary) => {
    let inputs = [];
    let filterChain = '';
    let inputIndexCounter = 0;

    /* =========================
       SEPARAÇÃO DE CLIPES
    ========================== */

    const visualClips = clips
      .filter(c =>
        ['video', 'camada', 'text', 'subtitle'].includes(c.track) ||
        ['video', 'image', 'text'].includes(c.type)
      )
      .sort((a, b) => a.start - b.start);

    const audioClips = clips.filter(c =>
      ['audio', 'music', 'sfx', 'narration'].includes(c.track) ||
      (c.type === 'audio' && !['video', 'camada'].includes(c.track))
    );

    let visualStreamLabels = [];
    let baseAudioSegments = [];

    /* =========================
       PIPELINE VISUAL
    ========================== */

    visualClips.forEach((clip, i) => {
      const filePath = fileMap[clip.fileName];
      if (!filePath && clip.type !== 'text') return;

      const duration = Number(clip.duration) || 5;

      /* ---------- INPUT ---------- */
      if (clip.type === 'image') {
        inputs.push('-loop', '1', '-t', duration.toString(), '-i', filePath);
      } else if (clip.type === 'video') {
        inputs.push('-i', filePath);
      } else if (clip.type === 'text') {
        inputs.push(
          '-f', 'lavfi',
          '-t', duration.toString(),
          '-i', 'color=c=black@0.0:s=1280x720:r=30'
        );
      }

      const idx = inputIndexCounter++;
      let currentV = `[${idx}:v]`;

      const add = (txt) => {
        if (!txt) return;
        const lbl = `v_${i}_${Math.random().toString(36).slice(2, 7)}`;
        filterChain += `${currentV}${txt}[${lbl}];`;
        currentV = `[${lbl}]`;
      };

      /* ---------- NORMALIZAÇÃO BASE ---------- */
      add(
        'scale=1280:720:force_original_aspect_ratio=decrease,' +
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
        'setsar=1,fps=30,format=yuv420p'
      );

      /* ---------- TRIM ---------- */
      const start = clip.mediaStartOffset || 0;
      add(`trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`);

      /* ---------- EFEITOS ---------- */
      if (clip.effect) {
        const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
        if (fx) add(`,${fx}`);
      }

      /* ---------- MOVIMENTO ---------- */
      if (clip.properties?.movement) {
        const mv = presetGenerator.getMovementFilter(
          clip.properties.movement.type,
          duration,
          clip.type === 'image',
          clip.properties.movement.config
        );
        if (mv) add(`,${mv}`);
      }

      /* ---------- TEXTO ---------- */
      if (clip.type === 'text' && clip.properties?.text) {
        const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
        add(
          `,drawtext=text='${txt}':fontcolor=white:fontsize=60:` +
          `x=(w-text_w)/2:y=(h-text_h)/2:` +
          `shadowcolor=black:shadowx=2:shadowy=2`
        );
      }

      visualStreamLabels.push({
        label: currentV,
        duration,
        transition: clip.transition
      });

      /* =========================
         ÁUDIO BASE
      ========================== */

      const albl = `a_base_${i}`;

      if (clip.type === 'video' && mediaLibrary[clip.fileName]?.hasAudio) {
        filterChain +=
          `[${idx}:a]atrim=start=${start}:duration=${duration},` +
          `asetpts=PTS-STARTPTS[${albl}];`;
      } else {
        filterChain +=
          `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}` +
          `[${albl}];`;
      }

      baseAudioSegments.push(`[${albl}]`);
    });

    /* =========================
       XFADE (TRANSIÇÕES)
    ========================== */

    let finalV = visualStreamLabels[0].label;
    let acc = visualStreamLabels[0].duration;

    for (let i = 1; i < visualStreamLabels.length; i++) {
      const prev = visualStreamLabels[i - 1];
      const next = visualStreamLabels[i];
      const trans = prev.transition || { id: 'fade', duration: 0.4 };
      const transId = presetGenerator.getTransitionXfade(trans.id);

      const tDur = Math.max(
        0.25,
        Math.min(trans.duration || 0.4, prev.duration / 2, next.duration / 2)
      );

      const offset = acc - tDur;
      const lbl = `xf_${i}`;

      filterChain +=
        `${finalV}${next.label}` +
        `xfade=transition=${transId}:duration=${tDur}:offset=${offset}` +
        `[${lbl}];`;

      finalV = `[${lbl}]`;
      acc += next.duration - tDur;
    }

    /* =========================
       SAÍDA FINAL DE VÍDEO
    ========================== */

    filterChain +=
      `${finalV}fps=30,format=yuv420p[v_final];`;

    /* =========================
       ÁUDIO BASE CONCAT
    ========================== */

    filterChain +=
      `${baseAudioSegments.join('')}` +
      `concat=n=${baseAudioSegments.length}:v=0:a=1[a_base];`;

    /* =========================
       ÁUDIOS OVERLAY
    ========================== */

    let overlays = [];

    audioClips.forEach((clip, i) => {
      const filePath = fileMap[clip.fileName];
      if (!filePath) return;

      inputs.push('-i', filePath);
      const idx = inputIndexCounter++;
      const lbl = `a_ov_${i}`;
      const delay = Math.round((clip.start || 0) * 1000);
      const vol = clip.properties?.volume ?? 1;

      filterChain +=
        `[${idx}:a]atrim=duration=${clip.duration},` +
        `asetpts=PTS-STARTPTS,volume=${vol},` +
        `adelay=${delay}|${delay}` +
        `[${lbl}];`;

      overlays.push(`[${lbl}]`);
    });

    /* =========================
       MIX FINAL DE ÁUDIO
    ========================== */

    if (overlays.length) {
      filterChain +=
        `[a_base]${overlays.join('')}` +
        `amix=inputs=${overlays.length + 1}:duration=longest:` +
        `dropout_transition=0[a_final];`;
    } else {
      filterChain += `[a_base]anull[a_final];`;
    }

    return {
      inputs,
      filterComplex: filterChain,
      outputMapVideo: '[v_final]',
      outputMapAudio: '[a_final]'
    };
  }
};
