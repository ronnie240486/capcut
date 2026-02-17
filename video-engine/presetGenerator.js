
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
        
        // Separamos filtros de Geometria (ZoomPan) e Pós-Processamento (Cor/Distorção)
        let zoomPanFilter = '';
        let postFilters = [];
        
        const id = moveId || '';
        
        const centerX = '(iw/2)-(iw/zoom/2)';
        const centerY = '(ih/2)-(ih/zoom/2)';
        
        let z = '1.0';
        let x = centerX;
        let y = centerY;

        // =========================================================================
        // 1. CINEMATIC PANS
        // =========================================================================
        if (id.includes('mov-pan-')) {
            z = '1.2'; 
            const dur = frames;
            const rightX = '(iw-iw/zoom)';
            const bottomY = '(ih-ih/zoom)';
            
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*(on/${dur})`;
            else if (id.includes('slow-r')) x = `(${rightX})*(on/${dur})`;
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*(on/${dur})`;
            else if (id.includes('slow-d')) y = `(${bottomY})*(on/${dur})`;
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,2*on/${dur}))`;
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,2*on/${dur}))`;
            else if (id.includes('diag-tl')) { x = `${rightX}*(1-on/${dur})`; y = `${bottomY}*(1-on/${dur})`; }
            else if (id.includes('diag-tr')) { x = `(${rightX})*(on/${dur})`; y = `${bottomY}*(1-on/${dur})`; }
            else if (id.includes('diag-bl')) { x = `${rightX}*(1-on/${dur})`; y = `(${bottomY})*(on/${dur})`; }
            else if (id.includes('diag-br')) { x = `(${rightX})*(on/${dur})`; y = `(${bottomY})*(on/${dur})`; }
            
        // =========================================================================
        // 2. DYNAMIC ZOOMS
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
                postFilters.push(`rotate=a='(t*2)':c=none`); 
            }
            else if (id.includes('twist-out')) {
                z = `max(1.5-0.02*on,1.0)`;
                postFilters.push(`rotate=a='-(t*2)':c=none`);
            }
            else if (id === 'dolly-zoom' || id === 'mov-dolly-vertigo') { z = `1.0 + 0.3*sin(PI*on/${frames})`; }
            
        // =========================================================================
        // 3. 3D TRANSFORMS
        // =========================================================================
        } else if (id.includes('mov-3d-')) {
            if (id.includes('flip-x')) {
                z = '1.1'; // Slight zoom for rotation
                postFilters.push(`rotate=a='2*PI*t'`); 
            }
            else if (id.includes('tumble')) {
                 z = `1.0+0.5*sin(time)`;
                 postFilters.push(`rotate=a='t':c=black`);
            }
            else if (id.includes('float')) {
                 z = '1.05';
                 x = `(iw-ow)/2 + 20*sin(time)`;
                 y = `(ih-oh)/2 + 20*cos(time)`;
            }
            else if (id.includes('perspective')) {
                z = '1.2';
                if (id.includes('u')) y = `${centerY} - (on*2)`;
            }

        // =========================================================================
        // 4. GLITCH E CAOS (Post-process logic mostly)
        // =========================================================================
        } else if (id.includes('glitch') || id.includes('chaos') || id.includes('tear') || id.includes('vhs') || id.includes('frame-skip') || id.includes('strobe') || id.includes('jitter')) {
            if (id.includes('snap')) {
                postFilters.push(`crop=w=iw-80:h=ih-80:x='40+if(lt(mod(t,1),0.06),(random(t)*80-40),0)':y='40+if(lt(mod(t,1),0.06),(random(t)*80-40),0)',scale=${w}:${h}`);
            } else if (id.includes('digital-tear')) {
                 postFilters.push(`noise=alls=40:allf=t+u`);
            } else if (id.includes('vhs-tracking')) {
                 postFilters.push(`noise=alls=10:allf=t+u,eq=saturation=1.5`);
            } else if (id.includes('rgb-shift')) {
                 postFilters.push(`rgbashift=rh=20:bv=20`);
            } else if (id.includes('strobe-move')) {
                 postFilters.push(`eq=brightness='if(lt(mod(t,0.1),0.05),1.5,0.8)'`);
            } else {
                 postFilters.push(`noise=alls=20:allf=t+u`);
            }

        // =========================================================================
        // 5. ELASTIC & FUN (CRITICAL FIX FOR COLORS)
        // =========================================================================
        } else if (id.includes('elastic') || id.includes('bounce') || id.includes('jelly') || id.includes('flash-pulse') || id.includes('spring') || id.includes('rubber') || id.includes('pendulum') || id.includes('pop-up') || id.includes('squash') || id.includes('tada')) {
            
            z = '1.4'; // Base zoom for elasticity
            
            if (id === 'mov-bounce-drop') {
                const amp = '200';
                y = `${centerY} - ${amp}*exp(-3*time)*cos(15*time)`; 
            } 
            else if (id === 'mov-elastic-snap-l' || id === 'mov-elastic-band') {
                const amp = '300';
                x = `${centerX} - ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-elastic-snap-r' || id === 'mov-elastic-right') {
                const amp = '300';
                x = `${centerX} + ${amp}*exp(-3*time)*cos(12*time)`;
            }
            else if (id === 'mov-rubber-band') {
                z = '1.2 + 0.15*sin(10*time)';
            }
            else if (id.includes('jelly') || id === 'mov-jelly-wobble') {
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
            else if (id === 'mov-pendulum-swing' || id === 'mov-pendulun') {
                 z = '1.3';
                 // Rotate AFTER Zoompan to avoid cropping edges weirdly
                 postFilters.push(`rotate=a='0.2*sin(3*t)*exp(-0.2*t)':c=none:ow=rotw(iw):oh=roth(ih)`);
            }
            else if (id === 'mov-pop-up' || id === 'mov-popup') {
                 z = '1.0 + 0.5*sin(PI*min(time,0.5))'; 
            }
            else if (id === 'mov-squash-stretch' || id === 'mov-squash') {
                 z = '1.2 + 0.1*sin(8*time)';
            }
            else if (id === 'mov-tada' || id === 'mov-tadal') {
                 z = '1.2';
                 postFilters.push(`rotate=a='0.1*sin(10*t)*min(1,t)':c=none`);
            }
            else if (id.includes('flash-pulse')) {
                 z = '1.0';
                 // IMPORTANT: eq uses 't' and MUST come after zoompan creates the video stream
                 // 'brightness' ranges -1.0 to 1.0. 
                 // We want peaks of brightness.
                 postFilters.push(`eq=brightness='0.3*sin(10*t)'`);
            }
            else if (id.includes('rgb-split')) {
                 z = '1.1';
                 postFilters.push(`rgbashift=rh='10*sin(5*t)':bh='-10*sin(5*t)'`);
            }

        // =========================================================================
        // 6. ANIMAÇÃO DE ENTRADA
        // =========================================================================
        } else if (id.includes('slide-in') || id === 'pop-in' || id === 'fade-in' || id.includes('swing-in')) {
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

        // =========================================================================
        // 7. BLUR & SHAKE & LOOP
        // =========================================================================
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
             
             // Shake logic in FFmpeg is complex inside zoompan due to 'random'.
             // We'll use a crop-based shake AFTER scaling to targetRes in the main pipeline.
             // But here we return a filter string.
             // Standard way: zoom in slightly, then crop randomly.
             z = '1.1'; // Zoom needed for shake room
             // Using crop filter for shake as post-process is easier than zoompan x/y random
             const shakeExpr = `x='(iw-ow)/2 + (random(1)-0.5)*${intensity}':y='(ih-oh)/2 + (random(1)-0.5)*${intensity}'`;
             postFilters.push(`crop=w=iw-${intensity}:h=ih-${intensity}:${shakeExpr},scale=${w}:${h}`);
        
        } else if (id === 'pulse') {
            z = '1.05+0.05*sin(2*PI*time)';
        } else if (id === 'heartbeat') {
            z = '1.0 + 0.1*abs(sin(3*PI*time))';
        }

        // =========================================================================
        // 8. KEN BURNS
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
        
        } else if (isImage && !id) {
            z = `min(zoom+0.0015,1.5)`; // Default slow zoom
        }
        
        // Photo Effects
        if (id === 'photo-flash') {
            postFilters.push(`eq=brightness='1+0.5*sin(2*PI*t*5)':enable='lt(t,1)'`);
        }

        // 1. Construct ZoomPan (Always First)
        zoomPanFilter = `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
        
        // 2. Combine with Post Filters (comma separated)
        // Zoompan outputs a video stream, subsequent filters apply to that stream using 't'.
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
            'push-left': 'slideleft', 'push-right': 'slideright', 'swirl': 'radial', 'kaleidoscope': 'circleopen',
            'water-drop': 'circleopen', 'wave': 'wipetl', 'stretch-h': 'slideleft', 'stretch-v': 'slideup',
            'morph': 'dissolve', 'turbulence': 'dissolve', 'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'distance'
        };
        return map[id] || 'fade';
    }
};
