export default {
    getVideoArgs: () => [
        '-c:v', 'libx264', '-preset', 'ultrafast',
        '-profile:v', 'high', '-level', '4.1',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-vsync', '1', '-r', '30'
    ],

    getAudioArgs: () => ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'],
    getAudioExtractArgs: () => ['-vn', '-acodec', 'libmp3lame', '-q:a', '2'],

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // ── PROCEDURAIS ────────────────────────────────────────────────────────
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            return `eq=contrast=${(1+(i%5)*0.12).toFixed(2)}:saturation=${(1+(i%3)*0.25).toFixed(2)},hue=h=${(i*17)%360}`;
        }
        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
            const i = parseInt(vinMatch[1], 10);
            const s = 0.3 + (i%5)*0.1;
            return `eq=contrast=0.88:brightness=0.08:saturation=0.75,colorbalance=rs=${s.toFixed(2)}:gs=${(s*0.4).toFixed(2)}:bs=${(-s*0.8).toFixed(2)},vignette=angle=PI/4`;
        }
        const cyberMatch = effectId.match(/^cyber-neon-(\d+)$/);
        if (cyberMatch) {
            const i = parseInt(cyberMatch[1], 10);
            return `eq=contrast=1.4:saturation=2.2,hue=h=${i*13},unsharp=5:5:1.2:5:5:0`;
        }
        const natureMatch = effectId.match(/^nature-fresh-(\d+)$/);
        if (natureMatch) {
            const i = parseInt(natureMatch[1], 10);
            return `eq=saturation=1.5:brightness=0.04:contrast=1.05,hue=h=-${i*3}`;
        }
        const artDuoMatch = effectId.match(/^art-duo-(\d+)$/);
        if (artDuoMatch) {
            const i = parseInt(artDuoMatch[1], 10);
            return `hue=s=0,eq=contrast=1.6,colorbalance=rs=0.4:gs=-0.2:bs=${(i%2===0?0.3:-0.3).toFixed(1)},eq=saturation=3`;
        }
        const noirMatch = effectId.match(/^noir-style-(\d+)$/);
        if (noirMatch) {
            const i = parseInt(noirMatch[1], 10);
            return `hue=s=0,eq=contrast=${(1.3+i*0.05).toFixed(2)}:brightness=${(-0.05-i*0.02).toFixed(2)}`;
        }
        const filmMatch = effectId.match(/^film-stock-(\d+)$/);
        if (filmMatch) {
            return `eq=contrast=1.08:saturation=0.85:brightness=0.03,colorbalance=rs=0.08:gs=0.04:bs=-0.06,noise=alls=6:allf=t+u,vignette`;
        }
        const leakMatch = effectId.match(/^leak-overlay-(\d+)$/);
        if (leakMatch) {
            const i = parseInt(leakMatch[1], 10);
            const r = ((i*0.12)%0.5).toFixed(2);
            const g = ((i*0.07)%0.25).toFixed(2);
            return `colorbalance=rs=${r}:gs=${g}:bs=0,vignette=angle=PI/3,eq=brightness=0.05`;
        }

        // ── EFEITOS PADRÃO ─────────────────────────────────────────────────────
        const effects = {
            'warm':         'colorbalance=rs=0.15:gs=0.05:bs=-0.12,eq=saturation=1.15',
            'cool':         'colorbalance=rs=-0.1:gs=0.02:bs=0.18,eq=saturation=1.1',
            'vivid':        'eq=saturation=1.8:contrast=1.15,unsharp=3:3:0.8:3:3:0',
            'muted':        'eq=saturation=0.45:contrast=0.88:brightness=0.05',
            'mono':         'hue=s=0,eq=contrast=1.1',
            'vintage':      'eq=contrast=0.9:brightness=0.08:saturation=0.7,colorbalance=rs=0.25:gs=0.1:bs=-0.2,vignette',
            'vintage-warm': 'colorbalance=rs=0.3:gs=0.05:bs=-0.28,eq=saturation=0.82:contrast=1.1,vignette=angle=PI/5',
            'vintage-cool': 'colorbalance=rs=-0.15:gs=0.05:bs=0.25,eq=saturation=0.8:contrast=1.05,vignette',
            'teal-orange':  'colorbalance=rs=0.22:bs=-0.22:gs=0:rm=0.18:gm=0:bm=-0.18:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.4',
            'golden-hour':  'colorbalance=rs=0.3:gs=0.1:bs=-0.35,eq=saturation=1.4:brightness=0.06,vignette',
            'cold-blue':    'hue=h=215,eq=saturation=0.85:contrast=1.05,colorbalance=bs=0.15',
            'matrix':       'hue=h=95,eq=contrast=1.3:brightness=-0.08:saturation=1.8',
            'horror':       'hue=s=0.15,eq=contrast=1.6:brightness=-0.25,colorbalance=rs=0.2:bs=-0.1,vignette=angle=PI/3',
            'underwater':   'hue=h=195,eq=brightness=-0.15:contrast=1.25:saturation=1.3,colorbalance=bs=0.2',
            'sunset':       'colorbalance=rs=0.35:gs=0.08:bs=-0.4,eq=saturation=1.6:brightness=0.04,vignette',
            'scifi':        'eq=contrast=1.3:saturation=0.6,hue=h=185,colorbalance=bs=0.25,unsharp=3:3:1.0:3:3:0',
            'pastel':       'eq=brightness=0.18:saturation=0.65:contrast=0.88',
            'high-contrast':'eq=contrast=2.5:saturation=1.2',
            'low-light':    'eq=brightness=-0.4:contrast=1.6,colorbalance=bs=0.05',
            'overexposed':  'eq=brightness=0.45:contrast=0.75:saturation=0.9',
            'radioactive':  'hue=h=92,eq=saturation=3.5:contrast=1.2',
            'ethereal':     'eq=brightness=0.28:contrast=0.82:saturation=0.55,gblur=sigma=1.5',
            'noir':         'hue=s=0,eq=contrast=1.6:brightness=-0.12',
            'cyberpunk':    'eq=contrast=1.5:saturation=2.5,colorbalance=rs=0.15:bs=0.3,unsharp=5:5:1.5:5:5:0',
            'dreamy':       'gblur=sigma=2.2,eq=brightness=0.18:saturation=1.3,vignette=angle=PI/5',
            'dreamy-blur':  'gblur=sigma=2.8,eq=brightness=0.12:saturation=1.2,colorbalance=bs=0.05',
            'pop-art':      'eq=saturation=4:contrast=1.8',
            'posterize':    'eq=contrast=2.2:saturation=1.8',
            'invert':       'negate',
            'sepia-max':    'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
            'sketch-sim':   'hue=s=0,eq=contrast=6:brightness=0.6,unsharp=9:9:3:9:9:0',
            'b-and-w-low':  'hue=s=0,eq=contrast=0.75:brightness=0.05',
            'glitch-scan':  'drawgrid=y=0:h=3:t=1:c=black@0.6,hue=H=2*PI*t:s=1.8',
            'chromatic':    "geq=r='p(X+6,Y)':g='p(X,Y)':b='p(X-6,Y)':a='p(X,Y)'",
            'vhs-distort':  "noise=alls=22:allf=t+u,eq=saturation=1.6:contrast=1.3",
            'bad-signal':   'noise=alls=35:allf=t,eq=brightness=0.08:contrast=1.6',
            'glitch-pro-1': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=3*PI*t:s=2.0,noise=alls=8:allf=t',
            'glitch-pro-2': "boxblur=luma_radius='if(lt(mod(t,0.15),0.07),25,0)':luma_power=1",
            'deep-fried':   'eq=contrast=2.2:saturation=3.5,unsharp=7:7:2.5:7:7:0',
            'grain':        'noise=alls=12:allf=t+u',
            'dust':         'noise=alls=18:allf=t+u,eq=contrast=1.05',
            'old-film':     'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=22:allf=t+u,vignette',
            'super8':       'colorbalance=rs=0.15:gs=0.05:bs=-0.15,eq=contrast=1.15:saturation=0.8,noise=alls=15:allf=t+u,vignette',
            'dv-cam':       'colorbalance=rs=0.08:gs=0.03:bs=-0.05,eq=contrast=1.12,noise=alls=12:allf=t',
            'film-roll':    'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,vignette,noise=alls=10:allf=t',
            'vignette':     'vignette=angle=PI/3',
            'light-leak-1': 'colorbalance=rs=0.35:gs=0.12:bs=0,vignette=angle=PI/4',
            'light-leak-2': 'colorbalance=rs=0.12:gs=0.35:bs=0.22,vignette=angle=PI/4',
            'sun-flare':    'eq=brightness=0.12,vignette,colorbalance=rs=0.1:gs=0.05:bs=-0.05',
            'god-rays':     'unsharp=7:7:2.5:7:7:0,eq=brightness=0.08',
            'neon-glow':    'eq=saturation=2.5,unsharp=7:7:2.0:7:7:0',
            'bling':        'eq=brightness=0.15,unsharp=5:5:2.0:5:5:0,eq=saturation=1.3',
            'soft-angel':   'eq=brightness=0.22:contrast=0.88:saturation=0.85,gblur=sigma=1.2',
            'sharpen':      'unsharp=7:7:2.0:7:7:0,eq=contrast=1.35:saturation=1.25',
            'night-vision': 'hue=s=0,eq=contrast=1.5,unsharp=3:3:1.0:3:3:0',
            'cool-morning': 'hue=h=185,colorbalance=bs=0.12,eq=brightness=0.1:saturation=0.9',
            'strobe':       "eq=eval=frame:brightness='if(lt(mod(t,0.18),0.09),0.6,-0.25)'",
            'vibrant':      'eq=saturation=2.8:contrast=1.15,unsharp=3:3:0.5:3:3:0',
            'fade':         'eq=contrast=0.75:brightness=0.22:saturation=0.6',
            // CapCut Specials
            'capcut-retro':  'colorbalance=rs=0.2:gs=0.1:bs=-0.25,eq=saturation=0.75:contrast=1.1,noise=alls=8:allf=t,vignette=angle=PI/4',
            'capcut-aura':   'gblur=sigma=1.5,eq=brightness=0.15:saturation=1.4,unsharp=5:5:0.8:5:5:0',
            'capcut-punch':  'eq=contrast=1.6:saturation=2.0,unsharp=5:5:1.5:5:5:0',
            'capcut-dream':  'gblur=sigma=2.0,colorbalance=rs=0.08:gs=0.05:bs=0.15,eq=brightness=0.1:saturation=1.3',
            'capcut-fire':   'colorbalance=rs=0.4:gs=0.05:bs=-0.45,eq=saturation=2.0:contrast=1.4',
            'capcut-ice':    'colorbalance=rs=-0.2:gs=0.05:bs=0.35,eq=saturation=1.3:contrast=1.1',
            'capcut-gold':   'colorbalance=rs=0.3:gs=0.15:bs=-0.4,eq=saturation=1.8:contrast=1.2',
            'capcut-dark':   'eq=brightness=-0.3:contrast=1.5:saturation=1.4,vignette=angle=PI/3',
            'capcut-pink':   'colorbalance=rs=0.25:gs=-0.05:bs=0.1,eq=saturation=1.5:brightness=0.05',
            'capcut-matrix': 'hue=s=0,eq=contrast=1.4,unsharp=3:3:1.0:3:3:0',
        };
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w || 1280;
        const h = targetRes.h || 720;
        const id = moveId || '';
        const speed = config.speed || 1;
        const intensity = config.intensity || 1;

        const cx = `(iw/2)-(iw/zoom/2)`;
        const cy = `(ih/2)-(ih/zoom/2)`;
        const T = `(on/${fps})`;

        let z = '1.0', x = cx, y = cy;
        let postFilters = [];
        let dVal = isImage ? frames : 1;
        const preScale = !isImage ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` : '';

        if (id === 'pulse') { z = `1.0+${(0.06*intensity).toFixed(3)}*sin(2*PI*${T}*${speed})`; }
        else if (id === 'heartbeat') { z = `1.0+${(0.12*intensity).toFixed(3)}*abs(sin(3.5*PI*${T}*${speed}))`; }
        else if (id === 'float') { y = `${cy}-${(25*intensity).toFixed(1)}*sin(2*PI*${T}*${speed}/2.5)`; z='1.06'; }
        else if (id === 'wiggle') { postFilters.push(`rotate=a='${(0.06*intensity).toFixed(3)}*sin(2*PI*t*${speed})':c=black@0:ow=iw:oh=ih`); z='1.12'; }
        else if (id === 'spin-slow') { postFilters.push(`rotate=a='2*PI*t*${speed}/12':c=black@0:ow=iw:oh=ih`); z='1.25'; }
        else if (id === 'pendulum') { postFilters.push(`rotate=a='${(0.22*intensity).toFixed(3)}*sin(2*PI*t*${speed}/2.2)':c=black@0:ow=iw:oh=ih`); z='1.12'; }
        else if (id === 'handheld-1') { z='1.12'; x=`${cx}+${(8*intensity).toFixed(1)}*sin(2*PI*t*0.6)`; y=`${cy}+${(8*intensity).toFixed(1)}*cos(2*PI*t*0.8)`; }
        else if (id === 'handheld-2') { z='1.18'; x=`${cx}+${(18*intensity).toFixed(1)}*sin(2*PI*t*1.3)`; y=`${cy}+${(18*intensity).toFixed(1)}*cos(2*PI*t*1.6)`; }
        else if (id === 'shake-hard') { z='1.25'; postFilters.push(`crop=w=iw-${Math.round(40*intensity)}:h=ih-${Math.round(40*intensity)}:x='(iw-ow)/2+(random(1)-0.5)*${Math.round(40*intensity)}':y='(ih-oh)/2+(random(1)-0.5)*${Math.round(40*intensity)}',scale=${w}:${h}`); }
        else if (id === 'earthquake') { z='1.35'; postFilters.push(`crop=w=iw-${Math.round(70*intensity)}:h=ih-${Math.round(70*intensity)}:x='(iw-ow)/2+(random(1)-0.5)*${Math.round(70*intensity)}':y='(ih-oh)/2+(random(1)-0.5)*${Math.round(70*intensity)}',scale=${w}:${h}`); }
        else if (id === 'jitter') { z='1.12'; x=`${cx}+${(18*intensity).toFixed(1)}*floor(sin(2*PI*t*22))`; y=`${cy}+${(18*intensity).toFixed(1)}*floor(cos(2*PI*t*28))`; }
        else if (id === 'zoom-slow-in')  { z = `1.0+(${(0.35*intensity).toFixed(3)}*on/${frames/speed})`; }
        else if (id === 'zoom-fast-in')  { z = `1.0+(${(0.7*intensity).toFixed(3)}*on/${frames/speed})`; }
        else if (id === 'zoom-slow-out') { z = `${(1.3*intensity).toFixed(2)}-(${(0.3*intensity).toFixed(3)}*on/${frames/speed})`; }
        else if (id === 'zoom-bounce')   { z = `1.0+${(0.35*intensity).toFixed(3)}*abs(sin(PI*on/(${(30/speed).toFixed(1)}*0.5)))*exp(-on/${(30/speed).toFixed(1)})`; }
        else if (id === 'zoom-crash-in') { z = `min(zoom+${(0.18*speed*intensity).toFixed(3)},4.5)`; }
        else if (id === 'zoom-crash-out'){ z = `max(4.5-${(0.18*speed*intensity).toFixed(3)}*on,1.0)`; }
        else if (id === 'dolly-zoom')    { z = `1.0+${(0.6*intensity).toFixed(3)}*sin(PI*on/${frames/speed})`; }
        else if (id === 'mov-vertigo-pro') { z = `1.0+${(0.7*intensity).toFixed(3)}*sin(PI*${T}*${speed}/${durationSec})`; }
        else if (id === 'mov-speed-ramp') { z = `1.0+${(0.35*intensity).toFixed(3)}*pow(sin(PI*${T}*${speed}/2),2)`; }
        else if (id === 'mov-spiral-zoom') { z = `1.0+${(0.6*intensity).toFixed(3)}*t/${durationSec}`; postFilters.push(`rotate=a='${speed}*t*t':c=black@0:ow=iw:oh=ih`); }
        else if (id.includes('mov-pan-')) {
            z = '1.22';
            const dur = frames / speed;
            const rX = '(iw-iw/zoom)', bY = '(ih-ih/zoom)';
            if (id.includes('slow-l')) x = `${rX}-(${rX})*(on/${dur})`;
            else if (id.includes('slow-r')) x = `(${rX})*(on/${dur})`;
            else if (id.includes('slow-u')) y = `${bY}-(${bY})*(on/${dur})`;
            else if (id.includes('slow-d')) y = `(${bY})*(on/${dur})`;
            else if (id.includes('fast-l')) x = `${rX}-(${rX})*(min(1,1.8*on/${dur}))`;
            else if (id.includes('fast-r')) x = `(${rX})*(min(1,1.8*on/${dur}))`;
            else if (id.includes('diag-tl')) { x=`${rX}*(1-on/${dur})`; y=`${bY}*(1-on/${dur})`; }
            else if (id.includes('diag-tr')) { x=`${rX}*(on/${dur})`; y=`${bY}*(1-on/${dur})`; }
            else if (id.includes('diag-bl')) { x=`${rX}*(1-on/${dur})`; y=`${bY}*(on/${dur})`; }
            else if (id.includes('diag-br')) { x=`${rX}*(on/${dur})`; y=`${bY}*(on/${dur})`; }
        }
        else if (id === 'mov-blur-in')   { postFilters.push(`boxblur=luma_radius='if(lt(t,0.6),${(10*intensity).toFixed(0)}*(1-t/0.6),0)':luma_power=1`); }
        else if (id === 'mov-blur-out')  { postFilters.push(`boxblur=luma_radius='if(gt(t,${durationSec}-0.6),${(10*intensity).toFixed(0)}*(t-(${durationSec}-0.6))/0.6,0)':luma_power=1`); }
        else if (id === 'mov-blur-pulse') { postFilters.push(`boxblur=luma_radius='${(5*intensity).toFixed(1)}*(1+sin(2*PI*t*${speed}))':luma_power=1`); }
        else if (id === 'mov-blur-zoom') { z=`min(zoom+${(0.006*speed).toFixed(3)},1.6)`; postFilters.push(`boxblur=luma_radius=${Math.round(6*intensity)}:luma_power=1`); }
        else if (id === 'mov-blur-motion') { postFilters.push(`boxblur=luma_radius=${Math.round(9*intensity)}:luma_power=1`); }
        else if (id === 'mov-dreamy-blur') { postFilters.push(`boxblur=luma_radius=6:luma_power=1,eq=brightness=0.12:saturation=1.5`); }
        else if (id === 'mov-strobe-move') { z='1.06'; postFilters.push(`eq=eval=frame:brightness='if(lt(mod(t,${(0.12/speed).toFixed(3)}),${(0.06/speed).toFixed(3)}),${(0.5*intensity).toFixed(2)},${(-0.25*intensity).toFixed(2)})'`); }
        else if (id === 'mov-vhs-tracking') { z='1.06'; y=`${cy}+${(22*intensity).toFixed(1)}*sin(0.5*${T})`; x=`${cx}+${(3*intensity).toFixed(1)}*sin(${(110*speed).toFixed(1)}*${T})`; postFilters.push(`noise=alls=${Math.round(18*intensity)}:allf=t,eq=saturation=1.5:contrast=1.15`); }
        else if (id === 'rgb-split-anim' || id === 'mov-rgb-shift-move') { z='1.06'; postFilters.push(`geq=r='p(X+${(18*intensity).toFixed(1)}*sin(${(12*speed).toFixed(1)}*T),Y)':g='p(X,Y)':b='p(X-${(18*intensity).toFixed(1)}*sin(${(12*speed).toFixed(1)}*T),Y)'`); }
        else if (id === 'mov-jitter-x') { z='1.12'; x=`${cx}+${(25*intensity).toFixed(1)}*sin(${(55*speed).toFixed(1)}*${T})`; }
        else if (id === 'mov-jitter-y') { z='1.12'; y=`${cy}+${(25*intensity).toFixed(1)}*sin(${(55*speed).toFixed(1)}*${T})`; }
        else if (id === 'mov-shake-violent') { z='1.25'; x=`${cx}+${(45*intensity).toFixed(1)}*sin(${(48*speed).toFixed(1)}*${T})`; y=`${cy}+${(45*intensity).toFixed(1)}*sin(${(68*speed).toFixed(1)}*${T})`; }
        else if (id === 'mov-glitch-skid') { z='1.12'; x=`${cx}+(iw/28)*${intensity}*sin(${(12*speed).toFixed(1)}*${T})`; }
        else if (id === 'mov-glitch-snap') { z='1.06'; x=`${cx}+${(28*intensity).toFixed(1)}*sin(${(48*speed).toFixed(1)}*${T})`; y=`${cy}+${(18*intensity).toFixed(1)}*cos(${(48*speed).toFixed(1)}*${T})`; }
        else if (id === 'mov-digital-tear') { z='1.06'; postFilters.push(`geq=r='if(gt(sin(Y/8+t*12),0),p(X+${(22*intensity).toFixed(1)},Y),p(X,Y))':g='p(X,Y)':b='if(lt(sin(Y/8+t*12),0),p(X-${(22*intensity).toFixed(1)},Y),p(X,Y))'`); }
        else if (id === 'mov-glitch-vortex') { z='1.25'; postFilters.push(`lenscorrection=k1=${(0.22*intensity).toFixed(3)}*sin(${speed}*t)`); }
        else if (id === 'mov-mirage-wave') { postFilters.push(`geq=r='p(X+${(18*intensity).toFixed(1)}*sin(Y/18+${speed}*T),Y)':g='p(X,Y)':b='p(X-${(18*intensity).toFixed(1)}*sin(Y/18+${speed}*T),Y)'`); }
        else if (id === 'mov-chromatic-pulse') { postFilters.push(`geq=r='p(X+${(8*intensity).toFixed(1)}*sin(${speed}*T),Y)':g='p(X,Y)':b='p(X-${(8*intensity).toFixed(1)}*sin(${speed}*T),Y)'`); }
        else if (id === 'mov-cinematic-bloom') { postFilters.push(`unsharp=5:5:${(1.2*intensity).toFixed(2)}:5:5:0,eq=brightness=${(0.06*intensity).toFixed(3)}:contrast=${(1+0.12*intensity).toFixed(2)}`); }
        else if (id === 'mov-vhs-pro') { postFilters.push(`noise=alls=${Math.round(18*intensity)}:allf=t+u,eq=saturation=${(1.6*intensity).toFixed(2)}:contrast=${(1.25*intensity).toFixed(2)}`); }
        else if (id === 'mov-old-film') { postFilters.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=${Math.round(22*intensity)}:allf=t+u,vignette`); }
        else if (id === 'mov-cyber-neon') { postFilters.push(`hue=h=360*t*${speed}/2,eq=saturation=${(2.2*intensity).toFixed(2)}`); }
        else if (id === 'mov-liquid-ripple') { z=`1.03+${(0.025*intensity).toFixed(3)}*sin(6*PI*${T}*${speed})`; postFilters.push(`rotate=a='${(0.025*intensity).toFixed(3)}*sin(2.5*PI*t*${speed})':c=black@0:ow=iw:oh=ih`); }
        else if (id === 'mov-prism-flare') { postFilters.push(`eq=contrast=${(1+0.35*intensity).toFixed(2)}:saturation=${(1+0.7*intensity).toFixed(2)}`); }
        else if (id === 'mov-crt-scanline') { postFilters.push(`noise=alls=${Math.round(6*intensity)}:allf=t,drawgrid=w=iw:h=2:c=black@0.4:t=1`); }
        else if (id === 'mov-zoom-warp') { z=`1.0+${(0.25*intensity).toFixed(3)}*sin(${speed}*t)`; postFilters.push(`lenscorrection=k1=${(0.12*intensity).toFixed(3)}*sin(${speed}*t):k2=${(0.06*intensity).toFixed(3)}*cos(${speed}*t)`); }
        else if (id === 'mov-scanline-flicker') { postFilters.push(`drawgrid=w=iw:h=2:c=black@0.5:t=1`); postFilters.push(`eq=brightness='${(0.12*intensity).toFixed(3)}*sin(55*t*${speed})'`); }
        else if (id === 'mov-vignette-pulse') { postFilters.push(`vignette=angle='PI/4+${(0.35*intensity).toFixed(3)}*sin(${speed}*t)':x0=iw/2:y0=ih/2`); }
        else if (id === 'mov-edge-glow') { postFilters.push(`edgedetect=low=0.1:high=0.4,format=rgba,colorchannelmixer=rr=${1+intensity}:gg=${1+intensity}:bb=${1+intensity}`); }
        else if (id === 'mov-pixel-drift') { const ps=Math.max(2,Math.round(10*intensity)); postFilters.push(`scale=iw/${ps}:-1,scale=${w}:${h}:flags=neighbor`); }
        else if (id === 'mov-kaleidoscope') { z='1.25'; postFilters.push(`crop=iw/2:ih/2:0:0,split=4[ka][kb][kc][kd];[kb]hflip[kb1];[kc]vflip[kc1];[kd]hflip,vflip[kd1];[ka][kb1]hstack[ktop];[kc1][kd1]hstack[kbot];[ktop][kbot]vstack,scale=${w}:${h}`); }
        else if (id === 'mov-ai-depth-zoom') { z=`1.0+${(0.35*intensity).toFixed(3)}*sin(PI*${T}*${speed}/3.5)`; postFilters.push(`unsharp=3:3:0.6:3:3:0.3`); }
        else if (id === 'mov-ai-face-focus') { z='1.12'; x=`${cx}+${(22*intensity).toFixed(1)}*sin(2*PI*${T}*${speed}/4.5)`; y=`${cy}+${(22*intensity).toFixed(1)}*cos(2*PI*${T}*${speed}/4.5)`; }
        else if (id === 'mov-ai-object-tracking') { z='1.06'; x=`${cx}-${(35*intensity).toFixed(1)}*sin(PI*${T}*${speed}/2.5)`; y=`${cy}-${(35*intensity).toFixed(1)}*cos(PI*${T}*${speed}/2.5)`; }
        else if (id === 'mov-ai-sky-motion') { z='1.12'; y=`${cy}-${(22*intensity).toFixed(1)}*sin(PI*${T}*${speed}/5.5)`; }
        else if (id === 'mov-ai-particle-flow') { postFilters.push(`noise=alls=${Math.round(12*intensity)}:allf=t+u,eq=brightness=${(0.025*intensity).toFixed(3)}:contrast=${(1+0.12*intensity).toFixed(2)}`); }
        else if (id === 'mov-ai-glitch-art') { postFilters.push(`hue=h=360*sin(PI*t*${speed}/2.5),noise=alls=${Math.round(22*intensity)}:allf=t+u`); }
        else if (id === 'mov-ai-time-warp') { z=`1.0+${(0.25*intensity).toFixed(3)}*sin(PI*${T}*${speed}/2)*sin(PI*${T}*${speed}/2)`; }
        else if (id === 'mov-ai-color-shift') { postFilters.push(`hue=h=360*t*${speed}/4.5,eq=saturation=${(1.6*intensity).toFixed(2)}`); }
        else if (id === 'mov-ai-perspective-warp') { postFilters.push(`perspective=x0='iw/9*sin(t*${speed})':y0=0:x1='iw-iw/9*sin(t*${speed})':y1=0:x2=0:y2=ih:x3=iw:y3=ih`); }
        else if (id === 'mov-ai-cinematic-shake') { z='1.06'; x=`${cx}+${(12*intensity).toFixed(1)}*sin(2*PI*t*${speed}/2.2)`; y=`${cy}+${(12*intensity).toFixed(1)}*cos(2*PI*t*${speed}/1.6)`; }
        else if (id === 'pop-in') { z=`if(lt(on,${Math.round(frames*0.3)}),max(0.1,on/${Math.round(frames*0.3)}),1.0)`; }
        else if (id === 'fade-in') { postFilters.push(`fade=t=in:st=0:d=${Math.min(durationSec*0.4,1.5)}`); }
        else if (id === 'swing-in') { z='1.12'; postFilters.push(`rotate=a='if(lt(t,1),-12*(1-t)*PI/180,0)':c=black@0:ow=iw:oh=ih`); }
        else if (id === 'slide-in-left') { x=`(iw-ow)/2-(iw)*(1-min(1,on/${Math.round(frames*0.3)}))`; z='1.0'; }
        else if (id === 'slide-in-right') { x=`(iw-ow)/2+(iw)*(1-min(1,on/${Math.round(frames*0.3)}))`; z='1.0'; }
        else if (id === 'slide-in-bottom') { y=`(ih-oh)/2+(ih)*(1-min(1,on/${Math.round(frames*0.3)}))`; z='1.0'; }
        else if (id === 'mov-bounce-drop') { y=`${cy}-${(220*intensity).toFixed(1)}*exp(-3*${T}*${speed})*cos(16*${T}*${speed})`; z='1.22'; }
        else if (id === 'mov-elastic-snap-l') { x=`${cx}-${(320*intensity).toFixed(1)}*exp(-3.5*${T}*${speed})*cos(13*${T}*${speed})`; z='1.22'; }
        else if (id === 'mov-elastic-snap-r') { x=`${cx}+${(320*intensity).toFixed(1)}*exp(-3.5*${T}*${speed})*cos(13*${T}*${speed})`; z='1.22'; }
        else if (id === 'mov-rubber-band') { z=`1.22+${(0.18*intensity).toFixed(3)}*sin(11*${T}*${speed})`; }
        else if (id === 'mov-spring-up') { y=`${cy}+${(220*intensity).toFixed(1)}*exp(-3*${T}*${speed})*cos(13*${T}*${speed})`; z='1.22'; }
        else if (id === 'mov-spring-down') { y=`${cy}-${(220*intensity).toFixed(1)}*exp(-3*${T}*${speed})*cos(13*${T}*${speed})`; z='1.22'; }
        else if (id === 'mov-pop-up') { z=`1.0+${(0.6*intensity).toFixed(3)}*sin(PI*min(${T}*${speed},0.5))`; }
        else if (id === 'mov-squash-stretch') { z=`1.22+${(0.12*intensity).toFixed(3)}*sin(9*${T}*${speed})`; }
        else if (id === 'mov-tada') { z='1.22'; postFilters.push(`rotate=a='${(0.12*intensity).toFixed(3)}*sin(11*t*${speed})*min(1,t)':c=black@0:ow=iw:oh=ih`); }
        else if (id === 'mov-pendulum-swing') { z='1.35'; postFilters.push(`rotate=a='${(0.22*intensity).toFixed(3)}*sin(3.5*t*${speed})*exp(-0.2*t)':c=black@0:ow=iw:oh=ih`); }
        else if (id.includes('jelly')) { x=`${cx}+${(12*intensity).toFixed(1)}*sin(16*${T}*${speed})`; y=`${cy}+${(12*intensity).toFixed(1)}*cos(16*${T}*${speed})`; z='1.22'; }
        else if (id.includes('mov-3d-')) {
            if (id.includes('flip-x')) { z='1.12'; postFilters.push(`rotate=a='${(2.2*speed).toFixed(2)}*PI*t':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('flip-y')) { z='1.12'; postFilters.push(`rotate=a='${(2.2*speed).toFixed(2)}*PI*t':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('tumble')) { z=`1.0+0.6*sin(${speed}*${T})`; postFilters.push(`rotate=a='${speed}*t':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('roll')) { postFilters.push(`rotate=a='2*PI*t*${speed}':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('spin-axis')) { z='1.25'; postFilters.push(`rotate=a='${(2.2*speed).toFixed(2)}*PI*t/5':c=black@0:ow=iw:oh=ih`); }
            else if (id.includes('swing-l')) { z='1.25'; x=`${cx}-${(45*intensity).toFixed(1)}*sin(${speed}*${T})`; }
            else if (id.includes('swing-r')) { z='1.25'; x=`${cx}+${(45*intensity).toFixed(1)}*sin(${speed}*${T})`; }
            else if (id.includes('float')) { z=`1.12+${(0.12*intensity).toFixed(3)}*sin(${speed}*${T})`; postFilters.push(`rotate=a='${(0.06*intensity).toFixed(3)}*sin(${speed}*${T})':c=black@0:ow=iw:oh=ih`); }
        }
        else if (id === 'kenBurns') {
            const ss=config.startScale||1.0, es=config.endScale||1.4;
            const period=6.5/speed, mid=(ss+es)/2, amp=((es-ss)/2)*intensity;
            z = `${mid.toFixed(3)}+${amp.toFixed(3)}*sin(2*PI*${T}/${period.toFixed(2)}-PI/2)`;
            if (config.startX !== undefined || config.endX !== undefined) {
                const sX=config.startX||0,eX=config.endX||0,mX=(sX+eX)/2,aX=((eX-sX)/2)*intensity;
                x = `${cx}+(iw/100)*(${mX.toFixed(2)}+${aX.toFixed(2)}*sin(2*PI*${T}/${period.toFixed(2)}-PI/2))`;
            }
            if (config.startY !== undefined || config.endY !== undefined) {
                const sY=config.startY||0,eY=config.endY||0,mY=(sY+eY)/2,aY=((eY-sY)/2)*intensity;
                y = `${cy}+(ih/100)*(${mY.toFixed(2)}+${aY.toFixed(2)}*sin(2*PI*${T}/${period.toFixed(2)}-PI/2))`;
            }
        }
        else if (id === 'parallax') {
            const pI=(config.intensity||65)*intensity;
            const dir=(config.direction||0)*(Math.PI/180);
            const mX=Math.cos(dir)*pI, mY=Math.sin(dir)*pI;
            z='1.45';
            const period=6.5/speed;
            x=`${cx}+${mX.toFixed(1)}*sin(2*PI*${T}/${period.toFixed(2)})`;
            y=`${cy}+${mY.toFixed(1)}*sin(2*PI*${T}/${period.toFixed(2)})`;
        }
        else if (id === 'photo-flash') { z='1.03'; postFilters.push(`eq=eval=frame:brightness='${(0.35*intensity).toFixed(2)}+${(0.55*intensity).toFixed(2)}*sin(${(28*speed).toFixed(1)}*t)'`); }
        else if (id === 'mov-flash-pulse') { z='1.0'; postFilters.push(`eq=eval=frame:brightness='${(0.25*intensity).toFixed(2)}+${(0.25*intensity).toFixed(2)}*sin(${(12*speed).toFixed(1)}*t)'`); }
        else if (isImage && !id) { z=`min(zoom+0.0018,1.55)`; }

        const zpFilter = `${preScale}zoompan=z='${z}':x='${x}':y='${y}':d=${dVal}:s=${w}x${h}:fps=${fps}`;
        const valid = postFilters.filter(f => f && f.trim().length > 0);
        const chain = valid.length > 0 ? `${zpFilter},${valid.join(',')}` : zpFilter;
        return `${chain},format=yuv420p`;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade':'fade','crossfade':'fade','mix':'fade','dissolve':'dissolve','luma-fade':'fade',
            'blur-dissolve':'distance','filter-blur':'distance','bokeh-blur':'distance','blur-warp':'distance','dynamic-blur':'distance',
            'black':'fadeblack','white':'fadewhite','flash':'fadewhite','flash-white':'fadewhite',
            'flash-black':'fadeblack','black-smoke':'fadeblack','white-smoke':'fadewhite',
            'flashback':'fadewhite','glow-intense':'fadewhite','flash-bang':'fadewhite','exposure':'fadewhite',
            'wipe-left':'wipeleft','wipe-right':'wiperight','wipe-up':'wipeup','wipe-down':'wipedown',
            'wipe-radial':'radial','clock-wipe':'radial','spiral-wipe':'radial',
            'slide-left':'slideleft','slide-right':'slideright','slide-up':'slideup','slide-down':'slidedown',
            'push-left':'slideleft','push-right':'slideright','push-up':'slideup','push-down':'slidedown',
            'elastic-left':'slideleft','elastic-right':'slideright','elastic-up':'slideup','elastic-down':'slidedown',
            'whip-left':'slideleft','whip-right':'slideright','whip-up':'slideup','whip-down':'slidedown',
            'perspective-left':'slideleft','perspective-right':'slideright',
            'paper-rip':'slideup','film-roll-v':'slideup','film-roll':'slideup','paper-unfold':'slideleft',
            'page-turn':'slideleft','brush-wind':'wipeleft','flare-pass':'slideleft',
            'wave':'slideleft','stretch-h':'slideleft','stretch-v':'slideup',
            'water-ripple':'slideleft','zoom-blur-l':'slideleft','zoom-blur-r':'slideright',
            'cube-rotate-l':'slideleft','cube-rotate-r':'slideright','cube-rotate-u':'slideup','cube-rotate-d':'slidedown',
            'zoom-in':'zoomin','zoom-out':'zoomout','zoom-neg':'zoomout','infinity-1':'zoomin',
            'spin-zoom-in':'zoomin','spin-zoom-out':'zoomout','pull-away':'zoomout','bounce-scale':'zoomin',
            'circle-open':'circleopen','circle-close':'circleclose','iris-in':'circleopen','iris-out':'circleclose',
            'swirl':'circleopen','water-drop':'circleopen','ink-splash':'circleopen',
            'dots-reveal':'circleopen','hex-reveal':'circleopen','star-zoom':'circleopen',
            'heart-wipe':'circleopen','bubble-blur':'circleopen','bubble-pop':'circleopen',
            'pixelize':'pixelize','glitch':'pixelize','glitch-chroma':'pixelize','pixel-sort':'pixelize',
            'datamosh':'pixelize','noise-jump':'pixelize','digital-paint':'pixelize','visual-buzz':'pixelize',
            'corrupt-img':'pixelize','nightmare':'pixelize','jelly':'pixelize','grid-flip':'pixelize',
            'mosaic-small':'pixelize','mosaic-large':'pixelize',
            'color-glitch':'dissolve','urban-glitch':'dissolve','liquid-melt':'dissolve','morph':'dissolve',
            'turbulence':'dissolve','fire-burn':'dissolve','blood-mist':'dissolve','dust-burst':'dissolve',
            'astral-project':'dissolve','god-rays':'dissolve','combine-overlay':'dissolve','combine-mix':'dissolve',
            'burn':'dissolve','light-leak-tr':'dissolve','prism-split':'distance','rgb-split':'distance',
            'scan-line-v':'dissolve','glitch-scan':'dissolve',
            'diamond-in':'diagtl','diamond-out':'diagbr','triangle-wipe':'diagtl','diamond-zoom':'diagtl',
            'whip-diagonal-1':'diagtl','whip-diagonal-2':'diagbr',
            'kaleidoscope':'hlslice','fade-classic':'fade','lens-flare':'fadewhite',
            'checkerboard':'rectcrop','shutters':'rectcrop','stripes-h':'rectcrop','stripes-v':'rectcrop',
            'spin-cw':'rotateccw','spin-ccw':'rotatecw','zoom-spin-fast':'zoomin',
            'cyber-slice':'rectcrop','rgb-shake':'distance','hologram':'distance',
            'block-glitch':'pixelize','cyber-zoom':'zoomin','color-tear':'dissolve',
            'digital-noise':'pixelize','oil-paint':'dissolve','smoke-reveal':'fadeblack',
            'burn-paper':'fadeblack','sketch-reveal':'dissolve','fold-up':'slideup',
            'door-open':'slideleft','flip-card':'horzflip','room-fly':'zoomin',
        };
        return map[id] || 'fade';
    }
};
