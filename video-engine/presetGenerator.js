
module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100'
    ],

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // --- 1. NAMED EFFECTS MAPPING ---
        const effects = {
            // Cinematic Pro
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
            'posterize': 'eq=contrast=2.0:saturation=1.5',
            'fade': 'eq=contrast=0.8:brightness=0.1',
            'vibrant': 'eq=saturation=2.0',
            'muted': 'eq=saturation=0.5',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'golden-hour': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=saturation=1.2',
            'cold-blue': 'colorbalance=bs=0.3:rs=-0.1',
            'night-vision': 'hue=s=0,eq=brightness=0.1,colorbalance=gs=0.5,noise=alls=20:allf=t',
            'scifi': 'colorbalance=bs=0.2:gs=0.1,eq=contrast=1.3',
            'pastel': 'eq=saturation=0.7:brightness=0.1:contrast=0.9',

            // Estilos Artísticos
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

            // Tendência & Filtros Básicos
            'dv-cam': 'eq=saturation=0.8,noise=alls=5:allf=t',
            'bling': 'eq=brightness=0.1',
            'soft-angel': 'boxblur=2:1,eq=brightness=0.1',
            'sharpen': 'unsharp=5:5:1.5:5:5:0.0',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5',
            'mono': 'hue=s=0',
            'bw': 'hue=s=0',
            'vintage': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=contrast=0.9',
            'dreamy': 'boxblur=2:1',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',

            // Glitch & Retro
            'glitch-pro-1': 'colorbalance=gs=0.1,noise=alls=10:allf=t',
            'glitch-pro-2': 'scale=iw/10:ih/10,scale=iw*10:ih*10:flags=neighbor',
            'vhs-distort': 'eq=saturation=1.5,boxblur=1:1,noise=alls=10:allf=t',
            'bad-signal': 'noise=alls=30:allf=t',
            'chromatic': 'colorbalance=rs=0.1:bs=0.1',
            'pixelate': 'scale=iw/20:ih/20,scale=iw*20:ih*20:flags=neighbor',
            'old-film': 'eq=saturation=0.5,noise=alls=15:allf=t',
            'dust': 'noise=alls=5:allf=t',
            'grain': 'noise=alls=15:allf=t',
            'vignette': 'eq=brightness=-0.1', // Simple approx
            'super8': 'eq=saturation=0.8:contrast=1.1,colorbalance=rs=0.1',
            'noise': 'noise=alls=20:allf=t'
        };

        if (effects[effectId]) return effects[effectId];

        // --- 2. PROCEDURAL EFFECTS MAPPING ---
        
        // Color Grade Pro (cg-pro-1 to 50)
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const c = 1 + (i % 5) * 0.1;
            const s = 1 + (i % 3) * 0.2;
            const h = (i * 15) % 360;
            return `eq=contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)},hue=h=${h}`;
        }

        // Vintage Style (vintage-style-1 to 30)
        if (effectId.startsWith('vintage-style-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const sepia = 0.1 + (i % 5) * 0.05;
            return `colorbalance=rs=${sepia.toFixed(2)}:bs=-${sepia.toFixed(2)},eq=contrast=0.9`;
        }
        
        // Cyber Neon (cyber-neon-1 to 20)
        if (effectId.startsWith('cyber-neon-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=contrast=1.2:saturation=1.5,hue=h=${i*10}`;
        }
        
        // Nature Fresh (nature-fresh-1 to 20)
        if (effectId.startsWith('nature-fresh-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=1.3:brightness=0.05,hue=h=-${i*2}`;
        }

        // Art Duo (art-duo-1 to 30)
        if (effectId.startsWith('art-duo-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,colorbalance=rs=${0.1 * (i%3)}:bs=${0.1 * (i%2)}`;
        }

        // Noir Style (noir-style-1 to 20)
        if (effectId.startsWith('noir-style-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,eq=contrast=${(1 + i*0.05).toFixed(2)}`;
        }
        
        // Film Stock (film-stock-1 to 20)
        if (effectId.startsWith('film-stock-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=0.8:contrast=1.1`;
        }

        // Light Leaks (Approximated with brightness/gamma)
        if (effectId.startsWith('leak-overlay-') || effectId.startsWith('light-leak-')) {
            return 'eq=brightness=0.1:gamma=1.1';
        }

        return null;
    },

    getMovementFilter: (moveId, durationSec) => {
        const d = parseFloat(durationSec) || 5;
        const fps = 30;
        const totalFrames = Math.ceil(d * 30);
        
        // Helper to get unique IDs for complex filter chains
        const uid = Math.floor(Math.random() * 100000);
        
        // ZoomPan Basics: d=1 means output 1 frame per input frame. s=1280x720 output size.
        // We use 'on' (current frame number) or 'time' for interpolation.
        const base = `:d=1:s=1280x720:fps=30`; 
        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

        switch (moveId) {
            // === 0. BLUR MOVEMENTS (Implemented using Overlay + Alpha Fade for stability) ===
            
            case 'mov-blur-in':
                // Blur starts at 100% and fades to 0% over 1 second (or d if d<1)
                // Using split to create a blurred copy, then overlaying it with fading alpha
                // boxblur=20 (Strong blur)
                return `split[base${uid}][to_blur${uid}];[to_blur${uid}]boxblur=20[blurred${uid}];[base${uid}][blurred${uid}]overlay=eval=frame:alpha='max(0,1-t)'`;

            case 'mov-blur-out':
                // Blur starts at 0% and fades to 100% at the end
                // We want it to start blurring near the end. Let's say last 1 second.
                // alpha = max(0, t - (d-1)) -> if d=5, at t=4 alpha=0, at t=5 alpha=1
                return `split[base${uid}][to_blur${uid}];[to_blur${uid}]boxblur=20[blurred${uid}];[base${uid}][blurred${uid}]overlay=eval=frame:alpha='max(0,t-(${d}-1))'`;

            case 'mov-blur-pulse':
                // Pulse blur every 1 second
                // alpha = 0.5 * (1 + sin(t * speed))
                return `split[base${uid}][to_blur${uid}];[to_blur${uid}]boxblur=15[blurred${uid}];[base${uid}][blurred${uid}]overlay=eval=frame:alpha='0.5*(1+sin(t*5))'`;

            case 'mov-blur-zoom':
                 // Combine Zoom and Blur In
                 // First apply zoompan, then apply the blur overlay technique
                 // Note: 'zoompan' creates a new stream. We apply zoompan first, then split the zoomed result.
                 return `zoompan=z='min(1.0+(on*0.5/${totalFrames}),1.5)':${center}${base},split[base${uid}][to_blur${uid}];[to_blur${uid}]boxblur=20[blurred${uid}];[base${uid}][blurred${uid}]overlay=eval=frame:alpha='max(0,1-t)'`;

            case 'mov-blur-motion':
                 // Directional blur (Motion Blur)
                 // Use a static horizontal blur
                 return `boxblur=luma_radius=10:luma_power=1`;

            // === 1. CAMERA PANS ===
            case 'mov-pan-slow-l': 
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-slow-r': 
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-slow-u': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))'${base}`;
            case 'mov-pan-slow-d': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})'${base}`;
            
            case 'mov-pan-fast-l': 
                return `zoompan=z=1.4:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-fast-r': 
                return `zoompan=z=1.4:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)'${base}`;
                
            // === 2. DYNAMIC ZOOMS ===
            case 'mov-zoom-crash-in': 
            case 'zoom-fast-in':
            case 'zoom-in':
                return `zoompan=z='min(1.0+(on*1.5/${totalFrames}),2.5)':${center}${base}`;
            
            case 'mov-zoom-crash-out': 
            case 'zoom-out':
                return `zoompan=z='max(2.5-(on*1.5/${totalFrames}),1.0)':${center}${base}`;
                
            case 'mov-zoom-slow-in':
            case 'zoom-slow-in':
            case 'kenBurns':
                 return `zoompan=z='min(1.0+(on*0.5/${totalFrames}),1.4)':${center}${base}`;

            case 'mov-zoom-slow-out':
            case 'zoom-slow-out':
                 return `zoompan=z='max(1.4-(on*0.5/${totalFrames}),1.0)':${center}${base}`;

            case 'mov-zoom-bounce-in':
            case 'zoom-bounce':
            case 'mov-zoom-bounce':
                 return `zoompan=z='1.0+0.1*abs(sin(on*0.1))':${center}${base}`;
            
            case 'mov-zoom-pulse-slow':
            case 'pulse':
                 return `zoompan=z='1.0+0.05*sin(on*0.05)':${center}${base}`;
            case 'mov-zoom-pulse-fast':
                 return `zoompan=z='1.0+0.1*sin(on*0.2)':${center}${base}`;

            case 'mov-dolly-vertigo':
            case 'dolly-zoom':
                 return `zoompan=z='min(1.0+(on*1.0/${totalFrames}),2.0)':${center}${base}`;

            case 'mov-zoom-twist-in':
            case 'mov-zoom-twist-out':
                 return `zoompan=z='1.0+0.2*abs(sin(on*0.1))':${center}${base}`;

            // === 3. SHAKES & HANDHELD ===
            case 'handheld-1':
                 return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+sin(on*0.1)*2':y='ih/2-(ih/zoom/2)+cos(on*0.13)*2'${base}`;
            case 'handheld-2':
                 return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+sin(on*0.2)*5':y='ih/2-(ih/zoom/2)+cos(on*0.25)*5'${base}`;
            case 'shake-hard':
            case 'mov-shake-violent':
                 return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*50':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*50'${base}`;
            case 'earthquake':
                 return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*30':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*30'${base}`;
            case 'jitter':
            case 'mov-jitter-x':
            case 'mov-jitter-y':
                 return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*10':y='ih/2-(ih/zoom/2)'${base}`;

            // === 4. ROTATION / SPIN (Simulated) ===
            case 'mov-3d-spin-axis': 
            case 'spin-slow':
                return `rotate='t*0.5':ow=iw:oh=ih:c=black`;
            
            case 'mov-3d-swing-l':
            case 'pendulum':
                return `rotate='sin(t*2)*0.1':ow=iw:oh=ih:c=black`;
            
            case 'wiggle':
                return `rotate='sin(t*10)*0.05':ow=iw:oh=ih:c=black`;
            
            // === 5. ENTRY ANIMATIONS (Simulated with Zoom/Crop) ===
            case 'slide-in-left': 
                return `zoompan=z=1.0:x='if(lte(on,30),(iw/2-(iw/zoom/2)) - (iw)*(1-on/30), iw/2-(iw/zoom/2))':y='ih/2-(ih/zoom/2)'${base}`;
            case 'slide-in-right':
                return `zoompan=z=1.0:x='if(lte(on,30),(iw/2-(iw/zoom/2)) + (iw)*(1-on/30), iw/2-(iw/zoom/2))':y='ih/2-(ih/zoom/2)'${base}`;
            case 'slide-in-bottom':
                return `zoompan=z=1.0:y='if(lte(on,30),(ih/2-(ih/zoom/2)) + (ih)*(1-on/30), ih/2-(ih/zoom/2))':x='iw/2-(iw/zoom/2)'${base}`;
            
            case 'pop-in':
            case 'mov-pop-up':
                // Scale 0 to 1 over first 15 frames
                return `zoompan=z='if(lte(on,15),min(on/15,1.0),1.0)':${center}${base}`;
            
            case 'fade-in':
                 return `zoompan=z=1${base}`;

            // === 6. EFFECTS & GLITCH MOVES ===
            case 'photo-flash':
            case 'strobe':
            case 'mov-strobe-move':
                return `eq=brightness='if(lt(mod(n,10),5),0.5,0)'`;
            
            case 'heartbeat':
                return `zoompan=z='if(lt(mod(on,30),5),1.2,1.0)':${center}${base}`;
            
            case 'mov-frame-skip':
                return `fps=10`;
            
            case 'mov-vhs-tracking':
                return `crop=iw:ih:0:'if(eq(mod(n,30),0),10,0)'`;

            case 'mov-glitch-snap':
            case 'mov-glitch-skid':
            case 'mov-digital-tear':
                 return `crop=iw:ih:'(random(1)-0.5)*20':'(random(1)-0.5)*20'`;

            // === 7. ELASTIC ===
            case 'mov-rubber-band':
            case 'mov-jelly-wobble':
            case 'mov-spring-up':
            case 'mov-squash-stretch':
                 return `zoompan=z='1.0+0.1*abs(sin(on*0.3))':${center}${base}`;
            case 'mov-tada':
                 return `zoompan=z='if(lt(on,10),1.0+0.05*sin(on),1.0)':${center}${base}`;

            default:
                // Fallback for any unknown moveId that contains "zoom"
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}${base}`;
                }
                return null;
        }
    },

    getTransitionXfade: (transId) => {
        // Full mapping from frontend IDs to FFmpeg xfade transition names
        // https://trac.ffmpeg.org/wiki/Xfade
        const map = {
            'fade-classic': 'fade',
            'crossfade': 'fade',
            'mix': 'fade',
            'black': 'fadeblack',
            'white': 'fadewhite',
            
            // Geometric
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
            'diamond-in': 'diagtl',
            'diamond-out': 'diagbr',
            'diamond-zoom': 'diagtl',
            'clock-wipe': 'clock',
            'iris-in': 'iris',
            'iris-out': 'iris', // FFmpeg has only one iris, usually in
            'checker-wipe': 'checkerboard',
            'checkerboard': 'checkerboard',
            'blind-h': 'hblur', // Approx
            'blind-v': 'vblur', // Approx
            'shutters': 'hblur',
            'triangle-wipe': 'diagtl',
            'star-zoom': 'circleopen', // Fallback
            'spiral-wipe': 'spiral',
            'grid-flip': 'checkerboard',
            'dots-reveal': 'dissolve',
            'hex-reveal': 'mosaic',
            'stripes-h': 'hblur',
            'stripes-v': 'vblur',
            'heart-wipe': 'circleopen', // Fallback
            
            // Glitch & Cyber
            'glitch': 'glitchdisplace',
            'color-glitch': 'glitchmem',
            'urban-glitch': 'glitchdisplace',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'rgbscanup',
            'hologram': 'holographic',
            'block-glitch': 'mosaic',
            'cyber-zoom': 'zoomin',
            'scan-line-v': 'wipetl',
            'color-tear': 'glitchmem',
            'digital-noise': 'noise',
            'glitch-scan': 'rgbscanup',
            'datamosh': 'glitchdisplace',
            'rgb-split': 'glitchmem',
            'noise-jump': 'noise',
            'cyber-slice': 'wipetl',
            'glitch-chroma': 'glitchmem',
            
            // Trends (Fire, Smoke, etc - Mapped to Dissolves/Fades)
            'blood-mist': 'dissolve',
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'fire-burn': 'dissolve',
            'visual-buzz': 'glitchdisplace',
            'rip-diag': 'wipetl',
            'zoom-neg': 'zoomin',
            'infinity-1': 'dissolve',
            'digital-paint': 'dissolve',
            'brush-wind': 'wipeleft',
            'dust-burst': 'dissolve',
            'filter-blur': 'blur',
            'film-roll-v': 'slideup',
            'astral-project': 'dissolve',
            'lens-flare': 'fadewhite',
            'pull-away': 'zoomout',
            'flash-black': 'fadeblack',
            'flash-white': 'fadewhite',
            'flashback': 'fadewhite',
            'combine-overlay': 'dissolve',
            'combine-mix': 'dissolve',
            'nightmare': 'dissolve',
            'bubble-blur': 'blur',
            'paper-unfold': 'slideleft',
            'corrupt-img': 'pixelize',
            'glow-intense': 'fadewhite',
            'dynamic-blur': 'blur',
            'blur-dissolve': 'blur',
            
            // Liquid & Organic
            'liquid-melt': 'dissolve',
            'ink-splash': 'dissolve',
            'oil-paint': 'dissolve',
            'water-ripple': 'ripple',
            'smoke-reveal': 'dissolve',
            'bubble-pop': 'circleopen',
            
            // Paper
            'page-turn': 'coverleft', // Approx
            'paper-rip': 'wipetl',
            'burn-paper': 'dissolve',
            'sketch-reveal': 'dissolve',
            'fold-up': 'slideup',
            
            // 3D
            'cube-rotate-l': 'slideleft',
            'cube-rotate-r': 'slideright',
            'cube-rotate-u': 'slideup',
            'cube-rotate-d': 'slidedown',
            'door-open': 'wipetl',
            'flip-card': 'slideleft',
            'room-fly': 'zoomin',
            
            // Zoom & Camera
            'zoom-in': 'zoomin',
            'zoom-out': 'zoomout',
            'zoom-spin-fast': 'zoomin', // Spin not standard
            'spin-cw': 'wipetl',
            'spin-ccw': 'wipetr',
            'whip-left': 'whipleft',
            'whip-right': 'whipright',
            'whip-up': 'whipup',
            'whip-down': 'whipdown',
            'perspective-left': 'slideleft',
            'perspective-right': 'slideright',
            'zoom-blur-l': 'whipleft',
            'zoom-blur-r': 'whipright',
            'spin-zoom-in': 'zoomin',
            'spin-zoom-out': 'zoomout',
            'whip-diagonal-1': 'wipetl',
            'whip-diagonal-2': 'wipetr',
            
            // Lights
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'burn': 'dissolve',
            'bokeh-blur': 'blur',
            'light-leak-tr': 'fadewhite',
            'flare-pass': 'wipeleft',
            'prism-split': 'dissolve',
            'god-rays': 'fadewhite',
            
            // Elastic
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'wipetl',
            
            // Cinematic
            'luma-fade': 'fade',
            'film-roll': 'slideup',
            'blur-warp': 'blur'
        };
        return map[transId] || 'fade';
    }
};
