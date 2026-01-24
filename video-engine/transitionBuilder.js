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
        inputs.push('-loop', '1', '-t', (duration + 2).toString(), '-i', filePath);
      } else if (clip.type === 'video') {
        inputs.push('-i', filePath);
      } else if (clip.type === 'text') {
        inputs.push(
          '-f', 'lavfi',
          '-t', (duration + 2).toString(),
          '-i', 'color=c=black@0.0:s=1280x720:r=30'
        );
      }

      const idx = inputIndexCounter++;
      let currentV = `[${idx}:v]`;

      const addFilter = (txt) => {
        if (!txt) return;
        const lbl = `v_${i}_${Math.random().toString(36).slice(2, 7)}`;
        filterChain += `${currentV}${txt}[${lbl}];`;
        currentV = `[${lbl}]`;
      };

      /* ---------- NORMALIZAÇÃO INICIAL ---------- */
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
      if (clip.effect) {
        const fx = presetGenerator.getFFmpegFilterFromEffect(clip.effect);
        if (fx) addFilter(fx);
      }

      /* ---------- MOVIMENTO ---------- */
      let moveFilter = null;
      if (clip.properties?.movement) {
        moveFilter = presetGenerator.getMovementFilter(
          clip.properties.movement.type,
          duration,
          clip.type === 'image',
          clip.properties.movement.config
        );
      } else if (clip.type === 'image') {
        moveFilter = presetGenerator.getMovementFilter(null, duration, true);
      }

      if (moveFilter) {
        addFilter(moveFilter);
        addFilter(
          'scale=1280:720:force_original_aspect_ratio=decrease,' +
          'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
          'setsar=1'
        );
      }

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
       XFADE (VÍDEO)
    ========================== */

    let finalV;

    if (visualStreamLabels.length > 0) {
      let current = visualStreamLabels[0].label;
      let accDur = visualStreamLabels[0].duration;

      for (let i = 1; i < visualStreamLabels.length; i++) {
        const prev = visualStreamLabels[i - 1];
        const next = visualStreamLabels[i];

        const trans = prev.transition || { id: 'fade', duration: 0.1 };
        const transId = presetGenerator.getTransitionXfade(trans.id);

        const tDur = Math.min(
          trans.duration || 0.1,
          prev.duration / 2,
          next.duration / 2
        );

        const offset = accDur - tDur;
        const lbl = `mix_${i}`;

        filterChain +=
          `${current}${next.label}` +
          `xfade=transition=${transId}:duration=${tDur}:offset=${offset}` +
          `[${lbl}];`;

        current = `[${lbl}]`;
        accDur = offset + tDur + (next.duration - tDur);
      }

      finalV = current;
    } else {
      inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5');
      finalV = `[${inputIndexCounter++}:v]`;
    }

    /* =========================
       NORMALIZAÇÃO FINAL (SEM FPS)
    ========================== */

    const finalVideoLabel = 'v_final';

    filterChain +=
      `${finalV}` +
      `scale=1280:720:force_original_aspect_ratio=decrease,` +
      `pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,` +
      `setsar=1,format=yuv420p` +
      `[${finalVideoLabel}];`;

    finalV = `[${finalVideoLabel}]`;

    /* =========================
       ÁUDIO BASE CONCAT
    ========================== */

    let baseAudioLabel = '[base_audio]';

    if (baseAudioSegments.length > 0) {
      filterChain +=
        `${baseAudioSegments.join('')}` +
        `concat=n=${baseAudioSegments.length}:v=0:a=1,asetpts=PTS-STARTPTS` +
        `${baseAudioLabel};`;
    } else {
      filterChain +=
        `anullsrc=channel_layout=stereo:sample_rate=44100:d=0.1` +
        `${baseAudioLabel};`;
    }

    /* =========================
       ÁUDIOS OVERLAY
    ========================== */

    let overlayLabels = [];

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
        `asetpts=PTS-STARTPTS,volume=${vol},` +
        `adelay=${delay}|${delay}` +
        `[${lbl}];`;

      overlayLabels.push(`[${lbl}]`);
    });

    /* =========================
       MIX FINAL DE ÁUDIO
    ========================== */

    let finalA = '[final_audio]';

    if (overlayLabels.length > 0) {
      filterChain +=
        `${baseAudioLabel}${overlayLabels.join('')}` +
        `amix=inputs=${overlayLabels.length + 1}:duration=first:` +
        `dropout_transition=0:normalize=0[mixed];`;

      filterChain +=
        `[mixed]aformat=sample_rates=44100:channel_layouts=stereo` +
        `${finalA}`;
    } else {
      finalA = baseAudioLabel;
    }

    return {
      inputs,
      filterComplex: filterChain,
      outputMapVideo: finalV,
      outputMapAudio: finalA
    };
  }
};
