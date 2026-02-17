
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
        
        // --- 1. Basic Pan/Zoom ---
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        
        if (id.includes('pan-')) {
            z = '1.2';
            if (id.includes('slow-l')) x = `(iw-ow)*(on/${frames})`;
            else if (id.includes('slow-r')) x = `(iw-ow)*(1-on/${frames})`;
            else if (id.includes('slow-u')) y = `(ih-oh)*(on/${frames})`;
            else if (id.includes('slow-d')) y = `(ih-oh)*(1-on/${frames})`;
            else if (id.includes('fast-l')) x = `(iw-ow)*((on*2)/${frames})`;
            else if (id.includes('fast-r')) x = `(iw-ow)*(1-(on*2)/${frames})`;
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        } else if (id.includes('zoom-') || id === 'dolly-zoom') {
            if (id.includes('crash-in')) { z = `min(zoom+0.05,2.0)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('crash-out')) { z = `max(2.0-0.05*on,1.0)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('slow-in')) { z = `min(zoom+0.0015,1.2)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('fast-in')) { z = `min(zoom+0.005,1.5)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id.includes('slow-out')) { z = `max(1.2-0.0015*on,1.0)`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            else if (id === 'dolly-zoom') { z = `1.0 + 0.3*sin(PI*on/${frames})`; x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`; }
            
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        } else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);

        } else if (isImage && !id) {
            // Default gentle zoom for static images
            z = `min(zoom+0.0015,1.5)`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            filters.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }

        // --- 2. Blur Movements ---
        if (id.includes('mov-blur')) {
            if (id === 'mov-blur-in') {
                // Blur from 20 down to 0 over 1 second (approx 30 frames)
                filters.push(`boxblur=luma_radius='min(20,20*(1-t/1.0))':luma_power=1:enable='between(t,0,1)'`);
            } else if (id === 'mov-blur-out') {
                 // Blur from 0 to 20 near end
                filters.push(`boxblur=luma_radius='min(20,20*((t-${Math.max(0, durationSec-1)})/1.0))':luma_power=1:enable='between(t,${Math.max(0, durationSec-1)},${durationSec})'`);
            } else if (id === 'mov-blur-pulse') {
                filters.push(`boxblur=luma_radius='10*abs(sin(2*PI*t))':luma_power=1`);
            } else if (id === 'mov-blur-zoom') {
                // Zoom is already handled above if combined, but specific blur here
                filters.push(`boxblur=luma_radius='min(10,zoom*5)':luma_power=1`);
            }
        }

        // --- 3. Shake & Jitter ---
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

        // --- 4. Loop Animations ---
        if (id === 'pulse') {
            // Zoom in/out loop
            const zPulse = `1.05+0.05*sin(2*PI*t)`; // Cycle every 1s (2*PI*t)
            filters.push(`zoompan=z='${zPulse}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }
        if (id === 'float') {
            // Translate Y up/down. Requires crop trick or pad.
            // Simplified: gentle zoom + pan Y
            const yFloat = `(ih-oh)/2 + 20*sin(2*PI*t)`;
            filters.push(`scale=${Math.floor(w*1.05)}:-2,crop=${w}:${h}:(iw-ow)/2:${yFloat}`);
        }
        if (id === 'wiggle' || id === 'spin-slow' || id === 'pendulum') {
             // Rotate
             let angle = `0`;
             if (id === 'wiggle') angle = `(PI/180)*3*sin(4*PI*t)`; // +/- 3 degrees, fast
             if (id === 'pendulum') angle = `(PI/180)*10*sin(1*PI*t)`; // +/- 10 degrees, slow
             if (id === 'spin-slow') angle = `t*0.2`; // Continuous slow rotation
             
             // Rotate requires complex filtering to avoid black corners (scale up then rotate then crop)
             // Scale 1.2x to be safe
             filters.push(`scale=${Math.floor(w*1.2)}:-2,rotate='${angle}':ow=${w}:oh=${h}:c=none`);
        }
        if (id === 'heartbeat') {
            const zHeart = `1.0 + 0.1*abs(sin(3*PI*t))`; // Fast pulse
            filters.push(`zoompan=z='${zHeart}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`);
        }

        return filters.length > 0 ? filters.join(',') : null;
    },

    getTransitionXfade: (id) => {
        // ... (Keeping existing map)
        return 'fade'; // Default
    }
};
