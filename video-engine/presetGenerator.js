
/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 * High-Precision Math (1080p Internal) to eliminate jitter.
 * Comprehensive mapping of ALL frontend transitions and movements.
 */

// We process movements at 1080p to allow for zooming without pixelation/jitter, then scale to 720p output.
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
        
        // Massive Effect Mapping
        const effects = {
            // Cinematic
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
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            
            // Glitch & Artistic
            'pop-art': 'eq=saturation=2:contrast=1.3',
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t'
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

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        // --- ANTI-SHAKE ENGINE (Super-Sampling 1080p + Absolute Math) ---
        // We calculate movement on a virtual 1920x1080 canvas.
        // 'on' = current frame number. 'frames' = total duration in frames.
        
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; // 0.0 to 1.0
        
        // Base Zoompan: 1920x1080 internal resolution prevents sub-pixel jitter
        const base = `zoompan=d=${isImage ? frames : 1}:s=1920x1080:fps=${fps}`; 

        // Helper: Center viewport (iw/2 - viewport_w/2)
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // 1. Ken Burns Custom
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

        // 2. Cinematic Pans (Generated IDs)
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
        }

        // 3. Dynamic Zooms
        if (moveId && (moveId.startsWith('mov-zoom-') || moveId.includes('zoom-'))) {
            // Basic
            if (moveId === 'zoom-in' || moveId === 'zoom-slow-in') return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'zoom-out' || moveId === 'zoom-slow-out') return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId === 'zoom-fast-in') return `${base}:z='1.0+(1.0)*${progress}':x='${centerX}':y='${centerY}'`;
            
            // Complex
            if (moveId.includes('crash-in')) return `${base}:z='1.0+3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`; // Exponential Zoom
            if (moveId.includes('crash-out')) return `${base}:z='4.0-3.0*${progress}*${progress}':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('bounce') || moveId === 'zoom-bounce') return `${base}:z='1.2+0.1*sin(on/30*3)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('pulse')) return `${base}:z='1.1+0.05*sin(on/30*10)':x='${centerX}':y='${centerY}'`;
            if (moveId.includes('wobble')) return `${base}:z='1.1+0.02*sin(on/10)':x='${centerX}+10*cos(on/15)':y='${centerY}'`;
        }

        // 4. Shakes & Chaos
        if (['shake', 'earthquake', 'handheld-1', 'handheld-2', 'jitter', 'mov-shake-violent'].includes(moveId) || moveId?.includes('jitter')) {
            const intensity = moveId === 'earthquake' || moveId.includes('violent') ? 20 : 5;
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        // 5. Blurs & Flashes (Non-Zoompan filters)
        // These return a filter chain string, not just zoompan
        if (moveId && moveId.startsWith('mov-blur-')) {
            if (moveId === 'mov-blur-in') return `boxblur=luma_radius='min(20, (1-${progress})*20)':luma_power=1`;
            if (moveId === 'mov-blur-out') return `boxblur=luma_radius='min(20, ${progress}*20)':luma_power=1`;
            if (moveId === 'mov-blur-pulse') return `boxblur=luma_radius='5*sin(on/30*5)':luma_power=1`;
            if (moveId === 'mov-blur-zoom') return `${base}:z='1+0.5*${progress}':x='${centerX}':y='${centerY}',boxblur=luma_radius='${progress}*10':luma_power=1`;
        }
        
        if (moveId === 'photo-flash') {
            // Flash effect using eq brightness
            return `eq=brightness='1+0.5*sin(on/5)*step(sin(on/5))'`;
        }
        
        // 6. 3D Simulated (using zoompan to pan across large crop)
        // Note: True 3D needs complex v360 or perspective filters which are heavy. 
        // We simulate "Swing" using horizontal scaling or perspective zoom.
        if (moveId && moveId.startsWith('mov-3d-')) {
             if (moveId.includes('float')) return `${base}:z=1.1:x='${centerX}':y='${centerY}+10*sin(on/30)'`;
             // For tumble/roll we fallback to a dynamic zoom as simple 2D proxy for stability
             return `${base}:z='1.1+0.1*sin(on/20)':x='${centerX}+10*cos(on/40)':y='${centerY}'`;
        }

        // Default: Static (but high res context)
        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        const map = {
            // === GEOMETRIC ===
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'rect-crop': 'rectcrop',
            'diamond-in': 'diagtl', // approximation
            'diamond-out': 'diagbr', // approximation
            'checker-wipe': 'checkerboard',
            'clock-wipe': 'clock',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'radial': 'radial',
            'smooth-left': 'smoothleft',
            'smooth-right': 'smoothright',
            
            // === BASICS ===
            'crossfade': 'fade',
            'mix': 'fade',
            'fade-classic': 'fade',
            'fade': 'fade',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'dissolve': 'dissolve',
            
            // === ZOOM & WARP ===
            'zoom-in': 'zoomin',
            'zoomin': 'zoomin',
            'zoom-out': 'circleclose', // fallback
            'pull-away': 'distance',
            'morph': 'pixelize', // fallback for morph
            'swirl': 'hblur', // fallback
            'kaleidoscope': 'pixelize', // fallback
            'warp': 'wipetl',
            
            // === GLITCH & SPECIAL ===
            'glitch': 'pixelize',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'hblur',
            'color-glitch': 'distance',
            'urban-glitch': 'squeezev',
            'blood-mist': 'distance', // best approx
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'fire-burn': 'hlslice', // heat slice
            'visual-buzz': 'hblur',
            'digital-noise': 'pixelize',
            
            // === SPECIFIC REQUESTS ===
            'rip-diag': 'wipeleft', // *** RASGO DO DIA -> HORIZONTAL WIPE ***
            'flash-bang': 'fadewhite',
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'lens-flare': 'fadewhite',
            'blur-dissolve': 'distance',
            'dynamic-blur': 'distance',
            'film-roll': 'slideup',
            'film-roll-v': 'slideup',
            
            // === LIQUID & ORGANIC ===
            'liquid-melt': 'hlslice',
            'ink-splash': 'hrslice',
            'water-ripple': 'radial',
            'smoke-reveal': 'fade',
            'oil-paint': 'dissolve',
            
            // === 3D & MOTION ===
            'cube-rotate-l': 'smoothleft',
            'cube-rotate-r': 'smoothright',
            'door-open': 'hblur',
            'flip-card': 'vblur',
            'spin-cw': 'radial',
            'spin-ccw': 'radial',
            'whip-left': 'slideleft',
            'whip-right': 'slideright'
        };

        // Fuzzy matching if exact ID not found
        if (map[id]) return map[id];
        
        if (id.includes('wipe')) return 'wipeleft';
        if (id.includes('slide')) return 'slideleft';
        if (id.includes('zoom')) return 'zoomin';
        if (id.includes('blur')) return 'distance';
        if (id.includes('flash')) return 'fadewhite';
        if (id.includes('black')) return 'fadeblack';
        if (id.includes('spin')) return 'radial';
        
        return 'fade'; // Ultimate fallback
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
