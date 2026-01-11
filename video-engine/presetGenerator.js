
module.exports = {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100'
    ],

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        const effects = {
            // Cinematic Pro
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.3:rs=-0.2:bs=-0.2,eq=contrast=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'boxblur=2:1,eq=brightness=0.1:saturation=1.2',
            'horror': 'hue=s=0,eq=contrast=1.5:brightness=-0.2,noise=alls=10:allf=t',
            'underwater': 'colorbalance=bs=0.4:gs=0.1:rs=-0.3,eq=contrast=0.9',
            'sunset': 'colorbalance=rs=0.3:gs=-0.1:bs=-0.2,eq=saturation=1.3',
            'posterize': 'eq=contrast=2.0:saturation=1.5',
            'fade': 'eq=contrast=0.8:brightness=0.1',
            'vibrant': 'eq=saturation=2.0',
            'muted': 'eq=saturation=0.5',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'golden-hour': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=saturation=1.2',
            'cold-blue': 'colorbalance=bs=0.3:rs=-0.1',
            'night-vision': 'hue=s=0,eq=brightness=0.1,colorbalance=gs=0.5,noise=alls=20:allf=t',
            'scifi': 'colorbalance=bs=0.2:gs=0.1,eq=contrast=1.3',
            'pastel': 'eq=saturation=0.7:brightness=0.1:contrast=0.9',

            // Estilos Artísticos
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'sketch-sim': 'hue=s=0,eq=contrast=5:brightness=0.3', 
            'invert': 'negate',
            'sepia-max': 'colorbalance=rs=0.4:gs=0.2:bs=-0.4',
            'high-contrast': 'eq=contrast=2.0',
            'low-light': 'eq=brightness=-0.3',
            'overexposed': 'eq=brightness=0.4',
            'radioactive': 'hue=h=90:s=2',
            'deep-fried': 'eq=saturation=3:contrast=2,unsharp=5:5:2.0',
            'ethereal': 'boxblur=3:1,eq=brightness=0.2',

            // Tendência & Filtros Básicos
            'dv-cam': 'eq=saturation=0.8,noise=alls=5:allf=t',
            'bling': 'eq=brightness=0.1',
            'soft-angel': 'boxblur=2:1,eq=brightness=0.1',
            'sharpen': 'unsharp=5:5:1.5:5:5:0.0',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5',
            'mono': 'hue=s=0',
            'bw': 'hue=s=0',
            'vintage': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=contrast=0.9',
            'dreamy': 'boxblur=2:1',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',

            // Glitch & Retro
            'glitch-pro-1': 'colorbalance=gs=0.1,noise=alls=10:allf=t',
            'glitch-pro-2': 'scale=iw/10:ih/10,scale=iw*10:ih*10:flags=neighbor',
            'vhs-distort': 'eq=saturation=1.5,boxblur=1:1,noise=alls=10:allf=t',
            'bad-signal': 'noise=alls=30:allf=t',
            'chromatic': 'colorbalance=rs=0.1:bs=0.1',
            'pixelate': 'scale=iw/20:ih/20,scale=iw*20:ih*20:flags=neighbor',
            'old-film': 'eq=saturation=0.5,noise=alls=15:allf=t',
            'dust': 'noise=alls=5:allf=t',
            'grain': 'noise=alls=15:allf=t',
            'vignette': 'eq=brightness=-0.1',
            'super8': 'eq=saturation=0.8:contrast=1.1,colorbalance=rs=0.1',
            'noise': 'noise=alls=20:allf=t'
        };

        if (effects[effectId]) return effects[effectId];

        // Procedural
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const c = 1 + (i % 5) * 0.1;
            const s = 1 + (i % 3) * 0.2;
            const h = (i * 15) % 360;
            return `eq=contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)},hue=h=${h}`;
        }
        if (effectId.startsWith('vintage-style-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const sepia = 0.1 + (i % 5) * 0.05;
            return `colorbalance=rs=${sepia.toFixed(2)}:bs=-${sepia.toFixed(2)},eq=contrast=0.9`;
        }
        if (effectId.startsWith('cyber-neon-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=contrast=1.2:saturation=1.5,hue=h=${i*10}`;
        }
        if (effectId.startsWith('nature-fresh-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=1.3:brightness=0.05,hue=h=-${i*2}`;
        }
        if (effectId.startsWith('art-duo-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,colorbalance=rs=${0.1 * (i%3)}:bs=${0.1 * (i%2)}`;
        }
        if (effectId.startsWith('noir-style-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,eq=contrast=${(1 + i*0.05).toFixed(2)}`;
        }
        if (effectId.startsWith('film-stock-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=0.8:contrast=1.1`;
        }
        if (effectId.startsWith('leak-overlay-') || effectId.startsWith('light-leak-')) {
            return 'eq=brightness=0.1:gamma=1.1';
        }

        return null;
    },

    getMovementFilter: (moveId, durationSec) => {
        const d = parseFloat(durationSec) || 5;
        const totalFrames = Math.ceil(d * 30);
        // Gera um ID único para os labels do filtro para evitar colisão no grafo
        const uid = Math.floor(Math.random() * 1000000);
        
        const base = `:d=1:s=1280x720:fps=30`; 
        
        // Helper to escape commas for FFmpeg expressions inside filter strings
        const esc = (s) => s.replace(/,/g, '\\,');

        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

        // Helper para efeito de Blur com Overlay e Zoom
        const blurWithZoom = (alphaExpr, zoomExpr = `min(1.0+(on*0.2/${totalFrames}),1.1)`) => {
            return `zoompan=z='${esc(zoomExpr)}':${center}${base},split=2[main${uid}][to_blur${uid}];[to_blur${uid}]boxblur=20:2[blurred${uid}];[main${uid}][blurred${uid}]overlay=x=0:y=0:alpha='${esc(alphaExpr)}':shortest=1`;
        };

        switch (moveId) {
            // === 0. BLUR (Focar/Desfocar com Movimento) ===
            case 'mov-blur-in':
                // Começa borrado (alpha 1) e fica nítido (alpha 0) no primeiro 1 segundo
                return blurWithZoom(`if(lt(t,1),1-t,0)`);
            
            case 'mov-blur-out':
                // Começa nítido (alpha 0) e fica borrado (alpha 1) no último 1 segundo
                return blurWithZoom(`if(gt(t,${d-1}),t-(${d}-1),0)`);
            
            case 'mov-blur-pulse':
                // Pulsa o blur
                return blurWithZoom(`0.5*(1+sin(t*5))`);
            
            case 'mov-blur-zoom':
                 // Zoom mais agressivo + Blur in
                 return blurWithZoom(`if(lt(t,1),1-t,0)`, `min(1.0+(on*0.8/${totalFrames}),1.5)`);
            
            case 'mov-blur-motion':
                 // Simula Motion Blur Horizontal (Blur estático direcional fake)
                 return `boxblur=luma_radius=10:luma_power=1`;

            // === 1. CINEMATIC PANS ===
            case 'mov-pan-slow-l': 
                return `zoompan=z=1.2:x='${esc(`(iw-iw/zoom)*(on/${totalFrames})`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-slow-r': 
                return `zoompan=z=1.2:x='${esc(`(iw-iw/zoom)*(1-(on/${totalFrames}))`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-slow-u': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='${esc(`(ih-ih/zoom)*(1-(on/${totalFrames}))`)}'${base}`;
            case 'mov-pan-slow-d': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='${esc(`(ih-ih/zoom)*(on/${totalFrames})`)}'${base}`;
            case 'mov-pan-fast-l': 
                return `zoompan=z=1.4:x='${esc(`(iw-iw/zoom)*(on/${totalFrames})`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-fast-r': 
                return `zoompan=z=1.4:x='${esc(`(iw-iw/zoom)*(1-(on/${totalFrames}))`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-diag-tl': 
                return `zoompan=z=1.4:x='${esc(`(iw-iw/zoom)*(on/${totalFrames})`)}':y='${esc(`(ih-ih/zoom)*(on/${totalFrames})`)}'${base}`;
            case 'mov-pan-diag-tr': 
                return `zoompan=z=1.4:x='${esc(`(iw-iw/zoom)*(1-(on/${totalFrames}))`)}':y='${esc(`(ih-ih/zoom)*(on/${totalFrames})`)}'${base}`;
            case 'mov-pan-diag-bl': 
                return `zoompan=z=1.4:x='${esc(`(iw-iw/zoom)*(on/${totalFrames})`)}':y='${esc(`(ih-ih/zoom)*(1-(on/${totalFrames}))`)}'${base}`;
            case 'mov-pan-diag-br': 
                return `zoompan=z=1.4:x='${esc(`(iw-iw/zoom)*(1-(on/${totalFrames}))`)}':y='${esc(`(ih-ih/zoom)*(1-(on/${totalFrames}))`)}'${base}`;

            // === 2. DYNAMIC ZOOMS ===
            case 'mov-zoom-crash-in': 
            case 'zoom-fast-in':
            case 'zoom-in':
                return `zoompan=z='${esc(`min(1.0+(on*2.0/${totalFrames}),3.0)`)}':${center}${base}`;
            case 'mov-zoom-crash-out': 
            case 'zoom-out':
                return `zoompan=z='${esc(`max(3.0-(on*2.0/${totalFrames}),1.0)`)}':${center}${base}`;
            case 'mov-zoom-slow-in':
            case 'zoom-slow-in':
            case 'kenBurns':
                 return `zoompan=z='${esc(`min(1.0+(on*0.3/${totalFrames}),1.3)`)}':${center}${base}`;
            case 'mov-zoom-slow-out':
            case 'zoom-slow-out':
                 return `zoompan=z='${esc(`max(1.3-(on*0.3/${totalFrames}),1.0)`)}':${center}${base}`;
            case 'mov-zoom-bounce-in':
            case 'zoom-bounce':
            case 'mov-zoom-bounce':
                 return `zoompan=z='${esc(`1.0+0.1*abs(sin(on*0.1))`)}':${center}${base}`;
            case 'mov-zoom-pulse-slow':
            case 'pulse':
                 return `zoompan=z='${esc(`1.0+0.05*sin(on*0.05)`)}':${center}${base}`;
            case 'mov-zoom-pulse-fast':
                 return `zoompan=z='${esc(`1.0+0.1*sin(on*0.2)`)}':${center}${base}`;
            case 'mov-dolly-vertigo':
            case 'dolly-zoom':
                 return `zoompan=z='${esc(`min(1.0+(on*1.0/${totalFrames}),2.0)`)}':${center}${base}`;
            case 'mov-zoom-twist-in':
                 return `rotate=a='0.1*t':c=black,zoompan=z='${esc(`min(1.0+(on*1.0/${totalFrames}),2.0)`)}':${center}${base}`;
            case 'mov-zoom-twist-out':
                 return `rotate=a='-0.1*t':c=black,zoompan=z='${esc(`max(2.0-(on*1.0/${totalFrames}),1.0)`)}':${center}${base}`;
            case 'mov-zoom-wobble':
                 return `zoompan=z='${esc(`1.1+0.05*sin(on*0.2)`)}':x='${esc(`iw/2-(iw/zoom/2)+10*sin(on*0.3)`)}':y='${esc(`ih/2-(ih/zoom/2)+10*cos(on*0.4)`)}'${base}`;
            case 'mov-zoom-shake':
                 return `zoompan=z='1.1':x='${esc(`iw/2-(iw/zoom/2)+random(1)*20-10`)}':y='${esc(`ih/2-(ih/zoom/2)+random(1)*20-10`)}'${base}`;

            // === 3. 3D TRANSFORMS ===
            case 'mov-3d-flip-x': 
                return `scale=w='${esc(`iw*abs(cos(t*2))`)}':h=ih,pad=1280:720:(1280-iw)/2:(720-ih)/2:black`;
            case 'mov-3d-flip-y':
                return `scale=w=iw:h='${esc(`ih*abs(cos(t*2))`)}',pad=1280:720:(1280-iw)/2:(720-ih)/2:black`;
            case 'mov-3d-spin-axis': 
            case 'spin-slow':
                return `rotate='t*0.5':ow=iw:oh=ih:c=black`;
            case 'mov-3d-swing-l':
            case 'pendulum':
                return `rotate='${esc(`sin(t*2)*0.1`)}':ow=iw:oh=ih:c=black`;
            case 'mov-3d-swing-r':
                return `rotate='${esc(`-sin(t*2)*0.1`)}':ow=iw:oh=ih:c=black`;
            case 'mov-3d-tumble':
                return `rotate='t':ow=iw:oh=ih:c=black`;
            case 'mov-3d-roll':
                return `rotate='t*2':ow=iw:oh=ih:c=black`;
            case 'mov-3d-float':
                return `zoompan=z='${esc(`1.05+0.02*sin(time)`)}':x='${esc(`iw/2-(iw/zoom/2)+10*sin(time*0.5)`)}':y='${esc(`ih/2-(ih/zoom/2)+10*cos(time*0.7)`)}'${base}`;

            // === 4. GLITCH & CHAOS ===
            case 'mov-glitch-snap':
                return `crop=w='${esc(`iw-mod(n,10)*10`)}':h=ih:x='${esc(`mod(n,10)*5`)}':y=0`;
            case 'mov-glitch-skid':
                 return `crop=x='${esc(`random(1)*20`)}':y='${esc(`random(1)*20`)}':w=iw-20:h=ih-20`;
            case 'mov-shake-violent':
            case 'shake-hard':
                 return `zoompan=z=1.2:x='${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*100`)}':y='${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*100`)}'${base}`;
            case 'mov-jitter-x':
            case 'jitter':
                 return `zoompan=z=1.05:x='${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*30`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-jitter-y':
                 return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)':y='${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*30`)}'${base}`;
            case 'mov-rgb-shift-move':
                 return `zoompan=z=1.1:x='${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*20`)}':y='ih/2-(ih/zoom/2)'${base},colorchannelmixer=rr=1:gg=0:bb=0:rb=0:br=0:bg=0`;
            case 'mov-strobe-move':
                return `eq=brightness='${esc(`if(lt(mod(n,10),5),0.5,-0.2)`)}'`;
            case 'mov-frame-skip':
                return `fps=10`;
            case 'mov-vhs-tracking':
                return `crop=iw:ih:0:'${esc(`if(eq(mod(n,30),0),10,0)`)}'`;

            // === 5. ELASTIC & FUN ===
            case 'mov-rubber-band':
            case 'mov-squash-stretch':
                 return `zoompan=z='${esc(`1.0+0.1*abs(sin(on*0.3))`)}':${center}${base}`;
            case 'mov-jelly-wobble':
                 return `zoompan=z='${esc(`1.05+0.05*sin(on*0.5)`)}':x='${esc(`iw/2-(iw/zoom/2)+5*sin(on*0.8)`)}':y='${esc(`ih/2-(ih/zoom/2)+5*cos(on*0.7)`)}'${base}`;
            case 'mov-spring-up':
                 return `zoompan=z=1:y='${esc(`if(lte(on,20), (ih)*(1-on/20), 0)`)}'${base}`;
            case 'mov-spring-down':
                 return `zoompan=z=1:y='${esc(`if(lte(on,20), -(ih)*(1-on/20), 0)`)}'${base}`;
            case 'mov-pop-up':
            case 'pop-in':
                return `zoompan=z='${esc(`if(lte(on,15),min(on/15,1.0),1.0)`)}':${center}${base}`;
            case 'mov-tada':
                 return `rotate='${esc(`if(lt(on,30), sin(on*0.5)*0.1, 0)`)}':c=black`;
            case 'mov-flash-pulse':
                 return `eq=brightness='${esc(`1+0.5*sin(t*10)`)}'`;
            case 'mov-bounce-drop':
                 return `zoompan=z='${esc(`if(lt(on,20),1.0+0.2*abs(cos(on*0.3)),1.0)`)}':${center}${base}`;
            case 'mov-elastic-snap-l':
                 return `zoompan=z=1.0:x='${esc(`if(lt(on,15),(iw/2)-(iw/2)*(1-on/15),iw/2)`)}':${center}${base}`;
            case 'mov-elastic-snap-r':
                 return `zoompan=z=1.0:x='${esc(`if(lt(on,15),(iw/2)+(iw/2)*(1-on/15),iw/2)`)}':${center}${base}`;
            case 'mov-pendulum-swing':
                 return `rotate='${esc(`sin(t*3)*0.1`)}':ow=iw:oh=ih:c=black`;

            // === 6. HANDHELD ===
            case 'handheld-1':
                 return `zoompan=z=1.05:x='${esc(`iw/2-(iw/zoom/2)+sin(on*0.05)*5`)}':y='${esc(`ih/2-(ih/zoom/2)+cos(on*0.07)*5`)}'${base}`;
            case 'handheld-2':
                 return `zoompan=z=1.1:x='${esc(`iw/2-(iw/zoom/2)+sin(on*0.1)*10`)}':y='${esc(`ih/2-(ih/zoom/2)+cos(on*0.15)*10`)}'${base}`;
            case 'earthquake':
                 return `zoompan=z=1.1:x='${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*40`)}':y='${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*40`)}'${base}`;

            // === 7. ENTRY ANIMATIONS ===
            case 'slide-in-left': 
                return `zoompan=z=1.0:x='${esc(`if(lte(on,30),(iw/2-(iw/zoom/2)) - (iw)*(1-on/30), iw/2-(iw/zoom/2))`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'slide-in-right':
                return `zoompan=z=1.0:x='${esc(`if(lte(on,30),(iw/2-(iw/zoom/2)) + (iw)*(1-on/30), iw/2-(iw/zoom/2))`)}':y='ih/2-(ih/zoom/2)'${base}`;
            case 'slide-in-bottom':
                return `zoompan=z=1.0:y='${esc(`if(lte(on,30),(ih/2-(ih/zoom/2)) + (ih)*(1-on/30), ih/2-(ih/zoom/2))`)}':x='iw/2-(iw/zoom/2)'${base}`;
            case 'fade-in':
                 return `colorchannelmixer=aa='${esc(`min(t,1)`)}'`;

            default:
                // Fallback for any unknown moveId that contains "zoom"
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z='${esc(`min(1.0+(on*0.3/${totalFrames}),1.3)`)}':${center}${base}`;
                }
                return null;
        }
    },

    getTransitionXfade: (transId) => {
        // Full mapping from frontend IDs to FFmpeg xfade transition names
        const map = {
            'fade-classic': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'black': 'fadeblack', 'white': 'fadewhite',
            'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright',
            'circle-open': 'circleopen', 'circle-close': 'circleclose',
            'diamond-in': 'diagtl', 'diamond-out': 'diagbr', 'diamond-zoom': 'diagtl',
            'clock-wipe': 'clock', 'iris-in': 'iris', 'iris-out': 'iris',
            'checker-wipe': 'checkerboard', 'checkerboard': 'checkerboard', 'grid-flip': 'checkerboard',
            'blind-h': 'hblur', 'blind-v': 'vblur', 'shutters': 'hblur', 'stripes-h': 'hblur', 'stripes-v': 'vblur',
            'triangle-wipe': 'diagtl', 'star-zoom': 'circleopen', 'spiral-wipe': 'spiral', 'heart-wipe': 'circleopen',
            'glitch': 'glitchdisplace', 'color-glitch': 'glitchmem', 'urban-glitch': 'glitchdisplace',
            'pixelize': 'pixelize', 'pixel-sort': 'pixelize', 'rgb-shake': 'rgbscanup', 'hologram': 'holographic',
            'block-glitch': 'mosaic', 'cyber-zoom': 'zoomin', 'scan-line-v': 'wipetl', 'color-tear': 'glitchmem',
            'digital-noise': 'noise', 'glitch-scan': 'rgbscanup', 'datamosh': 'glitchdisplace', 'rgb-split': 'glitchmem',
            'noise-jump': 'noise', 'cyber-slice': 'wipetl', 'glitch-chroma': 'glitchmem',
            'blood-mist': 'dissolve', 'black-smoke': 'fadeblack', 'white-smoke': 'fadewhite', 'fire-burn': 'dissolve',
            'visual-buzz': 'glitchdisplace', 'rip-diag': 'wipetl', 'zoom-neg': 'zoomin', 'infinity-1': 'dissolve',
            'digital-paint': 'dissolve', 'brush-wind': 'wipeleft', 'dust-burst': 'dissolve', 'filter-blur': 'blur',
            'film-roll-v': 'slideup', 'astral-project': 'dissolve', 'lens-flare': 'fadewhite', 'pull-away': 'zoomout',
            'flash-black': 'fadeblack', 'flash-white': 'fadewhite', 'flashback': 'fadewhite', 'combine-overlay': 'dissolve',
            'combine-mix': 'dissolve', 'nightmare': 'dissolve', 'bubble-blur': 'blur', 'paper-unfold': 'slideleft',
            'corrupt-img': 'pixelize', 'glow-intense': 'fadewhite', 'dynamic-blur': 'blur', 'blur-dissolve': 'blur',
            'liquid-melt': 'dissolve', 'ink-splash': 'dissolve', 'oil-paint': 'dissolve', 'water-ripple': 'ripple',
            'smoke-reveal': 'dissolve', 'bubble-pop': 'circleopen',
            'page-turn': 'coverleft', 'paper-rip': 'wipetl', 'burn-paper': 'dissolve', 'sketch-reveal': 'dissolve', 'fold-up': 'slideup',
            'cube-rotate-l': 'slideleft', 'cube-rotate-r': 'slideright', 'cube-rotate-u': 'slideup', 'cube-rotate-d': 'slidedown',
            'door-open': 'wipetl', 'flip-card': 'slideleft', 'room-fly': 'zoomin',
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout', 'zoom-spin-fast': 'zoomin', 'spin-cw': 'wipetl', 'spin-ccw': 'wipetr',
            'whip-left': 'whipleft', 'whip-right': 'whipright', 'whip-up': 'whipup', 'whip-down': 'whipdown',
            'perspective-left': 'slideleft', 'perspective-right': 'slideright', 'zoom-blur-l': 'whipleft', 'zoom-blur-r': 'whipright',
            'spin-zoom-in': 'zoomin', 'spin-zoom-out': 'zoomout', 'whip-diagonal-1': 'wipetl', 'whip-diagonal-2': 'wipetr',
            'flash-bang': 'fadewhite', 'exposure': 'fadewhite', 'burn': 'dissolve', 'bokeh-blur': 'blur',
            'light-leak-tr': 'fadewhite', 'flare-pass': 'wipeleft', 'prism-split': 'dissolve', 'god-rays': 'fadewhite',
            'elastic-left': 'slideleft', 'elastic-right': 'slideright', 'elastic-up': 'slideup', 'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin', 'jelly': 'wipetl',
            'luma-fade': 'fade', 'film-roll': 'slideup', 'blur-warp': 'blur'
        };
        return map[transId] || 'fade';
    }
};
