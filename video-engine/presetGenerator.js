
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

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // --- 1. PROCEDURAL EFFECTS (MATCHING FRONTEND CONSTANTS) ---
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hue = (i * 15) % 360;
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hue}`;
        }
        
        const effects = {
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.3:gs=0:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cyberpunk': 'eq=contrast=1.4:saturation=2,colorbalance=rs=0.2:bs=0.3',
            'dreamy-blur': 'gblur=sigma=5,eq=brightness=0.1:saturation=1.2',
            'pop-art': 'eq=saturation=3:contrast=1.5'
        };
        
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        
        const id = moveId || '';
        
        if (id.includes('pan-')) {
            z = '1.2';
            if (id.includes('slow-l')) x = `(iw-ow)*(on/${frames})`;
            else if (id.includes('slow-r')) x = `(iw-ow)*(1-on/${frames})`;
            else if (id.includes('slow-u')) y = `(ih-oh)*(on/${frames})`;
            else if (id.includes('slow-d')) y = `(ih-oh)*(1-on/${frames})`;
            else if (id.includes('fast-l')) x = `(iw-ow)*((on*2)/${frames})`;
            else if (id.includes('fast-r')) x = `(iw-ow)*(1-(on*2)/${frames})`;
        } else if (id.includes('zoom-') || id === 'dolly-zoom') {
            if (id.includes('crash-in')) { z = `min(zoom+0.05,2.0)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('crash-out')) { z = `max(2.0-0.05*on,1.0)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('slow-in')) { z = `min(zoom+0.0015,1.2)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('fast-in')) { z = `min(zoom+0.005,1.5)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('slow-out')) { z = `max(1.2-0.0015*on,1.0)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id === 'dolly-zoom') { z = `1.0 + 0.3*sin(PI*on/${frames})`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
        } else if (id.includes('shake') || id.includes('earthquake')) {
            z = '1.1';
            const intensity = id.includes('earthquake') ? 40 : 10;
            x = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
            y = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
        } else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        } else if (isImage && !id) {
            z = `min(zoom+0.0015,1.5)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        
        return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'blur-dissolve': 'distance', 'filter-blur': 'distance',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash': 'fadewhite',
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright', 'push-up': 'slideup', 'push-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 'diamond-in': 'diagtl', 'diamond-out': 'diagbr',
            'clock-wipe': 'radial', 'iris-in': 'circleopen', 'iris-out': 'circleclose',
            'pixelize': 'pixelize', 'glitch': 'pixelize', 'glitch-chroma': 'pixelize', 'pixel-sort': 'pixelize',
            'color-glitch': 'hblur', 'urban-glitch': 'hblur', 'rgb-split': 'distance',
            'liquid-melt': 'dissolve', 'ink-splash': 'circleopen', 'water-ripple': 'wipetl',
            'paper-rip': 'wipetl', 'page-turn': 'wipetl',
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', 'cube-rotate-u': 'slideup', 'cube-rotate-d': 'slidedown',
            'blood-mist': 'dissolve', 'black-smoke': 'fadeblack', 'white-smoke': 'fadewhite',
            'fire-burn': 'dissolve', 'visual-buzz': 'pixelize', 'rip-diag': 'wipetl', 'zoom-neg': 'zoomout',
            'infinity-1': 'zoomin', 'digital-paint': 'pixelize', 'brush-wind': 'wipeleft', 'dust-burst': 'dissolve',
            'film-roll-v': 'slideup', 'astral-project': 'dissolve', 'lens-flare': 'fadewhite',
            'mosaic-small': 'pixelize', 'mosaic-large': 'pixelize',
            'triangle-wipe': 'diagtl', 'star-zoom': 'circleopen', 'spiral-wipe': 'radial', 'grid-flip': 'pixelize',
            'dots-reveal': 'circleopen', 'shutters': 'rectcrop', 'wipe-radial': 'radial', 'checkerboard': 'rectcrop',
            'diamond-zoom': 'diagtl', 'hex-reveal': 'circleopen', 'stripes-h': 'rectcrop', 'stripes-v': 'rectcrop',
            'heart-wipe': 'circleopen',
            'zoom-blur-l': 'slideleft', 'zoom-blur-r': 'slideright', 'spin-zoom-in': 'zoomin', 'spin-zoom-out': 'zoomout',
            'whip-diagonal-1': 'diagtl', 'whip-diagonal-2': 'diagbr',
            'flash-bang': 'fadewhite', 'exposure': 'fadewhite', 'burn': 'dissolve', 'bokeh-blur': 'distance',
            'light-leak-tr': 'dissolve', 'flare-pass': 'slideleft', 'prism-split': 'distance', 'god-rays': 'dissolve',
            'elastic-left': 'slideleft', 'elastic-right': 'slideright', 'elastic-up': 'slideup', 'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin', 'jelly': 'pixelize',
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout', 'zoom-spin-fast': 'zoomin', 'spin-cw': 'rotateccw', 'spin-ccw': 'rotatecw',
            'whip-left': 'slideleft', 'whip-right': 'slideright', 'whip-up': 'slideup', 'whip-down': 'slidedown',
            'perspective-left': 'slideleft', 'perspective-right': 'slideright',
            'glitch-scan': 'hblur', 'datamosh': 'pixelize', 'noise-jump': 'pixelize', 'cyber-slice': 'rectcrop',
            'push-left': 'slideleft', 'push-right': 'slideright', 'swirl': 'radial', 'kaleidoscope': 'circleopen',
            'water-drop': 'circleopen', 'wave': 'wipetl', 'stretch-h': 'slideleft', 'stretch-v': 'slideup',
            'morph': 'dissolve', 'turbulence': 'dissolve', 'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'distance'
        };
        return map[id] || 'fade';
    }
};
