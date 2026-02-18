
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

        // Color Grading Procedural
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hue = (i * 15) % 360;
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hue}`;
        }
        
        // Vintage Procedural
        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
             const i = parseInt(vinMatch[1], 10);
             const sepia = 0.3 + (i%5)*0.1;
             return `eq=contrast=0.9:brightness=1.1,colorbalance=rs=${sepia}:gs=${sepia/2}:bs=-${sepia}`;
        }

        // Cyberpunk Procedural
        const cyberMatch = effectId.match(/^cyber-neon-(\d+)$/);
        if (cyberMatch) {
             const i = parseInt(cyberMatch[1], 10);
             return `eq=contrast=1.3:saturation=1.5,hue=h=${i*10}`;
        }

        // Standard Effects
        const effects = {
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.3:gs=0:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cyberpunk': 'eq=contrast=1.4:saturation=2,colorbalance=rs=0.2:bs=0.3',
            'dreamy-blur': 'gblur=sigma=2,eq=brightness=0.1:saturation=1.2',
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'warm': 'colorbalance=rs=0.1:bs=-0.1,eq=saturation=1.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1,eq=saturation=1.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'mono': 'hue=s=0'
        };
        
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let zoomPanFilter = '';
        let postFilters = [];
        
        const id = moveId || '';
        
        const centerX = '(iw/2)-(iw/zoom/2)';
        const centerY = '(ih/2)-(ih/zoom/2)';
        
        let z = '1.0';
        let x = centerX;
        let y = centerY;

        // =========================================================================
        // 1. SPECIFIC REQUESTED MOVEMENTS (High Priority)
        // =========================================================================
        
        if (id === 'mov-flash-pulse') {
            z = '1.0';
            postFilters.push("eq=eval=frame:brightness='0.2+0.2*sin(10*t)'");
        
        } else if (id === 'photo-flash') {
            z = '1.02';
            // Increased speed (25*t) and intensity for faster strobing effect
            postFilters.push(`eq=eval=frame:brightness='0.3+0.5*sin(25*t)'`);

        } else if (id === 'rgb-split-anim' || id === 'rgb-split') {
            z = '1.02';
            // Dynamic shift using sin wave. Use 'T' (uppercase) for time in geq filter.
            const shift = "10*sin(20*T)";
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)'`);

        } else if (id === 'mov-strobe-move') {
            z = '1.05'; 
            postFilters.push("eq=eval=frame:brightness='if(lt(mod(t,0.15),0.075),0.4,-0.2)'");
        
        } else if (id === 'mov-frame-skip') {
            z = '1.0';
            x = `${centerX} + 30*floor(sin(8*time))`;
        
        } else if (id === 'mov-vhs-tracking') {
            z = '1.05';
            // Combined effects:
            // 1. Vertical drift/tracking (y movement)
            // 2. Horizontal jitter (x movement)
            // 3. RGB split via geq (chromatic aberration)
            // 4. Noise and Saturation via noise/eq
            
            y = `${centerY} + 20*sin(0.5*time) + 5*sin(50*time)`;
            x = `${centerX} + 2*sin(100*time)`;

            // RGB Shift for VHS look (using T for geq time)
            const shift = "5*sin(15*T)";
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)'`);
            
            // Standard temporal noise
            postFilters.push("noise=alls=20:allf=t,eq=saturation=1.4:contrast=1.1");
            
        } else if (id === 'mov-jitter-y') {
            z = '1.1';
            y = `${centerY} + 20*sin(50*time)`;
            
        } else if (id === 'mov-jitter-x') {
            z = '1.1';
            x = `${centerX} + 20*sin(50*time)`;
            
        } else if (id === 'mov-rgb-shift-move') {
            z = '1.05';
            const shiftExpr = "20*sin(5*T)";
            postFilters.push(`geq=r='p(X+(${shiftExpr}),Y)':g='p(X,Y)':b='p(X-(${shiftExpr}),Y)'`);
            
        } else if (id === 'mov-shake-violent') {
            z = '1.2'; 
            x = `${centerX} + 40*sin(45*time)`;
            y = `${centerY} + 40*cos(65*time)`;
            
        } else if (id === 'mov-glitch-skid') {
            z = '1.1';
            x = `${centerX} + (iw/8)*sin(4*time)`;
        
        }
        
        // =========================================================================
        // 2. CINEMATIC PANS (Standard & Diagonal)
        // =========================================================================
        else if (id.includes('mov-pan-')) {
            z = '1.2'; 
            const dur = frames;
            
            // X bounds: 0 to (iw - iw/zoom)
            const rightX = '(iw-iw/zoom)';
            // Y bounds: 0 to (ih - ih/zoom)
            const bottomY = '(ih-ih/zoom)';
            
            // NOTE: 'on' is the current frame number
            
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*(on/${dur})`; // Right to Left
            else if (id.includes('slow-r')) x = `(${rightX})*(on/${dur})`; // Left to Right
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*(on/${dur})`; // Bottom to Top
            else if (id.includes('slow-d')) y = `(${bottomY})*(on/${dur})`; // Top to Bottom
            
            // FAST PANS (Increased speed or distance perception)
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,1.5*on/${dur}))`; // Faster easing
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,1.5*on/${dur}))`;
            
            // DIAGONAL PANS
            // TL: Bottom-Right to Top-Left
            else if (id.includes('diag-tl')) { 
                x = `${rightX}*(1-on/${dur})`; 
                y = `${bottomY}*(1-on/${dur})`; 
            }
            // TR: Bottom-Left to Top-Right
            else if (id.includes('diag-tr')) { 
                x = `${rightX}*(on/${dur})`; 
                y = `${bottomY}*(1-on/${dur})`; 
            }
            // BL: Top-Right to Bottom-Left
            else if (id.includes('diag-bl')) { 
                x = `${rightX}*(1-on/${dur})`; 
                y = `${bottomY}*(on/${dur})`; 
            }
            // BR: Top-Left to Bottom-Right
            else if (id.includes('diag-br')) { 
                x = `${rightX}*(on/${dur})`; 
                y = `${bottomY}*(on/${dur})`; 
            }
            
        // =========================================================================
        // 3. DYNAMIC ZOOMS (Crash, Twist, Pulse, Wobble, Dolly)
        // =========================================================================
        } else if (id.includes('mov-zoom-') || id === 'dolly-zoom' || id === 'mov-dolly-vertigo') {
            // Defaults
            z = `min(zoom+0.0015,1.2)`;

            if (id.includes('crash-in')) z = `min(zoom+0.15,3.0)`;
            else if (id.includes('crash-out')) z = `max(3.0-0.15*on,1.0)`;
            
            // Replaced hardcoded zooms with duration-based logic (on/frames)
            else if (id.includes('slow-in')) z = `1.0 + (0.2 * on / ${frames})`; // 1.0 -> 1.2
            else if (id.includes('fast-in')) z = `1.0 + (0.5 * on / ${frames})`; // 1.0 -> 1.5
            else if (id.includes('slow-out')) z = `1.2 - (0.2 * on / ${frames})`; // 1.2 -> 1.0
            
            else if (id.includes('bounce-in')) {
                 // Zoom in slightly then zoom back then in
                 z = `1.0 + 0.3*abs(sin(PI*on/(30*0.5))) * exp(-on/30)`; 
            }
            
            else if (id.includes('pulse-slow')) z = `1.1 + 0.05*sin(2*PI*on/(30*2))`;
            else if (id.includes('pulse-fast')) z = `1.1 + 0.05*sin(2*PI*on/(30*0.5))`;
            
            else if (id.includes('wobble')) { 
                z = `1.2`; 
                x = `${centerX} + 30*sin(2*PI*on/60)`; 
                y = `${centerY} + 30*cos(2*PI*on/90)`; 
            }
            
            else if (id.includes('shake')) { // mov-zoom-shake
                z = `1.2`;
                x = `${centerX} + 20*(random(1)-0.5)`;
                y = `${centerY} + 20*(random(1)-0.5)`;
            }

            else if (id.includes('twist-in')) {
                z = `min(zoom+0.02,1.5)`;
                postFilters.push(`rotate=a='(t*1)':c=none:ow=rotw(iw):oh=roth(ih)`); 
            }
            else if (id.includes('twist-out')) {
                z = `max(1.5-0.02*on,1.0)`;
                postFilters.push(`rotate=a='-(t*1)':c=none:ow=rotw(iw):oh=roth(ih)`);
            }
            else if (id === 'dolly-zoom' || id === 'mov-dolly-vertigo') { 
                // Simulate vertigo by pulsing zoom deeply
                z = `1.0 + 0.4*sin(PI*on/${frames})`; 
            }
            
        // =========================================================================
        // 4. 3D TRANSFORMS
        // =========================================================================
        } else if (id.includes('mov-3d-')) {
            if (id.includes('flip-x')) {
                z = '1.1'; 
                postFilters.push(`rotate=a='2*PI*t'`); 
            }
            else if (id.includes('tumble')) {
                 z = `1.0+0.5*sin(time)`;
                 postFilters.push(`rotate=a='t':c=black`);
            }
            else if (id.includes('float')) {
                 z = '1.05';
                 x = `${centerX} + 20*sin(time)`;
                 y = `${centerY} + 20*cos(time)`;
            }
            else if (id.includes('spin-axis')) {
                 z = '1.2';
                 postFilters.push(`rotate=a='2*PI*t/5':c=none`); 
            }
            else if (id.includes('swing-l')) {
                 z = '1.2';
                 x = `${centerX} - 40*sin(time)`;
            }
            else if (id.includes('swing-r')) {
                 z = '1.2';
                 x = `${centerX} + 40*sin(time)`;
            }
            else if (id.includes('perspective-u')) {
                 z = '1.2';
                 y = `${centerY} - 40*sin(time)`;
            }
            else if (id.includes('perspective-d')) {
                 z = '1.2';
                 y = `${centerY} + 40*sin(time)`;
            }

        // =========================================================================
        // 5. GENERIC FALLBACKS
        // =========================================================================
        } else if (id.includes('glitch') || id.includes('chaos')) {
             postFilters.push(`noise=alls=20:allf=t+u`);
        } else if (id.includes('elastic') || id.includes('bounce') || id.includes('jelly')) {
            z = '1.4'; 
            if (id === 'mov-bounce-drop') {
                const amp = '200';
                y = `${centerY} - ${amp}*exp(-3*time)*cos(15*time)`; 
            } 
            else if (id === 'mov-elastic-snap-l') {
                const amp = '300';
                x = `${centerX} - ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-elastic-snap-r') {
                const amp = '300';
                x = `${centerX} + ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-rubber-band') {
                z = '1.2 + 0.15*sin(10*time)';
            }
            else if (id.includes('jelly')) {
                 x = `${centerX} + 10*sin(15*time)`;
                 y = `${centerY} + 10*cos(15*time)`;
            }
            else if (id === 'mov-spring-up') {
                 const amp = '200';
                 y = `${centerY} + ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-spring-down') {
                 const amp = '200';
                 y = `${centerY} - ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-pendulum-swing') {
                 z = '1.3';
                 postFilters.push(`rotate=a='0.2*sin(3*t)*exp(-0.2*t)':c=none:ow=rotw(iw):oh=roth(ih)`);
            }
            else if (id === 'mov-pop-up') {
                 z = '1.0 + 0.5*sin(PI*min(time,0.5))'; 
            }
            else if (id === 'mov-squash-stretch') {
                 z = '1.2 + 0.1*sin(8*time)';
            }
            else if (id === 'mov-tada') {
                 z = '1.2';
                 postFilters.push(`rotate=a='0.1*sin(10*t)*min(1,t)':c=none`);
            }
            else if (id === 'mov-flash-pulse') { // Fallback if exact ID not matched above
                 postFilters.push("eq=brightness='0.2+0.2*sin(10*t)'");
            }
        } 
        
        // =========================================================================
        // 7. ANIMAÇÃO DE ENTRADA
        // =========================================================================
        else if (id.includes('slide-in') || id === 'pop-in' || id === 'fade-in' || id.includes('swing-in')) {
            if (id === 'slide-in-left') {
                 x = `(iw-ow)/2 - (iw)*(1-min(time*2,1))`;
                 y = `(ih-oh)/2`;
                 z = '1.0';
            } else if (id === 'slide-in-right') {
                 x = `(iw-ow)/2 + (iw)*(1-min(time*2,1))`;
                 y = `(ih-oh)/2`;
                 z = '1.0';
            } else if (id === 'slide-in-bottom') {
                 x = `(iw-ow)/2`;
                 y = `(ih-oh)/2 + (ih)*(1-min(time*2,1))`;
                 z = '1.0';
            } else if (id === 'pop-in') {
                 z = `if(lt(on,15), max(0.1, on/15), 1.0)`; 
            } else if (id === 'fade-in') {
                 postFilters.push(`fade=t=in:st=0:d=1`);
            } else if (id === 'swing-in') {
                 postFilters.push(`rotate=a='if(lt(t,1), -10*(1-t)*PI/180, 0)':c=none:ow=rotw(iw):oh=roth(ih)`);
            }
        
        } else if (id.includes('blur')) {
            if (id.includes('in')) postFilters.push(`boxblur=20:1:enable='between(t,0,0.5)'`);
            else if (id.includes('out')) postFilters.push(`boxblur=20:1:enable='between(t,${Math.max(0, durationSec-0.5)},${durationSec})'`);
            else if (id.includes('pulse')) postFilters.push(`boxblur=10:1:enable='lt(mod(t,1),0.3)'`);
            else if (id.includes('zoom')) {
                z = 'min(zoom+0.005,1.2)';
                postFilters.push(`boxblur=10:1`);
            }
            else postFilters.push(`boxblur=10:1`);
        
        } else if (id.includes('shake') || id.includes('handheld') || id.includes('earthquake')) {
             let intensity = 10;
             if (id.includes('handheld-1')) intensity = 5;
             if (id.includes('handheld-2')) intensity = 15;
             if (id.includes('shake-hard')) intensity = 30;
             if (id.includes('earthquake')) intensity = 50;
             
             z = '1.1'; 
             const shakeExpr = `x='(iw-ow)/2 + (random(1)-0.5)*${intensity}':y='(ih-oh)/2 + (random(1)-0.5)*${intensity}'`;
             postFilters.push(`crop=w=iw-${intensity}:h=ih-${intensity}:${shakeExpr},scale=${w}:${h}`);
        
        } else if (id === 'pulse') {
            z = '1.05+0.05*sin(2*PI*time)';
        } else if (id === 'heartbeat') {
            z = '1.0 + 0.1*abs(sin(3*PI*time))';
        }

        // =========================================================================
        // 9. KEN BURNS (Duration Adjusted)
        // =========================================================================
        else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.35;
            // Use 'on' (frame index) and 'frames' (total frames) for smooth linear zoom
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            if (config.startX !== undefined || config.endX !== undefined) {
                 const sX = config.startX || 0;
                 const eX = config.endX || 0;
                 const xOffset = `(iw/100) * (${sX} + (${eX}-${sX})*on/${frames})`;
                 x = `(iw/2)-(iw/zoom/2) + ${xOffset}`;
            }
             if (config.startY !== undefined || config.endY !== undefined) {
                 const sY = config.startY || 0;
                 const eY = config.endY || 0;
                 const yOffset = `(ih/100) * (${sY} + (${eY}-${sY})*on/${frames})`;
                 y = `(ih/2)-(ih/zoom/2) + ${yOffset}`;
            }
        
        } else if (isImage && !id) {
            z = `min(zoom+0.0015,1.5)`; 
        }

        zoomPanFilter = `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
        
        if (postFilters.length > 0) {
            return `${zoomPanFilter},${postFilters.join(',')}`;
        }
        
        return zoomPanFilter;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'blur-dissolve': 'distance', 'filter-blur': 'distance',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash': 'fadewhite',
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright', 'push-up': 'slideup', 'push-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 'diamond-in': 'diagtl', 'diamond-out': 'diagbr',
            'clock-wipe': 'radial', 'iris-in': 'circleopen', 'iris-out': 'circleclose',
            'pixelize': 'pixelize', 'glitch': 'pixelize', 'glitch-chroma': 'pixelize', 'pixel-sort': 'pixelize',
            'color-glitch': 'hblur', 'urban-glitch': 'hblur', 'rgb-split': 'distance',
            'liquid-melt': 'dissolve', 'ink-splash': 'circleopen', 'water-ripple': 'wipetl',
            'paper-rip': 'wipetl', 'page-turn': 'wipetl',
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', 'cube-rotate-u': 'slideup', 'cube-rotate-d': 'slidedown',
            'blood-mist': 'dissolve', 'black-smoke': 'fadeblack', 'white-smoke': 'fadewhite',
            'fire-burn': 'dissolve', 'visual-buzz': 'pixelize', 'rip-diag': 'wipetl', 'zoom-neg': 'zoomout',
            'infinity-1': 'zoomin', 'digital-paint': 'pixelize', 'brush-wind': 'wipeleft', 'dust-burst': 'dissolve',
            'film-roll-v': 'slideup', 'astral-project': 'dissolve', 'lens-flare': 'fadewhite',
            'mosaic-small': 'pixelize', 'mosaic-large': 'pixelize',
            'triangle-wipe': 'diagtl', 'star-zoom': 'circleopen', 'spiral-wipe': 'radial', 'grid-flip': 'pixelize',
            'dots-reveal': 'circleopen', 'shutters': 'rectcrop', 'wipe-radial': 'radial', 'checkerboard': 'rectcrop',
            'diamond-zoom': 'diagtl', 'hex-reveal': 'circleopen', 'stripes-h': 'rectcrop', 'stripes-v': 'rectcrop',
            'heart-wipe': 'circleopen',
            'zoom-blur-l': 'slideleft', 'zoom-blur-r': 'slideright', 'spin-zoom-in': 'zoomin', 'spin-zoom-out': 'zoomout',
            'whip-diagonal-1': 'diagtl', 'whip-diagonal-2': 'diagbr',
            'flash-bang': 'fadewhite', 'exposure': 'fadewhite', 'burn': 'dissolve', 'bokeh-blur': 'distance',
            'light-leak-tr': 'dissolve', 'flare-pass': 'slideleft', 'prism-split': 'distance', 'god-rays': 'dissolve',
            'elastic-left': 'slideleft', 'elastic-right': 'slideright', 'elastic-up': 'slideup', 'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin', 'jelly': 'pixelize',
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout', 'zoom-spin-fast': 'zoomin', 'spin-cw': 'rotateccw', 'spin-ccw': 'rotatecw',
            'whip-left': 'slideleft', 'whip-right': 'slideright', 'whip-up': 'slideup', 'whip-down': 'slidedown',
            'perspective-left': 'slideleft', 'perspective-right': 'slideright',
            'glitch-scan': 'hblur', 'datamosh': 'pixelize', 'noise-jump': 'pixelize', 'cyber-slice': 'rectcrop',
            'push-left': 'slideleft', 'push-right': 'slideright', 'swirl': 'radial', 'kaleidoscope': 'kaleidoscope',
            'water-drop': 'circleopen', 'wave': 'wipetl', 'stretch-h': 'squeezeh', 'stretch-v': 'squeezev',
            'morph': 'dissolve', 'turbulence': 'hblur', 'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'distance',
            'scan-line-v': 'hblur',
            
            // New CapCut Trends
            'flashback': 'fadewhite', 'combine-overlay': 'dissolve', 'combine-mix': 'dissolve',
            'nightmare': 'pixelize', 'bubble-blur': 'circleopen', 'paper-unfold': 'wipetl',
            'corrupt-img': 'pixelize', 'glow-intense': 'fadewhite', 'dynamic-blur': 'hblur',
            'flash-black': 'fadeblack', 'flash-white': 'fadewhite', 'pull-away': 'zoomout',
            'fade-classic': 'fade'
        };
        return map[id] || 'fade';
    }
};
