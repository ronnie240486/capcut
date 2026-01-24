
/**
 * FFmpeg FULL PRESETS + MOVEMENTS
 * Production-safe version with FULL MAPPING
 */

const FINAL_FILTER = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p,fps=30';

module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', 
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
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
        
        // Mapeamento exato dos IDs do constants.ts para filtros FFmpeg
        const effects = {
            // Cinematic Pro
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'gblur=sigma=2,eq=brightness=1.1',
            'horror': 'hue=s=0.2,eq=contrast=1.5:brightness=-0.2',
            'underwater': 'colorbalance=bs=0.4:gs=0.1,eq=brightness=-0.1',
            'sunset': 'colorbalance=rs=0.3:bs=-0.2,eq=saturation=1.4',
            
            // Basics
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'sepia-max': 'colorbalance=rs=0.4:gs=0.2:bs=-0.4',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'posterize': 'curves=posterize',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            
            // Glitch & Artistic
            'pop-art': 'eq=saturation=2:contrast=1.3',
            'sketch-sim': 'edgedetect=mode=colormix:high=0',
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t'
        };

        // Gerador procedural para os 50 efeitos extras
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]);
            return `contrast=${1 + (i%5)*0.1}:saturation=${1 + (i%3)*0.2}`;
        }
        if (effectId.startsWith('vintage-style-')) {
             return 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1';
        }
        if (effectId.startsWith('cyber-neon-')) {
             return 'eq=contrast=1.3:saturation=1.5';
        }

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const speed = parseFloat(config.speed || config.intensity || 1);
        const frames = Math.max(1, Math.ceil(durationSec * 30));
        
        // CRITICAL: Ensure s=1280x720 is always present
        const base = `zoompan=d=1:s=1280x720:fps=30`; 

        switch (moveId) {
            case 'kenBurns':
                 // Parameters from UI (defaults if missing)
                 const sS = config.startScale !== undefined ? Number(config.startScale) : 1.0;
                 const eS = config.endScale !== undefined ? Number(config.endScale) : 1.5;
                 // Offsets in UI are -50 to 50 (percentage). Convert to -0.5 to 0.5 fraction.
                 const sX = config.startX !== undefined ? Number(config.startX) / 100 : 0;
                 const sY = config.startY !== undefined ? Number(config.startY) / 100 : 0;
                 const eX = config.endX !== undefined ? Number(config.endX) / 100 : 0;
                 const eY = config.endY !== undefined ? Number(config.endY) / 100 : 0;
                 
                 // Interpolation factor (0 to 1) based on current frame 'on'
                 const p = `on/${frames}`;
                 
                 // Zoom Expression: Linear interpolation between start and end scale
                 const zExpr = `${sS}+(${eS - sS})*${p}`;
                 
                 // X/Y Expressions:
                 // The x/y in zoompan define the top-left coordinate of the viewport.
                 // We want to control the center offset.
                 // Center X relative to image width: 0.5 + offset
                 // Top-Left X = (Center X * iw) - (Viewport Width / 2)
                 // Viewport Width = iw / zoom
                 // Formula: iw * (0.5 + offset) - (iw / zoom) / 2
                 // Simplify: iw * (0.5 - 0.5/zoom + offset)
                 // We interpolate the offset (sX to eX) using 'p'
                 
                 const xExpr = `iw*(0.5-0.5/zoom+(${sX}+(${eX - sX})*${p}))`;
                 const yExpr = `ih*(0.5-0.5/zoom+(${sY}+(${eY - sY})*${p}))`;
                 
                 return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;

            case 'zoom-in':
            case 'zoom-slow-in':
                return `${base}:z='min(1+${0.0015 * 30 * speed}*on,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'zoom-fast-in':
                 return `${base}:z='min(1+${0.003 * 30 * speed}*on,2.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'zoom-out':
            case 'zoom-slow-out':
                return `${base}:z='max(1.5-${0.0015 * 30 * speed}*on,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'pan-left':
                return `${base}:z=1.2:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'pan-right':
                return `${base}:z=1.2:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'pan-up':
                return `${base}:z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${frames})'`;
            case 'pan-down':
                return `${base}:z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${frames})'`;
            case 'shake':
            case 'earthquake':
            case 'handheld-1':
            case 'handheld-2':
                return `${base}:z=1.1:x='iw/2-(iw/zoom/2)+random(1)*${10*speed}-5':y='ih/2-(ih/zoom/2)+random(1)*${10*speed}-5'`;
            case 'pulse':
                return `${base}:z='1+0.05*sin(on/30*${speed}*6.28)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            default:
                if (isImage) return `${base}:z=1`; // Static fix
                return null;
        }
    },

    getTransitionXfade: (id) => {
        const map = {
            // Basics
            'crossfade': 'fade',
            'mix': 'fade',
            'fade-classic': 'fade',
            'fade': 'fade',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flash-white': 'fadewhite',
            'flash': 'fadewhite',
            
            // Blur (Requested specifically)
            'blur-dissolve': 'distance',
            'blur': 'distance',
            'dynamic-blur': 'distance',
            'zoom-blur-l': 'hblur', // Approximation
            'zoom-blur-r': 'hblur',

            // Wipes & Slides
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'push-left': 'slideleft',
            'push-right': 'slideright',
            
            // Geometric
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'clock-wipe': 'clock',
            'diamond-in': 'diagtl',
            'diamond-out': 'diagbr',
            'checker-wipe': 'checkerboard',
            'checkerboard': 'checkerboard',
            'blind-h': 'hlslice',
            'blind-v': 'vuslice',
            
            // Zooms
            'zoom-in': 'zoomin',
            'zoomin': 'zoomin',
            'zoom-out': 'zoomout',
            'zoomout': 'zoomout',
            'pull-away': 'zoomout',
            'dreamy-zoom': 'circlecrop',

            // Glitch & Trends (Approximations using standard xfades)
            'glitch': 'pixelize',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'hblur',
            'color-glitch': 'distance',
            'urban-glitch': 'squeezev',
            'rip-diag': 'wipetl',
            'burn-paper': 'fadewhite',
            'liquid-melt': 'hlslice',
            'ink-splash': 'circleopen',
            'blood-mist': 'dissolve',
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'fire-burn': 'hlslice',
            'visual-buzz': 'hblur',
            'zoom-neg': 'zoomout',
            'infinity-1': 'kaleidoscope',
            'digital-paint': 'pixelize',
            'brush-wind': 'wipetl',
            'dust-burst': 'circleopen',
            'filter-blur': 'distance',
            'film-roll-v': 'slideup',
            'astral-project': 'dissolve',
            'lens-flare': 'fadewhite',
            'flashback': 'fade',
            'combine-overlay': 'dissolve',
            'combine-mix': 'dissolve',
            'nightmare': 'fadeblack',
            'bubble-blur': 'distance',
            'paper-unfold': 'horzopen',
            'corrupt-img': 'pixelize',
            'glow-intense': 'fadewhite',
            'glitch-chroma': 'hblur',
            'hologram': 'pixelize',
            'block-glitch': 'pixelize',
            'cyber-zoom': 'zoomin',
            'scan-line-v': 'vuslice',
            'color-tear': 'wipetl',
            'digital-noise': 'pixelize',
            'water-ripple': 'radial',
            'smoke-reveal': 'fade',
            'bubble-pop': 'circleopen',
            'mosaic-small': 'pixelize',
            'mosaic-large': 'pixelize',
            'triangle-wipe': 'diagtl',
            'star-zoom': 'circleopen',
            'spiral-wipe': 'clock',
            'grid-flip': 'checkerboard',
            'dots-reveal': 'circleopen',
            'page-turn': 'slideleft',
            'paper-rip': 'wipetl',
            'sketch-reveal': 'dissolve',
            'fold-up': 'vertclose',
            'cube-rotate-l': 'slideleft',
            'cube-rotate-r': 'slideright',
            'cube-rotate-u': 'slideup',
            'cube-rotate-d': 'slidedown',
            'door-open': 'horzopen',
            'flip-card': 'horzopen',
            'room-fly': 'zoomin',
            'spin-zoom-in': 'zoomin',
            'spin-zoom-out': 'zoomout',
            'whip-diagonal-1': 'diagtl',
            'whip-diagonal-2': 'diagtr',
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'burn': 'fadewhite',
            'bokeh-blur': 'distance',
            'light-leak-tr': 'diagtr',
            'flare-pass': 'slideleft',
            'prism-split': 'dissolve',
            'god-rays': 'radial',
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur',
            'zoom-spin-fast': 'zoomin',
            'spin-cw': 'radial',
            'spin-ccw': 'radial',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-up': 'slideup',
            'whip-down': 'slidedown',
            'perspective-left': 'slideleft',
            'perspective-right': 'slideright',
            'glitch-scan': 'vuslice',
            'datamosh': 'pixelize',
            'rgb-split': 'hblur',
            'noise-jump': 'pixelize',
            'cyber-slice': 'wipetl',
            'swirl': 'radial',
            'kaleidoscope': 'kaleidoscope',
            'water-drop': 'radial',
            'wave': 'hblur',
            'stretch-h': 'squeezeh',
            'stretch-v': 'squeezev',
            'morph': 'dissolve',
            'turbulence': 'hblur',
            'shutters': 'horzclose',
            'wipe-radial': 'clock',
            'diamond-zoom': 'diagtl',
            'hex-reveal': 'circleopen',
            'stripes-h': 'hlslice',
            'stripes-v': 'vuslice',
            'heart-wipe': 'circleopen',
            'luma-fade': 'dissolve',
            'film-roll': 'slideup',
            'blur-warp': 'distance'
        };

        return map[id] || 'fade';
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
