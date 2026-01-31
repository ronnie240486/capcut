
/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE (FFmpeg 6/7 Optimized)
 * Professional Grade Mapping for XFADE & Libavfilter
 */

module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // Use 'medium' ou 'fast' se a máquina aguentar para melhor compressão
        '-profile:v', 'high',
        '-level', '4.2',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-fps_mode', 'cfr' // FFmpeg 6+ replacement for -vsync 1 (Constant Frame Rate)
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

    // Mapeia IDs de efeitos do UI para cadeias de filtros complexos do FFmpeg
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;
        
        const effects = {
            // --- Cinematic Pro ---
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3:gamma_r=1.1:gamma_b=0.9',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8:brightness=0.05',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1:rs=-0.1',
            'dreamy-blur': 'gblur=sigma=2,eq=brightness=1.1:saturation=0.8',
            'horror': 'hue=s=0.2,eq=contrast=1.5:brightness=-0.2:gamma=0.8',
            'underwater': 'colorbalance=bs=0.4:gs=0.1,eq=brightness=-0.1',
            'sunset': 'colorbalance=rs=0.3:bs=-0.2,eq=saturation=1.4',

            // --- Basic & Artistic ---
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate', // Classic negative effect
            'negative': 'negate',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5,noise=alls=20:allf=t',
            'pop-art': 'eq=saturation=2:contrast=1.3,curves=strong_contrast',

            // --- Glitch & Distortion ---
            'pixelate': 'scale=iw/20:-1:flags=neighbor,scale=iw*20:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u,eq=contrast=1.5',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t,eq=saturation=0.8',
            'old-film': 'noise=alls=20:allf=t+u,eq=contrast=1.2,vignette', 
            'grain': 'noise=alls=10:allf=t',
            'chromatic': 'chromaber_v=3:0', // Requer FFmpeg 6+

            // --- Light & Atmosphere ---
            'soft-angel': 'gblur=sigma=5:steps=1,blend=all_mode=screen:all_opacity=0.5',
            'vignette': 'vignette=PI/4'
        };

        // Efeitos Procedurais (Gerados dinamicamente no frontend)
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const contrast = (1 + (i % 5) * 0.1).toFixed(2);
            const sat = (1 + (i % 3) * 0.2).toFixed(2);
            return `eq=contrast=${contrast}:saturation=${sat}`;
        }
        if (effectId.startsWith('vintage-style-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const rs = (0.1 + (i % 3) * 0.1).toFixed(2);
            return `colorbalance=rs=${rs}:bs=-0.2,eq=gamma=1.1`;
        }
        if (effectId.startsWith('cyber-neon-')) return 'eq=contrast=1.3:saturation=1.5,colorbalance=bs=0.2';
        if (effectId.startsWith('noir-style-')) return 'hue=s=0,eq=contrast=1.2';
        if (effectId.startsWith('film-stock-')) return 'eq=contrast=1.1:saturation=0.8,noise=alls=5:allf=t';
        if (effectId.startsWith('neon-glow-')) return 'eq=brightness=1.1:saturation=1.5'; 

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = { w: 1280, h: 720 }, targetFps = 30) => {
        const fps = targetFps;
        // Para zoompan, definimos d como total de frames
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        
        // Zoompan gera uma stream nova, precisamos garantir alta resolução interna para evitar pixelização
        const procW = Math.ceil(targetRes.w * 1.5); // Oversample
        const procH = Math.ceil(targetRes.h * 1.5);

        // on = output_frame_number, time = tempo em segundos
        const base = `zoompan=d=${frames}:s=${targetRes.w}x${targetRes.h}:fps=${fps}`;

        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // --- KEN BURNS PRO (Configurável) ---
        if (moveId === 'kenBurns') {
            const sS = Number(config.startScale ?? 1.0);
            const eS = Number(config.endScale ?? 1.3);

            // Coordenadas normalizadas (-50 a 50 -> convertidas para fator de deslocamento)
            // 0 = centro. 
            const startX_norm = (config.startX ?? 0) / 100; 
            const startY_norm = (config.startY ?? 0) / 100;
            const endX_norm = (config.endX ?? 0) / 100;
            const endY_norm = (config.endY ?? 0) / 100;

            // Interpolação linear do Zoom
            // z = start + (end - start) * (in / frames)
            const zExpr = `${sS}+(${eS - sS})*on/${frames}`;
            
            // X e Y precisam compensar o zoom para manter o ponto de interesse centralizado ou mover
            // x = iw/2 - (iw/zoom/2) + offset_x * iw
            const xExpr = `(iw/2)-(iw/zoom/2) + (iw*(${startX_norm}+(${endX_norm}-${startX_norm})*on/${frames}))`;
            const yExpr = `(ih/2)-(ih/zoom/2) + (ih*(${startY_norm}+(${endY_norm}-${startY_norm})*on/${frames}))`;

            return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;
        }

        // --- PAN MOVES ---
        if (moveId?.startsWith('mov-pan-')) {
            const type = moveId.replace('mov-pan-', '');
            const z = 1.2; // Zoom fixo leve para permitir pan sem bordas pretas

            const pans = {
                'slow-l': { x: `x='iw*(0.2)*(1-on/${frames})'`, y: `y='${centerY}'` }, // Dir para Esq
                'left': { x: `x='iw*(0.2)*(1-on/${frames})'`, y: `y='${centerY}'` },
                'slow-r': { x: `x='iw*(0.2)*(on/${frames})'`, y: `y='${centerY}'` }, // Esq para Dir
                'right': { x: `x='iw*(0.2)*(on/${frames})'`, y: `y='${centerY}'` },
                'slow-u': { x: `x='${centerX}'`, y: `y='ih*(0.2)*(1-on/${frames})'` },
                'up': { x: `x='${centerX}'`, y: `y='ih*(0.2)*(1-on/${frames})'` },
                'slow-d': { x: `x='${centerX}'`, y: `y='ih*(0.2)*(on/${frames})'` },
                'down': { x: `x='${centerX}'`, y: `y='ih*(0.2)*(on/${frames})'` },
            };

            const pan = pans[type] || pans['slow-r'];
            return `${base}:z=${z}:${pan.x}:${pan.y}`;
        }

        // --- ZOOM FAMILY ---
        if (moveId?.includes('zoom')) {
            const table = {
                'zoom-in': `min(zoom+0.0015,1.5)`,
                'zoom-slow-in': `min(zoom+0.0008,1.3)`,
                'zoom-fast-in': `min(zoom+0.005,2.0)`,
                'zoom-out': `max(1.5-0.0015*on,1.0)`,
                'zoom-slow-out': `max(1.3-0.0008*on,1.0)`,
                'dolly-zoom': `1.0+(0.5)*sin(on/${fps}*2)`
            };

            let zExpr = table[moveId];

            if (!zExpr) {
                if (moveId.includes('crash-in')) zExpr = `1.0+3.0*(on/${frames})*(on/${frames})`;
                else if (moveId.includes('crash-out')) zExpr = `4.0-3.0*(on/${frames})*(on/${frames})`;
                else if (moveId.includes('bounce')) zExpr = `1.2+0.1*sin(on/${fps}*5)`;
                else if (moveId.includes('pulse')) zExpr = `1.1+0.05*sin(on/${fps}*10)`;
                else zExpr = `min(zoom+0.0015,1.5)`; // Default zoom in
            }
            
            if (moveId.includes('out') && !moveId.includes('crash')) {
                if (moveId === 'zoom-out') zExpr = `1.5 - (0.5 * on/${frames})`;
                if (moveId === 'zoom-slow-out') zExpr = `1.2 - (0.2 * on/${frames})`;
            }

            return `${base}:z='${zExpr}':x='${centerX}':y='${centerY}'`;
        }

        // --- SHAKE & CHAOS ---
        if (moveId?.includes('shake') || moveId?.includes('jitter') || moveId === 'earthquake') {
            const intensity = moveId === 'earthquake' ? 40 : (moveId.includes('hard') ? 20 : 10);
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        // --- VHS Tracking ---
        if (moveId === 'mov-vhs-tracking') {
            return `${base}:z=1.0:y='${centerY}+10*sin(on*0.5)'`;
        }

        // Default: Static (no movement), but ensures duration matches for images
        if (isImage) return `${base}:z=1:x='${centerX}':y='${centerY}'`;
        
        return null;
    },

    getTransitionXfade: (id) => {
        if (!id) return 'fade';
        const norm = id.toLowerCase();

        const map = {
            // === TRANSITIONS PRO (FFmpeg 4.3+ xfade) ===
            
            // Zoom / Distortion
            'zoom-neg': 'distance', // Mapped to distance, but needs manual negative filter in Builder
            'zoom-in': 'zoomin',
            'zoom-out': 'radial',
            'pull-away': 'distance',
            'cyber-zoom': 'zoomin',
            'infinity-1': 'circleopen',

            // Glitch & Digital
            'glitch': 'pixelize',
            'glitch-chroma': 'hblur', // Fallback visual
            'pixel-sort': 'pixelize',
            'color-glitch': 'hblur',
            'rgb-split': 'hblur',
            'rgb-shake': 'hblur',
            'datamosh': 'pixelize',
            'digital-noise': 'pixelize',
            'visual-buzz': 'pixelize',
            'block-glitch': 'pixelize',

            // Light & Flash
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

            // Motion Swipes
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-diagonal-1': 'diagtl',
            'whip-diagonal-2': 'diagbr',
            'push-left': 'slideleft',

            // Shapes & Geometry
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
            'rect-crop': 'rectcrop',

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

        // Lógica de Fallback Inteligente
        if (norm.includes('zoom')) return 'zoomin';
        if (norm.includes('blur')) return 'hblur';
        if (norm.includes('flash')) return 'fadewhite';
        if (norm.includes('glitch')) return 'pixelize';
        if (norm.includes('wipe')) return 'wipeleft';
        if (norm.includes('slide')) return 'slideleft';
        if (norm.includes('circle')) return 'circleopen';

        return 'fade';
    }
};
