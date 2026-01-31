
/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 */

module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', 
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
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
        
        // Massive Effect Mapping
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
            
            // Basics & Artistic
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            'pop-art': 'eq=saturation=2:contrast=1.3',
            
            // Glitch & Distortion
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t',
            'old-film': 'noise=alls=20:allf=t+u,eq=contrast=1.2', 
            'grain': 'noise=alls=10:allf=t',
        };

        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            return `contrast=${1 + (i%5)*0.1}:saturation=${1 + (i%3)*0.2}`;
        }
        if (effectId.startsWith('vintage-style-')) {
             return 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1';
        }
        if (effectId.startsWith('cyber-neon-')) {
             return 'eq=contrast=1.3:saturation=1.5';
        }
        if (effectId.startsWith('noir-style-')) {
            return 'hue=s=0,eq=contrast=1.2';
        }
        if (effectId.startsWith('film-stock-')) {
            return 'eq=contrast=1.1:saturation=0.8';
        }

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w: 1280, h: 720}, targetFps = 30) => {
        const fps = targetFps;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; 
        
        const procW = Math.ceil(targetRes.w * 1.5);
        const procH = Math.ceil(targetRes.h * 1.5);
        
        const base = `zoompan=d=${isImage ? frames : 1}:s=${procW}x${procH}:fps=${fps}`; 

        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        if (moveId === 'kenBurns') {
             const sS = config.startScale !== undefined ? Number(config.startScale) : 1.0;
             const eS = config.endScale !== undefined ? Number(config.endScale) : 1.3;
             const startXNorm = 0.5 + (config.startX !== undefined ? Number(config.startX) / 100 : 0);
             const startYNorm = 0.5 + (config.startY !== undefined ? Number(config.startY) / 100 : 0);
             const endXNorm = 0.5 + (config.endX !== undefined ? Number(config.endX) / 100 : 0);
             const endYNorm = 0.5 + (config.endY !== undefined ? Number(config.endY) / 100 : 0);
             
             const zExpr = `${sS}+(${eS - sS})*${progress}`;
             const xExpr = `iw*(${startXNorm}+(${endXNorm - startXNorm})*${progress})-(iw/zoom/2)`;
             const yExpr = `ih*(${startYNorm}+(${endYNorm - startYNorm})*${progress})-(ih/zoom/2)`;
             
             return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;
        }

        if (moveId && moveId.startsWith('mov-pan-')) {
            const panType = moveId.replace('mov-pan-', '');
            const z = 1.2; 
            
            if (panType === 'slow-l' || panType === 'left') return `${base}:z=${z}:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`; 
            if (panType === 'slow-r' || panType === 'right') return `${base}:z=${z}:x='iw*(0.6-(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
            if (panType === 'slow-u' || panType === 'up') return `${base}:z=${z}:x='${centerX}':y='ih*(0.4+(0.2)*${progress})-(ih/zoom/2)'`;
            if (panType === 'slow-d' || panType === 'down') return `${base}:z=${z}:x='${centerX}':y='ih*(0.6-(0.2)*${progress})-(ih/zoom/2)'`;
            if (panType === 'fast-l') return `${base}:z=${z}:x='iw*(0.3+(0.4)*${progress})-(iw/zoom/2)':y='${centerY}'`;
            if (panType === 'fast-r') return `${base}:z=${z}:x='iw*(0.7-(0.4)*${progress})-(iw/zoom/2)':y='${centerY}'`;
            if (panType.includes('diag')) return `${base}:z=${z}:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='ih*(0.4+(0.2)*${progress})-(ih/zoom/2)'`;
        }

        if (moveId && (moveId.startsWith('mov-zoom-') || moveId.includes('zoom-'))) {
            if (moveId === 'zoom-in' || moveId === 'zoom-slow-in') return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'zoom-out' || moveId === 'zoom-slow-out') return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'zoom-fast-in') return `${base}:z='1.0+(1.0)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'dolly-zoom') return `${base}:z='1.0+(0.5)*sin(on/${fps}*3)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('crash-in')) return `${base}:z='1.0+3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('crash-out')) return `${base}:z='4.0-3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('bounce') || moveId === 'zoom-bounce') return `${base}:z='1.2+0.1*sin(on/${fps}*3)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('pulse')) return `${base}:z='1.1+0.05*sin(on/${fps}*10)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('wobble')) return `${base}:z='1.1+0.02*sin(on/10)':x='${centerX}+10*cos(on/15)':y='${centerY}'`;
            if (moveId.includes('twist')) return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`; 
        }

        if (['shake', 'earthquake', 'handheld-1', 'handheld-2', 'jitter', 'mov-shake-violent'].includes(moveId) || moveId?.includes('jitter') || moveId?.includes('shake')) {
            const intensity = moveId === 'earthquake' || moveId.includes('violent') ? 20 : 5;
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        if (moveId && moveId.startsWith('mov-blur-')) {
            if (moveId === 'mov-blur-zoom') return `${base}:z='1+0.5*${progress}':x='${centerX}':y='${centerY}'`;
        }
        
        if (moveId && moveId.startsWith('mov-3d-')) {
             if (moveId.includes('float')) return `${base}:z=1.1:x='${centerX}':y='${centerY}+10*sin(on/${fps})'`;
             return `${base}:z='1.1+0.1*sin(on/${fps/1.5})':x='${centerX}+10*cos(on/${fps/0.75})':y='${centerY}'`;
        }
        
        if (moveId && (moveId.includes('elastic') || moveId.includes('bounce') || moveId.includes('spring'))) {
            return `${base}:z=1.0:x='${centerX}':y='${centerY}+50*abs(sin(on/${fps/3}))*exp(-on/${fps})'`; 
        }
        
        if (moveId === 'mov-vhs-tracking') {
             return `${base}:z=1.0:y='${centerY}+5*sin(on*100)'`; 
        }

        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        if (!id) return 'fade';
        const normId = id.toLowerCase();
        
        const map = {
            // BASIC
            'crossfade': 'fade',
            'fade': 'fade',
            'mix': 'dissolve',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'fade-classic': 'fade',
            'luma-fade': 'fade',

            // MOTION
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'push-left': 'slideleft',
            'push-right': 'slideright',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-up': 'slideup',
            'whip-down': 'slidedown',
            'whip-diagonal-1': 'diagtl',
            'whip-diagonal-2': 'diagbr',
            
            // ZOOM
            'zoom-in': 'zoomin',
            'zoomin': 'zoomin',
            'zoom-out': 'radial', 
            'zoom-neg': 'distance', 
            'cyber-zoom': 'zoomin',
            'pull-away': 'distance',

            // GLITCH & CYBER
            'glitch': 'pixelize',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'glitch-scan': 'hblur',
            'scan-v': 'hblur',
            'rgb-split': 'hblur',
            'rgb-shake': 'hblur',
            'color-glitch': 'hblur',
            'urban-glitch': 'hblur',
            'visual-buzz': 'pixelize',
            'block-glitch': 'pixelize',
            'datamosh': 'pixelize',
            'noise-jump': 'pixelize',
            'digital-noise': 'pixelize',
            'glitch-chroma': 'hblur',
            'cyber-slice': 'rectcrop',
            'hologram': 'dissolve',

            // SHAPES
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'diamond-in': 'diagtl',
            'diamond-out': 'diagbr',
            'diamond-zoom': 'diamond',
            'star-zoom': 'circleopen',
            'heart-wipe': 'circleopen', 
            'triangle-wipe': 'diagtl',
            'hex-reveal': 'mosaic',
            'mosaic-small': 'mosaic',
            'mosaic-large': 'mosaic',
            'checker-wipe': 'checkerboard',
            'checkerboard': 'checkerboard',
            'clock-wipe': 'clock',
            'plus-wipe': 'plus',
            'wipe-radial': 'radial',
            'radar': 'radial',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',

            // WIPES
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'barn-door-h': 'hlslice',
            'barn-door-v': 'hrslice',
            'blind-h': 'hlslice',
            'blind-v': 'hrslice',
            'shutters': 'hlslice',
            'stripes-h': 'hlslice',
            'stripes-v': 'hrslice',

            // 3D / FLIPS
            'cube-rotate-l': 'slideleft', 
            'cube-rotate-r': 'slideright',
            'cube-rotate-u': 'slideup',
            'cube-rotate-d': 'slidedown',
            'flip-card': 'squeezev',
            'door-open': 'hlslice',
            'room-fly': 'zoomin',
            
            // ORGANIC / LIQUID
            'liquid-melt': 'dissolve',
            'ink-splash': 'circleopen', 
            'water-drop': 'circleopen',
            'water-ripple': 'hblur',
            'wave': 'hblur',
            'swirl': 'radial',
            'morph': 'dissolve',
            'turbulence': 'dissolve',
            'blur-warp': 'hblur',

            // PAPER
            'page-turn': 'slideleft',
            'paper-rip': 'slideleft',
            'burn-paper': 'circleopen',
            'sketch-reveal': 'dissolve',
            'fold-up': 'slideup',

            // LIGHT
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flash': 'fadewhite',
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'burn': 'fadewhite',
            'light-leak-tr': 'fadewhite',
            'god-rays': 'fadewhite',
            'flare-pass': 'wipeleft',
            'bokeh-blur': 'hblur',
            'prism-split': 'dissolve',

            // ELASTIC
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur'
        };

        if (map[normId]) return map[normId];

        // Fallbacks
        if (normId.includes('wipe')) return 'wipeleft';
        if (normId.includes('slide')) return 'slideleft';
        if (normId.includes('zoom')) return 'zoomin';
        if (normId.includes('blur')) return 'hblur';
        if (normId.includes('flash')) return 'fadewhite';
        if (normId.includes('black')) return 'fadeblack';
        if (normId.includes('white')) return 'fadewhite';
        if (normId.includes('glitch')) return 'pixelize';
        if (normId.includes('burn')) return 'hlslice';
        if (normId.includes('smoke')) return 'fadeblack';
        
        return 'fade'; 
    }
};
