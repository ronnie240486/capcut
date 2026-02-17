
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
        
        // Color Grade Pro (cg-pro-N)
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hue = (i * 15) % 360;
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hue}`;
        }

        // Vintage Style (vintage-style-N)
        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
            const i = parseInt(vinMatch[1], 10);
            const sepia = 0.3 + (i % 5) * 0.1;
            // Simulated sepia using colorbalance + desaturation
            return `eq=saturation=0.5:contrast=0.9:brightness=0.1,colorbalance=rs=${sepia.toFixed(2)}:bs=-${(sepia/2).toFixed(2)}`;
        }

        // Cyber Neon (cyber-neon-N)
        const cyberMatch = effectId.match(/^cyber-neon-(\d+)$/);
        if (cyberMatch) {
            const i = parseInt(cyberMatch[1], 10);
            const hue = i * 10;
            return `eq=contrast=1.3:saturation=1.5,hue=h=${hue}`;
        }

        // Nature Fresh (nature-fresh-N)
        const natMatch = effectId.match(/^nature-fresh-(\d+)$/);
        if (natMatch) {
            const i = parseInt(natMatch[1], 10);
            const hue = -(i * 2);
            return `eq=saturation=1.4:brightness=0.05,hue=h=${hue}`;
        }

        // Artistic Duotone (art-duo-N)
        const duoMatch = effectId.match(/^art-duo-(\d+)$/);
        if (duoMatch) {
            const i = parseInt(duoMatch[1], 10);
            const hue = i * 12;
            return `hue=s=0,eq=contrast=1.5,colorbalance=rs=0.5:bs=-0.5,hue=h=${hue}:s=3`;
        }

        // Noir (noir-style-N)
        const noirMatch = effectId.match(/^noir-style-(\d+)$/);
        if (noirMatch) {
            const i = parseInt(noirMatch[1], 10);
            return `hue=s=0,eq=contrast=${(1 + i * 0.05).toFixed(2)}:brightness=${(0 - i * 0.02).toFixed(2)}`;
        }

        // --- 2. STATIC NAMED EFFECTS ---
        const effects = {
            // Glitch & Distortion
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'scan-line-v': 'drawgrid=x=0:w=4:t=1:c=black@0.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'rgb-split': "geq=r='p(X+20,Y)':g='p(X,Y)':b='p(X-20,Y)'",
            'glitch-chroma': "geq=r='p(X+15,Y)':g='p(X,Y)':b='p(X-15,Y)',hue=s=2", 
            'urban-glitch': "hue=H=2*PI*t:s=2,eq=contrast=1.2,drawgrid=y=0:h=16:t=2:c=black@0.3",
            'pixelate': 'scale=iw/20:ih/20:flags=nearest,scale=iw*20:ih*20:flags=neighbor',
            'block-glitch': 'scale=iw/10:ih/10:flags=nearest,scale=iw*10:ih*10:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u,eq=contrast=1.5:brightness=0.1',
            'vhs-distort': 'noise=alls=10:allf=t+u,eq=saturation=1.3,gblur=sigma=1',
            
            // Colors
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'mono': 'hue=s=0,eq=contrast=1.2',
            'vintage-warm': 'colorbalance=rs=0.3:gs=0:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cool-morning': 'colorbalance=rs=-0.1:bs=0.2,eq=brightness=0.1',
            'cyberpunk': 'eq=contrast=1.4:saturation=2,colorbalance=rs=0.2:bs=0.3',
            'radioactive': 'hue=h=90:s=2,eq=contrast=1.5',
            'night-vision': 'hue=s=0,colorbalance=gs=0.5,noise=alls=30:allf=t+u',
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'dreamy': 'gblur=sigma=5,eq=brightness=0.1:saturation=1.2',
            'underwater': 'eq=saturation=0.8,colorbalance=rs=-0.2:gs=0.1:bs=0.3,gblur=sigma=2',
            
            // Retro
            'old-film': 'noise=alls=20:allf=t+u,vignette=PI/4,hue=s=0.5',
            'grain': 'noise=alls=30:allf=t+u',
            'vignette': 'vignette=PI/3',
            'super8': 'vignette=PI/4,hue=s=0.7,colorbalance=rs=0.1:bs=-0.1'
        };
        
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        // Default ZoomPan settings
        // d=duration in frames, s=output size, fps=framerate
        // x,y = top-left corner of the zoom window
        // z = zoom factor (1.0 = 100%, 1.5 = 150%)
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        
        // --- 1. PROCEDURAL PARSING (mov- prefix) ---
        
        // PANS
        if (moveId && moveId.startsWith('mov-pan-')) {
            z = '1.2'; // Must zoom in to pan
            if (moveId.includes('slow-l')) x = `(iw-ow)*(on/${frames})`; // Move viewport Right -> Image moves Left
            else if (moveId.includes('slow-r')) x = `(iw-ow)*(1-on/${frames})`;
            else if (moveId.includes('slow-u')) y = `(ih-oh)*(on/${frames})`;
            else if (moveId.includes('slow-d')) y = `(ih-oh)*(1-on/${frames})`;
            else if (moveId.includes('fast-l')) x = `(iw-ow)*((on*2)/${frames})`;
            else if (moveId.includes('fast-r')) x = `(iw-ow)*(1-(on*2)/${frames})`;
            // Diagonals
            else if (moveId.includes('diag-tl')) { x = `(iw-ow)*(on/${frames})`; y = `(ih-oh)*(on/${frames})`; }
            else if (moveId.includes('diag-tr')) { x = `(iw-ow)*(1-on/${frames})`; y = `(ih-oh)*(on/${frames})`; }
            else if (moveId.includes('diag-bl')) { x = `(iw-ow)*(on/${frames})`; y = `(ih-oh)*(1-on/${frames})`; }
            else if (moveId.includes('diag-br')) { x = `(iw-ow)*(1-on/${frames})`; y = `(ih-oh)*(1-on/${frames})`; }
        }
        
        // ZOOMS
        else if (moveId && moveId.startsWith('mov-zoom-')) {
            if (moveId.includes('crash-in')) {
                z = `min(zoom+0.05,2.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('crash-out')) {
                z = `max(2.0-0.05*on,1.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('slow-in')) {
                z = `min(zoom+0.0015,1.2)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('slow-out')) {
                z = `max(1.2-0.0015*on,1.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('bounce')) {
                z = `1.0+0.1*sin(2*PI*on/(${frames}/2))`; // Sine wave zoom
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('pulse')) {
                const freq = moveId.includes('fast') ? 10 : 3;
                z = `1.05+0.05*sin(2*PI*on/(${frames}/${freq}))`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            }
        }
        
        // SHAKES & GLITCHES (Simulated via crop/position jitter)
        else if (moveId && (moveId.includes('shake') || moveId.includes('jitter') || moveId.includes('earthquake') || moveId.includes('glitch'))) {
            const intensity = moveId.includes('violent') || moveId.includes('earthquake') ? 40 : 10;
            // Use 'crop' filter logic instead of zoompan for pure shake to avoid blur, but zoompan handles edge padding better.
            // Zoom in slightly (1.1) to allow shaking without black bars
            z = '1.1';
            x = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
            y = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
        }
        
        // --- 2. LEGACY SUPPORT & DEFAULTS ---
        else if (moveId === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (moveId === 'zoom-in' || (isImage && !moveId)) {
            z = `min(zoom+0.0015,1.5)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (moveId === 'zoom-out') {
            z = `max(1.5-0.0015*on,1.0)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else {
             // Static default
             z = '1.0'; x = '0'; y = '0';
        }
        
        return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },

    getTransitionXfade: (id) => {
        // Maps Frontend IDs to FFmpeg xfade transition names
        // https://ffmpeg.org/ffmpeg-filters.html#xfade
        const map = {
            // Standard
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash-white': 'fadewhite', 'flash-black': 'fadeblack',
            
            // Wipes & Slides
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright',
            
            // Shapes
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 
            'rect-crop': 'rectcrop', 'diamond-in': 'diagtl', 'diamond-out': 'diagbr',
            'radial': 'radial', 'clock-wipe': 'radial', 'spiral-wipe': 'radial',
            
            // Modern / Glitch / Cyber (Approximations)
            'pixelize': 'pixelize', 'glitch': 'pixelize', 'glitch-chroma': 'pixelize',
            'pixel-sort': 'pixelize', 'hologram': 'pixelize',
            'color-glitch': 'hblur', 'urban-glitch': 'hblur',
            'rgb-split': 'distance', 
            'blur-warp': 'hblur', 'morph': 'morph',
            
            // Physical / Organic
            'liquid-melt': 'dissolve', // Fallback, no direct fluid sim in xfade
            'ink-splash': 'circleopen', 
            'paper-rip': 'wipetl', 'page-turn': 'wipetl',
            'burn-paper': 'dissolve', 
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', // 3D sim via slide
            'door-open': 'hlslice', 'shutters': 'hlslice',
            'mosaic-small': 'pixelize', 'mosaic-large': 'pixelize',
            'whip-left': 'slideleft', 'whip-right': 'slideright', // Standard ffmpeg doesn't have whip, use slide
            'whip-diagonal-1': 'wipetl', 'whip-diagonal-2': 'wipebr',
            
            // Fallbacks for creative names
            'blood-mist': 'dissolve', 'fire-burn': 'dissolve', 'smoke-reveal': 'dissolve',
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout'
        };
        
        return map[id] || 'fade';
    }
};
