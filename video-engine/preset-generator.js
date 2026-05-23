
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

        // Nature Procedural
        const natureMatch = effectId.match(/^nature-fresh-(\d+)$/);
        if (natureMatch) {
            const i = parseInt(natureMatch[1], 10);
            return `eq=saturation=1.4:brightness=0.05,hue=h=-${i*2}`;
        }

        // Art Duotone Procedural
        const artDuoMatch = effectId.match(/^art-duo-(\d+)$/);
        if (artDuoMatch) {
            const i = parseInt(artDuoMatch[1], 10);
            return `hue=s=0,eq=contrast=1.5,sepia,hue=h=${i*12},eq=saturation=3`;
        }

        // Noir Procedural
        const noirMatch = effectId.match(/^noir-style-(\d+)$/);
        if (noirMatch) {
            const i = parseInt(noirMatch[1], 10);
            return `hue=s=0,eq=contrast=${(1 + i * 0.05).toFixed(2)}:brightness=${(-i * 0.02).toFixed(2)}`;
        }

        // Film Stock Procedural
        const filmMatch = effectId.match(/^film-stock-(\d+)$/);
        if (filmMatch) {
            return `eq=contrast=1.1:saturation=0.8:brightness=0.05,sepia`;
        }

        // Light Leaks Procedural (Simulated)
        const leakMatch = effectId.match(/^leak-overlay-(\d+)$/);
        if (leakMatch) {
            const i = parseInt(leakMatch[1], 10);
            const r = (i * 0.1) % 0.5;
            const g = (i * 0.2) % 0.3;
            return `colorbalance=rs=${r}:gs=${g}:bs=0,vignette=angle=PI/4:x0=iw*${(i % 10) / 10}:y0=ih*${((i + 5) % 10) / 10}`;
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
            'morpheus-glass': 'gblur=sigma=1:steps=1,vignette=angle=PI/6', 
            'morpheus-ether': 'colorbalance=rs=0.1:gs=0.2:bs=0.3,vignette=angle=PI/3',
            'morpheus-neon': 'curves=preset=vintage,eq=saturation=1.5',
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'remove-bg-green': 'colorkey=0x00FF00:0.1:0.1',
            'remove-bg-blue': 'colorkey=0x0000FF:0.1:0.1',
            'cinematic-warm': 'colorbalance=rs=0.1:gs=0:bs=-0.1:rm=0.1:gm=0:bm=-0.1,eq=contrast=1.1:saturation=1.2',
            'professional-cold': 'colorbalance=rs=-0.1:gs=0:bs=0.2:rm=-0.1:gm=0:bm=0.2,eq=contrast=1.05:saturation=1.1',
            'kodak-portra': 'eq=saturation=1.2:contrast=1.1:brightness=0.05,colorbalance=rs=0.05:gs=0:bs=-0.05',
            'fuji-film': 'eq=saturation=1.3:contrast=1.05,colorbalance=rs=-0.05:gs=0.05:bs=0',
            'blockbuster': 'colorbalance=rs=0.2:bs=-0.2:rm=0.1:bm=-0.1,eq=contrast=1.2:saturation=1.4',
            'golden-hour-pro': 'colorbalance=rs=0.3:gs=0.1:bs=-0.2,eq=brightness=0.05:saturation=1.3',
            'warm': 'colorbalance=rs=0.1:bs=-0.1,eq=saturation=1.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1,eq=saturation=1.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'mono': 'hue=s=0',
            'vintage': 'sepia=0.6,eq=contrast=0.9:brightness=0.1',
            'vintage-cool': 'colorbalance=bs=0.3:rs=-0.2,eq=saturation=0.8:contrast=1.1',
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
            'glitch-pro-1': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'glitch-pro-2': 'boxblur=luma_radius=\'if(lt(mod(t,0.2),0.1),20,0)\':luma_power=1',
            'vhs-distort': 'noise=alls=20:allf=t+u,eq=saturation=1.5:contrast=1.2',
            'bad-signal': 'noise=alls=30:allf=t,eq=brightness=0.1:contrast=1.5',
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'old-film': 'sepia,noise=alls=20:allf=t+u,drawbox=y=0:w=1:h=ih:c=black@0.3:t=fill',
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
            'strobe': 'eq=eval=frame:brightness=\'if(lt(mod(t,0.2),0.1),0.5,-0.2)\''
        };
        
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, isOverlay = false, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let zoomPanFilter = '';
        let postFilters = [];
        
        // Handle moveId being an object or string
        let id = typeof moveId === 'object' ? moveId?.type : (moveId || '');
        if (id && typeof id === 'string') {
            id = id.replace(/_/g, '-');
        }
        const actualConfig = typeof moveId === 'object' ? { ...config, ...(moveId?.config || {}) } : config;
        const speed = actualConfig.speed || 1;
        const intensity = actualConfig.intensity || 1;
        
        const centerX = `(iw/2)-(iw/zoom/2)`.replace(/\s+/g, '');
        const centerY = `(ih/2)-(ih/zoom/2)`.replace(/\s+/g, '');
        
        let z = '1.0';
        let x = centerX;
        let y = centerY;

        const time = 't';

        if (id === 'pulse') {
            z = `1.1 + ${0.1 * intensity}*sin(2*PI*${time}*${speed})`;
        } else if (id === 'heartbeat') {
            z = `1.1 + ${0.15 * intensity}*abs(sin(3*PI*${time}*${speed}))`;
        } else if (id === 'float') {
            y = `${centerY} - ${40 * intensity}*sin(2 * PI * ${time} * ${speed} / 2)`;
            z = '1.1';
        } else if (id === 'wiggle') {
            postFilters.push(`rotate=a='${0.08 * intensity} * sin(2 * PI * t * ${speed})':c=black@0:ow=iw:oh=ih`);
            z = '1.15';
        } else if (id === 'spin-slow') {
            postFilters.push(`rotate=a='2 * PI * t * ${speed} / 6':c=black@0:ow=iw:oh=ih`);
            z = '1.25';
        } else if (id === 'pendulum') {
            postFilters.push(`rotate=a='${0.15 * intensity} * sin(2 * PI * t * ${speed} / 2)':c=black@0:ow=iw:oh=ih`);
            z = '1.15';
        } else if (id === 'ken-burns' || id === 'kenburns' || id === 'kenBurns') {
            const progress = `(t/${durationSec})`;
            const eased = `(3*pow(${progress},2)-2*pow(${progress},3))`;
            z = `1.1 + ${0.4 * intensity}*${eased}`;
            x = `iw/2-(iw/zoom/2)`;
            y = `ih/2-(ih/zoom/2)`;
        } else if (id === 'zoom-in' || id === 'zoom-in-slow') {
            const progress = `(t/${durationSec})`;
            const eased = `(3*pow(${progress},2)-2*pow(${progress},3))`;
            z = `1.1 + ${0.5 * intensity}*${eased}`;
            x = `iw/2-(iw/zoom/2)`;
            y = `ih/2-(ih/zoom/2)`;
        } else if (id === 'zoom-out' || id === 'zoom-out-slow') {
            const progress = `(t/${durationSec})`;
            const eased = `(3*pow(${progress},2)-2*pow(${progress},3))`;
            z = `1.6 - ${0.5 * intensity}*${eased}`;
            x = `iw/2-(iw/zoom/2)`;
            y = `ih/2-(ih/zoom/2)`;
        } else if (id === 'zoom-crash-in') {
            const progress = `(t/${durationSec})`;
            z = `1.1 + ${3.0 * intensity}*pow(${progress},2)`;
            x = `iw/2-(iw/zoom/2)`;
            y = `ih/2-(ih/zoom/2)`;
        } else if (id === 'zoom-crash-out') {
            const progress = `(t/${durationSec})`;
            z = `4.5 - ${3.5 * intensity}*pow(${progress},2)`;
            x = `iw/2-(iw/zoom/2)`;
            y = `ih/2-(ih/zoom/2)`;
        } else if (id.includes('zoom') || id === 'dolly-zoom' || id === 'mov-dolly-vertigo') {
            const progress = `(t/${durationSec})`;
            if (id.includes('zoom-in')) z = `1.1 + ${0.8 * intensity}*${progress}`;
            else if (id.includes('zoom-out')) z = `2.0 - ${0.8 * intensity}*${progress}`;
            else if (id.includes('crash-in')) z = `1.1 + ${3.5 * intensity}*pow(${progress},2)`;
            else if (id.includes('crash-out')) z = `5.0 - ${4.0 * intensity}*pow(${progress},2)`;
            else if (id.includes('pulse')) z = `1.2 + ${0.15 * intensity}*sin(PI*${progress})`;
            else z = `1.2 + ${0.4 * intensity}*sin(PI*${progress})`;
            x = `iw/2-(iw/zoom/2)`;
            y = `ih/2-(ih/zoom/2)`;
        } else if (id === 'mov-strobe-move') {
            z = '1.1'; 
            postFilters.push(`eq=eval=frame:brightness='if(lt(mod(t,${0.15 / speed}),${0.075 / speed}),${0.4 * intensity},${-0.2 * intensity})'`);
        } else if (id === 'mov-vhs-tracking') {
            z = '1.1';
            y = `${centerY} + ${20 * intensity}*sin(0.5*${time}) + ${5 * intensity}*sin(${50 * speed}*${time})`;
            x = `${centerX} + ${2 * intensity}*sin(${100 * speed}*${time})`;
            const shift = `${5 * intensity}*sin(${15 * speed}*T)`;
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)':a='p(X,Y)'`);
            postFilters.push(`noise=alls=${15 * intensity}:allf=t,eq=saturation=1.4:contrast=1.1`);
        } else if (id === 'rgb-split-anim' || id === 'rgb-split' || id === 'mov-rgb-shift-move') {
            z = '1.1';
            const shift = `${15 * intensity}*sin(${10 * speed}*T)`;
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)':a='p(X,Y)'`);
        } else if (id === 'mov-jitter-x') {
            z = '1.2';
            x = `${centerX} + ${20 * intensity}*sin(${50 * speed}*${time})`;
        } else if (id === 'mov-jitter-y') {
            z = '1.2';
            y = `${centerY} + ${20 * intensity}*sin(${50 * speed}*${time})`;
        } else if (id === 'mov-frame-skip') {
            z = '1.1';
            x = `${centerX} + ${25 * intensity}*sin(${speed}*${time})`; 
        } else if (id === 'mov-shake-violent') {
            z = '1.3'; 
            x = `${centerX} + ${40 * intensity}*sin(${45 * speed}*${time})`;
            y = `${centerY} + ${40 * intensity}*sin(${65 * speed}*${time})`;
        } else if (id === 'mov-glitch-skid') {
            z = '1.2';
            x = `${centerX} + (iw/30)*${intensity}*sin(${10 * speed}*${time})`;
        } else if (id === 'mov-glitch-snap') {
            z = '1.15';
            x = `${centerX} + ${25 * intensity}*sin(${45 * speed}*${time})`;
            y = `${centerY} + ${15 * intensity}*cos(${45 * speed}*${time})`;
        } else if (id === 'mov-digital-tear') {
            z = '1.1';
            postFilters.push(`geq=r='if(gt(sin(Y/10+t*10),0),p(X+${20 * intensity},Y),p(X,Y))':g='p(X,Y)':b='if(lt(sin(Y/10+t*10),0),p(X-${20 * intensity},Y),p(X,Y))'`);
        } else if (id.includes('mov-pan-')) {
            z = '1.3'; 
            const dur = actualConfig.duration || durationSec;
            const progress = `(min(1,t/${dur}))`;
            const rightX = '(iw-ow)';
            const bottomY = '(ih-oh)';
            if (id.includes('slow-l')) x = `${rightX} - (${rightX})*${progress}`; 
            else if (id.includes('slow-r')) x = `(${rightX})*${progress}`;
            else if (id.includes('slow-u')) y = `${bottomY} - (${bottomY})*${progress}`;
            else if (id.includes('slow-d')) y = `(${bottomY})*${progress}`;
            else if (id.includes('fast-l')) x = `${rightX} - (${rightX})*(min(1,1.5*${progress}))`;
            else if (id.includes('fast-r')) x = `(${rightX})*(min(1,1.5*${progress}))`;
            else if (id.includes('diag-tl')) { x = `${rightX}*(1-${progress})`; y = `${bottomY}*(1-${progress})`; }
            else if (id.includes('diag-tr')) { x = `${rightX}*${progress}`; y = `${bottomY}*(1-${progress})`; }
            else if (id.includes('diag-bl')) { x = `${rightX}*(1-${progress})`; y = `${bottomY}*${progress}`; }
            else if (id.includes('diag-br')) { x = `${rightX}*${progress}`; y = `${bottomY}*${progress}`; }
        } else if (id === 'mov-glitch-vortex') {
            z = '1.3';
            postFilters.push(`lenscorrection=k1=${0.2 * intensity}*sin(${speed}*t)`);
        } else if (id === 'mov-mirage-wave') {
            z = '1.1';
            postFilters.push(`geq=r='p(X+${15 * intensity}*sin(Y/20+${speed}*T),Y)':g='p(X,Y)':b='p(X-${15 * intensity}*sin(Y/20+${speed}*T),Y)'`);
        } else if (id === 'mov-kaleidoscope') {
            z = '1.3';
            postFilters.push(`crop=iw/2:ih/2:0:0,split=4[a][b][c][d];[b]hflip[b1];[c]vflip[c1];[d]hflip,vflip[d1];[a][b1]hstack[top];[c1][d1]hstack[bottom];[top][bottom]vstack,scale=${w}:${h}`);
        } else if (id === 'mov-zoom-warp') {
            z = `1.2 + ${0.2 * intensity}*sin(${speed}*t)`;
            postFilters.push(`lenscorrection=k1=${0.1 * intensity}*sin(${speed}*t):k2=${0.05 * intensity}*cos(${speed}*t)`);
        } else if (id === 'mov-chromatic-pulse') {
            z = '1.1';
            const shift = `${5 * intensity}*sin(${speed}*T)`;
            postFilters.push(`geq=r='p(X+${shift},Y)':g='p(X,Y)':b='p(X-${shift},Y)'`);
        } else if (id === 'mov-scanline-flicker') {
            z = '1.1';
            postFilters.push(`drawgrid=w=iw:h=2:c=black@0.5:t=1`);
            postFilters.push(`eq=brightness='${0.1 * intensity}*sin(50*t*${speed})'`);
        } else if (id === 'mov-vignette-pulse') {
            z = '1.1';
            postFilters.push(`vignette=angle='PI/4+${0.3 * intensity}*sin(${speed}*t)':x0=iw/2:y0=ih/2`);
        } else if (id === 'mov-edge-glow') {
            z = '1.1';
            postFilters.push(`edgedetect=low=0.1:high=0.4,format=rgba,colorchannelmixer=rr=${1 + intensity}:gg=${1 + intensity}:bb=${1 + intensity}`);
        } else if (id === 'mov-pixel-drift') {
            z = '1.1';
            const pSize = Math.max(2, Math.round(10 * intensity));
            postFilters.push(`scale=iw/${pSize}:-1,scale=${w}:${h}:flags=neighbor`);
        } else if (id === 'mov-spiral-zoom') {
            z = `1.1 + ${0.7 * intensity}*t/${durationSec}`;
            postFilters.push(`rotate=a='${speed}*t*t':c=black@0:ow=iw:oh=ih`);
        } else if (id.includes('blur') || id.includes('defocus')) {
            const blurVal = Math.max(1, Math.round(10 * intensity));
            if (id.includes('in') || id.includes('focus')) {
                postFilters.push(`boxblur=luma_radius='if(lt(t,0.5), ${blurVal}*(1-t/0.5), 0)':luma_power=1`);
            } else if (id.includes('out') || id.includes('defocus')) {
                postFilters.push(`boxblur=luma_radius='if(gt(t,${durationSec}-0.5), ${blurVal}*(t-(${durationSec}-0.5))/0.5, 0)':luma_power=1`);
            } else if (id.includes('pulse')) {
                postFilters.push(`boxblur=luma_radius='${blurVal/2}*(1+sin(2*PI*t*${speed}))':luma_power=1`);
            } else if (id.includes('zoom')) {
                z = `min(zoom+${0.005 * speed},1.8)`;
                postFilters.push(`boxblur=luma_radius=${Math.round(5 * intensity)}:luma_power=1`);
            } else if (id.includes('motion')) {
                postFilters.push(`boxblur=luma_radius=${Math.round(8 * intensity)}:luma_power=1`);
            } else if (id === 'mov-dreamy-blur') {
                postFilters.push(`boxblur=luma_radius=5:luma_power=1,eq=brightness=0.1:saturation=1.5`);
            } else {
                postFilters.push(`boxblur=luma_radius=${Math.round(5 * intensity)}:luma_power=1`);
            }
            if (z === '1.0' || z === '1') z = '1.1';
        } else if (id.includes('mov-3d-')) {
            if (id.includes('flip-x')) { z = '1.2'; postFilters.push(`rotate=a='${2 * speed}*PI*t':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('flip-y')) { z = '1.2'; postFilters.push(`rotate=a='${2 * speed}*PI*t':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('tumble')) { z = `1.1+0.6*sin(${speed}*${time})`; postFilters.push(`rotate=a='${speed}*t':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('roll')) { z = '1.2'; postFilters.push(`rotate=a='2 * PI * t * ${speed}':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('spin-axis')) { z = '1.3'; postFilters.push(`rotate=a='${2 * speed}*PI*t/5':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('swing-l')) { z = '1.3'; x = `${centerX} - ${40 * intensity}*sin(${speed}*${time})`; }
            else if (id.includes('swing-r')) { z = '1.3'; x = `${centerX} + ${40 * intensity}*sin(${speed}*${time})`; }
            else if (id.includes('perspective-u')) { z = '1.3'; y = `${centerY} - ${40 * intensity}*sin(${speed}*${time})`; }
            else if (id.includes('perspective-d')) { z = '1.3'; y = `${centerY} + ${40 * intensity}*sin(${speed}*${time})`; }
            else if (id.includes('float')) { z = `1.2 + ${0.2 * intensity}*sin(${speed}*${time})`; postFilters.push(`rotate=a='${0.05 * intensity}*sin(${speed}*${time})':c=black@0:ow=iw:oh=ih`); }
        } else if (id.includes('slide-in') || id === 'pop-in' || id === 'fade-in' || id === 'swing-in') {
            const dur = (actualConfig.duration || 1) / speed;
            if (id === 'slide-in-left') { x = `(iw-ow)/2 - (iw)*(1-min(t/dur,1))`; z = '1.1'; }
            else if (id === 'slide-in-right') { x = `(iw-ow)/2 + (iw)*(1-min(t/dur,1))`; z = '1.1'; }
            else if (id === 'slide-in-bottom') { y = `(ih-oh)/2 + (ih)*(1-min(t/dur,1))`; z = '1.1'; }
            else if (id === 'pop-in') { z = `if(lt(t,${dur}), max(0.1, t/${dur}), 1.1)`; }
            else if (id === 'fade-in') { z = '1.1'; postFilters.push(`fade=t=in:st=0:d=${dur}`); }
            else if (id === 'swing-in') { z = '1.2'; postFilters.push(`rotate=a='if(lt(t,${dur}), -10*(1-t/${dur})*PI/180, 0)':c=black@0:ow=iw:oh=ih`); }
        } else if (id.includes('elastic') || id.includes('bounce') || id.includes('jelly') || id.includes('spring') || id.includes('squash') || id === 'mov-tada') {
            z = '1.3'; 
            if (id === 'mov-bounce-drop') { const amp = 200 * intensity; y = `${centerY} - ${amp}*exp(-3*${time}*${speed})*cos(15*${time}*${speed})`; } 
            else if (id === 'mov-elastic-snap-l') { const amp = 300 * intensity; x = `${centerX} - ${amp}*exp(-3*${time}*${speed})*cos(12*${time}*${speed})`; }
            else if (id === 'mov-elastic-snap-r') { const amp = 300 * intensity; x = `${centerX} + ${amp}*exp(-3*${time}*${speed})*cos(12*${time}*${speed})`; }
            else if (id === 'mov-rubber-band') { z = `1.3 + ${0.2 * intensity}*sin(10*${time}*${speed})`; }
            else if (id.includes('jelly')) { x = `${centerX} + ${10 * intensity}*sin(15*${time}*${speed})`; y = `${centerY} + ${10 * intensity}*cos(15*${time}*${speed})`; }
            else if (id === 'mov-spring-up') { const amp = 200 * intensity; y = `${centerY} + ${amp}*exp(-3*${time}*${speed})*cos(12*${time}*${speed})`; }
            else if (id === 'mov-spring-down') { const amp = 200 * intensity; y = `${centerY} - ${amp}*exp(-3*${time}*${speed})*cos(12*${time}*${speed})`; }
            else if (id === 'mov-pendulum-swing') { z = '1.4'; postFilters.push(`rotate=a='${0.2 * intensity}*sin(3*t*${speed})*exp(-0.2*t)':c=black@0:ow=iw:oh=ih`); }
            else if (id === 'mov-pop-up') { z = `1.1 + ${0.6 * intensity}*sin(PI*min(${time}*${speed},0.5))`; }
            else if (id === 'mov-squash-stretch') { z = `1.3 + ${0.15 * intensity}*sin(8*${time}*${speed})`; }
            else if (id === 'mov-tada') { z = '1.3'; postFilters.push(`rotate=a='${0.1 * intensity}*sin(10*t*${speed})*min(1,t)':c=black@0:ow=iw:oh=ih`); }
        } else if (id === 'mov-cinematic-bloom') {
            z = '1.1';
            postFilters.push(`unsharp=5:5:${1.0 * intensity}:5:5:0.0,eq=brightness=${0.05 * intensity}:contrast=${1 + 0.1 * intensity}`);
        } else if (id === 'mov-vhs-pro') {
            z = '1.1';
            postFilters.push(`noise=alls=${15 * intensity}:allf=t+u,eq=saturation=${1.5 * intensity}:contrast=${1.2 * intensity}`);
        } else if (id === 'mov-old-film') {
            z = '1.1';
            postFilters.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=${20 * intensity}:allf=t+u`);
        } else if (id === 'mov-cyber-neon') {
            z = '1.1';
            postFilters.push(`hue=h=360*t*${speed}/2,eq=saturation=${2 * intensity}`);
        } else if (id === 'mov-liquid-ripple') {
            z = `1.1 + ${0.05 * intensity}*sin(5*PI*${time}*${speed})`;
            postFilters.push(`rotate=a='${0.02 * intensity}*sin(2*PI*t*${speed})':c=black@0:ow=iw:oh=ih`);
        } else if (id === 'mov-prism-flare') {
            z = '1.1';
            postFilters.push(`eq=contrast=${1 + 0.3 * intensity}:saturation=${1 + 0.6 * intensity}`);
        } else if (id === 'mov-crt-scanline') {
            z = '1.1';
            postFilters.push(`noise=alls=${5 * intensity}:allf=t,eq=brightness=${0.05 * intensity}`);
        } else if (id === 'mov-speed-ramp') {
            z = `1.1 + ${0.4 * intensity}*pow(sin(PI*${time}*${speed}/2), 2)`;
        } else if (id === 'mov-vertigo-pro') {
            z = `1.1 + ${0.7 * intensity}*sin(PI*${time}*${speed}/${durationSec})`;
        } else if (id === 'mov-ai-depth-zoom') {
            z = `1.1 + ${0.4 * intensity}*sin(PI*${time}*${speed}/3)`;
            postFilters.push(`unsharp=3:3:0.5:3:3:0.5`);
        } else if (id === 'mov-ai-face-focus') {
            z = '1.2';
            x = `${centerX} + ${20 * intensity}*sin(2*PI*${time}*${speed}/4)`;
            y = `${centerY} + ${20 * intensity}*cos(2*PI*${time}*${speed}/4)`;
        } else if (id === 'mov-ai-object-tracking') {
            z = '1.15';
            x = `${centerX} - ${30 * intensity}*sin(PI*${time}*${speed}/2)`;
            y = `${centerY} - ${30 * intensity}*cos(PI*${time}*${speed}/2)`;
        } else if (id === 'mov-ai-sky-motion') {
            z = '1.2';
            y = `${centerY} - ${20 * intensity}*sin(PI*${time}*${speed}/5)`;
        } else if (id === 'mov-ai-particle-flow') {
            z = '1.1';
            postFilters.push(`noise=alls=${10 * intensity}:allf=t+u,eq=brightness=${0.02 * intensity}:contrast=${1 + 0.1 * intensity}`);
        } else if (id === 'mov-ai-glitch-art') {
            z = '1.1';
            postFilters.push(`hue=h=360*sin(PI*t*${speed}/2),noise=alls=${20 * intensity}:allf=t+u`);
        } else if (id === 'mov-ai-time-warp') {
            z = `1.1 + ${0.3 * intensity}*sin(PI*${time}*${speed}/2)*sin(PI*${time}*${speed}/2)`;
        } else if (id === 'mov-ai-color-shift') {
            z = '1.1';
            postFilters.push(`hue=h=360*t*${speed}/4,eq=saturation=${1.5 * intensity}`);
        } else if (id === 'mov-ai-perspective-warp') {
            z = '1.1';
            postFilters.push(`perspective=x0='iw/10*sin(t*${speed})':y0=0:x1='iw-iw/10*sin(t*${speed})':y1=0:x2=0:y2=ih:x3=iw:y3=ih`);
        } else if (id === 'mov-ai-cinematic-shake') {
            z = '1.15';
            x = `${centerX} + ${10 * intensity}*sin(2*PI*t*${speed}/2)`;
            y = `${centerY} + ${10 * intensity}*cos(2*PI*t*${speed}/1.5)`;
        } else if (id === 'photo-flash') {
            z = '1.12';
            postFilters.push(`eq=eval=frame:brightness='${0.3 * intensity}+${0.5 * intensity}*sin(${25 * speed}*t)'`);
        } else if (id === 'mov-flash-pulse') {
            z = '1.1';
            postFilters.push(`eq=eval=frame:brightness='${0.2 * intensity}+${0.2 * intensity}*sin(${10 * speed}*t)'`);
        } else if (isImage && !id) {
            z = `min(zoom+0.0015,1.5)`; 
        }

        // Apply movement using scale+crop instead of zoompan for better stability and stream support
        if (!isOverlay) {
            const zoomExpr = z;
            const xExpr = x.replace(/zoom/g, zoomExpr).replace(/iw/g, `(iw*${zoomExpr})`).replace(/ih/g, `(ih*${zoomExpr})`);
            const yExpr = y.replace(/zoom/g, zoomExpr).replace(/iw/g, `(iw*${zoomExpr})`).replace(/ih/g, `(ih*${zoomExpr})`);
            
            // Clean up expressions - in our scale+crop model:
            // x = (iw - ow)/2 for centering
            // After scale=w=iw*z:h=720*z, iw is the zoomed width, ow is target width (w)
            const finalX = x.includes('iw/2') ? `(iw-${w})/2` : x.replace(/zoom/g, zoomExpr).replace(/iw/g, `(iw)`).replace(/ih/g, `(ih)`);
            const finalY = y.includes('ih/2') ? `(ih-${h})/2` : y.replace(/zoom/g, zoomExpr).replace(/iw/g, `(iw)`).replace(/ih/g, `(ih)`);

            const scalePart = `scale=w='max(${w},trunc(iw*${zoomExpr}/2)*2)':h='max(${h},trunc(ih*${zoomExpr}/2)*2)':eval=frame`;
            const cropPart = `crop=w=${w}:h=${h}:x='${finalX}':y='${finalY}'`;
            
            zoomPanFilter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${scalePart},${cropPart}`;
        } else {
            // Overlays use simpler transformations
            if (z !== '1.0' && z !== '1') {
                postFilters.push(`scale=w='trunc(iw*${z}/2)*2':h='trunc(ih*${z}/2)*2':eval=frame`);
            }
        }
        
        const validPF = postFilters.filter(f => f && f.trim().length > 0);
        const finalFilterChain = [zoomPanFilter, ...validPF].filter(Boolean).join(',');
        
        return finalFilterChain ? `${finalFilterChain},format=yuv420p` : null;
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
            'fire-burn': 'dissolve', 'visual-buzz': 'pixelize', 'rip-diag': 'slideleft', 'zoom-neg': 'fade',
            'infinity-1': 'fade', 'digital-paint': 'pixelize', 'brush-wind': 'wipeleft', 'dust-burst': 'dissolve',
            'film-roll-v': 'slideup', 'astral-project': 'dissolve', 'lens-flare': 'fadewhite',
            'mosaic-small': 'pixelize', 'mosaic-large': 'pixelize',
            'triangle-wipe': 'diagtl', 'star-zoom': 'circleopen', 'spiral-wipe': 'radial', 'grid-flip': 'pixelize',
            'dots-reveal': 'circleopen', 'shutters': 'rectcrop', 'wipe-radial': 'radial', 'checkerboard': 'rectcrop',
            'diamond-zoom': 'diagtl', 'hex-reveal': 'circleopen', 'stripes-h': 'rectcrop', 'stripes-v': 'rectcrop',
            'plus-wipe': 'circleopen', 'checker-wipe': 'checkerboard', 'blind-h': 'hlslice', 'blind-v': 'vrslice',
            'barn-door-h': 'rectcrop', 'barn-door-v': 'rectcrop',
            'zoom-crash-in': 'fade', 'zoom-crash-out': 'fade',
            'zoomin': 'fade', 'zoomout': 'fade',
            'whip-diagonal-3': 'diagtl', 'whip-diagonal-4': 'diagbr',
            'glitch-rgb-hard': 'pixelize', 'smoke-burst': 'fade', 'light-speed': 'fadewhite',
            'ink-drop': 'circleopen', 'static-shock': 'pixelize', 'vhs-rewind': 'slideup',
            'hologram-glitch': 'pixelize', 'morph-ai': 'dissolve',
            'geo-swirl': 'circleopen', 'geo-hex': 'pixelize', 'geo-slice': 'hlslice', 'geo-shards': 'pixelize', 'geo-vortex': 'radial',
            'heart-wipe': 'circleopen',
            'zoom-blur-l': 'slideleft', 'zoom-blur-r': 'slideright', 'spin-zoom-in': 'fade', 'spin-zoom-out': 'fade',
            'whip-diagonal-1': 'diagtl', 'whip-diagonal-2': 'diagbr',
            'flash-bang': 'fadewhite', 'exposure': 'fadewhite', 'burn': 'dissolve', 'bokeh-blur': 'distance',
            'light-leak-tr': 'dissolve', 'flare-pass': 'slideleft', 'prism-split': 'distance', 'god-rays': 'dissolve',
            'elastic-left': 'slideleft', 'elastic-right': 'slideright', 'elastic-up': 'slideup', 'elastic-down': 'slidedown',
            'bounce-scale': 'fade', 'jelly': 'pixelize',
            'zoom-in': 'fade', 'zoom-out': 'fade', 'zoom-spin-fast': 'fade', 'spin-cw': 'fade', 'spin-ccw': 'fade',
            'whip-left': 'slideleft', 'whip-right': 'slideright', 'whip-up': 'slideup', 'whip-down': 'slidedown',
            'perspective-left': 'slideleft', 'perspective-right': 'slideright',
            'glitch-scan': 'dissolve', 'datamosh': 'pixelize', 'noise-jump': 'pixelize', 'cyber-slice': 'rectcrop',
            'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'distance',
            'scan-line-v': 'dissolve',
            'flashback': 'fadewhite', 'combine-overlay': 'dissolve', 'combine-mix': 'dissolve',
            'nightmare': 'pixelize', 'bubble-blur': 'circleopen', 'paper-unfold': 'slideleft',
            'corrupt-img': 'pixelize', 'glow-intense': 'fadewhite', 'dynamic-blur': 'dissolve',
            'flash-black': 'fadeblack', 'flash-white': 'fadewhite', 'pull-away': 'fade',
        };
        return map[id] || 'fade';
    }
};
