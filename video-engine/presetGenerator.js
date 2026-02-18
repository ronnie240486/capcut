
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

        // 1. Color Grading Procedural (cg-pro-X)
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hueVal = (i * 15) % 360;
            // FIX: Chain 'eq' and 'hue' filters separately. eq does not have hue.
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hueVal}`;
        }
        
        // 2. Vintage Procedural (vintage-style-X)
        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
             const i = parseInt(vinMatch[1], 10);
             const sepia = 0.3 + (i%5)*0.1;
             // Vintage: Colorbalance for sepia tone + eq for faded look
             return `eq=contrast=0.9:brightness=0.05,colorbalance=rs=${sepia.toFixed(2)}:gs=${(sepia/2).toFixed(2)}:bs=-${sepia.toFixed(2)}`;
        }

        // 3. Cyberpunk Procedural (cyber-neon-X)
        const cyberMatch = effectId.match(/^cyber-neon-(\d+)$/);
        if (cyberMatch) {
             const i = parseInt(cyberMatch[1], 10);
             const hueShift = (i * 10) % 360;
             return `eq=contrast=1.3:saturation=1.5,hue=h=${hueShift},colorbalance=bs=0.3:rs=0.2`;
        }

        // 4. Nature & Fresh (nature-fresh-X)
        const natureMatch = effectId.match(/^nature-fresh-(\d+)$/);
        if (natureMatch) {
             const i = parseInt(natureMatch[1], 10);
             const hueShift = -(i * 2);
             return `eq=saturation=1.4:brightness=0.05,hue=h=${hueShift},colorbalance=gs=0.1:bs=0.05`;
        }

        // 5. Duotone & Art (art-duo-X)
        const duoMatch = effectId.match(/^art-duo-(\d+)$/);
        if (duoMatch) {
             const i = parseInt(duoMatch[1], 10);
             const hueShift = (i * 12) % 360;
             // Simulate duotone via extreme saturation + hue shift + tinting
             return `hue=s=0,eq=contrast=1.5,colorbalance=rs=0.5:bs=-0.5,hue=h=${hueShift}`;
        }

        // 6. Noir & Mono (noir-style-X)
        const noirMatch = effectId.match(/^noir-style-(\d+)$/);
        if (noirMatch) {
             const i = parseInt(noirMatch[1], 10);
             const contrast = 1 + i * 0.05;
             const bright = -0.02 * i;
             return `hue=s=0,eq=contrast=${contrast.toFixed(2)}:brightness=${bright.toFixed(2)}`;
        }

        // 7. Film Stock (film-stock-X)
        const filmMatch = effectId.match(/^film-stock-(\d+)$/);
        if (filmMatch) {
             const i = parseInt(filmMatch[1], 10);
             return `eq=contrast=1.1:saturation=0.8,colorbalance=rs=0.1:bs=0.1,noise=alls=10:allf=t`;
        }

        // 8. Light Leaks (Simulation via Filters)
        const leakMatch = effectId.match(/^leak-overlay-(\d+)$/);
        if (leakMatch) {
             const i = parseInt(leakMatch[1], 10);
             // Simulates a color wash that pulses slightly
             return `eq=brightness=0.1,colorbalance=rs=${(i%3===0?0.3:0)}:gs=${(i%3===1?0.2:0)}:bs=${(i%3===2?0.3:0)}`;
        }
        
        // 9. Glitch Static Procedural
        const glitchMatch = effectId.match(/^glitch-static-/);
        if (glitchMatch) {
             // Basic RGB split static
             return "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'";
        }

        // Standard Effects (Legacy & Named)
        const effects = {
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'matrix': 'colorbalance=gs=0.5:rs=-0.2:bs=-0.2,eq=contrast=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.3:gs=0:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cyberpunk': 'eq=contrast=1.4:saturation=2,colorbalance=rs=0.2:bs=0.3',
            'dreamy-blur': 'gblur=sigma=2,eq=brightness=0.1:saturation=1.2',
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'warm': 'colorbalance=rs=0.1:bs=-0.1,eq=saturation=1.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1,eq=saturation=1.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'mono': 'hue=s=0',
            'sepia-max': 'hue=s=0,colorbalance=rs=0.3:bs=-0.3',
            'night-vision': 'hue=s=0,colorbalance=gs=0.5,eq=contrast=1.2',
            'scifi': 'colorbalance=bs=0.4:rs=-0.2,eq=contrast=1.2'
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
            // FIX: Made smoother and slower (3*T instead of 20*T)
            const shift = "20*sin(3*T)";
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)'`);

        } else if (id === 'mov-strobe-move') {
            z = '1.05'; 
            postFilters.push("eq=eval=frame:brightness='if(lt(mod(t,0.15),0.075),0.4,-0.2)'");
        
        } else if (id === 'mov-frame-skip') {
            z = '1.0';
            x = `${centerX} + 30*floor(sin(8*time))`;
        
        } else if (id === 'mov-vhs-tracking') {
            z = '1.05';
            y = `${centerY} + 20*sin(0.5*time) + 5*sin(50*time)`;
            x = `${centerX} + 2*sin(100*time)`;
            const shift = "5*sin(15*T)";
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)'`);
            postFilters.push("noise=alls=20:allf=t,eq=saturation=1.4:contrast=1.1");
            
        } else if (id === 'mov-jitter-y') {
            z = '1.1';
            y = `${centerY} + 20*sin(50*time)`;
            
        } else if (id === 'mov-jitter-x') {
            z = '1.1';
            x = `${centerX} + 20*sin(50*time)`;
            
        } else if (id === 'mov-rgb-shift-move') {
            z = '1.05';
            // Slower rgb shift move
            const shiftExpr = "20*sin(4*T)";
            postFilters.push(`geq=r='p(X+(${shiftExpr}),Y)':g='p(X,Y)':b='p(X-(${shiftExpr}),Y)'`);
            
        } else if (id === 'mov-shake-violent') {
            z = '1.2'; 
            x = `${centerX} + 40*sin(45*time)`;
            y = `${centerY} + 40*cos(65*time)`;
            
        } else if (id === 'mov-glitch-skid') {
            z = '1.1';
            x = `${centerX} + (iw/30)*sin(10*time)`;

        } else if (id === 'mov-glitch-snap') {
            z = '1.05';
            x = `${centerX} + 25*sin(45*time)`;
            y = `${centerY} + 15*cos(45*time)`;
        }
        
        // =========================================================================
        // 2. CINEMATIC PANS (Standard & Diagonal)
        // =========================================================================
        else if (id.includes('mov-pan-')) {
            z = '1.2'; 
            const dur = frames;
            
            const rightX = '(iw-iw/zoom)';
            const bottomY = '(ih-ih/zoom)';
            
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*(on/${dur})`; // Right to Left
            else if (id.includes('slow-r')) x = `(${rightX})*(on/${dur})`; // Left to Right
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*(on/${dur})`; // Bottom to Top
            else if (id.includes('slow-d')) y = `(${bottomY})*(on/${dur})`; // Top to Bottom
            
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,1.5*on/${dur}))`; 
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,1.5*on/${dur}))`;
            
            else if (id.includes('diag-tl')) { 
                x = `${rightX}*(1-on/${dur})`; 
                y = `${bottomY}*(1-on/${dur})`; 
            }
            else if (id.includes('diag-tr')) { 
                x = `${rightX}*(on/${dur})`; 
                y = `${bottomY}*(1-on/${dur})`; 
            }
            else if (id.includes('diag-bl')) { 
                x = `${rightX}*(1-on/${dur})`; 
                y = `${bottomY}*(on/${dur})`; 
            }
            else if (id.includes('diag-br')) { 
                x = `${rightX}*(on/${dur})`; 
                y = `${bottomY}*(on/${dur})`; 
            }
            
        // =========================================================================
        // 3. DYNAMIC ZOOMS
        // =========================================================================
        } else if (id.includes('mov-zoom-') || id === 'dolly-zoom' || id === 'mov-dolly-vertigo') {
            z = `min(zoom+0.0015,1.2)`;

            if (id.includes('crash-in')) z = `min(zoom+0.15,3.0)`;
            else if (id.includes('crash-out')) z = `max(3.0-0.15*on,1.0)`;
            
            else if (id.includes('slow-in')) z = `1.0 + (0.2 * on / ${frames})`; 
            else if (id.includes('fast-in')) z = `1.0 + (0.5 * on / ${frames})`;
            else if (id.includes('slow-out')) z = `1.2 - (0.2 * on / ${frames})`;
            
            else if (id.includes('bounce-in')) {
                 z = `1.0 + 0.3*abs(sin(PI*on/(30*0.5))) * exp(-on/30)`; 
            }
            
            else if (id.includes('pulse-slow')) z = `1.1 + 0.05*sin(2*PI*on/(30*2))`;
            else if (id.includes('pulse-fast')) z = `1.1 + 0.05*sin(2*PI*on/(30*0.5))`;
            
            else if (id.includes('wobble')) { 
                z = `1.2`; 
                x = `${centerX} + 30*sin(2*PI*on/60)`; 
                y = `${centerY} + 30*cos(2*PI*on/90)`; 
            }
            
            else if (id.includes('shake')) { 
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
                z = `1.0 + 0.4*sin(PI*on/${frames})`; 
            }
            
        // =========================================================================
        // 4. 3D TRANSFORMS
        // =========================================================================
        } else if (id.includes('mov-3d-')) {
            // Using rotate filters which are simpler in ffmpeg than full 3D perspective
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
            // Perspective hacks using basic zoom/pan as true 3D filters (v360) are complex
            else if (id.includes('perspective')) {
                 z = '1.2';
                 y = `${centerY} + 40*sin(time)`; // Simulate tilt by sliding
            }

        // =========================================================================
        // 5. GENERIC FALLBACKS & ELASTIC
        // =========================================================================
        } else if (id.includes('glitch') || id.includes('chaos')) {
             postFilters.push(`noise=alls=20:allf=t+u`);
        } else if (id.includes('elastic') || id.includes('bounce') || id.includes('jelly')) {
            z = '1.4'; 
            if (id === 'mov-bounce-drop') {
                const amp = '200';
                y = `${centerY} - ${amp}*exp(-3*time)*cos(15*time)`; 
            } 
            else if (id === 'mov-rubber-band') {
                z = '1.2 + 0.15*sin(10*time)';
            }
            else if (id.includes('jelly')) {
                 x = `${centerX} + 10*sin(15*time)`;
                 y = `${centerY} + 10*cos(15*time)`;
            }
            else if (id === 'mov-pop-up') {
                 z = '1.0 + 0.5*sin(PI*min(time,0.5))'; 
            }
            else if (id === 'mov-tada') {
                 z = '1.2';
                 postFilters.push(`rotate=a='0.1*sin(10*t)*min(1,t)':c=none`);
            }
        } 
        
        // =========================================================================
        // 7. ENTRY/EXIT
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
            } else if (id === 'pop-in') {
                 z = `if(lt(on,15), max(0.1, on/15), 1.0)`; 
            } else if (id === 'fade-in') {
                 postFilters.push(`fade=t=in:st=0:d=1`);
            }
        
        } else if (id.includes('blur')) {
            if (id.includes('in')) postFilters.push(`boxblur=20:1:enable='between(t,0,0.5)'`);
            else if (id.includes('out')) postFilters.push(`boxblur=20:1:enable='between(t,${Math.max(0, durationSec-0.5)},${durationSec})'`);
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
            // Basics
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash': 'fadewhite',
            
            // Wipes/Slides
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            
            // Geometric
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 
            'diamond-in': 'diagtl', 'diamond-out': 'diagbr',
            'clock-wipe': 'radial', 'iris-in': 'circleopen', 'iris-out': 'circleclose',
            'rect-crop': 'rectcrop', 'checkerboard': 'rectcrop',
            'swirl': 'circleopen', 'kaleidoscope': 'hlslice', 'hex-reveal': 'circleopen',
            
            // Glitch/Pixel
            'pixelize': 'pixelize', 'glitch': 'pixelize', 
            'rgb-split': 'distance', 'hologram': 'dissolve', 'scan-line': 'wipetl',
            
            // Liquids
            'liquid-melt': 'dissolve', 'ink-splash': 'circleopen', 'water-ripple': 'slideleft',
            
            // Others
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout',
            'spin-cw': 'rotateccw', 'spin-ccw': 'rotatecw',
            'whip-left': 'slideleft', 'whip-right': 'slideright'
        };
        return map[id] || 'fade';
    }
};
