module.exports = {

  /* =========================
     CODECS / OUTPUT
  ========================== */

  getVideoArgs: () => [
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart'
  ],

  getAudioArgs: () => [
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100'
  ],

  getAudioExtractArgs: () => [
    '-vn',
    '-acodec', 'libmp3lame',
    '-q:a', '2'
  ],

  /* =========================
     EFFECTS
  ========================== */

  getFFmpegFilterFromEffect: (effectId) => {
    if (!effectId) return null;

    const effects = {
      // Cinematic
      'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
      'matrix': 'colorbalance=gs=0.3:rs=-0.2:bs=-0.2,eq=contrast=1.2',
      'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
      'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
      'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
      'dreamy-blur': 'boxblur=2:1,eq=brightness=0.1:saturation=1.2',
      'horror': 'hue=s=0,eq=contrast=1.5:brightness=-0.2,noise=alls=10',
      'sunset': 'colorbalance=rs=0.3:bs=-0.2,eq=saturation=1.3',
      'vibrant': 'eq=saturation=2.0',
      'muted': 'eq=saturation=0.5',
      'bw': 'hue=s=0',

      // Artistic
      'invert': 'negate',
      'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
      'high-contrast': 'eq=contrast=2.0',
      'ethereal': 'boxblur=3:1,eq=brightness=0.2',

      // Retro / Glitch (SAFE)
      'vhs-distort': 'eq=saturation=1.3,noise=alls=10',
      'grain': 'noise=alls=15',
      'dust': 'noise=alls=5',
      'pixelate': "scale='max(1,iw/16)':'max(1,ih/16)',scale=iw*16:ih*16:flags=neighbor"
    };

    if (effects[effectId]) return effects[effectId];

    if (effectId.startsWith('cg-pro-')) {
      const i = parseInt(effectId.split('-')[2]) || 1;
      return `eq=contrast=${(1 + i * 0.1).toFixed(2)}:saturation=${(1 + i * 0.2).toFixed(2)}`;
    }

    return null;
  },

  /* =========================
     MOVEMENTS (SAFE)
  ========================== */

  getMovementFilter: (moveId, duration, isImage, config = {}) => {
    const d = Math.max(1, parseFloat(duration) || 5);
    const fps = 30;
    const frames = Math.ceil(d * fps);
    const speed = Math.max(0.2, parseFloat(config.speed || 1));

    const center = 'x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)';
    const base = `:d=1:s=1280x720:fps=${fps}`;

    switch (moveId) {

      // Zooms
      case 'zoom-in':
        return `zoompan=z=1+(on/${frames})*0.3:${center}${base}`;

      case 'zoom-out':
        return `zoompan=z=1.3-(on/${frames})*0.3:${center}${base}`;

      case 'kenBurns':
        return `zoompan=z=1+(on/${frames})*0.15:${center}${base}`;

      // Pans
      case 'pan-left':
        return `zoompan=z=1.1:x=(iw-iw/zoom)*(on/${frames}):y=ih/2-(ih/zoom/2)${base}`;

      case 'pan-right':
        return `zoompan=z=1.1:x=(iw-iw/zoom)*(1-on/${frames}):y=ih/2-(ih/zoom/2)${base}`;

      case 'pan-up':
        return `zoompan=z=1.1:x=iw/2-(iw/zoom/2):y=(ih-ih/zoom)*(1-on/${frames})${base}`;

      case 'pan-down':
        return `zoompan=z=1.1:x=iw/2-(iw/zoom/2):y=(ih-ih/zoom)*(on/${frames})${base}`;

      // Shake (SAFE)
      case 'shake':
        return `zoompan=z=1.1:x=iw/2-(iw/zoom/2)+(random(1)-0.5)*20*${speed}:y=ih/2-(ih/zoom/2)+(random(1)-0.5)*20*${speed}${base}`;

      // Rotate
      case 'rotate-slow':
        return `rotate=0.05*t:ow=iw:oh=ih:c=black`;

      default:
        return null;
    }
  },

  /* =========================
     TRANSITIONS
  ========================== */

  getTransitionXfade: (id) => {
    const map = {
      fade: 'fade',
      crossfade: 'fade',
      black: 'fadeblack',
      white: 'fadewhite',
      slideleft: 'slideleft',
      slideright: 'slideright',
      slideup: 'slideup',
      slidedown: 'slidedown',
      zoomin: 'zoomin',
      zoomout: 'zoomout',
      circle: 'circleopen',
      wipe: 'wipeleft',
      glitch: 'pixelize'
    };
    return map[id] || 'fade';
  }

};
