function buildTransition(aIndex, bIndex, t) {
  return `[${aIndex}:v][${bIndex}:v]xfade=` +
         `transition=${t.type}:duration=${t.duration}:offset=${t.offset || 0}`;
}

module.exports = buildTransition;
