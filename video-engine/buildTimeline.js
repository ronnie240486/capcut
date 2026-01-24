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
        inputs.push('-loop', '1', '-t', String(duration + 2), '-i', filePath);
      } else if (clip.type === 'video') {
        inputs.push('-i', filePath);
      } else if (clip.type === 'text') {
        inputs.push(
          '-f', 'lavfi',
          '-t', String(duration + 2),
          '-i', 'color=c=black@0.0:s=1280x720:r=30'
        );
      }

      const idx = inputIndexCounter++;
      let currentV = `[${idx}:v]`;

      /* ---------- ADD FILTER (BLINDADO) ---------- */
      const addFilter = (txt) => {
        if (typeof txt !== 'string') return;

        const clean = txt.replace(/\s+/g, ' ').trim();
        if (!clean) return;

        const lbl = `v_${i}_${Math.random().toString(36).slice(2, 7)}`;
        filterChain += `${currentV}${clean}[${lbl}];`;
        currentV = `[${lbl}]`;
      };

      /* ---------- NORMALIZAÇÃO BASE ---------- */
      addFilter(
        'scale=1280:720:force_original_aspect_ratio=decrease,' +
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
        'setsar=1,format=yuv420p'
      );

      /* ---------- TRIM ---------- */
      if (clip.type !== 'image') {
        const start = clip.mediaStartOffset || 0;
        addFilter(`trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`);
      } else {
        addFilter(`trim=duration=${duration},setpts=PTS-STARTPTS`);
      }

      /* ---------- EFEITOS ---------- */
      const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
      if (typeof fx === 'string' && fx.trim()) addFilter(fx);

      /* ---------- MOVIMENTO ---------- */
      let move = null;
      if (clip.properties?.movement) {
        move = presetGenerator.getMovementFilter(
          clip.properties.movement.type,
          duration,
          clip.type === 'image',
          clip.properties.movement.config
        );
      } else if (clip.type === 'image') {
        move = presetGenerator.getMovementFilter(null, duration, true);
      }
      if (typeof move === 'string' && move.trim()) addFilter(move);

      /* ---------- TEXTO ---------- */
      if (clip.type === 'text' && clip.properties?.text) {
        const txt = clip.properties.text.replace(/'/g, '').replace(/:/g, '\\:');
        const color = clip.properties.textDesign?.color || 'white';

        addFilter(
          `drawtext=text='${txt}':fontcolor=${color}:fontsize=60:` +
          `x=(w-text_w)/2:y=(h-text_h)/2:` +
          `shadowcolor=black:shadowx=2:shadowy=2`
        );
      }

      /* ---------- NORMALIZAÇÃO FINAL PARA XFADE ---------- */
      addFilter('fps=30,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p');

      visualStreamLabels.push({
        label: currentV,
        duration,
        transition: clip.transition
      });

      /* =========================
         ÁUDIO BASE
      ========================== */

      const mediaInfo = mediaLibrary[clip.fileName];
      const albl = `a_base_${i}`;

      if (clip.type === 'video' && mediaInfo?.hasAudio) {
        const start = clip.mediaStartOffset || 0;
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

    let finalV;

    if (visualStreamLabels.length > 0) {
      let current = visualStreamLabels[0].label;
      let acc = visualStreamLabels[0].duration;

      for (let i = 1; i < visualStreamLabels.length; i++) {
        const prev = visualStreamLabels[i - 1];
        const next = visualStreamLabels[i];
        const trans = prev.transition || { id: 'fade', duration: 0.3 };
        const transId = presetGenerator.getTransitionXfade(trans.id);

        const tDur = Math.min(
          trans.duration || 0.3,
          prev.duration / 2,
          next.duration / 2
        );

        const offset = acc - tDur;
        const lbl = `mix_${i}`;

        filterChain +=
          `${current}${next.label}` +
          `xfade=transition=${transId}:duration=${tDur}:offset=${offset}` +
          `[${lbl}];`;

        current = `[${lbl}]`;
        acc = offset + tDur + (next.duration - tDur);
      }

      finalV = current;
    } else {
      inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
      finalV = `[${inputIndexCounter++}:v]`;
    }

    /* =========================
       NORMALIZAÇÃO FINAL DO VÍDEO
    ========================== */

    const vOut = '[v_final]';
    filterChain +=
      `${finalV}` +
      `scale=1280:720:force_original_aspect_ratio=decrease,` +
      `pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,` +
      `setsar=1,format=yuv420p,fps=30,setpts=N/30/TB` +
      `${vOut};`;

    /* =========================
       ÁUDIO BASE CONCAT
    ========================== */

    const baseA = '[a_base_all]';

    if (baseAudioSegments.length > 0) {
      filterChain +=
        `${baseAudioSegments.join('')}` +
        `concat=n=${baseAudioSegments.length}:v=0:a=1` +
        `${baseA};`;
    } else {
      filterChain +=
        `anullsrc=channel_layout=stereo:sample_rate=44100:d=0.1` +
        `${baseA};`;
    }

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

      const start = clip.mediaStartOffset || 0;
      const vol = clip.properties?.volume ?? 1;
      const delay = Math.round(clip.start * 1000);

      filterChain +=
        `[${idx}:a]atrim=start=${start}:duration=${clip.duration},` +
        `asetpts=PTS-STARTPTS,volume=${vol},adelay=${delay}|${delay}` +
        `[${lbl}];`;

      overlays.push(`[${lbl}]`);
    });

    /* =========================
       MIX FINAL DE ÁUDIO
    ========================== */

    let finalA = '[a_final]';

    if (overlays.length > 0) {
      filterChain +=
        `${baseA}${overlays.join('')}` +
        `amix=inputs=${overlays.length + 1}:duration=first:` +
        `dropout_transition=0:normalize=0[mixed];`;

      filterChain +=
        `[mixed]aformat=sample_rates=44100:channel_layouts=stereo${finalA}`;
    } else {
      finalA = baseA;
    }

    return {
      inputs,
      filterComplex: filterChain,
      outputMapVideo: vOut,
      outputMapAudio: finalA
    };
  }
};
