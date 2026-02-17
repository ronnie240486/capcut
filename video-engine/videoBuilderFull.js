// videoBuilderFullWithOverlays.js

const preset = require('./presetGenerator');
const transitions = require('./transitionMap');

function escapeDrawText(text) {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\')
             .replace(/:/g, '\\:')
             .replace(/'/g, "\\'")
             .replace(/\(/g, '\\(')
             .replace(/\)/g, '\\)')
             .replace(/\[/g, '\\[')
             .replace(/\]/g, '\\]');
}

function wrapText(text, maxCharsPerLine = 30) {
  if (!text) return '';
  const words = text.split(' ');
  let lines = [];
  let line = words[0] || '';
  for (let i = 1; i < words.length; i++) {
    if (line.length + 1 + words[i].length <= maxCharsPerLine) line += ' ' + words[i];
    else { lines.push(line); line = words[i]; }
  }
  lines.push(line);
  return lines.join('\n');
}

module.exports = {
  build: (clips, overlays, fileMap, exportConfig = {}) => {
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

      fc += `${cur}format=yuv420p`;
      if (c.effect) { const fx = preset.getFFmpegFilterFromEffect(c.effect); if (fx) fc += `,${fx}`; }
      if (c.movement) { const mv = preset.getMovementFilter(c.movement, c.duration); if (mv) fc += `,${mv}`; }

      const finalScale = preset.getFinalScaleFilter(targetRes, targetFps);
      fc += `,${finalScale},trim=duration=${c.duration},setpts=PTS-STARTPTS[${out}];`;

      visuals.push({ label: `[${out}]`, duration: c.duration, transition: c.transition });

      // Mapear áudio
      audioLabels.push(`[${idx - 1}:a]`);
    });

    // --- 2. APLICAR TRANSIÇÕES ---
    let finalVideo = null;
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
      finalVideo = current;
    }

    // --- 3. PROCESSAR OVERLAYS ---
    let compLabel = finalVideo || null;
    overlays.forEach((ov, i) => {
      let ovLabel = '';
      if (ov.type === 'text') {
        const txtBg = `txtbg_${i}`;
        fc += `color=c=black@0.0:s=${targetRes.width}x${targetRes.height}:r=${targetFps}:d=${ov.duration}[${txtBg}];`;
        let text = wrapText(ov.text || '', 30);
        text = escapeDrawText(text);
        let color = ov.color || 'white';
        let fontsize = Math.round((ov.fontsize || 80) * targetRes.width / 1280);
        let x = ov.x != null ? ov.x : '(w-text_w)/2';
        let y = ov.y != null ? ov.y : '(h-text_h)/2';
        let style = '';
        if (ov.stroke) style += `:borderw=${ov.stroke.width || 2}:bordercolor=${ov.stroke.color || 'black'}`;
        if (ov.shadow) style += `:shadowx=${ov.shadow.x || 2}:shadowy=${ov.shadow.y || 2}:shadowcolor=${ov.shadow.color || 'black@0.5'}`;
        const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
        fc += `[${txtBg}]drawtext=text='${text}':fontfile='${fontFile}':fontsize=${fontsize}:fontcolor=${color}:x=${x}:y=${y}${style}[txt_${i}];`;
        ovLabel = `[txt_${i}]`;
      } else if (ov.type === 'image') {
        if (!fileMap[ov.file]) return;
        inputs.push('-loop', '1', '-t', ov.duration.toString(), '-i', fileMap[ov.file]);
        const idxImg = idx++;
        ovLabel = `[${idxImg}:v]`;
        let scale = ov.scale || 0.5;
        let w = Math.max(2, Math.floor(targetRes.width * scale / 2) * 2);
        let filters = `scale=${w}:-2,format=yuv420p`;
        if (ov.rotation) filters += `,rotate=${ov.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`;
        fc += `${ovLabel}${filters}[ov_${i}];`;
        ovLabel = `[ov_${i}]`;
      }

      // Overlay no vídeo final
      const nextComp = `comp_${i}`;
      fc += `${compLabel}${ovLabel}overlay=x=${ov.x||'(W-w)/2'}:y=${ov.y||'(H-h)/2'}:enable='between(t,${ov.start||0},${(ov.start||0)+ov.duration})':eof_action=pass[${nextComp}];`;
      compLabel = `[${nextComp}]`;
    });

    // --- 4. MIXAR ÁUDIO ---
    let finalAudio = null;
    if (audioLabels.length > 0) {
      fc += `${audioLabels.join('')}amix=inputs=${audioLabels.length}:dropout_transition=0[final_audio];`;
      finalAudio = '[final_audio]';
    } else {
      // Silêncio
      inputs.push('-f', 'lavfi', '-t', '5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      finalAudio = `[${idx++}:a]`;
    }

    return {
      inputs,
      filterComplex: fc,
      mapVideo: compLabel,
      mapAudio: finalAudio,
      outputOptions: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', `${targetFps}`, '-c:a', 'aac', '-b:a', '192k']
    };
  }
};
