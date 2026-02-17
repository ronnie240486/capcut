
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
        
        let filters = [];
        const id = moveId || '';
        
        // Default Zoompan parameters
        // IMPORTANT: z must be >= 1. x and y use 'on' (frame number) or 'time'.
        // To center correctly: x = 'iw/2-(iw/zoom)/2', y = 'ih/2-(ih/zoom)/2'
        
        const centerX = '(iw/2)-(iw/zoom/2)';
        const centerY = '(ih/2)-(ih/zoom/2)';
        
        let z = '1.0';
        let x = centerX;
        let y = centerY;

        // =========================================================================
        // 1. CINEMATIC PANS (Movimentos de Câmera Suaves)
        // =========================================================================
        if (id.includes('mov-pan-')) {
            z = '1.2'; // Must zoom in slightly to pan without black bars
            const dur = frames;
            // Panning logic: interpolate between start and end positions
            // Max offset is roughly iw/z * (z-1) ? No.
            // Visible width is iw/z. Total width iw. Max pan = iw - iw/z.
            // Center is at iw/2 - iw/2z.
            // Left edge x=0. Right edge x=iw - iw/z.
            
            const leftX = '0';
            const rightX = '(iw-iw/zoom)';
            const topY = '0';
            const bottomY = '(ih-ih/zoom)';
            
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*(on/${dur})`; // Right to Left
            else if (id.includes('slow-r')) x = `(${rightX})*(on/${dur})`; // Left to Right
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*(on/${dur})`;
            else if (id.includes('slow-d')) y = `(${bottomY})*(on/${dur})`;
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,2*on/${dur}))`;
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,2*on/${dur}))`;
            else if (id.includes('diag-tl')) { x = `${rightX}*(1-on/${dur})`; y = `${bottomY}*(1-on/${dur})`; }
            else if (id.includes('diag-tr')) { x = `(${rightX})*(on/${dur})`; y = `${bottomY}*(1-on/${dur})`; }
            else if (id.includes('diag-bl')) { x = `${rightX}*(1-on/${dur})`; y = `(${bottomY})*(on/${dur})`; }
            else if (id.includes('diag-br')) { x = `(${rightX})*(on/${dur})`; y = `(${bottomY})*(on/${dur})`; }
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        // =========================================================================
        // 2. DYNAMIC ZOOMS (Zooms Complexos e Rápidos)
        // =========================================================================
        } else if (id.includes('mov-zoom-') || id === 'dolly-zoom') {
            if (id.includes('crash-in')) z = `min(zoom+0.1,2.5)`;
            else if (id.includes('crash-out')) z = `max(2.5-0.1*on,1.0)`;
            else if (id.includes('slow-in')) z = `min(zoom+0.0015,1.2)`;
            else if (id.includes('fast-in')) z = `min(zoom+0.005,1.5)`;
            else if (id.includes('slow-out')) z = `max(1.2-0.0015*on,1.0)`;
            else if (id.includes('bounce-in')) z = `1.0+0.3*abs(sin(PI*on/30))`;
            else if (id.includes('pulse-slow')) z = `1.1+0.1*sin(2*PI*on/${fps})`;
            else if (id.includes('pulse-fast')) z = `1.1+0.1*sin(4*PI*on/${fps})`;
            else if (id.includes('wobble')) { 
                z = `1.2`; 
                x = `${centerX} + 40*sin(4*PI*on/${fps})`; 
                y = `${centerY} + 40*cos(4*PI*on/${fps})`; 
            }
            else if (id.includes('twist-in')) {
                z = `min(zoom+0.02,1.5)`;
                filters.push(`rotate=a='(t*2)':c=none`); 
            }
            else if (id.includes('twist-out')) {
                z = `max(1.5-0.02*on,1.0)`;
                filters.push(`rotate=a='-(t*2)':c=none`);
            }
            else if (id === 'dolly-zoom' || id === 'mov-dolly-vertigo') { z = `1.0 + 0.3*sin(PI*on/${frames})`; }
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        // =========================================================================
        // 3. 3D TRANSFORMS (Simulados)
        // =========================================================================
        } else if (id.includes('mov-3d-')) {
            // Need to zoom out slightly before rotate to avoid black corners, or zoom in.
            // Using a base zoompan of 1.2
            if (id.includes('flip-x')) {
                filters.push(`zoompan=z=1.1:d=${frames}:s=${w}x${h}:fps=${fps}`);
                filters.push(`rotate=a='2*PI*t'`); // Simple rotation, proper 3D flip requires 'perspective' filter which is complex
            }
            else if (id.includes('tumble')) {
                 filters.push(`rotate=a='t':c=black`);
                 filters.push(`zoompan=z='1.0+0.5*sin(t)':d=${frames}:s=${w}x${h}:fps=${fps}`);
            }
            else if (id.includes('perspective')) {
                // Pseudo perspective via zoompan y slide + zoom
                if (id.includes('u')) y = `${centerY} - (on*2)`;
                filters.push(`zoompan=z='1.2':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);
            }

        // =========================================================================
        // 4. GLITCH E CAOS
        // =========================================================================
        } else if (id.includes('glitch') || id.includes('chaos') || id.includes('tear') || id.includes('vhs') || id.includes('frame-skip') || id.includes('strobe') || id.includes('jitter')) {
            if (id.includes('snap')) {
                filters.push(`crop=w=iw-80:h=ih-80:x='40+if(lt(mod(t,1),0.06),(random(t)*80-40),0)':y='40+if(lt(mod(t,1),0.06),(random(t)*80-40),0)',scale=${w}:${h}`);
            } else if (id.includes('digital-tear')) {
                 filters.push(`noise=alls=40:allf=t+u`);
            } else if (id.includes('vhs-tracking')) {
                 filters.push(`noise=alls=10:allf=t+u,eq=saturation=1.5`);
            } else if (id.includes('rgb-shift')) {
                 filters.push(`rgbashift=rh=20:bv=20`);
            } else if (id.includes('strobe-move')) {
                 filters.push(`eq=brightness='if(lt(mod(t,0.1),0.05),1.5,0.8)'`);
            } else {
                 filters.push(`noise=alls=20:allf=t+u`);
            }

        // =========================================================================
        // 5. ELASTIC & FUN (FIXED MATH)
        // =========================================================================
        } else if (id.includes('elastic') || id.includes('bounce') || id.includes('jelly') || id.includes('flash-pulse') || id.includes('spring') || id.includes('rubber') || id.includes('pendulum') || id.includes('pop-up') || id.includes('squash') || id.includes('tada')) {
            
            // Standardizing base zoom for movement room
            z = '1.4'; 
            
            if (id === 'mov-bounce-drop') {
                // Drop from top to center with bounce
                // y starts high (offset negative in render, but here y coord is positive down)
                // We want image to start 'above' and drop in. 
                // In zoompan, y=0 is top. Center is y=ih/2-ih/2z.
                // We oscillate y around center.
                const amp = '200';
                y = `${centerY} - ${amp}*exp(-3*time)*cos(15*time)`; 
            } 
            else if (id === 'mov-elastic-snap-l' || id === 'mov-elastic-band') {
                // Snap from left
                const amp = '300';
                x = `${centerX} - ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-elastic-snap-r' || id === 'mov-elastic-right') {
                // Snap from right
                const amp = '300';
                x = `${centerX} + ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-rubber-band') {
                // Pulsing zoom
                z = '1.2 + 0.15*sin(10*time)';
            }
            else if (id.includes('jelly') || id === 'mov-jelly-wobble') {
                 // Fast wobbling x/y
                 x = `${centerX} + 10*sin(15*time)`;
                 y = `${centerY} + 10*cos(15*time)`;
            }
            else if (id === 'mov-spring-up') {
                 // Spring upwards
                 const amp = '200';
                 y = `${centerY} + ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-spring-down') {
                 // Spring downwards (same as bounce drop really, but maybe inverted phase)
                 const amp = '200';
                 y = `${centerY} - ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-pendulum-swing' || id === 'mov-pendulun') {
                 filters.push(`rotate=a='0.2*sin(3*time)*exp(-0.2*time)':c=none:ow=rotw(iw):oh=roth(ih)`);
                 z = '1.3'; // Zoom in to cover rotation edges
            }
            else if (id === 'mov-pop-up' || id === 'mov-popup') {
                 // Fast Zoom In from 0? Zoompan can't do z=0.
                 // We simulate pop up by z going from very high (zoomed in? no that's close)
                 // Pop up: Object scales 0 -> 1.
                 // Camera equivalent: Zoom out? 
                 // Let's just do a quick elastic zoom in.
                 z = 'min(1.0 + 2.0*exp(-5*time), 3.0)'; // Starts at 3.0, decays to 1.0? 
                 // Wait, scale 0->1 means z infinity -> 1.
                 // Let's try z starts at 0.1 (zoomed out far? no z>=1).
                 // We can't do true pop up (scale 0) with zoompan on full video. 
                 // We'll do a "Punch" zoom.
                 z = '1.0 + 0.5*sin(PI*min(time,0.5))'; 
            }
            else if (id === 'mov-squash-stretch' || id === 'mov-squash') {
                 // Emulated via zoom oscillation
                 z = '1.2 + 0.1*sin(8*time)';
                 // And some scaling if possible, but zoompan is safer.
            }
            else if (id === 'mov-tada' || id === 'mov-tadal') {
                 filters.push(`rotate=a='0.1*sin(10*time)*min(1,time)':c=none`);
                 z = '1.2';
            }
            else if (id.includes('flash-pulse')) {
                 filters.push(`eq=brightness='1+0.5*sin(10*time)'`);
                 z = '1.0'; // No movement
            }

            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        // =========================================================================
        // 6. ANIMAÇÃO DE ENTRADA
        // =========================================================================
        } else if (id.includes('slide-in') || id === 'pop-in' || id === 'fade-in' || id.includes('swing-in')) {
            if (id === 'slide-in-left') {
                 filters.push(`zoompan=z=1:x='(iw-ow)/2 - (iw)*(1-min(time*2,1))':y='(ih-oh)/2':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'slide-in-right') {
                 filters.push(`zoompan=z=1:x='(iw-ow)/2 + (iw)*(1-min(time*2,1))':y='(ih-oh)/2':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'slide-in-bottom') {
                 filters.push(`zoompan=z=1:x='(iw-ow)/2':y='(ih-oh)/2 + (ih)*(1-min(time*2,1))':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'pop-in') {
                 z = `if(lt(on,15), max(0.1, on/15), 1.0)`; 
                 filters.push(`zoompan=z='${z}':x='(iw/2)-(iw/zoom/2)':y='(ih/2)-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'fade-in') {
                 filters.push(`fade=t=in:st=0:d=1`);
            } else if (id === 'swing-in') {
                 filters.push(`rotate=a='if(lt(t,1), -10*(1-t)*PI/180, 0)':c=none:ow=rotw(iw):oh=roth(ih)`);
            }

        // =========================================================================
        // 7. BLUR & SHAKE & LOOP (Outros)
        // =========================================================================
        } else if (id.includes('blur')) {
            if (id.includes('in')) filters.push(`boxblur=20:1:enable='between(t,0,0.5)'`);
            else if (id.includes('out')) filters.push(`boxblur=20:1:enable='between(t,${Math.max(0, durationSec-0.5)},${durationSec})'`);
            else if (id.includes('pulse')) filters.push(`boxblur=10:1:enable='lt(mod(t,1),0.3)'`);
            else if (id.includes('zoom')) filters.push(`zoompan=z='min(zoom+0.005,1.2)':d=${frames}:s=${w}x${h}:fps=${fps},boxblur=10:1`);
            else filters.push(`boxblur=10:1`);
        
        } else if (id.includes('shake') || id.includes('handheld') || id.includes('earthquake')) {
             let intensity = 10;
             if (id.includes('handheld-1')) intensity = 5;
             if (id.includes('handheld-2')) intensity = 15;
             if (id.includes('shake-hard')) intensity = 30;
             if (id.includes('earthquake')) intensity = 50;
             const shakeX = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
             const shakeY = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
             filters.push(`scale=${Math.floor(w*1.1)}:-2,crop=${w}:${h}:${shakeX}:${shakeY}`);
        
        } else if (id === 'pulse') {
            filters.push(`zoompan=z='1.05+0.05*sin(2*PI*time)':d=${frames}:s=${w}x${h}:fps=${fps}`);
        } else if (id === 'float') {
            filters.push(`scale=${Math.floor(w*1.05)}:-2,crop=${w}:${h}:(iw-ow)/2:'(ih-oh)/2 + 20*sin(2*PI*time)'`);
        } else if (id === 'heartbeat') {
            filters.push(`zoompan=z='1.0 + 0.1*abs(sin(3*PI*time))':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }

        // =========================================================================
        // 8. KEN BURNS (Default or Custom)
        // =========================================================================
        else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            if (config.startX !== undefined || config.endX !== undefined) {
                 const sX = config.startX || 0;
                 const eX = config.endX || 0;
                 const xOffset = `(iw/100) * (${sX} + (${eX}-${sX})*on/${frames})`;
                 x = `(iw/2)-(iw/zoom/2) + ${xOffset}`;
            }
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);
        
        } else if (isImage && !id) {
            // Default gentle zoom
            z = `min(zoom+0.0015,1.5)`;
            filters.push(`zoompan=z='${z}':x='(iw/2)-(iw/zoom/2)':y='(ih/2)-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }
        
        // Photo Effects
        if (id === 'photo-flash') {
            filters.push(`eq=brightness='1+0.5*sin(2*PI*t*5)':enable='lt(t,1)'`);
        }

        return filters.length > 0 ? filters.join(',') : null;
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
            'push-left': 'slideleft', 'push-right': 'slideright', 'swirl': 'radial', 'kaleidoscope': 'circleopen',
            'water-drop': 'circleopen', 'wave': 'wipetl', 'stretch-h': 'slideleft', 'stretch-v': 'slideup',
            'morph': 'dissolve', 'turbulence': 'dissolve', 'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'distance'
        };
        return map[id] || 'fade';
    }
};
