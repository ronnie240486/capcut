

module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100'
    ],

    // Mapeamento de IDs do ProEdit para tipos internos do FFmpeg xfade
    getTransitionType: (id) => {
        const mapping = {
            // Básicos
            'crossfade': 'fade',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'mix': 'dissolve',
            
            // Geométricos
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'diamond-in': 'diamondshape',
            'diamond-out': 'diamondshape',
            'clock-wipe': 'clock',
            'plus-wipe': 'plus',
            'checker-wipe': 'checkerboard',
            'blind-h': 'horzopen',
            'blind-v': 'vertopen',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',

            // Glitch & Cyber
            'pixelize': 'pixelize',
            'glitch': 'pixelize',
            'block-glitch': 'pixelize',
            'rgb-split': 'radial',
            
            // Zoom & Spin
            'zoom-in': 'zoomin',
            'zoom-out': 'zoomin',
            'spin-zoom-in': 'circleopen',
            
            // Tendência / Especiais
            'blood-mist': 'radial',
            'fire-burn': 'fadefast',
            'luma-fade': 'radial',
            'heart-wipe': 'radial',
            'page-turn': 'slideleft'
        };
        return mapping[id] || 'fade';
    },

    getFFmpegFilterFromEffect: (effectId) => {
        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,curves=contrast',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2', 
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.4:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'mono': 'hue=s=0',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5'
        };
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec) => {
        const d = durationSec || 5;
        const totalFrames = Math.ceil(d * 30);
        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
        const baseSettings = `d=1:s=1280x720:fps=30`; 

        switch (moveId) {
            case 'mov-pan-slow-l': return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-r': return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-u': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-slow-d': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
            case 'mov-zoom-crash-in': return `zoompan=z='min(1.0+(on*1.5/15),2.0)':${center}:${baseSettings}`;
            case 'mov-zoom-crash-out': return `zoompan=z='max(2.0-(on*1.5/15),1.0)':${center}:${baseSettings}`;
            case 'mov-3d-flip-x': return `zoompan=z='1.0+0.5*abs(sin(on*0.1))':x='iw/2-(iw/zoom/2)+iw*0.2*sin(on*0.1)':${center}:${baseSettings}`;
            case 'mov-shake-violent': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*100-50':y='ih/2-(ih/zoom/2)+random(on+1)*100-50':${baseSettings}`;
            case 'pulse': return `zoompan=z='1.0+0.05*sin(on*0.1)':${center}:${baseSettings}`;
            case 'kenBurns': return `zoompan=z='min(1.0+(on*0.4/${totalFrames}),1.4)':x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
            default:
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
                }
                return null;
        }
    }
};
