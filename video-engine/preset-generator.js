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
        
        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
             const i = parseInt(vinMatch[1], 10);
             const sepia = 0.3 + (i%5)*0.1;
             return `eq=contrast=0.9:brightness=1.1,colorbalance=rs=${sepia}:gs=${sepia/2}:bs=-${sepia}`;
        }

        const cyberMatch = effectId.match(/^cyber-neon-(\d+)$/);
        if (cyberMatch) {
             const i = parseInt(cyberMatch[1], 10);
             return `eq=contrast=1.3:saturation=1.5,hue=h=${i*10}`;
        }

        const natureMatch = effectId.match(/^nature-fresh-(\d+)$/);
        if (natureMatch) {
            const i = parseInt(natureMatch[1], 10);
            return `eq=saturation=1.4:brightness=0.05,hue=h=-${i*2}`;
        }

        const artDuoMatch = effectId.match(/^art-duo-(\d+)$/);
        if (artDuoMatch) {
            const i = parseInt(artDuoMatch[1], 10);
            return `hue=s=0,eq=contrast=1.5,sepia,hue=h=${i*12},eq=saturation=3`;
        }

        const noirMatch = effectId.match(/^noir-style-(\d+)$/);
        if (noirMatch) {
            const i = parseInt(noirMatch[1], 10);
            return `hue=s=0,eq=contrast=${(1 + i * 0.05).toFixed(2)}:brightness=${(-i * 0.02).toFixed(2)}`;
        }

        const filmMatch = effectId.match(/^film-stock-(\d+)$/);
        if (filmMatch) {
            return `eq=contrast=1.1:saturation=0.8:brightness=0.05,sepia`;
        }

        const leakMatch = effectId.match(/^leak-overlay-(\d+)$/);
        if (leakMatch) {
            const i = parseInt(leakMatch[1], 10);
            const r = (i * 0.1) % 0.5;
            const g = (i * 0.2) % 0.3;
            return `colorbalance=rs=${r}:gs=${g}:bs=0,vignette=angle=PI/4:x0=iw*${(i % 10) / 10}:y0=ih*${((i + 5) % 10) / 10}`;
        }

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
            'mono': 'hue=s=0',
            'vintage': 'sepia=0.6,eq=contrast=0.9:brightness=0.1',
            'matrix': 'hue=h=90,eq=contrast=1.2:brightness=-0.1:saturation=1.5',
            'cool-morning': 'hue=h=180,sepia,eq=brightness=0.1',
            'horror': 'hue=s=0.2,eq=contrast=1.5:brightness=-0.3,sepia',
            'underwater': 'hue=h=190,eq=brightness=-0.2:contrast=1.2',
            'sunset': 'sepia,eq=saturation=1.5,hue=h=-20',
            'posterize': 'eq=contrast=2:saturation=1.5',
            'fade': 'eq=contrast=0.8:brightness=0.2,sepia',
            'vibrant': 'eq=saturation=2.5:contrast=1.1',
            'muted': 'eq=saturation=0.5:contrast=0.9',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'golden-hour': 'sepia,eq=saturation=1.4:brightness=0.1',
            'cold-blue': 'hue=h=210,eq=saturation=0.8',
            'night-vision': 'hue=s=0,sepia,hue=h=90,eq=contrast=1.5',
            'scifi': 'eq=contrast=1.3,hue=h=180',
            'pastel': 'eq=brightness=0.2:saturation=0.7:contrast=0.9',
            'sketch-sim': 'hue=s=0,eq=contrast=5:brightness=0.5',
            'invert': 'negate',
            'sepia-max': 'sepia',
            'high-contrast': 'eq=contrast=3',
            'low-light': 'eq=brightness=-0.5:contrast=1.5',
            'overexposed': 'eq=brightness=0.5:contrast=0.8',
            'radioactive': 'hue=h=90,eq=saturation=3',
            'deep-fried': 'eq=contrast=2:saturation=3,unsharp=5:5:2.0:5:5:0.0',
            'ethereal': 'eq=brightness=0.3:contrast=0.8:saturation=0.5',
            'dv-cam': 'sepia=0.2,eq=contrast=1.1,noise=alls=10:allf=t',
            'bling': 'eq=brightness=1.1,unsharp=3:3:1.5',
            'soft-angel': 'eq=brightness=1.2:contrast=0.9,boxblur=luma_radius=1:luma_power=1',
            'sharpen': 'unsharp=5:5:1.5:5:5:0.0,eq=contrast=1.4:saturation=1.2',
            'dreamy': 'boxblur=luma_radius=2:luma_power=1,eq=brightness=0.2:saturation=0.8',
            'vhs-distort': 'noise=alls=20:allf=t+u,eq=saturation=1.5:contrast=1.2',
            'bad-signal': 'noise=alls=30:allf=t,eq=brightness=0.1:contrast=1.5',
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'old-film': 'sepia,noise=alls=20:allf=t+u',
            'dust': 'noise=alls=15:allf=t+u',
            'grain': 'noise=alls=10:allf=t+u',
            'vignette': 'vignette=angle=PI/3',
            'super8': 'sepia,eq=contrast=1.2,vignette',
            'noise': 'noise=alls=25:allf=t+u',
            'light-leak-1': 'colorbalance=rs=0.3:gs=0.1:bs=0,vignette',
            'light-leak-2': 'colorbalance=rs=0.1:gs=0.3:bs=0.2,vignette',
            'sun-flare': 'eq=brightness=0.1,vignette',
            'god-rays': 'unsharp=5:5:2.0:5:5:0.0',
            'neon-glow': 'eq=saturation=2,unsharp=5:5:1.5:5:5:0.0',
        };
        
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let postFilters = [];
        const id = moveId || '';
        const speed = config.speed || 1;
        const intensity = config.intensity || 1;
        
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;
        
        let z = '1.0';
        let x = centerX;
        let y = centerY;

        const time = `(on/${fps})`;

        if (id === 'pulse') {
            z = `1.0 + ${0.05 * intensity}*sin(2*PI*${time}*${speed})`;
        } else if (id === 'heartbeat') {
            z = `1.0 + ${0.1 * intensity}*abs(sin(3*PI*${time}*${speed}))`;
        } else if (id === 'float') {
            y = `${centerY} - ${20 * intensity}*sin(2*PI*${time}*${speed}/2)`;
            z = '1.05';
        } else if (id === 'wiggle') {
            postFilters.push(`rotate=a='${0.05 * intensity}*sin(2*PI*t*${speed})':c=black@0:ow=iw:oh=ih`);
            z = '1.1';
        } else if (id === 'spin-slow') {
            postFilters.push(`rotate=a='2*PI*t*${speed}/10':c=black@0:ow=iw:oh=ih`);
            z = '1.2';
        } else if (id === 'pendulum') {
            postFilters.push(`rotate=a='${0.2 * intensity}*sin(2*PI*t*${speed}/2)':c=black@0:ow=iw:oh=ih`);
            z = '1.1';
        } else if (id.includes('mov-pan-')) {
            z = '1.2'; 
            const dur = frames / speed;
            const rightX = '(iw-iw/zoom)';
            const bottomY = '(ih-ih/zoom)';
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*(on/${dur})`; 
            else if (id.includes('slow-r')) x = `(${rightX})*(on/${dur})`;
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*(on/${dur})`;
            else if (id.includes('slow-d')) y = `(${bottomY})*(on/${dur})`;
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,1.5*on/${dur}))`;
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,1.5*on/${dur}))`;
        } else if (id.includes('zoom')) {
            z = `min(zoom+${0.0015 * speed},1.2)`;
            if (id.includes('slow-in')) z = `1.0 + (${0.3 * intensity} * on / ${frames / speed})`;
            else if (id.includes('fast-in')) z = `1.0 + (${0.6 * intensity} * on / ${frames / speed})`;
            else if (id.includes('slow-out')) z = `1.3 - (${0.3 * intensity} * on / ${frames / speed})`;
        } else if (id.includes('shake') || id.includes('handheld') || id === 'earthquake' || id === 'jitter') {
            let sIntensity = 10;
            if (id.includes('handheld-1')) sIntensity = 5;
            else if (id.includes('handheld-2')) sIntensity = 15;
            else if (id.includes('shake-hard')) sIntensity = 30;
            else if (id.includes('earthquake')) sIntensity = 50;
            const finalIntensity = sIntensity * intensity;
            z = '1.1';
            postFilters.push(`crop=w=iw-${finalIntensity}:h=ih-${finalIntensity}:x='(iw-ow)/2+(random(1)-0.5)*${finalIntensity}':y='(ih-oh)/2+(random(1)-0.5)*${finalIntensity}',scale=${w}:${h}`);
        } else if (id === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.35;
            const period = 6 / speed;
            const midScale = (startScale + endScale) / 2;
            const ampScale = ((endScale - startScale) / 2) * intensity;
            z = `${midScale} + ${ampScale} * sin(2*PI*${time}/${period} - PI/2)`;
        } else if (isImage && !id) {
            z = `min(zoom+0.0015,1.5)`;
        }

        const dVal = isImage ? frames : 1;
        const preScale = !isImage ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` : '';
        const zoomPanFilter = `${preScale}zoompan=z='${z}':x='${x}':y='${y}':d=${dVal}:s=${w}x${h}:fps=${fps}`;
        
        const validPostFilters = postFilters.filter(f => f && f.trim().length > 0);
        const filterChain = validPostFilters.length > 0 
            ? `${zoomPanFilter},${validPostFilters.join(',')}` 
            : zoomPanFilter;
        
        return `${filterChain},format=yuv420p`;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'blur-dissolve': 'distance', 'filter-blur': 'distance',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash': 'fadewhite',
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose',
            'pixelize': 'pixelize', 'glitch': 'pixelize',
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout',
            'black-smoke': 'fadeblack', 'white-smoke': 'fadewhite',
            'flash-black': 'fadeblack', 'flash-white': 'fadewhite',
        };
        return map[id] || 'fade';
    }
};
