
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

        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hue = (i * 15) % 360;
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hue}`;
        }
        
        const effects = {
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.3:gs=0:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cyberpunk': 'eq=contrast=1.4:saturation=2,colorbalance=rs=0.2:bs=0.3',
            'dreamy-blur': 'gblur=sigma=5,eq=brightness=0.1:saturation=1.2',
            'pop-art': 'eq=saturation=3:contrast=1.5'
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
        
        // =========================================================================
        // 1. CINEMATIC PANS (Movimentos de Câmera Suaves)
        // =========================================================================
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        
        if (id.includes('pan-')) {
            z = '1.2'; // Zoom necessário para permitir o pan
            
            // Slow Pans
            if (id.includes('slow-l')) x = `(iw-ow)*(on/${frames})`;
            else if (id.includes('slow-r')) x = `(iw-ow)*(1-on/${frames})`;
            else if (id.includes('slow-u')) y = `(ih-oh)*(on/${frames})`;
            else if (id.includes('slow-d')) y = `(ih-oh)*(1-on/${frames})`;
            
            // Fast Pans
            else if (id.includes('fast-l')) x = `(iw-ow)*((on*2)/${frames})`;
            else if (id.includes('fast-r')) x = `(iw-ow)*(1-(on*2)/${frames})`;
            
            // Diagonals
            else if (id.includes('diag-tl')) { x = `(iw-ow)*(on/${frames})`; y = `(ih-oh)*(on/${frames})`; }
            else if (id.includes('diag-tr')) { x = `(iw-ow)*(1-on/${frames})`; y = `(ih-oh)*(on/${frames})`; }
            else if (id.includes('diag-bl')) { x = `(iw-ow)*(on/${frames})`; y = `(ih-oh)*(1-on/${frames})`; }
            else if (id.includes('diag-br')) { x = `(iw-ow)*(1-on/${frames})`; y = `(ih-oh)*(1-on/${frames})`; }
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        // =========================================================================
        // 2. DYNAMIC ZOOMS (Zooms Complexos e Rápidos)
        // =========================================================================
        } else if (id.includes('zoom-') || id === 'dolly-zoom') {
            // Crash Zooms
            if (id.includes('crash-in')) { z = `min(zoom+0.1,2.5)`; }
            else if (id.includes('crash-out')) { z = `max(2.5-0.1*on,1.0)`; }
            
            // Standard Speed
            else if (id.includes('slow-in')) { z = `min(zoom+0.0015,1.2)`; }
            else if (id.includes('fast-in')) { z = `min(zoom+0.005,1.5)`; }
            else if (id.includes('slow-out')) { z = `max(1.2-0.0015*on,1.0)`; }
            
            // Effects
            else if (id.includes('bounce-in')) { z = `1.0+0.3*abs(sin(PI*on/30))`; } // Bounce
            else if (id.includes('pulse-slow')) { z = `1.1+0.1*sin(2*PI*on/${fps})`; }
            else if (id.includes('pulse-fast')) { z = `1.1+0.1*sin(4*PI*on/${fps})`; }
            else if (id.includes('wobble')) { 
                z = `1.1`; 
                x = `(iw-ow)/2 + 20*sin(4*PI*on/${fps})`; 
                y = `(ih-oh)/2 + 20*cos(4*PI*on/${fps})`; 
            }
            else if (id.includes('twist-in')) {
                // Zoom + Rotate (Rotate must be a separate filter in chain)
                z = `min(zoom+0.02,1.5)`;
                filters.push(`rotate=a='(t*2)':c=none`); 
            }
            else if (id.includes('twist-out')) {
                z = `max(1.5-0.02*on,1.0)`;
                filters.push(`rotate=a='-(t*2)':c=none`);
            }
            else if (id === 'dolly-zoom') { z = `1.0 + 0.3*sin(PI*on/${frames})`; }
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        // =========================================================================
        // 3. ANIMAÇÃO DE ENTRADA (Slide Ins & Pops)
        // =========================================================================
        } else if (id.includes('slide-in') || id === 'pop-in' || id === 'fade-in' || id.includes('swing-in')) {
            // Slides use zoompan trick: start with x/y offset, move to center
            if (id === 'slide-in-left') {
                 // Move from Left (offset negative Width) to Center
                 filters.push(`zoompan=z=1:x='(iw-ow)/2 - (iw)*(1-min(time*2,1))':y='(ih-oh)/2':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'slide-in-right') {
                 filters.push(`zoompan=z=1:x='(iw-ow)/2 + (iw)*(1-min(time*2,1))':y='(ih-oh)/2':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'slide-in-bottom') {
                 filters.push(`zoompan=z=1:x='(iw-ow)/2':y='(ih-oh)/2 + (ih)*(1-min(time*2,1))':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'pop-in') {
                 // Scale from 0 to 1 rapidly
                 z = `if(lt(on,15), max(0.1, on/15), 1.0)`; 
                 filters.push(`zoompan=z='${z}':x='(iw/2)-(iw/zoom/2)':y='(ih/2)-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id === 'fade-in') {
                 filters.push(`fade=t=in:st=0:d=1`);
            } else if (id === 'swing-in') {
                 // Rotate slightly from -10deg to 0
                 filters.push(`rotate=a='if(lt(t,1), -10*(1-t)*PI/180, 0)':c=none:ow=rotw(iw):oh=roth(ih)`);
            }

        // =========================================================================
        // 4. GLITCH E CAOS (Distorções)
        // =========================================================================
        } else if (id.includes('glitch') || id.includes('chaos') || id.includes('tear') || id.includes('vhs') || id.includes('frame-skip') || id.includes('strobe')) {
            if (id.includes('snap')) {
                // Random position jumps
                const shake = `if(lt(mod(time,1.0),0.06), (random(time)*80-40), 0)`;
                filters.push(`crop=w=iw-80:h=ih-80:x=40+${shake}:y=40+${shake},scale=${w}:${h}`);
            } else if (id.includes('skid')) {
                // Horizontal Slide Glitch
                const skid = `if(lt(mod(time,2.0),0.1), (random(time)*200-100), 0)`;
                filters.push(`crop=w=iw-200:h=ih:x=100+${skid}:y=0,scale=${w}:${h}`);
            } else if (id.includes('digital-tear')) {
                 filters.push(`noise=alls=40:allf=t+u`);
            } else if (id.includes('vhs-tracking')) {
                 // Simulate VHS noise lines
                 filters.push(`noise=alls=10:allf=t+u,eq=saturation=1.5`);
            } else if (id.includes('rgb-shift')) {
                 filters.push(`rgbashift=rh=20:bv=20`);
            } else if (id.includes('strobe-move')) {
                 filters.push(`eq=brightness='if(lt(mod(t,0.1),0.05),1.5,0.8)'`);
            } else if (id.includes('frame-skip')) {
                 filters.push(`fps=fps=5`); // Low FPS look
            } else {
                 // Generic chaos
                 filters.push(`noise=alls=20:allf=t+u,drawgrid=y=0:h=64:t=2:c=white@0.3:enable='lt(mod(t,1),0.1)'`);
            }

        // =========================================================================
        // 5. 3D TRANSFORMS (Simulados)
        // =========================================================================
        } else if (id.includes('mov-3d-')) {
            if (id.includes('flip-x')) filters.push(`hflip`); // Simple Flip
            if (id.includes('flip-y')) filters.push(`vflip`);
            if (id.includes('roll')) filters.push(`rotate=a='2*PI*t':c=black`); // Barrel Roll
            if (id.includes('spin-axis')) filters.push(`rotate=a='4*PI*t':c=black`); // Fast Spin
            if (id.includes('tumble')) {
                 // Rotate + Zoom
                 filters.push(`rotate=a='t':c=black`);
                 filters.push(`zoompan=z='1.0+0.5*sin(t)':d=${frames}:s=${w}x${h}:fps=${fps}`);
            }
            if (id.includes('swing')) {
                 // Pendulum rotation
                 filters.push(`rotate=a='0.2*sin(2*PI*t)':c=none`);
            }
            if (id.includes('float')) {
                 filters.push(`zoompan=z='1.05':x='(iw-ow)/2 + 20*sin(t)':y='(ih-oh)/2 + 20*cos(t)':d=${frames}:s=${w}x${h}:fps=${fps}`);
            }

        // =========================================================================
        // 6. ELASTIC & FUN (Bounce/Jelly)
        // =========================================================================
        } else if (id.includes('elastic') || id.includes('bounce') || id.includes('jelly') || id.includes('flash-pulse')) {
            if (id === 'mov-bounce-drop') {
                // Simulate drop with y offset
                const dropY = `max(0, (ih-oh)*(1 - abs(sin(3*t))))`;
                filters.push(`zoompan=z=1:x='(iw-ow)/2':y='${dropY}':d=${frames}:s=${w}x${h}:fps=${fps}`);
            } else if (id.includes('flash-pulse')) {
                 filters.push(`eq=brightness='1+0.5*sin(10*t)'`);
            } else if (id.includes('jelly')) {
                 // Simulated jelly with wave (warp is complex, using zoom wobble)
                 filters.push(`zoompan=z='1.0+0.05*sin(10*t)':d=${frames}:s=${w}x${h}:fps=${fps}`);
            }
            
        } else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            
            // Custom Start/End Position logic for Ken Burns
            if (config.startX !== undefined || config.endX !== undefined) {
                 const sX = config.startX || 0;
                 const eX = config.endX || 0;
                 // Map -50..50 to pixel offsets relative to center
                 const xOffset = `(iw/100) * (${sX} + (${eX}-${sX})*on/${frames})`;
                 x = `(iw/2)-(iw/zoom/2) + ${xOffset}`;
            }
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        } else if (isImage && !id) {
            // Default gentle zoom for static images
            z = `min(zoom+0.0015,1.5)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }

        // --- 7. Blur Movements ---
        if (id.includes('mov-blur')) {
            if (id === 'mov-blur-in') {
                // Blur at start (0-0.5s), then sharp
                filters.push(`boxblur=20:1:enable='between(t,0,0.5)'`);
            } else if (id === 'mov-blur-out') {
                // Sharp then blur at end
                filters.push(`boxblur=20:1:enable='between(t,${Math.max(0, durationSec-0.5)},${durationSec})'`);
            } else if (id === 'mov-blur-pulse') {
                // Toggle blur every 1 second
                filters.push(`boxblur=10:1:enable='lt(mod(t,1),0.3)'`);
            } else if (id === 'mov-blur-zoom') {
                filters.push(`boxblur=10:1:enable='between(t,0,0.5)'`);
            }
        }

        // --- 8. Shake & Jitter ---
        if (id.includes('shake') || id.includes('handheld') || id.includes('earthquake') || id.includes('jitter')) {
             let intensity = 10;
             if (id.includes('handheld-1')) intensity = 5;
             if (id.includes('handheld-2')) intensity = 15;
             if (id.includes('shake-hard')) intensity = 30;
             if (id.includes('earthquake')) intensity = 50;
             if (id.includes('jitter')) intensity = 20;

             // Use crop to simulate shake (zoom in slightly, then move x/y randomly)
             const shakeX = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
             const shakeY = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
             // Zoom in 10% to have room to shake
             filters.push(`scale=${Math.floor(w*1.1)}:-2,crop=${w}:${h}:${shakeX}:${shakeY}`);
        }

        // --- 9. Loop Animations ---
        if (id === 'pulse') {
            const zPulse = `1.05+0.05*sin(2*PI*time)`; 
            filters.push(`zoompan=z='${zPulse}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }
        if (id === 'float') {
             const yFloat = `(ih-oh)/2 + 20*sin(2*PI*time)`;
             filters.push(`scale=${Math.floor(w*1.05)}:-2,crop=${w}:${h}:(iw-ow)/2:${yFloat}`);
        }
        if (id === 'heartbeat') {
            const zHeart = `1.0 + 0.1*abs(sin(3*PI*time))`; 
            filters.push(`zoompan=z='${zHeart}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }
        
        // --- 10. Photo Effects ---
        if (id === 'photo-flash') {
            filters.push(`eq=brightness='1+0.5*sin(2*PI*t*5)':enable='lt(t,1)'`);
        }
        if (id === 'rgb-split-anim') {
            filters.push(`hue=h='t*10'`); 
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
