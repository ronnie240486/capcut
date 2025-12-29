function interpolate(from, to, frame, total) {
  return from + (to - from) * (frame / total);
}

function buildFilters(effects, fps = 30, duration = 5) {
  const filters = [];
  const totalFrames = fps * duration;

  if (effects.zoom) {
    const z = effects.zoom;
    filters.push(
      `zoompan=z='${z.from}+(${z.to}-${z.from})*on/${z.frames}':d=${z.frames}`
    );
  }

  if (effects.rotate) {
    filters.push(`rotate=${effects.rotate.angle}*PI/180`);
  }

  if (effects.shake) {
    filters.push(
      `crop=iw-${effects.shake.intensity}:ih-${effects.shake.intensity}:` +
      `${effects.shake.intensity}*random(1):${effects.shake.intensity}*random(2)`
    );
  }

  if (effects.eq) {
    const e = effects.eq;
    filters.push(
      `eq=brightness=${e.brightness || 0}:` +
      `contrast=${e.contrast || 1}:` +
      `saturation=${e.saturation || 1}`
    );
  }

  if (effects.blur) {
    filters.push(`boxblur=${effects.blur.strength}`);
  }

  if (effects.glow) {
    filters.push(
      `split[a][b];[b]boxblur=15[b];[a][b]overlay`
    );
  }

  return filters.join(",");
}

module.exports = buildFilters;
