
/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 * High-Precision Math (1080p Internal) to eliminate jitter.
 * Comprehensive mapping of ALL frontend transitions and movements.
 */

// We process movements at 1280x720 (Safe HD) to balance quality and memory usage.
// Previously 1080p caused "Resource temporarily unavailable" on complex timelines.
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

        // Procedural Generated Effects Support (Color Grade, Vintage, etc from constants)
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

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        // --- ANTI-SHAKE ENGINE ---
        // Using 1280x720 internal resolution for stability.
        // 'on' = current frame number. 'frames' = total duration in frames.
        
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; // 0.0 to 1.0
        
        // Base Zoompan: 1280x720 internal resolution to save memory while keeping quality acceptable
        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 

        // Helper: Center viewport (iw/2 - viewport_w/2)
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // 1. Ken Burns Custom (User Configured)
        if (moveId === 'kenBurns') {
             const sS = config.startScale !== undefined ? Number(config.startScale) : 1.0;
             const eS = config.endScale !== undefined ? Number(config.endScale) : 1.3;
             
             // Convert percentage offsets (-50 to 50) to normalized (0.0 to 1.0)
             const startXNorm = 0.5 + (config.startX !== undefined ? Number(config.startX) / 100 : 0);
             const startYNorm = 0.5 + (config.startY !== undefined ? Number(config.startY) / 100 : 0);
             const endXNorm = 0.5 + (config.endX !== undefined ? Number(config.endX) / 100 : 0);
             const endYNorm = 0.5 + (config.endY !== undefined ? Number(config.endY) / 100 : 0);
             
             const zExpr = `${sS}+(${eS - sS})*${progress}`;
             const xExpr = `iw*(${startXNorm}+(${endXNorm - startXNorm})*${progress})-(iw/zoom/2)`;
             const yExpr = `ih*(${startYNorm}+(${endYNorm - startYNorm})*${progress})-(ih/zoom/2)`;
             
             return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;
        }

        // 2. Cinematic Pans (Generated IDs from constants)
        if (moveId && moveId.startsWith('mov-pan-')) {
            const panType = moveId.replace('mov-pan-', '');
            // Logic: Zoom 1.2 to give room to pan without black bars
            const z = 1.2; 
            
            // Standard Pans (Slow)
            if (panType === 'slow-l' || panType === 'left') return `${base}:z=${z}:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`; // Right to Left
            if (panType === 'slow-r' || panType === 'right') return `${base}:z=${z}:x='iw*(0.6-(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`; // Left to Right
            if (panType === 'slow-u' || panType === 'up') return `${base}:z=${z}:x='${centerX}':y='ih*(0.4+(0.2)*${progress})-(ih/zoom/2)'`;
            if (panType === 'slow-d' || panType === 'down') return `${base}:z=${z}:x='${centerX}':y='ih*(0.6-(0.2)*${progress})-(ih/zoom/2)'`;
            
            // Fast Pans
            if (panType === 'fast-l') return `${base}:z=${z}:x='iw*(0.3+(0.4)*${progress})-(iw/zoom/2)':y='${centerY}'`;
            if (panType === 'fast-r') return `${base}:z=${z}:x='iw*(0.7-(0.4)*${progress})-(iw/zoom/2)':y='${centerY}'`;
            
            // Diagonal Pans
            if (panType === 'diag-tl') return `${base}:z=${z}:x='iw*(0.6-(0.2)*${progress})-(iw/zoom/2)':y='ih*(0.6-(0.2)*${progress})-(ih/zoom/2)'`; // Bot-Right to Top-Left
            if (panType === 'diag-br') return `${base}:z=${z}:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='ih*(0.4+(0.2)*${progress})-(ih/zoom/2)'`; // Top-Left to Bot-Right
            // Fallbacks for other diags
            if (panType.includes('diag')) return `${base}:z=${z}:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='ih*(0.4+(0.2)*${progress})-(ih/zoom/2)'`;
        }

        // 3. Dynamic Zooms (Generated IDs + Basic)
        if (moveId && (moveId.startsWith('mov-zoom-') || moveId.includes('zoom-'))) {
            // Basic
            if (moveId === 'zoom-in' || moveId === 'zoom-slow-in') return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'zoom-out' || moveId === 'zoom-slow-out') return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'zoom-fast-in') return `${base}:z='1.0+(1.0)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'dolly-zoom') return `${base}:z='1.0+(0.5)*sin(on/30*3)':x='${centerX}':y='${centerY}'`; // Simulate dolly effect with zoom
            
            // Complex (Generated)
            if (moveId.includes('crash-in')) return `${base}:z='1.0+3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`; // Exponential Zoom
            if (moveId.includes('crash-out')) return `${base}:z='4.0-3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('bounce') || moveId === 'zoom-bounce') return `${base}:z='1.2+0.1*sin(on/30*3)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('pulse')) return `${base}:z='1.1+0.05*sin(on/30*10)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('wobble')) return `${base}:z='1.1+0.02*sin(on/10)':x='${centerX}+10*cos(on/15)':y='${centerY}'`;
            if (moveId.includes('twist')) return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`; // No rotation in zoompan, fallback to zoom
        }

        // 4. Shakes & Chaos
        if (['shake', 'earthquake', 'handheld-1', 'handheld-2', 'jitter', 'mov-shake-violent'].includes(moveId) || moveId?.includes('jitter') || moveId?.includes('shake')) {
            const intensity = moveId === 'earthquake' || moveId.includes('violent') ? 20 : 5;
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        // 5. Blurs & Flashes (Using filter chains, simplified for zoompan context where possible)
        if (moveId && moveId.startsWith('mov-blur-')) {
            if (moveId === 'mov-blur-zoom') return `${base}:z='1+0.5*${progress}':x='${centerX}':y='${centerY}'`;
        }
        
        // 6. 3D Simulated (using zoompan to pan across large crop to simulate perspective pan)
        if (moveId && moveId.startsWith('mov-3d-')) {
             if (moveId.includes('float')) return `${base}:z=1.1:x='${centerX}':y='${centerY}+10*sin(on/30)'`;
             // For tumble/roll we fallback to a dynamic zoom/pan as simple 2D proxy for stability
             return `${base}:z='1.1+0.1*sin(on/20)':x='${centerX}+10*cos(on/40)':y='${centerY}'`;
        }
        
        // 7. Elastic/Bounce
        if (moveId && (moveId.includes('elastic') || moveId.includes('bounce') || moveId.includes('spring'))) {
            return `${base}:z=1.0:x='${centerX}':y='${centerY}+50*abs(sin(on/10))*exp(-on/30)'`; // Bouncing effect on Y
        }
        
        // 8. Photo Effects (Simulate motion)
        if (moveId === 'mov-vhs-tracking') {
             return `${base}:z=1.0:y='${centerY}+5*sin(on*100)'`; // Vertical jitter
        }

        // Default: Static (but high res context to match pipeline)
        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        const map = {
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
            'checker-wipe': 'checkerboard',
            'checkerboard': 'checkerboard',
            'clock-wipe': 'clock',
            'plus-wipe': 'plus',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'radial': 'radial',
            'wipe-radial': 'radial',
            'smooth-left': 'smoothleft',
            'smooth-right': 'smoothright',
            'blind-h': 'hlslice',
            'blind-v': 'hrslice',
            'barn-door-h': 'hrslice',
            'barn-door-v': 'hlslice',
            'shutters': 'hlslice',
            'hex-reveal': 'mosaic',
            'stripes-h': 'hlslice',
            'stripes-v': 'hrslice',
            'heart-wipe': 'circleopen',
            
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
            'morph': 'pixelize',
            'swirl': 'hblur',
            'kaleidoscope': 'pixelize',
            'warp': 'wipetl',
            'water-drop': 'radial',
            'wave': 'hblur',
            'stretch-h': 'smoothleft',
            'stretch-v': 'smoothup',
            'turbulence': 'dissolve',
            'blur-warp': 'hblur',
            
            // === GLITCH & SPECIAL ===
            'glitch': 'pixelize',
            'glitch-scan': 'hblur',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'hblur',
            'color-glitch': 'distance',
            'urban-glitch': 'squeezev',
            'blood-mist': 'distance',
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'fire-burn': 'hlslice',
            'visual-buzz': 'hblur',
            'digital-noise': 'pixelize',
            'hologram': 'fade',
            'block-glitch': 'pixelize',
            'cyber-zoom': 'zoomin',
            'scan-line-v': 'vdissolve',
            'color-tear': 'hblur',
            'datamosh': 'pixelize',
            'rgb-split': 'hblur',
            'noise-jump': 'pixelize',
            'cyber-slice': 'hlslice',
            'glitch-chroma': 'hblur',
            
            // === SPECIFIC REQUESTS ===
            'rip-diag': 'wipeleft',
            'zoom-neg': 'distance',
            'infinity-1': 'distance',
            'digital-paint': 'dissolve',
            'brush-wind': 'wipeleft',
            'dust-burst': 'fadewhite',
            'filter-blur': 'hblur',
            'film-roll-v': 'slideup',
            'astral-project': 'zoomin',
            'lens-flare': 'fadewhite',
            'flash-bang': 'fadewhite',
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flashback': 'fadewhite',
            'combine-overlay': 'fade',
            'combine-mix': 'fade',
            'nightmare': 'fadeblack',
            'bubble-blur': 'hblur',
            'paper-unfold': 'circleopen',
            'corrupt-img': 'pixelize',
            'glow-intense': 'fadewhite',
            'dynamic-blur': 'hblur',
            'blur-dissolve': 'distance',
            'burn': 'fadewhite',
            'exposure': 'fadewhite',
            'bokeh-blur': 'hblur',
            'light-leak-tr': 'fadewhite',
            'flare-pass': 'slideleft',
            'prism-split': 'hblur',
            'god-rays': 'fadewhite',
            
            // === LIQUID & ORGANIC ===
            'liquid-melt': 'hlslice',
            'ink-splash': 'hrslice',
            'water-ripple': 'radial',
            'smoke-reveal': 'fade',
            'oil-paint': 'dissolve',
            'bubble-pop': 'circleopen',
            
            // === 3D & MOTION ===
            'cube-rotate-l': 'smoothleft',
            'cube-rotate-r': 'smoothright',
            'cube-rotate-u': 'smoothup',
            'cube-rotate-d': 'smoothdown',
            'door-open': 'hblur',
            'flip-card': 'vblur',
            'room-fly': 'zoomin',
            'spin-cw': 'radial',
            'spin-ccw': 'radial',
            'spin-zoom-in': 'zoomin',
            'spin-zoom-out': 'distance',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-up': 'slideup',
            'whip-down': 'slidedown',
            'whip-diagonal-1': 'diagtl',
            'whip-diagonal-2': 'diagbr',
            'perspective-left': 'slideleft',
            'perspective-right': 'slideright',
            'zoom-blur-l': 'slideleft',
            'zoom-blur-r': 'slideright',
            'zoom-spin-fast': 'radial',
            
            // === ELASTIC ===
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur'
        };

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
        
        return 'fade'; 
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
