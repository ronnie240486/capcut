
/**
 * FFmpeg FULL PRESETS + MOVEMENTS ENGINE
 * High-Precision Math (720p/1080p Internal).
 * Comprehensive mapping of ALL frontend transitions and movements.
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
        '-b:a', '320k', // Increased quality
        '-ar', '44100',
        '-ac', '2' // Force Stereo
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
            
            // Basics & Artistic
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
            'pop-art': 'eq=saturation=2:contrast=1.3',
            
            // Glitch & Distortion
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t',
            'old-film': 'noise=alls=20:allf=t+u,eq=contrast=1.2', 
            'grain': 'noise=alls=10:allf=t',
            'noise': 'noise=alls=20:allf=t+u',
            'vignette': 'vignette=PI/4',
            
            // Blur & Optics (New)
            'blur': 'gblur=sigma=10',
            'desfoque': 'gblur=sigma=10',
            'soft-angel': 'gblur=sigma=2,colorbalance=rs=0.1:bs=0.1:gs=0.1',
            'sharpen': 'unsharp=5:5:1.0:5:5:0.0',
            'prism': 'geq=r=\'p(X+10,Y)\':g=\'p(X,Y)\':b=\'p(X-10,Y)\'',
            'chromatic': 'geq=r=\'p(X+5,Y)\':g=\'p(X,Y)\':b=\'p(X-5,Y)\'',
            'super8': 'noise=alls=20:allf=t+u,colorbalance=rs=0.2',
            'light-leak-1': 'colorbalance=rs=0.3:gs=0.1:bs=-0.1,eq=brightness=0.1',
            'strobe': 'eq=brightness=\'if(eq(mod(n,4),0),1.5,1)\''
        };

        // Dynamic ID handlers
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            return `contrast=${1 + (i%5)*0.1}:saturation=${1 + (i%3)*0.2}`;
        }
        if (effectId.startsWith('vintage-style-')) return 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1';
        if (effectId.startsWith('cyber-neon-')) return 'eq=contrast=1.3:saturation=1.5';
        if (effectId.startsWith('noir-style-')) return 'hue=s=0,eq=contrast=1.2';
        if (effectId.startsWith('film-stock-')) return 'eq=contrast=1.1:saturation=0.8';
        if (effectId.startsWith('nature-fresh-')) return 'saturate=1.2';
        if (effectId.startsWith('art-duo-')) return 'hue=s=0,colorbalance=rs=0.3';
        if (effectId.includes('glitch')) return 'noise=alls=20:allf=t+u';

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const fps = 30;
        const safeDur = Math.max(1, durationSec);
        const frames = Math.ceil(safeDur * fps);
        const progress = `(on/${frames})`; 
        // Base zoompan string
        const zp = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 
        const cx = `(iw/2)-(iw/zoom/2)`;
        const cy = `(ih/2)-(ih/zoom/2)`;

        // --- 1. KEN BURNS (Configurable) ---
        if (moveId === 'kenBurns') {
             const sS = config.startScale !== undefined ? Number(config.startScale) : 1.0;
             const eS = config.endScale !== undefined ? Number(config.endScale) : 1.3;
             const startXNorm = 0.5 + (config.startX || 0) / 100;
             const startYNorm = 0.5 + (config.startY || 0) / 100;
             const endXNorm = 0.5 + (config.endX || 0) / 100;
             const endYNorm = 0.5 + (config.endY || 0) / 100;

             const zExpr = `${sS}+(${eS - sS})*${progress}`;
             const xExpr = `iw*(${startXNorm}+(${endXNorm - startXNorm})*${progress})-(iw/zoom/2)`;
             const yExpr = `ih*(${startYNorm}+(${endYNorm - startYNorm})*${progress})-(ih/zoom/2)`;
             
             return `${zp}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;
        }

        // --- 2. CINEMATIC PANS ---
        if (moveId === 'mov-pan-slow-l') return `${zp}:z=1.2:x='iw*(0.2+0.2*${progress})-(iw/zoom/2)':y='${cy}'`;
        if (moveId === 'mov-pan-slow-r') return `${zp}:z=1.2:x='iw*(0.4-0.2*${progress})-(iw/zoom/2)':y='${cy}'`;
        if (moveId === 'mov-pan-slow-u') return `${zp}:z=1.2:x='${cx}':y='ih*(0.2+0.2*${progress})-(ih/zoom/2)'`;
        if (moveId === 'mov-pan-slow-d') return `${zp}:z=1.2:x='${cx}':y='ih*(0.4-0.2*${progress})-(ih/zoom/2)'`;
        if (moveId === 'mov-pan-fast-l') return `${zp}:z=1.2:x='iw*(0.1+0.4*${progress})-(iw/zoom/2)':y='${cy}'`;
        if (moveId === 'mov-pan-fast-r') return `${zp}:z=1.2:x='iw*(0.5-0.4*${progress})-(iw/zoom/2)':y='${cy}'`;
        if (moveId === 'mov-pan-diag-tl') return `${zp}:z=1.3:x='iw*(0.4-0.2*${progress})-(iw/zoom/2)':y='ih*(0.4-0.2*${progress})-(ih/zoom/2)'`;
        if (moveId === 'mov-pan-diag-br') return `${zp}:z=1.3:x='iw*(0.2+0.2*${progress})-(iw/zoom/2)':y='ih*(0.2+0.2*${progress})-(ih/zoom/2)'`;

        // --- 3. BASIC ZOOMS ---
        if (moveId === 'zoom-in' || moveId === 'zoom-slow-in') return `${zp}:z='1.0+0.5*${progress}':x='${cx}':y='${cy}'`;
        if (moveId === 'zoom-out' || moveId === 'zoom-slow-out') return `${zp}:z='1.5-0.5*${progress}':x='${cx}':y='${cy}'`;
        if (moveId === 'zoom-fast-in') return `${zp}:z='1.0+1.5*${progress}':x='${cx}':y='${cy}'`;
        
        // --- 4. DYNAMIC ZOOMS ---
        if (moveId === 'mov-zoom-twist-in') return `rotate=a='2*PI*t/${safeDur}':c=black@0:ow=rotw(2*PI*t/${safeDur}):oh=roth(2*PI*t/${safeDur}),${zp}:z='min(1.0+1.0*${progress},2.0)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-zoom-twist-out') return `rotate=a='-2*PI*t/${safeDur}':c=black@0:ow=rotw(-2*PI*t/${safeDur}):oh=roth(-2*PI*t/${safeDur}),${zp}:z='max(2.0-1.0*${progress},1.0)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-zoom-crash-in') return `${zp}:z='1.0+3.0*pow(${progress},3)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-zoom-crash-out') return `${zp}:z='4.0-3.0*pow(${progress},3)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-zoom-bounce-in' || moveId === 'zoom-bounce') return `${zp}:z='1.2+0.2*sin(on/30*3)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-zoom-pulse-slow') return `${zp}:z='1.1+0.05*sin(on/15)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-zoom-pulse-fast') return `${zp}:z='1.1+0.1*sin(on/5)':x='${cx}':y='${cy}'`;
        if (moveId === 'mov-dolly-vertigo') return `${zp}:z='1.0+0.5*sin(on/30*2)':x='${cx}':y='${cy}'`;

        // --- 5. SHAKE & CHAOS ---
        const shakeBase = `${zp}:z=1.1`;
        if (moveId === 'shake-hard' || moveId === 'mov-zoom-shake') return `${shakeBase}:x='${cx}+random(1)*20-10':y='${cy}+random(1)*20-10'`;
        if (moveId === 'earthquake' || moveId === 'mov-shake-violent') return `${shakeBase}:x='${cx}+random(1)*50-25':y='${cy}+random(1)*50-25'`;
        if (moveId === 'handheld-1') return `${zp}:z=1.05:x='${cx}+sin(on/10)*5':y='${cy}+cos(on/15)*5'`;
        if (moveId === 'handheld-2') return `${zp}:z=1.05:x='${cx}+sin(on/5)*10':y='${cy}+cos(on/7)*10'`;
        if (moveId === 'mov-jitter-x') return `${shakeBase}:x='${cx}+random(1)*30-15':y='${cy}'`;
        if (moveId === 'mov-jitter-y') return `${shakeBase}:x='${cx}':y='${cy}+random(1)*30-15'`;

        // --- 6. 3D TRANSFORMS ---
        if (moveId === 'mov-3d-flip-x') return `scale=w='iw*cos(2*PI*t/${safeDur})':h=ih`;
        if (moveId === 'mov-3d-flip-y') return `scale=w=iw:h='ih*cos(2*PI*t/${safeDur})'`;
        if (moveId === 'mov-3d-tumble') return `rotate=a='2*PI*t/${safeDur}'`;
        if (moveId === 'mov-3d-roll') return `rotate=a='4*PI*t/${safeDur}'`;
        if (moveId === 'mov-3d-swing-l') return `rotate=a='sin(2*PI*t/${safeDur})*0.2'`;

        // --- 7. ELASTIC & GLITCH ---
        if (moveId === 'mov-bounce-drop') return `${zp}:y='${cy}+50*abs(cos(on/10))*exp(-on/30)'`;
        if (moveId === 'mov-jelly-wobble') return `scale=w='iw*(1+0.1*sin(t*10))':h='ih*(1-0.1*sin(t*10))'`;
        if (moveId === 'mov-glitch-snap') return `colorchannelmixer=rr='1':rg='0.1*sin(t*20)':rb='0':gr='0':gg='1':gb='0':br='0':bg='0':bb='1',${shakeBase}:x='${cx}+step(sin(t*10))*20'`;
        if (moveId === 'mov-rgb-shift-move') return `rgbashift=rh='20*sin(t*5)':bv='20*cos(t*5)'`;

        // --- 9. BLUR MOVEMENT ---
        if (moveId === 'mov-blur-in') return `gblur=sigma='20*(1-${progress})':steps=2`;
        if (moveId === 'mov-blur-out') return `gblur=sigma='20*${progress}':steps=2`;
        if (moveId === 'mov-blur-zoom') return `gblur=sigma='10*${progress}':steps=2,${zp}:z='1+0.5*${progress}'`;

        if (isImage) return `${zp}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        // --- XFADE MAPPINGS (APPROXIMATIONS) ---
        const map = {
            // Standard
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'fade-classic': 'fade', 'luma-fade': 'fade',
            'black': 'fade', 'white': 'fade', 'dissolve': 'dissolve',
            'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright',
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 'rect-crop': 'rectcrop', 
            'iris-in': 'circleopen', 'iris-out': 'circleclose', 'radial': 'radial',
            'diamond-in': 'diagtl', 'diamond-out': 'diagbr', 'diamond-zoom': 'diamond',
            'plus-wipe': 'plus', 'checker-wipe': 'checkerboard', 'checkerboard': 'checkerboard', 'clock-wipe': 'clock',
            'wipe-radial': 'radial', 'pixelize': 'pixelize', 'hblur': 'hblur', 'wipetl': 'wipetl', 
            'squeezeh': 'squeezeh', 'squeezev': 'squeezev', 'zoomin': 'zoomin',
            
            // --- TRENDS & COMPLEX ---
            // Mapping complex names to best available standard Xfade transition
            'morph': 'pixelize',
            'swirl': 'hblur', // Approx
            'kaleidoscope': 'pixelize', // Approx
            'warp': 'wipetl',
            'glitch': 'pixelize',
            'glitch-scan': 'hblur',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'hblur',
            'color-glitch': 'dissolve',
            'urban-glitch': 'squeezev',
            'blood-mist': 'dissolve', // Visual approx
            'black-smoke': 'fade',
            'white-smoke': 'fade',
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
            'rip-diag': 'wipetl',
            'zoom-neg': 'distance',
            'infinity-1': 'distance',
            'digital-paint': 'dissolve',
            'brush-wind': 'wipeleft',
            'dust-burst': 'fade',
            'filter-blur': 'hblur',
            'film-roll-v': 'slideup',
            'astral-project': 'zoomin',
            'lens-flare': 'fade',
            'flash-bang': 'fade',
            'flash-white': 'fade',
            'flash-black': 'fade',
            'flashback': 'fade',
            'combine-overlay': 'fade',
            'combine-mix': 'fade',
            'nightmare': 'fade',
            'bubble-blur': 'hblur',
            'paper-unfold': 'circleopen',
            'corrupt-img': 'pixelize',
            'glow-intense': 'fade',
            'dynamic-blur': 'hblur',
            'blur-dissolve': 'distance',
            'burn': 'fade',
            'exposure': 'fade',
            'bokeh-blur': 'hblur',
            'light-leak-tr': 'fade',
            'flare-pass': 'slideleft',
            'prism-split': 'hblur',
            'god-rays': 'fade',
            'liquid-melt': 'hlslice',
            'ink-splash': 'hrslice',
            'water-ripple': 'radial',
            'smoke-reveal': 'fade',
            'oil-paint': 'dissolve',
            'bubble-pop': 'circleopen',
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
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur'
        };

        if (map[id]) return map[id];
        
        // Final fallback heuristics
        if (id.includes('wipe')) return 'wipeleft';
        if (id.includes('slide')) return 'slideleft';
        if (id.includes('zoom')) return 'zoomin';
        if (id.includes('spin')) return 'radial';
        if (id.includes('flash')) return 'fade';
        
        return 'fade'; 
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
