
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

        let postFilters = [];

        // 1. Zoom Logic
        if (id.includes('zoom') || id.includes('dolly')) {
            if (id.includes('crash-in')) z = `min(zoom+0.15,3.0)`;
            else if (id.includes('crash-out')) z = `max(3.0-0.15*on,1.0)`;
            else if (id.includes('slow-in')) z = `1.0 + (0.2 * on / ${frames})`; 
            else if (id.includes('fast-in')) z = `1.0 + (0.5 * on / ${frames})`; 
            else if (id.includes('slow-out')) z = `1.2 - (0.2 * on / ${frames})`; 
            else if (id.includes('bounce-in')) z = `1.0 + 0.3*abs(sin(PI*on/(30*0.5))) * exp(-on/30)`;
            else if (id.includes('pulse-slow')) z = `1.1 + 0.05*sin(2*PI*on/(30*2))`;
            else if (id.includes('pulse-fast')) z = `1.1 + 0.05*sin(2*PI*on/(30*0.5))`;
            else if (id === 'zoom-bounce') z = `1.0 + 0.2*abs(sin(2*PI*on/30))`;
            else if (id.includes('wobble')) { z = `1.2`; x = `${centerX} + 30*sin(2*PI*on/60)`; y = `${centerY} + 30*cos(2*PI*on/90)`; }
            else if (id.includes('shake')) { z = `1.2`; x = `${centerX} + 20*(random(1)-0.5)`; y = `${centerY} + 20*(random(1)-0.5)`; }
            else if (id.includes('twist-in')) { z = `min(zoom+0.02,1.5)`; postFilters.push(`rotate=a='(t*1)':c=none:ow=rotw(iw):oh=roth(ih)`); }
            else if (id.includes('twist-out')) { z = `max(1.5-0.02*on,1.0)`; postFilters.push(`rotate=a='-(t*1)':c=none:ow=rotw(iw):oh=roth(ih)`); }
            else if (id.includes('dolly')) z = `1.0 + 0.4*sin(PI*on/${frames})`;
            else z = `min(zoom+0.0015,1.2)`;
        }

        // 2. Pan Logic
        if (id.includes('pan-')) {
            z = '1.2';
            const rightX = '(iw-iw/zoom)';
            const bottomY = '(ih-ih/zoom)';
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*(on/${frames})`; 
            else if (id.includes('slow-r')) x = `(${rightX})*(on/${frames})`;
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*(on/${frames})`;
            else if (id.includes('slow-d')) y = `(${bottomY})*(on/${frames})`;
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,1.5*on/${frames}))`;
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,1.5*on/${frames}))`;
        }

        // 3. Shake / Handheld
        if (id.includes('shake') || id.includes('handheld') || id.includes('earthquake')) {
             let intensity = 10;
             if (id.includes('1')) intensity = 5;
             if (id.includes('2')) intensity = 15;
             if (id.includes('hard')) intensity = 30;
             if (id.includes('earthquake')) intensity = 50;
             z = '1.1'; 
             const shakeX = `(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
             const shakeY = `(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
             postFilters.push(`crop=w=iw-${intensity}:h=ih-${intensity}:${shakeX}:${shakeY},scale=${w}:${h}`);
        }

        // 4. Blur
        if (id.includes('blur')) {
            if (id.includes('in')) postFilters.push(`boxblur=20:1:enable='between(t,0,0.5)'`);
            else if (id.includes('out')) postFilters.push(`boxblur=20:1:enable='between(t,${Math.max(0, durationSec-0.5)},${durationSec})'`);
            else postFilters.push(`boxblur=10:1`);
        }

        // 5. Entrada / Loop / Outros
        if (id.includes('slide-in')) {
            if (id.includes('left')) { x = `(iw-ow)/2 - (iw)*(1-min(${time}*2,1))`; }
            else if (id.includes('right')) { x = `(iw-ow)/2 + (iw)*(1-min(${time}*2,1))`; }
            else if (id.includes('bottom')) { y = `(ih-oh)/2 + (ih)*(1-min(${time}*2,1))`; }
            z = '1.0';
        } else if (id === 'pop-in') {
            z = `if(lt(on,15), max(0.1, on/15), 1.0)`;
        } else if (id === 'fade-in') {
            postFilters.push(`fade=t=in:st=0:d=1`);
        } else if (id === 'pulse') {
            z = `1.05+0.05*sin(2*PI*${time})`;
        } else if (id === 'heartbeat') {
            z = `1.0 + 0.1*abs(sin(3*PI*${time}))`;
        } else if (id.includes('glitch')) {
            postFilters.push(`noise=alls=20:allf=t+u`);
        }

        // 6. Ken Burns
        if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.35;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
        }

        // Final Filter Construction
        // For images, zoompan is great. For video, zoompan is a memory hog and frame exploder.
        // We use zoompan for images, and scale/crop for video if it's just a simple zoom.
        // But to keep it simple and consistent with the existing logic, we'll use zoompan 
        // but ensure it's restricted to the correct frame count.
        
        let filter = '';
        if (isImage) {
            filter = `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
        } else {
            // For video, zoompan is dangerous. We use it only if we have to.
            // Actually, let's use a safer version for video that doesn't explode frames.
            // By setting d=1, it processes one input frame to one output frame.
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
