module.exports = {

  /* =========================
     CODECS
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

  /* =========================
     EFEITOS VISUAIS (REAIS)
  ========================== */

  getFFmpegFilterFromEffect: (id) => {
    if (!id) return null;

    const map = {
      'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
      'matrix': 'colorbalance=gs=0.3:rs=-0.2:bs=-0.2',
      'noir': 'hue=s=0,eq=contrast=1.5',
      'vintage-warm': 'colorbalance=rs=0.15:bs=-0.1,eq=gamma=1.1',
      'cyberpunk': 'eq=contrast=1.2:saturation=1.5',
      'dreamy-blur': 'boxblur=2:1',
      'horror': 'hue=s=0,noise=alls=15',
      'sunset': 'colorbalance=rs=0.3:bs=-0.2',
      'vibrant': 'eq=saturation=2',
      'muted': 'eq=saturation=0.6',
      'bw': 'hue=s=0',
      'invert': 'negate',
      'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
      'grain': 'noise=alls=10',
      'dust': 'noise=alls=5',
      'vignette': 'vignette'
    };

    if (map[id]) return map[id];

    if (id.startsWith('cg-pro-')) {
      const i = Number(id.split('-')[2]) || 1;
      return `eq=contrast=${1 + i * 0.1}:saturation=${1 + i * 0.15}`;
    }

    return null;
  },

  /* =========================
     MOVIMENTOS (SAFE)
  ========================== */

  getMovementFilter: (id, duration = 5) => {
    const fps = 30;
    const frames = duration * fps;

    switch (id) {
      case 'zoom-in':
        return `zoompan=z=1+(on/${frames})*0.3:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):s=1280x720:fps=${fps}`;
      case 'zoom-out':
        return `zoompan=z=1.3-(on/${frames})*0.3:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):s=1280x720:fps=${fps}`;
      case 'kenBurns':
        return `zoompan=z=1+(on/${frames})*0.15:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):s=1280x720:fps=${fps}`;
      case 'pan-left':
        return `zoompan=z=1.1:x=(iw-iw/zoom)*(on/${frames}):y=ih/2-(ih/zoom/2):s=1280x720:fps=${fps}`;
      case 'pan-right':
        return `zoompan=z=1.1:x=(iw-iw/zoom)*(1-on/${frames}):y=ih/2-(ih/zoom/2):s=1280x720:fps=${fps}`;
      case 'shake':
        return `zoompan=z=1.05:x=iw/2-(iw/zoom/2)+(random(1)-0.5)*20:y=ih/2-(ih/zoom/2)+(random(1)-0.5)*20:s=1280x720:fps=${fps}`;
      default:
        return null;
    }
  }

};
