
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
            case 'mov-pan-fast-l': return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/60)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-fast-r': return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/60))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-pan-diag-tl': return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-diag-tr': return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;
            case 'mov-pan-diag-bl': return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
            case 'mov-pan-diag-br': return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            // --- DYNAMIC ZOOMS ---
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

            // --- 3D TRANSFORMATIONS ---
            case 'mov-3d-flip-x': return `rotate='n*0.1',zoompan=z='1+0.3*abs(sin(on*0.1))':${center}:${baseSettings}`;
            case 'mov-3d-flip-y': return `rotate='-n*0.1',zoompan=z='1+0.3*abs(cos(on*0.1))':${center}:${baseSettings}`;
            case 'mov-3d-spin-axis': return `rotate='n*0.3'`;
            case 'mov-3d-tumble': return `rotate='n*0.08',zoompan=z='1.1+0.1*sin(on*0.05)':x='iw/2-(iw/zoom/2)+20*sin(on*0.05)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-3d-roll': return `rotate='n*0.1'`;
            case 'mov-3d-swing-l': return `rotate='-0.1*abs(sin(n*0.05))',zoompan=z=1.1:x='on*0.5':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-3d-swing-r': return `rotate='0.1*abs(sin(n*0.05))',zoompan=z=1.1:x='(iw-iw/zoom)-on*0.5':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-3d-perspective-u': return `zoompan=z='1.2-0.2*(on/${totalFrames})':${center}:${baseSettings}`;
            case 'mov-3d-perspective-d': return `zoompan=z='1.0+0.2*(on/${totalFrames})':${center}:${baseSettings}`;
            case 'mov-3d-float': return `rotate='sin(n*0.02)*0.03',zoompan=z='1.1+0.05*sin(on*0.05)':x='iw/2-(iw/zoom/2)+10*cos(on*0.03)':y='ih/2-(ih/zoom/2)+10*sin(on*0.03)':${baseSettings}`;

            // --- GLITCH & CHAOS (CORRIGIDO PARA FUNCIONAR NO EXPORT) ---
            case 'mov-glitch-snap': return `rotate='if(gt(mod(n,15),12),0.1*sin(n),0)',zoompan=z='if(gt(mod(on,15),12),1.1,1.0)':${center}:${baseSettings}`;
            case 'mov-glitch-skid': return `rotate='if(gt(mod(n,25),22),0.2*random(n)-0.1,0)',hue=h='if(gt(mod(n,25),22),n*10,0)'`;
            case 'mov-shake-violent': return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*100-50':y='ih/2-(ih/zoom/2)+random(on+1)*100-50':${baseSettings}`;
            case 'mov-jitter-x': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+random(on)*30-15':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-jitter-y': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+random(on)*30-15':${baseSettings}`;
            case 'mov-rgb-shift-move': return `hue=h='n*20',zoompan=z=1.05:${center}:${baseSettings}`; // Simula RGB via ciclo de matiz
            case 'mov-strobe-move': return `drawbox=c=black:t=fill:enable='eq(mod(n,4),0)'`; // Melhor que 'eq' para strobe
            case 'mov-digital-tear': return `zoompan=z=1.1:x='if(eq(mod(on,8),0),random(on)*40,iw/2-(iw/zoom/2))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-frame-skip': return `setpts='PTS+if(eq(mod(n,4),0),0.1,0)'`;
            case 'mov-vhs-tracking': return `eq=contrast=1.2,rotate='if(eq(mod(n,30),0),0.01,0)',zoompan=z=1.02:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+if(lt(mod(on,30),5),10,0)':${baseSettings}`;

            // --- ELASTIC & FUN ---
            case 'mov-rubber-band': return `zoompan=z='1.0+0.15*abs(sin(on*0.2))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-bounce-drop': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*abs(sin(on*0.12))':${baseSettings}`;
            case 'mov-elastic-snap-l': return `zoompan=z=1.1:x='if(lt(on,20),(iw-iw/zoom)*(1-on/20),0)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-elastic-snap-r': return `zoompan=z=1.1:x='if(lt(on,20),(iw-iw/zoom)*(on/20),0)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-jelly-wobble': return `rotate='sin(n*0.25)*0.08',zoompan=z='1.0+0.05*cos(on*0.25)':${center}:${baseSettings}`;
            case 'mov-spring-up': return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)':y='if(lt(on,15),(ih-ih/zoom)*(1-on/15),0)':${baseSettings}`;
            case 'mov-spring-down': return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)':y='if(lt(on,15),(ih-ih/zoom)*(on/15),0)':${baseSettings}`;
            case 'mov-pendulum-swing': return `rotate='sin(n*0.08)*0.15'`;
            case 'mov-pop-up': return `zoompan=z='if(lt(on,12),on/12,1.0)':${center}:${baseSettings}`;
            case 'mov-squash-stretch': return `zoompan=z='1.0+0.08*sin(on*0.3)':x='iw/2-(iw/zoom/2)+15*sin(on*0.3)':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            case 'mov-tada': return `rotate='if(lt(n,25),sin(n*0.4)*0.08,0)',zoompan=z='if(lt(on,25),1.08,1.0)':${center}:${baseSettings}`;
            case 'mov-flash-pulse': return `drawbox=c=white:t=fill:enable='eq(mod(n,12),0)'`;

            // --- LOOPS & DEFAULTS ---
            case 'pulse': return `zoompan=z='1.0+0.05*sin(on*0.1)':${center}:${baseSettings}`;
            case 'float': return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+10*sin(on*0.06)':${baseSettings}`;
            case 'wiggle': return `rotate='sin(n*0.18)*0.04'`;
            case 'heartbeat': return `zoompan=z='1.0+if(lt(mod(on,35),8),0.12,0)':${center}:${baseSettings}`;
            case 'spin-slow': return `rotate='n*0.015'`;
            case 'photo-flash': return `drawbox=c=white:t=fill:enable='lt(n,4)'`;
            case 'kenBurns': return `zoompan=z='min(1.0+(on*0.4/${totalFrames}),1.4)':x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            default:
                if (moveId && (moveId.includes('zoom') || moveId.includes('ken'))) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
                }
                return null;
        }
    }
};
