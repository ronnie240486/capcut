
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
            // --- CINEMATIC PANS ---
            case 'mov-pan-slow-l': return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-r': return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-u': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-slow-d': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            // --- DYNAMIC ZOOMS ---
            case 'mov-zoom-crash-in': return `zoompan=z='min(1.0+(on*1.5/15),2.0)':${center}:${baseSettings}`;
            case 'mov-zoom-crash-out': return `zoompan=z='max(2.0-(on*1.5/15),1.0)':${center}:${baseSettings}`;
            
            // --- 3D FLIPS (SIMULADOS SEM PERSPECTIVE PARA EVITAR CRASH) ---
            // Simula Flip X diminuindo e aumentando a largura via zoompan math
            case 'mov-3d-flip-x': 
                return `zoompan=z='1.0+0.5*abs(sin(on*0.1))':x='iw/2-(iw/zoom/2)+iw*0.2*sin(on*0.1)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-3d-flip-y': 
                return `zoompan=z='1.0+0.5*abs(cos(on*0.1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+ih*0.2*cos(on*0.1)':${baseSettings}`;
            case 'mov-3d-spin-axis': 
                return `rotate='n*0.2',zoompan=z=1.2:${center}:${baseSettings}`;

            // --- GLITCH & CHAOS (CORRIGIDOS) ---
            case 'photo-flash': 
                return `eq=brightness='if(lt(n,6),0.5,0)':contrast='if(lt(n,6),1.5,1)'`;
            case 'mov-rgb-shift-move': 
                return `colorbalance=rs='0.3*sin(n*0.5)':bs='-0.3*sin(n*0.5)',zoompan=z=1.1:${center}:${baseSettings}`;
            case 'mov-strobe-move': 
                return `drawbox=c=white:t=fill:enable='eq(mod(n,4),0)'`;
            case 'mov-shake-violent': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*100-50':y='ih/2-(ih/zoom/2)+random(on+1)*100-50':${baseSettings}`;
            case 'mov-frame-skip': 
                return `setpts='PTS+if(eq(mod(n,6),0),0.5,0)'`;
            case 'mov-digital-tear': 
                return `crop=iw:ih/2:0:'if(eq(mod(n,10),0),random(n)*ih/2,0)',pad=1280:720:0:0`;

            // --- ELASTIC & FUN ---
            case 'mov-rubber-band': 
                return `zoompan=z='1.0+0.2*abs(sin(on*0.3))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pop-up': 
                return `zoompan=z='min(on/10,1.0)':${center}:${baseSettings}`;
            case 'mov-tada': 
                return `rotate='if(lt(n,20),0.1*sin(n*0.5),0)',zoompan=z='if(lt(on,20),1.1,1.0)':${center}:${baseSettings}`;

            // --- DEFAULTS ---
            case 'pulse': return `zoompan=z='1.0+0.05*sin(on*0.1)':${center}:${baseSettings}`;
            case 'kenBurns': return `zoompan=z='min(1.0+(on*0.4/${totalFrames}),1.4)':x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            default:
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
                }
                return null;
        }
    }
};
