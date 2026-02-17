
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
        
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hue = (i * 15) % 360;
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hue}`;
        }

        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
            const i = parseInt(vinMatch[1], 10);
            const sepia = 0.3 + (i % 5) * 0.1;
            return `eq=saturation=0.5:contrast=0.9:brightness=0.1,colorbalance=rs=${sepia.toFixed(2)}:bs=-${(sepia/2).toFixed(2)}`;
        }

        const cyberMatch = effectId.match(/^cyber-neon-(\d+)$/);
        if (cyberMatch) {
            const i = parseInt(cyberMatch[1], 10);
            const hue = i * 10;
            return `eq=contrast=1.3:saturation=1.5,hue=h=${hue}`;
        }

        const natMatch = effectId.match(/^nature-fresh-(\d+)$/);
        if (natMatch) {
            const i = parseInt(natMatch[1], 10);
            const hue = -(i * 2);
            return `eq=saturation=1.4:brightness=0.05,hue=h=${hue}`;
        }

        const duoMatch = effectId.match(/^art-duo-(\d+)$/);
        if (duoMatch) {
            const i = parseInt(duoMatch[1], 10);
            const hue = i * 12;
            return `hue=s=0,eq=contrast=1.5,colorbalance=rs=0.5:bs=-0.5,hue=h=${hue}:s=3`;
        }

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
            'posterize': 'curves=posterize',
            'fade': 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3',
            'vibrant': 'eq=saturation=2',
            'muted': 'eq=saturation=0.5',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'golden-hour': 'colorbalance=rs=0.3:gs=0.1:bs=-0.3,eq=saturation=1.2',
            'cold-blue': 'colorbalance=bs=0.4:rs=-0.1,eq=saturation=0.8',
            'scifi': 'eq=contrast=1.3,hue=h=180',
            'pastel': 'eq=contrast=0.8:brightness=0.2:saturation=1.5',
            
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
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        let extra = ''; // For filters like blur
        
        // Normalize moveId: some might have 'mov-' prefix, some might not.
        // We ensure we check against the core name.
        const id = moveId || '';
        
        // --- 1. PROCEDURAL PANS (mov-pan-) ---
        if (id.includes('pan-')) {
            z = '1.2';
            if (id.includes('slow-l')) x = `(iw-ow)*(on/${frames})`;
            else if (id.includes('slow-r')) x = `(iw-ow)*(1-on/${frames})`;
            else if (id.includes('slow-u')) y = `(ih-oh)*(on/${frames})`;
            else if (id.includes('slow-d')) y = `(ih-oh)*(1-on/${frames})`;
            else if (id.includes('fast-l')) x = `(iw-ow)*((on*2)/${frames})`;
            else if (id.includes('fast-r')) x = `(iw-ow)*(1-(on*2)/${frames})`;
            else if (id.includes('diag-tl')) { x = `(iw-ow)*(on/${frames})`; y = `(ih-oh)*(on/${frames})`; }
            else if (id.includes('diag-tr')) { x = `(iw-ow)*(1-on/${frames})`; y = `(ih-oh)*(on/${frames})`; }
            else if (id.includes('diag-bl')) { x = `(iw-ow)*(on/${frames})`; y = `(ih-oh)*(1-on/${frames})`; }
            else if (id.includes('diag-br')) { x = `(iw-ow)*(1-on/${frames})`; y = `(ih-oh)*(1-on/${frames})`; }
        }
        // --- 2. 3D ZOOMS & DYNAMIC ---
        else if (id.includes('zoom-') || id === 'dolly-zoom') {
            if (id.includes('crash-in')) {
                z = `min(zoom+0.05,2.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id.includes('crash-out')) {
                z = `max(2.0-0.05*on,1.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id.includes('slow-in')) {
                z = `min(zoom+0.0015,1.2)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id.includes('fast-in')) {
                z = `min(zoom+0.005,1.5)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id.includes('slow-out')) {
                z = `max(1.2-0.0015*on,1.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id.includes('bounce')) {
                z = `1.0+0.1*sin(2*PI*on/(${frames}/2))`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id.includes('pulse')) {
                const freq = id.includes('fast') ? 10 : 3;
                z = `1.05+0.05*sin(2*PI*on/(${frames}/${freq}))`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (id === 'dolly-zoom') {
                // Dolly zoom simulation: Zoom in strongly while staying centered
                z = `1.0 + 0.3*sin(PI*on/${frames})`; 
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            }
        }
        // --- 3. ELASTIC & FUN ---
        else if (id.includes('elastic') || id.includes('jelly') || id.includes('bounce-scale')) {
            if (id.includes('elastic-left')) {
                // Use sine wave with exponential decay to simulate elastic snap from left
                z = '1.0';
                x = `(iw-ow)/2 + (iw/4)*sin(2*PI*on/(${frames}/2))*exp(-2*on/${frames})`;
            } else if (id.includes('elastic-right')) {
                 z = '1.0';
                 x = `(iw-ow)/2 - (iw/4)*sin(2*PI*on/(${frames}/2))*exp(-2*on/${frames})`;
            } else if (id.includes('jelly')) {
                // Rapid wobble zoom
                z = `1.0 + 0.05*sin(10*PI*on/${frames})`;
                x = `(iw-ow)/2`; y = `(ih-oh)/2`;
            } else if (id.includes('bounce-scale')) {
                 z = `if(lt(on,${frames}/2), 0.5 + (1.2-0.5)*(on/(${frames}/2)), 1.2 - 0.2*((on-${frames}/2)/(${frames}/2)))`;
                 x = `(iw-ow)/2`; y = `(ih-oh)/2`;
            }
        }
        // --- BLURS ---
        else if (id.includes('blur-')) {
            if (id.includes('in')) {
                // Blur first 0.5s
                extra = `,gblur=sigma=20:enable='between(t,0,0.5)'`;
            }
            else if (id.includes('out')) {
                // Blur last 0.5s
                const startBlur = Math.max(0, durationSec - 0.5);
                extra = `,gblur=sigma=20:enable='between(t,${startBlur},${durationSec})'`;
            }
            else if (id.includes('pulse')) {
                // Blur in middle 0.5s
                const mid = durationSec / 2;
                extra = `,gblur=sigma=15:enable='between(t,${mid-0.25},${mid+0.25})'`;
            }
            else if (id.includes('zoom')) {
                 z = `min(zoom+0.01,1.5)`;
                 extra = `,gblur=sigma=5:enable='between(t,0,0.3)'`;
            }
        }
        // --- SHAKES ---
        else if (id.includes('shake') || id.includes('jitter') || id.includes('earthquake') || id.includes('glitch')) {
            const intensity = id.includes('violent') || id.includes('earthquake') ? 40 : 10;
            z = '1.1';
            x = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
            y = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
        }
        // --- LEGACY ---
        else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (id === 'zoom-in' || (isImage && !id)) {
            z = `min(zoom+0.0015,1.5)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (id === 'zoom-out') {
            z = `max(1.5-0.0015*on,1.0)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else {
             z = '1.0'; x = '0'; y = '0';
        }
        
        return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}${extra}`;
    },

    getTransitionXfade: (id) => {
        // FULL MAPPING OF CONSTANTS.TS to FFMPEG XFADE
        // https://ffmpeg.org/ffmpeg-filters.html#xfade
        
        const map = {
            // Basics
            'fade': 'fade', 
            'crossfade': 'fade', 
            'mix': 'fade', 
            'dissolve': 'dissolve',
            'blur-dissolve': 'distance', // Approx for "blur dissolve"
            'filter-blur': 'distance',

            // Colors
            'black': 'fadeblack', 
            'white': 'fadewhite', 
            'flash': 'fadewhite', 
            'flash-white': 'fadewhite', 
            'flash-black': 'fadeblack',
            
            // Wipes & Slides
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright', 'push-up': 'slideup', 'push-down': 'slidedown',
            'smooth-left': 'smoothleft', 'smooth-right': 'smoothright', 'smooth-up': 'smoothup', 'smooth-down': 'smoothdown',
            
            // Shapes
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 
            'rect-crop': 'rectcrop', 'diamond-in': 'diagtl', 'diamond-out': 'diagbr',
            'radial': 'radial', 'clock-wipe': 'radial', 'spiral-wipe': 'radial',
            'iris-in': 'circleopen', 'iris-out': 'circleclose',
            'triangle-wipe': 'diagtl',
            'checker-wipe': 'checkerboard', 'checkerboard': 'checkerboard',
            
            // Glitch / Cyber (Best Approx)
            'pixelize': 'pixelize', 
            'glitch': 'pixelize', 
            'glitch-chroma': 'pixelize',
            'pixel-sort': 'pixelize', 
            'hologram': 'pixelize',
            'color-glitch': 'hblur', 
            'urban-glitch': 'hblur',
            'rgb-split': 'distance', 
            'rgb-shake': 'distance',
            'blur-warp': 'hblur', 
            'morph': 'morph',
            'datamosh': 'pixelize',
            'cyber-zoom': 'zoomin',
            'cyber-slice': 'slice', // requires FFmpeg 6.1+
            
            // Organic / Liquid
            'liquid-melt': 'dissolve', 
            'ink-splash': 'circleopen', 
            'oil-paint': 'dissolve',
            'water-ripple': 'wipetl',
            'water-drop': 'circleopen',
            'bubble-pop': 'circleopen',
            
            // Paper / Texture
            'paper-rip': 'wipetl', 
            'page-turn': 'wipetl',
            'burn-paper': 'dissolve', 
            'fold-up': 'slideup',
            
            // 3D / Rotation
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', 
            'cube-rotate-u': 'slideup', 'cube-rotate-d': 'slidedown',
            'door-open': 'hlslice', 'shutters': 'hlslice',
            'mosaic-small': 'pixelize', 'mosaic-large': 'pixelize',
            'whip-left': 'slideleft', 'whip-right': 'slideright', 
            'whip-up': 'slideup', 'whip-down': 'slidedown',
            'whip-diagonal-1': 'wipetl', 'whip-diagonal-2': 'wipebr',
            'spin-cw': 'radial', 'spin-ccw': 'radial',
            'spin-zoom-in': 'zoomin', 'spin-zoom-out': 'zoomout',
            'flip-card': 'squeezeh',
            
            // Optics / Light
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout',
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'burn': 'fadeblack',
            'bokeh-blur': 'distance',
            
            // Creative Fallbacks (Mapping "Blood Mist" etc)
            'blood-mist': 'dissolve', 
            'fire-burn': 'dissolve', 
            'smoke-reveal': 'dissolve',
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'visual-buzz': 'pixelize',
            'rip-diag': 'wipetl',
            'zoom-neg': 'zoomout',
            'infinity-1': 'zoomin',
            'digital-paint': 'pixelize',
            'brush-wind': 'wipeleft',
            'dust-burst': 'dissolve',
            'film-roll-v': 'slideup',
            'astral-project': 'dissolve',
            'lens-flare': 'fadewhite',
            'pull-away': 'zoomout',
            'fade-classic': 'fade',
            'flashback': 'fadewhite',
            'nightmare': 'fadeblack',
            'bubble-blur': 'distance',
            'paper-unfold': 'circleopen',
            'corrupt-img': 'pixelize',
            'glow-intense': 'fadewhite',
            'dynamic-blur': 'distance'
        };
        
        // Return valid mapping or default to 'fade'
        return map[id] || 'fade';
    }
};
