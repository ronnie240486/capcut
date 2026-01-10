
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
            // --- CINEMATIC PANS (Usa 'on') ---
            case 'mov-pan-slow-l': return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-r': return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-slow-u': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-slow-d': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
            case 'mov-pan-fast-l': return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/60)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-fast-r': return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/60))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-diag-tl': return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-diag-tr': return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-diag-bl': return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
            case 'mov-pan-diag-br': return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            // --- DYNAMIC ZOOMS (Usa 'on') ---
            case 'mov-zoom-crash-in': return `zoompan=z='min(1.0+(on*1.5/15),2.0)':${center}:${baseSettings}`;
            case 'mov-zoom-crash-out': return `zoompan=z='max(2.0-(on*1.5/15),1.0)':${center}:${baseSettings}`;
            case 'mov-zoom-twist-in': return `zoompan=z='min(1.0+(on*0.5/${totalFrames}),1.5)':${center}:${baseSettings},rotate='on*0.05'`;
            case 'mov-zoom-twist-out': return `zoompan=z='max(1.5-(on*0.5/${totalFrames}),1.0)':${center}:${baseSettings},rotate='-on*0.05'`;
            case 'mov-zoom-bounce-in': return `zoompan=z='1.0+(0.2*abs(sin(on*0.2))*(1-on/${totalFrames}))':${center}:${baseSettings}`;
            case 'mov-zoom-pulse-slow': return `zoompan=z='1.0+0.05*sin(on*0.1)':${center}:${baseSettings}`;
            case 'mov-zoom-pulse-fast': return `zoompan=z='1.0+0.1*sin(on*0.5)':${center}:${baseSettings}`;
            case 'mov-zoom-wobble': return `zoompan=z='1.1+0.05*sin(on*0.2)':x='iw/2-(iw/zoom/2)+10*cos(on*0.1)':y='ih/2-(ih/zoom/2)+10*sin(on*0.1)':${baseSettings}`;
            case 'mov-zoom-shake': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*20-10':y='ih/2-(ih/zoom/2)+random(on+1)*20-10':${baseSettings}`;
            case 'mov-dolly-vertigo': return `zoompan=z='1.0+(on*0.5/${totalFrames})':${center}:${baseSettings},rotate='sin(on*0.05)*0.02'`;

            // --- 3D & SPIN EFFECTS (Usa 'n' no rotate) ---
            case 'mov-3d-flip-x': return `rotate='n*0.2',zoompan=z='1+0.5*abs(cos(on*0.1))':${center}:${baseSettings}`;
            case 'mov-3d-flip-y': return `rotate='n*0.2',zoompan=z='1+0.5*abs(sin(on*0.1))':${center}:${baseSettings}`;
            case 'mov-3d-spin-axis': return `rotate='n*0.4'`;
            case 'mov-3d-tumble': return `rotate='n*0.1',zoompan=z='1.1+0.1*sin(on*0.05)':${center}:${baseSettings}`;
            case 'mov-3d-roll': return `rotate='n*0.1'`;
            case 'mov-3d-swing-l': return `rotate='-0.2*abs(sin(n*0.05))',zoompan=z=1.1:x='on':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-3d-swing-r': return `rotate='0.2*abs(sin(n*0.05))',zoompan=z=1.1:x='iw-iw/zoom-on':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-3d-perspective-u': return `zoompan=z='1.2-0.2*(on/${totalFrames})':${center}:${baseSettings}`;
            case 'mov-3d-perspective-d': return `zoompan=z='1.0+0.2*(on/${totalFrames})':${center}:${baseSettings}`;
            case 'mov-3d-float': return `rotate='sin(n*0.02)*0.03',zoompan=z='1.1+0.05*sin(on*0.05)':x='iw/2-(iw/zoom/2)+10*cos(on*0.03)':y='ih/2-(ih/zoom/2)+10*sin(on*0.03)':${baseSettings}`;

            // --- GLITCH & CHAOS (Usa 'n' no crop/eq) ---
            case 'mov-glitch-snap': return `crop=1200:680:40:20,pad=1280:720:40:20,rotate='if(gt(mod(n,20),17),0.1,0)'`;
            case 'mov-glitch-skid': return `rotate='if(gt(mod(n,30),25),random(n)*0.2-0.1,0)',eq=brightness='if(gt(mod(n,30),25),0.2,0)'`;
            case 'mov-shake-violent': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*50-25':y='ih/2-(ih/zoom/2)+random(on+1)*50-25':${baseSettings}`;
            case 'mov-jitter-x': return `crop=1200:720:'random(n)*20':0,pad=1280:720:0:0`;
            case 'mov-jitter-y': return `crop=1280:680:0:'random(n)*20',pad=1280:720:0:0`;
            case 'mov-rgb-shift-move': return `colorbalance=rs='0.2*sin(n*0.3)':bs='0.2*cos(n*0.3)'`;
            case 'mov-strobe-move': return `eq=brightness='if(eq(mod(n,4),0),-0.5,0)'`;
            case 'mov-digital-tear': return `crop=1280:720:0:'if(eq(mod(n,10),0),random(n)*30,0)'`;
            case 'mov-frame-skip': return `setpts='PTS+(mod(n,2)*0.1)'`;
            case 'mov-vhs-tracking': return `eq=contrast=1.2:brightness=-0.1,rotate='sin(n*0.01)*0.01'`;

            // --- ELASTIC & FUN (Usa 'on' no zoompan) ---
            case 'mov-rubber-band': return `zoompan=z='1.0+0.2*abs(sin(on*0.2))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-bounce-drop': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*abs(sin(on*0.15))':${baseSettings}`;
            case 'mov-elastic-snap-l': return `zoompan=z=1.1:x='if(lt(on,20),(iw-iw/zoom)*(1-on/20),0)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-elastic-snap-r': return `zoompan=z=1.1:x='if(lt(on,20),(iw-iw/zoom)*(on/20),0)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-jelly-wobble': return `rotate='sin(n*0.2)*0.1',zoompan=z='1.0+0.05*cos(on*0.2)':${center}:${baseSettings}`;
            case 'mov-spring-up': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='if(lt(on,15),(ih-ih/zoom)*(1-on/15),0)':${baseSettings}`;
            case 'mov-spring-down': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='if(lt(on,15),(ih-ih/zoom)*(on/15),0)':${baseSettings}`;
            case 'mov-pendulum-swing': return `rotate='sin(n*0.1)*0.2'`;
            case 'mov-pop-up': return `zoompan=z='if(lt(on,15),on/15,1.0)':${center}:${baseSettings}`;
            case 'mov-squash-stretch': return `zoompan=z='1.0+0.1*sin(on*0.2)':x='iw/2-(iw/zoom/2)+20*sin(on*0.2)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-tada': return `rotate='if(lt(n,30),sin(n*0.5)*0.1,0)',zoompan=z='if(lt(on,30),1.1,1.0)':${center}:${baseSettings}`;
            case 'mov-flash-pulse': return `eq=brightness='if(eq(mod(n,10),0),0.5,0)',fade=t=in:st=0:d=0.2`;

            // --- LOOPS & DEFAULTS ---
            case 'pulse': return `zoompan=z='1.0+0.05*sin(on*0.1)':${center}:${baseSettings}`;
            case 'float': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+15*sin(on*0.07)':${baseSettings}`;
            case 'wiggle': return `rotate='sin(n*0.2)*0.05'`;
            case 'heartbeat': return `zoompan=z='1.0+if(lt(mod(on,30),10),0.1,0)':${center}:${baseSettings}`;
            case 'spin-slow': return `rotate='n*0.02'`;
            case 'photo-flash': return `eq=brightness='if(lt(n,3),0.8,0)',fade=t=in:st=0:d=0.2`;
            case 'kenBurns': return `zoompan=z='min(1.0+(on*0.4/${totalFrames}),1.4)':x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            default:
                if (moveId && (moveId.includes('zoom') || moveId.includes('ken'))) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
                }
                return null;
        }
    }
};
