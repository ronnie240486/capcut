
export default {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'veryfast', 
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
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)':a='p(X,Y)'",
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
        
        const id = moveId || '';
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;
        
        let z = '1.0';
        let x = centerX;
        let y = centerY;
        const time = `(on/${fps})`;
        const progress = `(on/${frames})`;

        let postFilters = [];

        // 1. Cinematic Pans
        if (id.includes('pan-')) {
            z = '1.3'; // Zoom in a bit to allow panning
            const maxPanX = '(iw-iw/zoom)';
            const maxPanY = '(ih-ih/zoom)';
            
            if (id.includes('slow-l')) x = `${maxPanX}*(1-${progress})`;
            else if (id.includes('slow-r')) x = `${maxPanX}*${progress}`;
            else if (id.includes('slow-u')) y = `${maxPanY}*(1-${progress})`;
            else if (id.includes('slow-d')) y = `${maxPanY}*${progress}`;
            else if (id.includes('fast-l')) x = `${maxPanX}*(1-min(1,1.5*${progress}))`;
            else if (id.includes('fast-r')) x = `${maxPanX}*(min(1,1.5*${progress}))`;
            else if (id.includes('diag-tl')) { x = `${maxPanX}*(1-${progress})`; y = `${maxPanY}*(1-${progress})`; }
            else if (id.includes('diag-tr')) { x = `${maxPanX}*${progress}`; y = `${maxPanY}*(1-${progress})`; }
            else if (id.includes('diag-bl')) { x = `${maxPanX}*(1-${progress})`; y = `${maxPanY}*${progress}`; }
            else if (id.includes('diag-br')) { x = `${maxPanX}*${progress}`; y = `${maxPanY}*${progress}`; }
        }

        // 2. Dynamic Zooms
        else if (id.includes('zoom-') || id.includes('dolly') || id === 'kenBurns') {
            if (id.includes('crash-in')) z = `1.0 + 2.0*min(1, ${progress}*4)`;
            else if (id.includes('crash-out')) z = `3.0 - 2.0*min(1, ${progress}*4)`;
            else if (id.includes('twist-in')) { 
                z = `1.0 + 0.5*${progress}`; 
                postFilters.push(`rotate=a='${progress}*PI*0.5':c=none:ow=rotw(iw):oh=roth(ih)`); 
            }
            else if (id.includes('twist-out')) { 
                z = `1.5 - 0.5*${progress}`; 
                postFilters.push(`rotate=a='-${progress}*PI*0.5':c=none:ow=rotw(iw):oh=roth(ih)`); 
            }
            else if (id.includes('bounce-in')) z = `1.0 + 0.3*abs(sin(PI*${progress}*2)) * exp(-${progress}*3)`;
            else if (id.includes('pulse-slow')) z = `1.1 + 0.05*sin(2*PI*${time}/2)`;
            else if (id.includes('pulse-fast')) z = `1.1 + 0.05*sin(2*PI*${time}*2)`;
            else if (id.includes('wobble')) { 
                z = `1.2`; 
                x = `${centerX} + 40*sin(2*PI*${time})`; 
                y = `${centerY} + 40*cos(2*PI*${time}*0.7)`; 
            }
            else if (id.includes('shake')) { 
                z = `1.2`; 
                x = `${centerX} + 25*(random(1)-0.5)`; 
                y = `${centerY} + 25*(random(1)-0.5)`; 
            }
            else if (id.includes('dolly-vertigo')) {
                // Dolly Zoom effect: zoom in while scaling down (or vice versa)
                z = `1.0 + 0.5*${progress}`;
                postFilters.push(`scale=iw/(1+0.5*${progress}):-1,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
            }
            else if (id === 'kenBurns') {
                const startScale = config.startScale || 1.0;
                const endScale = config.endScale || 1.35;
                z = `${startScale}+(${endScale}-${startScale})*${progress}`;
            }
        }

        // 3. 3D Transforms (Simulated)
        else if (id.includes('3d-')) {
            if (id.includes('flip-x')) {
                postFilters.push(`rotate=a='${progress}*PI*2':c=none:ow=rotw(iw):oh=roth(ih)`);
            }
            else if (id.includes('flip-y')) {
                postFilters.push(`rotate=a='${progress}*PI*2':c=none:ow=rotw(iw):oh=roth(ih)`); // Simplified
            }
            else if (id.includes('tumble')) {
                postFilters.push(`rotate=a='${progress}*PI':c=none,scale=iw*(1-0.3*sin(PI*${progress})):-1,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
            }
            else if (id.includes('roll')) {
                postFilters.push(`rotate=a='${progress}*PI*2':c=none`);
            }
            else if (id.includes('spin-axis')) {
                postFilters.push(`rotate=a='sin(${progress}*PI*2)*0.2':c=none`);
            }
            else if (id.includes('swing')) {
                const dir = id.includes('-l') ? -1 : 1;
                postFilters.push(`rotate=a='${dir}*0.2*sin(${progress}*PI)':c=none`);
            }
            else if (id.includes('perspective')) {
                const dir = id.includes('-u') ? 1 : -1;
                // Simulating perspective with vertical scale
                postFilters.push(`scale=iw:ih*(1-0.2*${progress}*${dir}),pad=${w}:${h}:0:(oh-ih)/2`);
            }
            else if (id.includes('float')) {
                z = '1.1';
                y = `${centerY} + 30*sin(2*PI*${time}*0.5)`;
                x = `${centerX} + 20*cos(2*PI*${time}*0.3)`;
            }
        }

        // 4. Glitch & Chaos
        else if (id.includes('glitch') || id.includes('shake-violent') || id.includes('jitter') || id.includes('chaos')) {
            if (id.includes('snap')) {
                z = `if(lt(mod(on,10),2), 1.5, 1.0)`;
            }
            else if (id.includes('skid')) {
                x = `${centerX} + if(lt(mod(on,15),5), 100*${progress}, 0)`;
            }
            else if (id.includes('violent')) {
                z = '1.3';
                x = `${centerX} + 60*(random(1)-0.5)`;
                y = `${centerY} + 60*(random(1)-0.5)`;
            }
            else if (id.includes('jitter-x')) {
                x = `${centerX} + 40*(random(1)-0.5)`;
            }
            else if (id.includes('jitter-y')) {
                y = `${centerY} + 40*(random(1)-0.5)`;
            }
            else if (id.includes('rgb-shift')) {
                postFilters.push(`chromashift=cbh=5:crv=5`);
            }
            else if (id.includes('strobe')) {
                postFilters.push(`drawbox=c=white@0.5:t=fill:enable='lt(mod(on,4),2)'`);
            }
            else if (id.includes('vhs')) {
                postFilters.push(`noise=alls=20:allf=t+u,hue=s=0.5`);
            }
        }

        // 5. Elastic & Bounce
        else if (id.includes('bounce') || id.includes('elastic') || id.includes('rubber') || id.includes('jelly') || id.includes('spring') || id.includes('pop-up') || id.includes('tada')) {
            if (id.includes('drop')) {
                y = `${centerY} - ${h}*(1-min(1,${progress}*2))*abs(cos(PI*${progress}*3))`;
            }
            else if (id.includes('snap-l')) {
                x = `${centerX} - 100*sin(PI*${progress})*exp(-${progress}*3)`;
            }
            else if (id.includes('snap-r')) {
                x = `${centerX} + 100*sin(PI*${progress})*exp(-${progress}*3)`;
            }
            else if (id.includes('rubber')) {
                z = `1.0 + 0.2*sin(PI*${progress}*4)*exp(-${progress}*2)`;
            }
            else if (id.includes('jelly')) {
                postFilters.push(`scale=iw*(1+0.1*sin(PI*${progress}*5)):ih*(1-0.1*sin(PI*${progress}*5)),pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
            }
            else if (id.includes('spring-up')) {
                y = `${centerY} + 50*sin(PI*${progress}*4)*exp(-${progress}*2)`;
            }
            else if (id.includes('pop-up')) {
                z = `if(lt(on,10), 0.5+0.5*on/10, 1.0)`;
            }
            else if (id.includes('tada')) {
                z = `1.0 + 0.1*sin(PI*${progress}*6)`;
                postFilters.push(`rotate=a='sin(${progress}*PI*8)*0.1':c=none`);
            }
        }

        // 6. Handheld / Earthquake
        else if (id.includes('handheld') || id.includes('earthquake')) {
             let intensity = 10;
             if (id.includes('1')) intensity = 5;
             if (id.includes('2')) intensity = 15;
             if (id.includes('hard')) intensity = 30;
             if (id.includes('earthquake')) intensity = 60;
             z = '1.1'; 
             const shakeX = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
             const shakeY = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
             postFilters.push(`crop=w=iw-${intensity}:h=ih-${intensity}:${shakeX}:${shakeY},scale=${w}:${h}`);
        }

        // 7. Loops (Pulse, Float, etc)
        else if (id === 'pulse' || id.includes('pulsar')) {
            z = `1.05 + 0.05*sin(2*PI*${time})`;
        }
        else if (id === 'float' || id.includes('flutuar')) {
            y = `${centerY} + 20*sin(PI*${time})`;
        }
        else if (id === 'heartbeat') {
            z = `1.0 + 0.1*abs(sin(2*PI*${time}*1.2))`;
        }

        // Fallback for simple zoom if nothing else matched but it has "zoom" in name
        else if (id.includes('zoom')) {
            if (id.includes('in')) z = `1.0 + 0.3*${progress}`;
            else if (id.includes('out')) z = `1.3 - 0.3*${progress}`;
        }

        // Final Filter Construction
        let filter = '';
        if (isImage) {
            // For images, we must specify d (duration in frames) to generate the sequence
            filter = `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
        } else {
            // For video, d=1 processes one input frame to one output frame
            filter = `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${w}x${h}:fps=${fps}`;
        }

        postFilters.unshift('format=yuv420p');
        const validPostFilters = postFilters.filter(f => f && f.trim().length > 0);
        return `${filter}${validPostFilters.length > 0 ? ',' + validPostFilters.join(',') : ''}`;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'blur-dissolve': 'distance', 'filter-blur': 'distance',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash': 'fadewhite',
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'swirl': 'circleopen', 'kaleidoscope': 'hlslice', 'water-drop': 'circleopen', 'wave': 'slideleft', 
            'stretch-h': 'slideleft', 'stretch-v': 'slideup', 'morph': 'dissolve', 'turbulence': 'dissolve',
            'push-left': 'slideleft', 'push-right': 'slideright', 'push-up': 'slideup', 'push-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 'diamond-in': 'diagtl', 'diamond-out': 'diagbr',
            'clock-wipe': 'radial', 'iris-in': 'circleopen', 'iris-out': 'circleclose',
            'pixelize': 'pixelize', 'glitch': 'pixelize', 'glitch-chroma': 'pixelize', 'pixel-sort': 'pixelize',
            'color-glitch': 'dissolve', 'urban-glitch': 'dissolve', 'rgb-split': 'distance',
            'liquid-melt': 'dissolve', 'ink-splash': 'circleopen', 'water-ripple': 'slideleft',
            'paper-rip': 'slideup', 'page-turn': 'slideleft',
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', 'cube-rotate-u': 'slideup', 'cube-rotate-d': 'slidedown',
            'blood-mist': 'dissolve', 'black-smoke': 'fadeblack', 'white-smoke': 'fadewhite',
            'fire-burn': 'dissolve', 'visual-buzz': 'pixelize', 'rip-diag': 'slideleft', 'zoom-neg': 'zoomout',
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
            'glitch-scan': 'dissolve', 'datamosh': 'pixelize', 'noise-jump': 'pixelize', 'cyber-slice': 'rectcrop',
            'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'distance',
            'scan-line-v': 'dissolve',
            'flashback': 'fadewhite', 'combine-overlay': 'dissolve', 'combine-mix': 'dissolve',
            'nightmare': 'pixelize', 'bubble-blur': 'circleopen', 'paper-unfold': 'slideleft',
            'corrupt-img': 'pixelize', 'glow-intense': 'fadewhite', 'dynamic-blur': 'dissolve',
            'flash-black': 'fadeblack', 'flash-white': 'fadewhite', 'pull-away': 'zoomout',
        };
        return map[id] || 'fade';
    }
};
