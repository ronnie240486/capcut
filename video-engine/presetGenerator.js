
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
        const effects = {
            // Cinematic
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,curves=contrast',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2', 
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'dreamy': 'boxblur=2:1,eq=brightness=0.1',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5'
        };
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec) => {
        const d = durationSec || 5;
        const totalFrames = Math.ceil(d * 30);
        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
        const baseSettings = `d=1:s=1280x720:fps=30`;

        switch (moveId) {
            // --- CINEMATIC PANS (Zoompan usa 'on') ---
            case 'mov-pan-slow-l':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-r':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-u':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-slow-d':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
            case 'mov-pan-diag-tl':
                return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;

            // --- DYNAMIC ZOOMS ---
            case 'zoom-slow-in':
            case 'mov-zoom-pulse-slow':
                return `zoompan=z='min(1.0+(on*0.2/${totalFrames}),1.2)':${center}:${baseSettings}`;
            case 'mov-zoom-crash-in':
                return `zoompan=z='min(1.0+(on*1.0/${totalFrames}),2.0)':${center}:${baseSettings}`;
            case 'mov-zoom-bounce-in':
                return `zoompan=z='1.0+(0.2*sin(on*0.2)*(1-on/${totalFrames}))':${center}:${baseSettings}`;

            // --- 3D TRANSFORMS (Filtros de rotação usam 'n') ---
            case 'mov-3d-roll':
                return `rotate='n*0.05'`;
            case 'mov-3d-flip-x':
                return `scale=1280:720,rotate='n*0.05':ow=iw*abs(cos(n*0.1)):oh=ih`;
            case 'mov-3d-float':
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+20*sin(n*0.05)':'(ih-oh)/2+20*cos(n*0.03)',rotate='sin(n*0.02)*0.03'`;
            case 'mov-3d-perspective-u':
                return `perspective=x0=0:y0='n*0.5':x1=W:y1='n*0.5':x2=0:y2=H:x3=W:y3=H`;

            // --- GLITCH & CHAOS ---
            case 'mov-glitch-snap':
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+if(gt(mod(n,10),8),random(n)*40-20,0)':'(ih-oh)/2+if(gt(mod(n,10),8),random(n+1)*40-20,0)'`;
            case 'mov-shake-violent':
                return `scale=1408:792,crop=1280:720:'(iw-ow)/2+random(n)*50-25':'(ih-oh)/2+random(n+1)*50-25'`;
            case 'mov-jitter-x':
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+random(n)*20-10':(ih-oh)/2`;

            // --- ELASTIC & FUN ---
            case 'mov-bounce-drop':
                return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(abs(sin(on*0.15))*(1-on/${totalFrames}))':${baseSettings}`;
            case 'mov-pop-up':
                return `zoompan=z='min(0.01+(on*2/${totalFrames}),1.1)':${center}:${baseSettings}`;
            case 'mov-jelly-wobble':
                return `rotate='sin(n*0.2)*0.1',scale=1280*(1+0.05*sin(n*0.2)):720*(1+0.05*cos(n*0.2)),pad=1280:720:(ow-iw)/2:(oh-ih)/2`;

            // --- ENTRANCE ANIMATIONS (Primeiro 1 segundo) ---
            case 'slide-in-left':
                return `zoompan=z=1.1:x='if(lt(on,30),(iw-iw/zoom)*(1-on/30),0)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'pop-in':
                return `zoompan=z='if(lt(on,15),on/15,1.0)':${center}:${baseSettings}`;
            case 'fade-in':
                return `fade=t=in:st=0:d=1`;

            // --- LOOPS ---
            case 'pulse':
                return `zoompan=z='1.0+0.05*sin(on*0.1)':${center}:${baseSettings}`;
            case 'float':
                return `scale=1344:756,crop=1280:720:(iw-ow)/2:'(ih-oh)/2+15*sin(n*0.07)'`;
            case 'wiggle':
                return `rotate='sin(n*0.2)*0.05'`;

            // --- EFEITOS DE FOTO ---
            case 'photo-flash':
                return `drawbox=c=white:t=fill:enable='between(n,0,3)',fade=t=in:st=0:d=0.2`;

            default:
                if (moveId && (moveId.includes('zoom') || moveId.includes('ken'))) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
                }
                return null;
        }
    }
};
