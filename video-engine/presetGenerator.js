const { safe } = require('./validator');

module.exports = {

  /* =========================
     EFFECTS (FFMPEG REAIS)
  ========================== */
  getEffect(id) {
    const map = {
      'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
      'noir': 'hue=s=0,eq=contrast=1.5',
      'vintage': 'eq=gamma=1.2:saturation=0.8',
      'cyberpunk': 'eq=saturation=1.5,curves=r=\'0/0 0.5/0.7 1/1\'',
      'grain': 'noise=alls=15',
      'dust': 'noise=alls=5',
      'bw': 'hue=s=0',
      'invert': 'negate',
      'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
      'posterize': 'posterize=levels=5'
    };
    return safe(map[id]);
  },

  /* =========================
     MOVEMENTS (SAFE)
  ========================== */
  getMovement(id, duration = 5) {
    const fps = 30;
    const frames = Math.max(1, Math.floor(duration * fps));
    const c = 'x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)';

    const map = {
      'kenBurns': `zoompan=z=1+(on/${frames})*0.15:${c}:d=1:s=1280x720:fps=${fps}`,
      'zoom-in': `zoompan=z=1+(on/${frames})*0.3:${c}:d=1:s=1280x720:fps=${fps}`,
      'zoom-out': `zoompan=z=1.3-(on/${frames})*0.3:${c}:d=1:s=1280x720:fps=${fps}`,
      'pan-left': `zoompan=z=1.1:x=(iw-iw/zoom)*(on/${frames}):y=ih/2-(ih/zoom/2):d=1:s=1280x720:fps=${fps}`,
      'shake': `zoompan=z=1.1:x=iw/2-(iw/zoom/2)+(random(1)-0.5)*20:y=ih/2-(ih/zoom/2)+(random(1)-0.5)*20:d=1:s=1280x720:fps=${fps}`
    };

    return safe(map[id]);
  },

  /* =========================
     XFADE TRANSITIONS (REAIS)
  ========================== */
  getTransition(id) {
    const map = {
      fade: 'fade',
      black: 'fadeblack',
      white: 'fadewhite',
      slideleft: 'slideleft',
      slideright: 'slideright',
      slideup: 'slideup',
      slidedown: 'slidedown',
      zoomin: 'zoomin',
      zoomout: 'zoomout',
      circle: 'circleopen',
      wipe: 'wipeleft'
    };
    return map[id] || 'fade';
  }
};
