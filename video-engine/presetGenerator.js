
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

    getAudioExtractArgs: () => [
        '-vn', 
        '-acodec', 'libmp3lame', 
        '-q:a', '2'
    ],

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // 1. Static Dictionary for Famous/Complex Effects
        const effects = {
            // --- Cinematic Pro ---
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

            // --- Artistic Styles ---
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

            // --- Trends & Basics ---
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

            // --- Glitch & Retro ---
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

        // 2. Procedural Generation for "Massive" Lists (cg-pro-1 to cg-pro-50, etc)
        
        // Color Grade (1-50)
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const c = 1 + (i % 5) * 0.1; // Contrast variation
            const s = 1 + (i % 3) * 0.2; // Saturation variation
            const h = (i * 15) % 360;    // Hue rotation
            return `eq=contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)},hue=h=${h}`;
        }
        
        // Vintage Style (1-30)
        if (effectId.startsWith('vintage-style-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const sepia = 0.1 + (i % 5) * 0.05;
            return `colorbalance=rs=${sepia.toFixed(2)}:bs=-${sepia.toFixed(2)},eq=contrast=0.9`;
        }
        
        // Cyber Neon (1-20)
        if (effectId.startsWith('cyber-neon-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=contrast=1.2:saturation=1.5,hue=h=${i*10}`;
        }
        
        // Nature Fresh (1-20)
        if (effectId.startsWith('nature-fresh-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=1.3:brightness=0.05,hue=h=-${i*2}`;
        }
        
        // Art Duotone (1-30)
        if (effectId.startsWith('art-duo-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,colorbalance=rs=${0.1 * (i%3)}:bs=${0.1 * (i%2)}`;
        }
        
        // Noir Style (1-20)
        if (effectId.startsWith('noir-style-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,eq=contrast=${(1 + i*0.05).toFixed(2)}`;
        }
        
        // Film Stock (1-20)
        if (effectId.startsWith('film-stock-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=0.8:contrast=1.1`;
        }
        
        // Light Leaks (Overlay Logic handled in frontend/builder, here just basic brightness boost)
        if (effectId.startsWith('leak-overlay-') || effectId.startsWith('light-leak-')) {
            return 'eq=brightness=0.1:gamma=1.1';
        }

        return null;
    },

    getMovementFilter: (moveId, durationSec, isImage, config = {}) => {
        // === CRITICAL: MOVEMENT DURATION DEFAULT TO 8 SECONDS ===
        const d = parseFloat(durationSec) || 8.0; 
        const totalFrames = Math.ceil(d * 30);
        const uid = Math.floor(Math.random() * 1000000);
        
        // FIX: Increased supersampling to 3840x2160 (4K) to eliminate pixel tremor/jitter during zoom
        // This is a trade-off: uses more RAM than 1080p, but much less than 8K (which crashed).
        // 4K provides smooth sub-pixel interpolation.
        const base = `:d=1:s=3840x2160:fps=30`; 
        
        const esc = (s) => s.replace(/,/g, '\\,');
        const center = "x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)";

        const speed = parseFloat(config.speed || config.intensity || 1);

        // Helper for Blur calculations
        const blurDuration = Math.min(d, 8.0) / speed; 
        
        const blurWithZoom = (alphaFilter, zoomExpr = `(1.0+(0.1*${speed}*on/${totalFrames}))`) => {
            return `zoompan=z=${esc(zoomExpr)}:${center}${base},split=2[main${uid}][to_blur${uid}];[to_blur${uid}]boxblur=40:5,format=yuva420p,${alphaFilter}[blurred${uid}];[main${uid}][blurred${uid}]overlay=x=0:y=0:shortest=1`;
        };

        switch (moveId) {
            // === 0. BLUR (Focus/Defocus) ===
            case 'mov-blur-in':
                return blurWithZoom(`fade=t=out:st=0:d=${blurDuration}:alpha=1`);
            case 'mov-blur-out':
                const startTime = Math.max(0, d - blurDuration);
                return blurWithZoom(`fade=t=in:st=${startTime}:d=${blurDuration}:alpha=1`);
            case 'mov-blur-pulse':
                return blurWithZoom(`geq=a='128*(1+sin(T*3*${speed}))'`);
            case 'mov-blur-zoom':
                 return blurWithZoom(`fade=t=out:st=0:d=${blurDuration}:alpha=1`, `min(1.0+(on*0.8*${speed}/${totalFrames}),1.5)`);
            case 'mov-blur-motion':
                 return `boxblur=luma_radius=${15*speed}:luma_power=2`;

            // === 1. CINEMATIC PANS (Standardized Math) ===
            case 'mov-pan-slow-l': 
                return `zoompan=z=${1.1 + (0.1 * speed)}:x=${esc(`(iw-iw/zoom)*(on/(${totalFrames}))`)}:y=ih/2-(ih/zoom/2)${base}`;
            case 'mov-pan-slow-r': 
                return `zoompan=z=${1.1 + (0.1 * speed)}:x=${esc(`(iw-iw/zoom)*(1-(on/(${totalFrames})))`)}:y=ih/2-(ih/zoom/2)${base}`;
            case 'mov-pan-slow-u': 
                return `zoompan=z=${1.1 + (0.1 * speed)}:x=iw/2-(iw/zoom/2):y=${esc(`(ih-ih/zoom)*(1-(on/(${totalFrames})))`)}${base}`;
            case 'mov-pan-slow-d': 
                return `zoompan=z=${1.1 + (0.1 * speed)}:x=iw/2-(iw/zoom/2):y=${esc(`(ih-ih/zoom)*(on/(${totalFrames}))`)}${base}`;
            case 'mov-pan-fast-l': 
                return `zoompan=z=${1.3 + (0.2 * speed)}:x=${esc(`(iw-iw/zoom)*(on/(${totalFrames}))`)}:y=ih/2-(ih/zoom/2)${base}`;
            case 'mov-pan-fast-r': 
                return `zoompan=z=${1.3 + (0.2 * speed)}:x=${esc(`(iw-iw/zoom)*(1-(on/(${totalFrames})))`)}:y=ih/2-(ih/zoom/2)${base}`;
            case 'mov-pan-diag-tl': 
                return `zoompan=z=${1.2 + (0.1 * speed)}:x=${esc(`(iw-iw/zoom)*(on/(${totalFrames}))`)}:y=${esc(`(ih-ih/zoom)*(on/(${totalFrames}))`)}${base}`;
            case 'mov-pan-diag-tr': 
                return `zoompan=z=${1.2 + (0.1 * speed)}:x=${esc(`(iw-iw/zoom)*(1-(on/(${totalFrames})))`)}:y=${esc(`(ih-ih/zoom)*(on/(${totalFrames}))`)}${base}`;
            case 'mov-pan-diag-bl': 
                return `zoompan=z=${1.2 + (0.1 * speed)}:x=${esc(`(iw-iw/zoom)*(on/(${totalFrames}))`)}:y=${esc(`(ih-ih/zoom)*(1-(on/(${totalFrames})))`)}${base}`;
            case 'mov-pan-diag-br': 
                return `zoompan=z=${1.2 + (0.1 * speed)}:x=${esc(`(iw-iw/zoom)*(1-(on/(${totalFrames})))`)}:y=${esc(`(ih-ih/zoom)*(1-(on/(${totalFrames})))`)}${base}`;

            // === 2. DYNAMIC ZOOMS ===
            case 'mov-zoom-crash-in': 
            case 'zoom-fast-in':
            case 'zoom-in':
                return `zoompan=z=${esc(`1.0+(${0.5 * speed}*on/${totalFrames})`)}:${center}${base}`;
            case 'mov-zoom-crash-out': 
            case 'zoom-out':
                return `zoompan=z=${esc(`${1.0 + (0.5 * speed)}-(${0.5 * speed}*on/${totalFrames})`)}:${center}${base}`;
            case 'mov-zoom-slow-in':
            case 'zoom-slow-in':
            case 'kenBurns':
                 // Ken Burns is 8 seconds by default now
                 return `zoompan=z=${esc(`1.0+(${0.2 * speed}*on/${totalFrames})`)}:${center}${base}`;
            case 'mov-zoom-slow-out':
            case 'zoom-slow-out':
                 return `zoompan=z=${esc(`${1.0 + (0.2 * speed)}-(${0.2 * speed}*on/${totalFrames})`)}:${center}${base}`;
            case 'mov-zoom-bounce-in':
            case 'zoom-bounce':
            case 'mov-zoom-bounce':
                 return `zoompan=z=${esc(`1.0+${0.1 * speed}*abs(sin(on*0.1*${speed}))`)}:${center}${base}`;
            case 'mov-zoom-pulse-slow':
            case 'pulse':
                 return `zoompan=z=${esc(`1.0+${0.05 * speed}*sin(on*0.05*${speed})`)}:${center}${base}`;
            case 'mov-zoom-pulse-fast':
                 return `zoompan=z=${esc(`1.0+${0.1 * speed}*sin(on*0.2*${speed})`)}:${center}${base}`;
            case 'mov-dolly-vertigo':
            case 'dolly-zoom':
                 return `zoompan=z=${esc(`min(1.0+(on*1.0*${speed}/${totalFrames}),2.0)`)}:${center}${base}`;
            case 'mov-zoom-twist-in':
                 return `rotate=a=${esc(`0.1*${speed}*t`)}:c=black,zoompan=z=${esc(`min(1.0+(on*1.0*${speed}/${totalFrames}),2.0)`)}:${center}${base}`;
            case 'mov-zoom-twist-out':
                 return `rotate=a=${esc(`-0.1*${speed}*t`)}:c=black,zoompan=z=${esc(`max(2.0-(on*1.0*${speed}/${totalFrames}),1.0)`)}:${center}${base}`;
            case 'mov-zoom-wobble':
                 return `zoompan=z=${esc(`1.1+0.05*${speed}*sin(on*0.2)`)}:x=${esc(`iw/2-(iw/zoom/2)+10*${speed}*sin(on*0.3)`)}:y=${esc(`ih/2-(ih/zoom/2)+10*${speed}*cos(on*0.4)`)}${base}`;
            case 'mov-zoom-shake':
                 return `zoompan=z=1.1:x=${esc(`iw/2-(iw/zoom/2)+(random(1)*20-10)*${speed}`)}:y=${esc(`ih/2-(ih/zoom/2)+(random(1)*20-10)*${speed}`)}${base}`;

            // === 3. 3D TRANSFORMS ===
            case 'mov-3d-flip-x': 
                return `scale=w=${esc(`iw*abs(cos(t*2*${speed}))`)}:h=ih,pad=1280:720:(1280-iw)/2:(720-ih)/2:black`;
            case 'mov-3d-flip-y':
                return `scale=w=iw:h=${esc(`ih*abs(cos(t*2*${speed}))`)}:pad=1280:720:(1280-iw)/2:(720-ih)/2:black`;
            case 'mov-3d-spin-axis': 
            case 'spin-slow':
                return `rotate=${esc(`t*0.5*${speed}`)}:ow=iw:oh=ih:c=black`;
            case 'mov-3d-swing-l':
            case 'pendulum':
                return `rotate=${esc(`sin(t*2*${speed})*0.1*${speed}`)}:ow=iw:oh=ih:c=black`;
            case 'mov-3d-swing-r':
                return `rotate=${esc(`-sin(t*2*${speed})*0.1*${speed}`)}:ow=iw:oh=ih:c=black`;
            case 'mov-3d-tumble':
                return `rotate=t*${speed}:ow=iw:oh=ih:c=black`;
            case 'mov-3d-roll':
                return `rotate=${esc(`t*2*${speed}`)}:ow=iw:oh=ih:c=black`;
            case 'mov-3d-float':
                return `zoompan=z=${esc(`1.05+0.02*${speed}*sin(time*${speed})`)}:x=${esc(`iw/2-(iw/zoom/2)+10*${speed}*sin(time*0.5*${speed})`)}:y=${esc(`ih/2-(ih/zoom/2)+10*${speed}*cos(time*0.7*${speed})`)}${base}`;

            // === 4. GLITCH & CHAOS ===
            case 'mov-glitch-snap':
                return `crop=w=${esc(`iw-mod(n,10)*10*${speed}`)}:h=ih:x=${esc(`mod(n,10)*5*${speed}`)}:y=0`;
            case 'mov-glitch-skid':
                 return `crop=x=${esc(`random(1)*20*${speed}`)}:y=${esc(`random(1)*20*${speed}`)}:w=iw-20:h=ih-20`;
            case 'mov-shake-violent':
            case 'shake-hard':
                 return `zoompan=z=1.2:x=${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*100*${speed}`)}:y=${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*100*${speed}`)}${base}`;
            case 'mov-jitter-x':
            case 'jitter':
                 return `zoompan=z=1.05:x=${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*30*${speed}`)}:y=ih/2-(ih/zoom/2)${base}`;
            case 'mov-jitter-y':
                 return `zoompan=z=1.05:x=iw/2-(iw/zoom/2):y=${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*30*${speed}`)}${base}`;
            case 'mov-rgb-shift-move':
                 return `zoompan=z=1.1:x=${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*20*${speed}`)}:y=ih/2-(ih/zoom/2)${base},colorchannelmixer=rr=1:gg=0:bb=0:rb=0:br=0:bg=0`;

            // === 5. ELASTIC & FUN ===
            case 'mov-rubber-band':
            case 'mov-squash-stretch':
                 return `zoompan=z=${esc(`1.0+0.1*${speed}*abs(sin(on*0.3*${speed}))`)}:${center}${base}`;
            case 'mov-jelly-wobble':
                 return `zoompan=z=${esc(`1.05+0.05*${speed}*sin(on*0.5*${speed})`)}:x=${esc(`iw/2-(iw/zoom/2)+5*${speed}*sin(on*0.8*${speed})`)}:y=${esc(`ih/2-(ih/zoom/2)+5*${speed}*cos(on*0.7*${speed})`)}${base}`;
            case 'mov-pop-up':
            case 'pop-in':
                return `zoompan=z=${esc(`if(lte(on,15/${speed}),min(on*${speed}/15,1.0),1.0)`)}:${center}${base}`;
            case 'mov-bounce-drop':
                 return `zoompan=z=${esc(`if(lt(on,20/${speed}),1.0+0.2*${speed}*abs(cos(on*0.3*${speed})),1.0)`)}:${center}${base}`;

            // === 6. HANDHELD ===
            case 'handheld-1':
                 return `zoompan=z=1.05:x=${esc(`iw/2-(iw/zoom/2)+sin(on*0.05*${speed})*5`)}:y=${esc(`ih/2-(ih/zoom/2)+cos(on*0.07*${speed})*5`)}${base}`;
            case 'handheld-2':
                 return `zoompan=z=1.1:x=${esc(`iw/2-(iw/zoom/2)+sin(on*0.1*${speed})*10`)}:y=${esc(`ih/2-(ih/zoom/2)+cos(on*0.15*${speed})*10`)}${base}`;
            case 'earthquake':
                 return `zoompan=z=1.1:x=${esc(`iw/2-(iw/zoom/2)+(random(1)-0.5)*40*${speed}`)}:y=${esc(`ih/2-(ih/zoom/2)+(random(1)-0.5)*40*${speed}`)}${base}`;
            
            // === 7. NEWLY ADDED MOVEMENTS (STROBE, ELASTIC SNAP, TADA, ETC) ===
            case 'mov-strobe-move':
                 // Move slightly and flash brightness
                 return `zoompan=z=${esc(`min(1.0+(0.05*on/${totalFrames}),1.1)`)}:${center}${base},eq=brightness=${esc(`'if(eq(mod(n,5),0),0.3,0)'`)}:eval=frame`;

            case 'mov-elastic-snap-l':
                 return `zoompan=z=1.0:x=${esc(`(iw/2-(iw/zoom/2)) - (iw/2 * exp(-4*on*${speed}/${totalFrames}) * cos(10*on*${speed}/${totalFrames}))`)}:y='ih/2-(ih/zoom/2)'${base}`;

            case 'mov-elastic-snap-r':
                 return `zoompan=z=1.0:x=${esc(`(iw/2-(iw/zoom/2)) + (iw/2 * exp(-4*on*${speed}/${totalFrames}) * cos(10*on*${speed}/${totalFrames}))`)}:y='ih/2-(ih/zoom/2)'${base}`;

            case 'mov-spring-up':
                 return `zoompan=z=1.0:x='iw/2-(iw/zoom/2)':y=${esc(`(ih/2-(ih/zoom/2)) + (ih/2 * exp(-4*on*${speed}/${totalFrames}) * cos(10*on*${speed}/${totalFrames}))`)}${base}`;

            case 'mov-tada':
                 return `zoompan=z=${esc(`1.0+0.05*sin(on*0.5*${speed})`)}:x=${esc(`iw/2-(iw/zoom/2)+10*sin(on*0.8*${speed})`)}:y=${esc(`ih/2-(ih/zoom/2)`)}${base}`;

            case 'mov-digital-tear':
                 return `zoompan=z=1.05:x=${esc(`iw/2-(iw/zoom/2)+(random(1)>0.8)*(random(1)-0.5)*200`)}:y='ih/2-(ih/zoom/2)'${base}`;

            case 'mov-frame-skip':
                 return `zoompan=z=${esc(`min(1.0+(0.2*on/${totalFrames}),1.2)`)}:${center}${base},fps=fps=10`;

            case 'mov-vhs-tracking':
                 return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y=${esc(`mod(on*4, ih-ih/zoom)`)}${base}`;

            // === 8. ENTRY ANIMATIONS ===
            case 'slide-in-left': 
                return `zoompan=z=1.0:x=${esc(`if(lte(on,30/${speed}),(iw/2-(iw/zoom/2)) - (iw)*(1-on*${speed}/30), iw/2-(iw/zoom/2))`)}:y=ih/2-(ih/zoom/2)${base}`;
            case 'slide-in-right':
                return `zoompan=z=1.0:x=${esc(`if(lte(on,30/${speed}),(iw/2-(iw/zoom/2)) + (iw)*(1-on*${speed}/30), iw/2-(iw/zoom/2))`)}:y=ih/2-(ih/zoom/2)${base}`;
            
            default:
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z=${esc(`min(1.0+(on*0.3*${speed}/${totalFrames}),1.3)`)}:${center}${base}`;
                }
                return null;
        }
    },

    getTransitionXfade: (transId) => {
        // Massive mapping from frontend IDs to FFmpeg xfade transition names
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
            'barn-door-h': 'hl', 'barn-door-v': 'vu',
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
