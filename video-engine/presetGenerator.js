/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 * Professional Grade Mapping for XFADE
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

            // Basic & Artistic
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
            'grain': 'noise=alls=10:allf=t'
        };

        // Dynamic categories
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            return `contrast=${1 + (i % 5) * 0.1}:saturation=${1 + (i % 3) * 0.2}`;
        }
        if (effectId.startsWith('vintage-style-')) return 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1';
        if (effectId.startsWith('cyber-neon-')) return 'eq=contrast=1.3:saturation=1.5';
        if (effectId.startsWith('noir-style-')) return 'hue=s=0,eq=contrast=1.2';
        if (effectId.startsWith('film-stock-')) return 'eq=contrast=1.1:saturation=0.8';

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = { w: 1280, h: 720 }, targetFps = 30) => {
        const fps = targetFps;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`;

        const procW = Math.ceil(targetRes.w * 1.5);
        const procH = Math.ceil(targetRes.h * 1.5);

        const base = `zoompan=d=${isImage ? frames : 1}:s=${procW}x${procH}:fps=${fps}`;

        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // --- KEN BURNS ---
        if (moveId === 'kenBurns') {
            const sS = Number(config.startScale ?? 1.0);
            const eS = Number(config.endScale ?? 1.3);

            const startX = 0.5 + ((config.startX ?? 0) / 100);
            const startY = 0.5 + ((config.startY ?? 0) / 100);
            const endX = 0.5 + ((config.endX ?? 0) / 100);
            const endY = 0.5 + ((config.endY ?? 0) / 100);

            const zExpr = `${sS}+(${eS - sS})*${progress}`;
            const xExpr = `iw*(${startX}+(${endX - startX})*${progress})-(iw/zoom/2)`;
            const yExpr = `ih*(${startY}+(${endY - startY})*${progress})-(ih/zoom/2)`;

            return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;
        }

        // --- PAN MOVES ---
        if (moveId?.startsWith('mov-pan-')) {
            const type = moveId.replace('mov-pan-', '');
            const z = 1.2;

            const pans = {
                'slow-l': `iw*(0.4+0.2*${progress})`,
                'left': `iw*(0.4+0.2*${progress})`,
                'slow-r': `iw*(0.6-0.2*${progress})`,
                'right': `iw*(0.6-0.2*${progress})`,
                'slow-u': centerX,
                'up': centerX,
                'slow-d': centerX,
                'down': centerX,
                'fast-l': `iw*(0.3+0.4*${progress})`,
                'fast-r': `iw*(0.7-0.4*${progress})`,
                'diag': `iw*(0.4+0.2*${progress})`
            };

            if (pans[type]) {
                if (['slow-u', 'up', 'slow-d', 'down'].includes(type)) {
                    return `${base}:z=${z}:x='${centerX}':y='ih*(0.4+0.2*${progress})-(ih/zoom/2)'`;
                }

                return `${base}:z=${z}:x='${pans[type]}-(iw/zoom/2)':y='${centerY}'`;
            }
        }

        // --- ZOOM FAMILY ---
        if (moveId?.includes('zoom')) {
            const table = {
                'zoom-in': `1.0+(0.5)*${progress}`,
                'zoom-out': `1.5-(0.5)*${progress}`,
                'zoom-fast-in': `1.0+(1.0)*${progress}`,
                'dolly-zoom': `1.0+(0.5)*sin(on/${fps}*3)`
            };

            if (table[moveId]) {
                return `${base}:z='${table[moveId]}':x='${centerX}':y='${centerY}'`;
            }

            if (moveId.includes('crash-in'))
                return `${base}:z='1.0+3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`;

            if (moveId.includes('crash-out'))
                return `${base}:z='4.0-3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`;

            if (moveId.includes('bounce'))
                return `${base}:z='1.2+0.1*sin(on/${fps}*3)':x='${centerX}':y='${centerY}'`;

            if (moveId.includes('pulse'))
                return `${base}:z='1.1+0.05*sin(on/${fps}*10)':x='${centerX}':y='${centerY}'`;
        }

        // --- SHAKE ---
        if (moveId?.includes('shake') || moveId?.includes('jitter') || moveId === 'earthquake') {
            const intensity = moveId === 'earthquake' ? 20 : 5;
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        // VHS Tracking
        if (moveId === 'mov-vhs-tracking') {
            return `${base}:z=1.0:y='${centerY}+5*sin(on*100)'`;
        }

        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        if (!id) return 'fade';
        const norm = id.toLowerCase();

        const map = {
            // Zoom / Distortion
            'zoom-neg': 'zoomin',
            'zoom-in': 'zoomin',
            'zoom-out': 'radial',
            'pull-away': 'distance',
            'cyber-zoom': 'zoomin',
            'infinity-1': 'circleopen',

            // Glitch
            'glitch': 'pixelize',
            'glitch-chroma': 'hblur',
            'pixel-sort': 'pixelize',
            'color-glitch': 'hblur',
            'rgb-split': 'hblur',
            'rgb-shake': 'hblur',
            'datamosh': 'pixelize',
            'digital-noise': 'pixelize',
            'visual-buzz': 'pixelize',
            'block-glitch': 'pixelize',

            // FLASH
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flash': 'fadewhite',
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'burn': 'fadewhite',
            'light-leak-tr': 'fadewhite',
            'flare-pass': 'wipeleft',
            'god-rays': 'fadewhite',

            // Classic
            'crossfade': 'fade',
            'fade-classic': 'fade',
            'luma-fade': 'fade',
            'mix': 'dissolve',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',

            // Motion
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-diagonal-1': 'diagtl',
            'whip-diagonal-2': 'diagbr',
            'push-left': 'slideleft',

            // Shapes
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'iris-in': 'circleopen',
            'diamond-zoom': 'diamond',
            'heart-wipe': 'circleopen',
            'star-zoom': 'circleopen',
            'mosaic-small': 'mosaic',
            'checker-wipe': 'checkerboard',
            'clock-wipe': 'clock',
            'wipe-radial': 'radial',

            // Organic
            'ink-splash': 'circleopen',
            'water-drop': 'circleopen',
            'liquid-melt': 'dissolve',
            'swirl': 'radial',
            'paper-turn': 'slideleft',
            'burn-paper': 'circleopen',
            'blur-warp': 'hblur'
        };

        if (map[norm]) return map[norm];

        // Fallback logic
        if (norm.includes('zoom')) return 'zoomin';
        if (norm.includes('blur')) return 'hblur';
        if (norm.includes('flash')) return 'fadewhite';
        if (norm.includes('glitch')) return 'pixelize';
        if (norm.includes('wipe')) return 'wipeleft';
        if (norm.includes('slide')) return 'slideleft';

        return 'fade';
    }
};
