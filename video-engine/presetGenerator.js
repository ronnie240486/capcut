

/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 * High-Precision Math to eliminate jitter.
 * Comprehensive mapping of ALL frontend transitions and movements.
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
        
        // Massive Effect Mapping from constants.tsx
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
            'old-film': 'noise=alls=20:allf=t+u,eq=contrast=1.2', // Simula ruído
            'grain': 'noise=alls=10:allf=t',
        };

        // Procedural Generated Effects Support
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
        const progress = `(on/${frames})`; // 0.0 to 1.0
        
        // Processing Resolution: Use a bit higher than target to avoid aliasing during zoom
        const procW = Math.ceil(targetRes.w * 1.5);
        const procH = Math.ceil(targetRes.h * 1.5);
        
        const base = `zoompan=d=${isImage ? frames : 1}:s=${procW}x${procH}:fps=${fps}`; 

        // Helper: Center viewport (iw/2 - viewport_w/2)
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // 1. Ken Burns Custom (User Configured)
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

        // 2. Cinematic Pans
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

        // 3. Dynamic Zooms
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

        // 4. Shakes & Chaos
        if (['shake', 'earthquake', 'handheld-1', 'handheld-2', 'jitter', 'mov-shake-violent'].includes(moveId) || moveId?.includes('jitter') || moveId?.includes('shake')) {
            const intensity = moveId === 'earthquake' || moveId.includes('violent') ? 20 : 5;
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        // 5. Blurs & Flashes
        if (moveId && moveId.startsWith('mov-blur-')) {
            if (moveId === 'mov-blur-zoom') return `${base}:z='1+0.5*${progress}':x='${centerX}':y='${centerY}'`;
        }
        
        // 6. 3D Simulated
        if (moveId && moveId.startsWith('mov-3d-')) {
             if (moveId.includes('float')) return `${base}:z=1.1:x='${centerX}':y='${centerY}+10*sin(on/${fps})'`;
             return `${base}:z='1.1+0.1*sin(on/${fps/1.5})':x='${centerX}+10*cos(on/${fps/0.75})':y='${centerY}'`;
        }
        
        // 7. Elastic/Bounce
        if (moveId && (moveId.includes('elastic') || moveId.includes('bounce') || moveId.includes('spring'))) {
            return `${base}:z=1.0:x='${centerX}':y='${centerY}+50*abs(sin(on/${fps/3}))*exp(-on/${fps})'`; 
        }
        
        // 8. Photo Effects
        if (moveId === 'mov-vhs-tracking') {
             return `${base}:z=1.0:y='${centerY}+5*sin(on*100)'`; 
        }

        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        const map = {
            // === CAPCUT TRENDS & PRO ===
            'cyber-zoom': 'zoomin',
            'scan-line-v': 'glitchmem', 
            'scan-v': 'glitchmem',
            'scaline': 'glitchmem',
            'rasgo-de': 'hblur', 
            'rip-diag': 'wipeleft',
            'color-tear': 'hblur',
            'star-zoom': 'circleopen', 
            'estrelas': 'circleopen',
            'dots-reveal': 'circleopen', 
            'pontos': 'circleopen',
            'page-turn': 'wipeleft', 
            'virar-paginas': 'wipeleft',
            'burn-paper': 'wipetl', 
            'queimar': 'wipetl',
            'sketch-reveal': 'fade', 
            'rascunho': 'fade',
            'fold-up': 'slideup',
            'dobrar': 'slideup',
            'cube-rotate-u': 'smoothup',
            'cubo-cima': 'smoothup',
            'cube-rotate-d': 'smoothdown',
            'cubo-baixo': 'smoothdown',
            'door-open': 'hlslice', 
            'porta': 'hlslice',
            'flip-card': 'squeezev', 
            'cartao': 'squeezev',
            'room-fly': 'zoomin',
            'quarto': 'zoomin',
            'whip-diagonal-1': 'diagtl',
            'whip-diagonal-2': 'diagbr',
            'whip-diag-1': 'diagtl',
            'whip-diag-2': 'diagbr',
            'bokeh-blur': 'hblur',
            'desfoque': 'hblur',
            'light-leak-tr': 'fadewhite',
            'vazamento': 'fadewhite',
            'flare-pass': 'slideleft',
            'flamepass': 'slideleft',
            'prism-split': 'pixelize',
            'prisma': 'pixelize',
            'god-rays': 'fadewhite',
            'raio': 'fadewhite',
            'glitch-scan': 'hblur',
            'rgb-split': 'hblur',
            'cyber-slice': 'hlslice',
            'swirl': 'radial',
            'redemoinho': 'radial',
            'kaleidoscope': 'pixelize',
            'caledoscopio': 'pixelize',
            'water-drop': 'circleopen',
            'gota': 'circleopen',
            'wave': 'hblur',
            'onda': 'hblur',
            'stretch-h': 'smoothleft',
            'esticar-h': 'smoothleft',
            'stretch-v': 'smoothup',
            'esticar-v': 'smoothup',
            'morph': 'dissolve',
            'turbulence': 'dissolve',
            'turbulencia': 'dissolve',
            'wipe-radial': 'radial',
            'radar': 'radial',
            'checker-wipe': 'checkerboard',
            'xadrez': 'checkerboard',
            'stripes-v': 'hrslice',
            'listra-v': 'hrslice',
            'heart-wipe': 'circleopen',
            'coracao': 'circleopen',
            'film-roll-v': 'slideup',
            'rolo-de-filme': 'slideup',
            'blur-warp': 'hblur',
            
            // CAPCUT TREND ID MATCHING
            'blood-mist': 'distance',
            'fire-burn': 'hlslice',
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'visual-buzz': 'hblur',
            'urban-glitch': 'squeezev',
            'color-glitch': 'distance',
            'digital-paint': 'fade',
            'brush-wind': 'wipeleft',
            
            // === GEOMETRIC & WIPES ===
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
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'rect-crop': 'rectcrop',
            'diamond-in': 'diagtl',
            'diamond-out': 'diagbr',
            'diamond-zoom': 'diamond',
            'checkerboard': 'checkerboard',
            'clock-wipe': 'clock',
            'plus-wipe': 'plus',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'radial': 'radial',
            'smooth-left': 'smoothleft',
            'smooth-right': 'smoothright',
            'blind-h': 'hlslice',
            'blind-v': 'hrslice',
            'barn-door-h': 'hrslice',
            'barn-door-v': 'hlslice',
            'shutters': 'hlslice',
            'hex-reveal': 'mosaic',
            'stripes-h': 'hlslice',
            
            // === BASICS ===
            'crossfade': 'fade',
            'mix': 'fade',
            'fade-classic': 'fade',
            'fade': 'fade',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'dissolve': 'dissolve',
            'luma-fade': 'fade',
            
            // === ZOOM & WARP ===
            'zoom-in': 'zoomin',
            'zoomin': 'zoomin',
            'zoom-out': 'circleclose',
            'pull-away': 'distance',
            
            // === GLITCH & SPECIAL ===
            'glitch': 'pixelize',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'hblur',
            'digital-noise': 'pixelize',
            'hologram': 'fade',
            'block-glitch': 'pixelize',
            'datamosh': 'pixelize',
            'noise-jump': 'pixelize',
            'glitch-chroma': 'hblur',
            
            // === ELASTIC ===
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur'
        };

        // Fuzzy matching se não encontrar exato
        if (map[id]) return map[id];
        
        if (id.includes('wipe')) return 'wipeleft';
        if (id.includes('slide')) return 'slideleft';
        if (id.includes('zoom')) return 'zoomin';
        if (id.includes('blur')) return 'distance';
        if (id.includes('flash')) return 'fadewhite';
        if (id.includes('black')) return 'fadeblack';
        if (id.includes('spin')) return 'radial';
        if (id.includes('cube')) return 'smoothleft';
        if (id.includes('glitch')) return 'pixelize';
        if (id.includes('mist')) return 'distance';
        if (id.includes('burn')) return 'hlslice';
        if (id.includes('smoke')) return 'fadeblack';
        
        return 'fade'; // Ultimate fallback
    }
};
