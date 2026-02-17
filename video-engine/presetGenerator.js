export default {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-vsync', '1',
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2'
    ],

    getAudioExtractArgs: () => [
        '-vn',
        '-acodec', 'libmp3lame',
        '-q:a', '2'
    ],

    // -------------------------------------------
    // ✔️ VERSÃO CORRETA DO getFinalScaleFilter
    // -------------------------------------------
    getFinalScaleFilter: (targetRes, targetFps) => {
        return [
            `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease:flags=lanczos`,
            `pad=${targetRes.w}:${targetRes.h}:(${targetRes.w}-iw)/2:(${targetRes.h}-ih)/2:color=black`,
            `setsar=1`,
            `fps=${targetFps}`,
            `format=yuv420p`
        ].join(",");
    },

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'scan-line-v': 'drawgrid=x=0:w=4:t=1:c=black@0.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'rgb-split': "geq=r='p(X+10,Y)':g='p(X,Y)':b='p(X-10,Y)'",
            'pixelate': 'scale=iw/20:ih/20:flags=nearest,scale=iw*20:ih*20:flags=neighbor',
            'block-glitch': 'scale=iw/10:ih/10:flags=nearest,scale=iw*10:ih*10:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u,eq=contrast=1.5:brightness=0.1',
            'vhs-distort': 'curves=r=0/0.1 0.5/0.5 1/1:g=0/0 0.5/0.5 1/1:b=0/0 0.5/0.5 1/0.9,noise=alls=10:allf=t+u,eq=saturation=1.3',
            'glitch-pro-1': "geq=r='p(X+10*sin(T*10),Y)':g='p(X,Y)':b='p(X,Y)'",

            'zoom-neg': 'negate',
            'negative': 'negate',
            'invert': 'negate',
            'flash-chroma': 'hue=h=90:s=2',
            'flash-c': 'hue=h=90:s=2',
            'color-glitch': 'hue=h=180:s=2',
            'teal-orange': 'curves=r=0/0 0.25/0.15 0.5/0.5 0.75/0.85 1/1:b=0/0 0.25/0.35 0.5/0.5 0.75/0.65 1/1',
            'noir': 'hue=s=0,contrast=1.5,eq=brightness=-0.1',
            'mono': 'hue=s=0,contrast=1.2',
            'b-and-w-low': 'hue=s=0,contrast=1.2',
            'vintage-warm': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
            'sepia': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
            'cool-morning': 'curves=r=0/0 1/0.8:g=0/0 1/0.8:b=0/0 1/1',
            'cool': 'eq=saturation=0.8,colorbalance=rs=-0.1:gs=0:bs=0.1',
            'cold-blue': 'hue=h=10,eq=saturation=0.5,colorbalance=bs=0.3',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=rs=0.2:gs=-0.1:bs=0.3',
            'radioactive': 'hue=h=90:s=2,eq=contrast=1.5',
            'night-vision': 'hue=s=0,colorbalance=gs=0.5,noise=alls=30:allf=t+u',

            'old-film': 'noise=alls=20:allf=t+u,vignette=PI/4,hue=s=0.5',
            'grain': 'noise=alls=30:allf=t+u',
            'noise': 'noise=alls=50:allf=t+u',
            'vignette': 'vignette=PI/3',
            'super8': 'vignette=PI/4,hue=s=0.7,curves=r=0/0 0.5/0.6 1/1:b=0/0 0.5/0.4 1/1',

            'pop-art': 'eq=saturation=3:contrast=1.5',
            'sketch-sim': 'edgedetect=low=0.1:high=0.4,negate,hue=s=0',
            'dreamy': 'gblur=sigma=5,eq=brightness=0.1:saturation=1.2',
            'soft-angel': 'gblur=sigma=2,eq=brightness=0.2:contrast=0.9',
            'underwater': 'eq=saturation=0.8,colorbalance=rs=-0.2:gs=0.1:bs=0.3,gblur=sigma=2'
        };

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = { w: 1280, h: 720 }, targetFps = 30) => {
        const fps = targetFps || 30;
        const w = targetRes.w;
        const h = targetRes.h;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`;

        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        if (!moveId) {
            return `zoompan=z='1':x='${centerX}':y='${centerY}':d=${frames}:fps=${fps}:s=${w}x${h}`;
        }

        if (moveId === 'kenBurns') {
            const start = config.startScale || 1.0;
            const end = config.endScale || 1.3;
            return `zoompan=z='${start}+(${end}-${start})*${progress}':x='${centerX}':y='${centerY}':d=${frames}:fps=${fps}:s=${w}x${h}`;
        }

        if (moveId === 'zoom-in') {
            return `zoompan=z='1.0+(0.05*${progress})':x='${centerX}':y='${centerY}':d=${frames}:fps=${fps}:s=${w}x${h}`;
        }

        return null;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade': 'fade',
            'crossfade': 'fade',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',

            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'rect-crop': 'rectcrop',
            'radial': 'radial',
            'clock-wipe': 'radial',
            'spiral-wipe': 'radial',

            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'smooth-left': 'smoothleft',
            'smooth-right': 'smoothright',
            'squeeze-h': 'squeezeh',
            'squeeze-v': 'squeezev',
            'zoom-in': 'zoomin',

            'page-turn': 'wipetl',
            'cube-rotate-l': 'slideleft',
            'cube-rotate-r': 'slideright',
            'spin-cw': 'radial',
            'spin-ccw': 'radial',

            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-up': 'slideup',
            'whip-down': 'slidedown',

            'pixelize': 'pixelize',
            'glitch': 'slideleft',
            'pixel-sort': 'pixelize',
            'hologram': 'pixelize'
        };

        return map[id] || 'fade';
    }
};
