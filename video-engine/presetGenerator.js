
/**
 * FFmpeg FULL PRESETS + MOVEMENTS
 * Production-safe version
 * FIXED: auto_scale, zero-size frames, filter reinit, memory leaks
 */

const FINAL_FILTER =
    'scale=1280:720:force_original_aspect_ratio=decrease,' +
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,' +
    'setsar=1,format=yuv420p,fps=30';

module.exports = {
    /* =========================
       VIDEO / AUDIO ARGS
    ========================= */
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

    /* =========================
       EFFECT PRESETS (ALL MAPPED FROM FRONTEND)
    ========================= */
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            // --- Cinematic Pro ---
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.3:rs=-0.2:bs=-0.2,eq=contrast=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'boxblur=2:1,eq=brightness=0.1:saturation=1.2',
            'horror': 'hue=s=0,eq=contrast=1.5:brightness=-0.2,noise=alls=10:allf=t',
            'underwater': 'colorbalance=bs=0.4:gs=0.1:rs=-0.3,eq=contrast=0.9',
            'sunset': 'colorbalance=rs=0.3:gs=-0.1:bs=-0.2,eq=saturation=1.3',
            'posterize': 'eq=contrast=2.0:saturation=1.5', // Curves posterize not standard in all builds, eq approx
            'fade': 'eq=contrast=0.8:brightness=0.1',
            'vibrant': 'eq=saturation=2.0',
            'muted': 'eq=saturation=0.5',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'golden-hour': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=saturation=1.2',
            'cold-blue': 'colorbalance=bs=0.3:rs=-0.1',
            'night-vision': 'hue=s=0,eq=brightness=0.1,colorbalance=gs=0.5,noise=alls=20:allf=t',
            'scifi': 'colorbalance=bs=0.2:gs=0.1,eq=contrast=1.3',
            'pastel': 'eq=saturation=0.7:brightness=0.1:contrast=0.9',

            // --- Artistic Styles ---
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'sketch-sim': 'hue=s=0,eq=contrast=5:brightness=0.3', 
            'invert': 'negate',
            'sepia-max': 'colorbalance=rs=0.4:gs=0.2:bs=-0.4',
            'high-contrast': 'eq=contrast=2.0',
            'low-light': 'eq=brightness=-0.3',
            'overexposed': 'eq=brightness=0.4',
            'radioactive': 'hue=h=90:s=2',
            'deep-fried': 'eq=saturation=3:contrast=2,unsharp=5:5:2.0',
            'ethereal': 'boxblur=3:1,eq=brightness=0.2',

            // --- Trends & Basics ---
            'dv-cam': 'eq=saturation=0.8,noise=alls=5:allf=t',
            'bling': 'eq=brightness=0.1', // Overlay approximation
            'soft-angel': 'boxblur=2:1,eq=brightness=0.1',
            'sharpen': 'unsharp=5:5:1.5:5:5:0.0',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'mono': 'hue=s=0',
            'bw': 'hue=s=0',
            'vintage': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=contrast=0.9',
            'dreamy': 'boxblur=2:1',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',

            // --- Glitch & Retro ---
            'glitch-pro-1': 'colorbalance=gs=0.1,noise=alls=10:allf=t',
            'glitch-pro-2': "scale='max(1,iw/10)':'max(1,ih/10)',scale=iw*10:ih*10:flags=neighbor,setsar=1", // Blocky
            'vhs-distort': 'eq=saturation=1.5,boxblur=1:1,noise=alls=10:allf=t',
            'bad-signal': 'noise=alls=30:allf=t',
            'chromatic': 'colorbalance=rs=0.1:bs=0.1',
            'pixelate': "scale='max(1,iw/20)':'max(1,ih/20)',scale=iw*20:ih*20:flags=neighbor,setsar=1",
            'old-film': 'eq=saturation=0.5,noise=alls=15:allf=t',
            'dust': 'noise=alls=5:allf=t',
            'grain': 'noise=alls=15:allf=t',
            'vignette': 'eq=brightness=-0.1',
            'super8': 'eq=saturation=0.8:contrast=1.1,colorbalance=rs=0.1',
            'noise': 'noise=alls=20:allf=t',
            
            // --- Atmosphere & Light ---
            'light-leak-1': 'eq=brightness=0.1:contrast=0.9', // Simplification
            'light-leak-2': 'eq=brightness=0.15:contrast=0.85',
            'sun-flare': 'eq=brightness=0.2',
            'god-rays': 'boxblur=1:1,eq=brightness=0.2',
            'neon-glow': 'eq=saturation=2:contrast=1.2',
            'strobe': "eq=brightness='if(eq(mod(n,5),0),2,0)'" // Simple Strobe
        };

        // Procedural Fallbacks (cg-pro, vintage-style, etc)
        if (effects[effectId]) return effects[effectId];
        
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            return `eq=contrast=${1 + (i % 5) * 0.05}:saturation=${1 + (i % 3) * 0.1}`;
        }
        if (effectId.startsWith('vintage-style-')) return 'colorbalance=rs=0.2:bs=-0.2';
        if (effectId.startsWith('cyber-neon-')) return 'eq=contrast=1.2:saturation=1.5';
        if (effectId.startsWith('film-stock-')) return 'eq=saturation=0.8:contrast=1.1';
        if (effectId.startsWith('leak-overlay-')) return 'eq=brightness=0.1';
        if (effectId.startsWith('noir-style-')) return 'hue=s=0,eq=contrast=1.2';
        if (effectId.startsWith('art-duo-')) return 'hue=s=0,colorbalance=rs=0.2';

        return null;
    },

    /* =========================
       MOVEMENTS (ALL – SAFE)
       s=1280x720:fps=30 is MANDATORY to avoid [auto_scale] error
    ========================= */
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const speed = parseFloat(config.speed || config.intensity || 1);
        const frames = Math.max(1, Math.ceil(durationSec * 30));
        
        // Base rigorosa: Resolução 720p, FPS 30. Evita reinit de filtros.
        const base = `zoompan=d=1:s=1280x720:fps=30`; 
        const esc = (s) => s;

        switch (moveId) {
            // === 1. CINEMATIC PANS ===
            case 'pan-left':
            case 'mov-pan-slow-l':
                return `${base}:z=1.2:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'pan-right':
            case 'mov-pan-slow-r':
                return `${base}:z=1.2:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'mov-pan-slow-u':
                return `${base}:z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${frames})'`;
            case 'mov-pan-slow-d':
                return `${base}:z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${frames})'`;
            case 'mov-pan-fast-l':
                return `${base}:z=1.5:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'mov-pan-fast-r':
                 return `${base}:z=1.5:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
            case 'mov-pan-diag-tl':
                 return `${base}:z=1.2:x='(iw-iw/zoom)*(on/${frames})':y='(ih-ih/zoom)*(on/${frames})'`;
            case 'mov-pan-diag-tr':
                 return `${base}:z=1.2:x='(iw-iw/zoom)*(1-on/${frames})':y='(ih-ih/zoom)*(on/${frames})'`;
            case 'mov-pan-diag-bl':
                 return `${base}:z=1.2:x='(iw-iw/zoom)*(on/${frames})':y='(ih-ih/zoom)*(1-on/${frames})'`;
            case 'mov-pan-diag-br':
                 return `${base}:z=1.2:x='(iw-iw/zoom)*(1-on/${frames})':y='(ih-ih/zoom)*(1-on/${frames})'`;

            // === 2. DYNAMIC ZOOMS ===
            case 'zoom-in':
            case 'kenBurns':
            case 'zoom-slow-in':
                return `${base}:z='min(1+${0.4 * speed}*on/${frames},1.6)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'zoom-fast-in':
            case 'mov-zoom-crash-in':
                return `${base}:z='min(1+${1.0 * speed}*on/${frames},2.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'zoom-out':
            case 'zoom-slow-out':
                return `${base}:z='max(1.6-${0.4 * speed}*on/${frames},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'mov-zoom-bounce-in':
            case 'zoom-bounce':
                return `${base}:z='1+0.1*abs(sin(on*0.1*${speed}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'pulse':
            case 'mov-zoom-pulse-slow':
            case 'mov-zoom-pulse-fast':
                return `${base}:z='1+0.05*sin(on*0.15*${speed})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            case 'mov-zoom-wobble':
            case 'zoom-wobble':
                return `${base}:z='1.1+0.05*sin(on*0.1)':x='iw/2-(iw/zoom/2)+10*sin(on*0.2)':y='ih/2-(ih/zoom/2)+10*cos(on*0.2)'`;
            case 'dolly-zoom':
            case 'mov-dolly-vertigo':
                // Simulated dolly: Zoom in while scaling (requires complex filter, here just aggressive zoom)
                return `${base}:z='1+${0.8 * speed}*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;

            // === 3. 3D TRANSFORMS & ROTATIONS ===
            // Note: True 3D rotation (yaw/pitch) needs complex filters not standard in basic ffmpeg builds. 
            // We approximate with 2D rotation or zoompan tricks.
            case 'spin-slow':
            case 'mov-3d-spin-axis':
                return `rotate=t*${0.2 * speed}:ow=iw:oh=ih:c=black`;
            case 'mov-3d-swing-l':
            case 'pendulum':
                return `rotate='sin(t*2*${speed})*0.1':ow=iw:oh=ih:c=black`;
            case 'mov-3d-swing-r':
                return `rotate='-sin(t*2*${speed})*0.1':ow=iw:oh=ih:c=black`;
            case 'mov-3d-roll':
                return `rotate=t*${0.5 * speed}:ow=iw:oh=ih:c=black`;

            // === 4. CHAOS / SHAKE ===
            case 'shake':
            case 'earthquake':
            case 'mov-shake-violent':
            case 'shake-hard':
                return `${base}:z=1.1:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*${20 * speed}':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*${20 * speed}'`;
            case 'jitter':
            case 'mov-jitter-x':
            case 'mov-jitter-y':
                return `${base}:z=1.05:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*${10 * speed}':y='ih/2-(ih/zoom/2)'`;
            case 'mov-glitch-snap':
            case 'mov-glitch-skid':
                // Simulate glitch jump
                return `${base}:x='if(eq(mod(on,30),0),iw/2-(iw/zoom/2)+50,iw/2-(iw/zoom/2))':y='ih/2-(ih/zoom/2)'`;

            // === 5. BLUR / FOCUS (Approximated via Zoompan + Blur logic in builder, here just subtle zoom) ===
            case 'mov-blur-in':
            case 'mov-blur-out':
            case 'mov-blur-zoom':
                 return `${base}:z='min(1.0+(0.1*on/${frames}),1.1)'`;
            
            // === 6. ELASTIC & FUN ===
            case 'mov-bounce-drop':
            case 'mov-rubber-band':
            case 'mov-jelly-wobble':
            case 'mov-pop-up':
            case 'mov-tada':
            case 'mov-squash-stretch':
                 // Approximated by bouncy zoom
                 return `${base}:z='1+0.1*abs(sin(on*0.2*${speed}))'`;

            // === 7. PHOTO FX ===
            case 'photo-flash':
            case 'mov-flash-pulse':
                 // Logic handled in effects mostly, but here add zoom punch
                 return `${base}:z='if(lt(mod(on,30),5),1.2,1.0)'`;
            
            // === DEFAULT ===
            default:
                // Retorna estático seguro se for imagem, null se for vídeo (sem movimento)
                if (isImage) return `${base}:z=1`;
                return null;
        }
    },

    /* =========================
       TRANSITIONS (SAFE)
    ========================= */
    getTransitionXfade: (id) => {
        // Map ALL frontend transition IDs to FFmpeg xfade names
        const map = {
            // Basics
            'fade-classic': 'fade', 'crossfade': 'fade', 'mix': 'fade', 
            'black': 'fadeblack', 'white': 'fadewhite', 'dissolve': 'dissolve',
            
            // Slides / Wipes
            'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright',
            'rect-crop': 'rectcrop', 'circle-crop': 'circlecrop',
            'circle-open': 'circleopen', 'circle-close': 'circleclose',
            'diamond-in': 'diagtl', 'diamond-out': 'diagbr', 'diamond-zoom': 'hl', // fallback
            
            // Zooms
            'zoomin': 'zoomin', 'zoomout': 'zoomout', 'zoom-in': 'zoomin', 'zoom-out': 'zoomout',
            
            // Shapes
            'clock-wipe': 'clock', 'iris-in': 'iris', 'iris-out': 'iris', // iris is available in newer ffmpeg
            'checker-wipe': 'checkerboard', 'checkerboard': 'checkerboard',
            'blind-h': 'hblur', 'blind-v': 'vblur', // fallbacks
            'barn-door-h': 'hl', 'barn-door-v': 'vu', // barn door approx
            
            // Glitch / Complex (Fallbacks to pixelize/wipes if specific xfade doesn't exist)
            'glitch': 'pixelize', 'pixelize': 'pixelize', 'pixel-sort': 'pixelize',
            'glitch-scan': 'hblur', 'block-glitch': 'pixelize', 'rgb-split': 'pixelize',
            'color-glitch': 'pixelize', 'urban-glitch': 'pixelize', 'visual-buzz': 'pixelize',
            'digital-noise': 'pixelize', 'datamosh': 'pixelize',
            
            // Trend / Artistic
            'blood-mist': 'dissolve', 'black-smoke': 'fadeblack', 'white-smoke': 'fadewhite',
            'fire-burn': 'dissolve', 'water-ripple': 'ripple', 'liquid-melt': 'dissolve',
            'ink-splash': 'dissolve', 'oil-paint': 'dissolve',
            'blur-warp': 'blur', 'blur-dissolve': 'blur', 'dynamic-blur': 'blur',
            'film-roll': 'slideup', 'film-roll-v': 'slideup',
            'page-turn': 'coverleft', 'paper-rip': 'wipetl', 'burn-paper': 'dissolve',
            'flash-bang': 'fadewhite', 'exposure': 'fadewhite', 'burn': 'dissolve',
            'luma-fade': 'fade', 'morph': 'dissolve', 'swirl': 'spiral', 'kaleidoscope': 'dissolve',
            
            // 3D / Motion
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', 
            'spin-zoom-in': 'zoomin', 'spin-zoom-out': 'zoomout',
            'whip-left': 'whipleft', 'whip-right': 'whipright', 'whip-up': 'whipup', 'whip-down': 'whipdown'
        };
        
        return map[id] || 'fade';
    },

    /* =========================
       FINAL FILTER (MANDATORY)
    ========================= */
    getFinalVideoFilter: () => FINAL_FILTER
};
