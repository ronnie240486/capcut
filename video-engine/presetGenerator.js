/**
 * FFmpeg Preset + Movement + Transition Generator
 * SAFE VERSION (estável, sem crash, sem áudio infinito)
 */

const FINAL_FILTER =
  'scale=1280:720:force_original_aspect_ratio=decrease,' +
  'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
  'setsar=1,fps=30,format=yuv420p';

module.exports = {

  // ---------------- VIDEO ----------------
  getVideoArgs() {
    return [
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-profile:v', 'high',
      '-level', '4.1',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-r', '30'
    ];
  },

  // ---------------- AUDIO ----------------
  getAudioArgs() {
    return [
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2'
    ];
  },

  // ---------------- EFFECTS ----------------
  getFFmpegFilterFromEffect(effectId) {
    if (!effectId) return null;

    const effects = {
      'bw': 'hue=s=0',
      'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
      'vivid': 'eq=saturation=1.5:contrast=1.1',
      'cinematic': 'eq=contrast=1.2:saturation=1.3',
      'noir': 'hue=s=0,eq=contrast=1.4',
      'invert': 'negate',
      'grain': 'noise=alls=10:allf=t'
    };

    return effects[effectId] || null;
  },

  // ---------------- MOVEMENTS ----------------
  getMovementFilter(moveId, duration = 5, isImage = false) {
    const fps = 30;
    const frames = Math.max(1, Math.ceil(duration * fps));
    const progress = `(on/${frames})`;

    const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`;
    const cx = `(iw/2)-(iw/zoom/2)`;
    const cy = `(ih/2)-(ih/zoom/2)`;

    if (!moveId) {
      return `${base}:z=1:x='${cx}':y='${cy}'`;
    }

    if (moveId === 'zoom-in') {
      return `${base}:z='1+0.4*${progress}':x='${cx}':y='${cy}'`;
    }

    if (moveId === 'zoom-out') {
      return `${base}:z='1.4-0.4*${progress}':x='${cx}':y='${cy}'`;
    }

    if (moveId === 'pan-left') {
      return `${base}:z=1.2:x='iw*(0.6-0.2*${progress})-(iw/zoom/2)':y='${cy}'`;
    }

    if (moveId === 'pan-right') {
      return `${base}:z=1.2:x='iw*(0.4+0.2*${progress})-(iw/zoom/2)':y='${cy}'`;
    }

    if (moveId === 'shake') {
      return `${base}:z=1.05:x='${cx}+random(1)*10-5':y='${cy}+random(1)*10-5'`;
    }

    return `${base}:z=1:x='${cx}':y='${cy}'`;
  },

  // ---------------- TRANSITIONS ----------------
  getTransitionXfade(id) {
    const map = {
      fade: 'fade',
      crossfade: 'fade',
      wipe: 'wipeleft',
      slide: 'slideleft',
      zoom: 'zoomin',
      glitch: 'pixelize',
      black: 'fadeblack',
      white: 'fadewhite'
    };

    return map[id] || 'fade';
  },

  // ---------------- FINAL FILTER ----------------
  getFinalVideoFilter() {
    return FINAL_FILTER;
  }
};
