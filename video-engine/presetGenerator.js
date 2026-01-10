
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
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'posterize': 'curves=posterize',
            'vignette': 'vignette=PI/4'
        };
        // Generate procedural effects mappings if needed (simplified fallback)
        if (!effects[effectId]) {
             if(effectId.includes('bw')) return 'hue=s=0';
             if(effectId.includes('neon')) return 'eq=saturation=2:contrast=1.2';
             if(effectId.includes('vintage')) return 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1';
        }
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec) => {
        const d = durationSec || 5;
        const totalFrames = Math.ceil(d * 30);
        // Base settings for 720p output
        const base = `d=1:s=1280x720:fps=30`; 
        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

        switch (moveId) {
            /* --- 1. CINEMATIC PANS --- */
            case 'mov-pan-slow-l': 
            case 'pan-left':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-pan-slow-r': 
            case 'pan-right':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-pan-slow-u': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${base}`;
            case 'mov-pan-slow-d': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':${base}`;
            
            case 'mov-pan-fast-l': 
                return `zoompan=z=1.2:x='(iw-iw/zoom)*pow(on/${totalFrames},0.5)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-pan-fast-r': 
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-pow(on/${totalFrames},0.5))':y='ih/2-(ih/zoom/2)':${base}`;
            
            case 'mov-pan-diag-tl': // Bottom-Right to Top-Left
                return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${base}`;
            case 'mov-pan-diag-tr': // Bottom-Left to Top-Right
                return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${base}`;
            case 'mov-pan-diag-bl': // Top-Right to Bottom-Left
                return `zoompan=z=1.3:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='(ih-ih/zoom)*(on/${totalFrames})':${base}`;
            case 'mov-pan-diag-br': // Top-Left to Bottom-Right
                return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${base}`;

            /* --- 2. DYNAMIC ZOOMS --- */
            case 'mov-zoom-crash-in': 
                return `zoompan=z='min(1.0+(on*1.5/${totalFrames}),2.5)':${center}:${base}`;
            case 'mov-zoom-crash-out': 
                return `zoompan=z='max(2.5-(on*1.5/${totalFrames}),1.0)':${center}:${base}`;
            case 'mov-zoom-twist-in': 
                return `rotate='0.2*sin(t)':ow=iw:oh=ih,zoompan=z='min(1.0+(on*0.5/${totalFrames}),1.5)':${center}:${base}`;
            case 'mov-zoom-twist-out':
                return `rotate='-0.2*sin(t)':ow=iw:oh=ih,zoompan=z='max(1.5-(on*0.5/${totalFrames}),1.0)':${center}:${base}`;
            case 'mov-zoom-bounce-in': 
                return `zoompan=z='1.0+0.3*abs(sin(3*t))':${center}:${base}`;
            case 'mov-zoom-pulse-slow': 
                return `zoompan=z='1.0+0.1*sin(1*t)':${center}:${base}`;
            case 'mov-zoom-pulse-fast': 
                return `zoompan=z='1.0+0.15*sin(5*t)':${center}:${base}`;
            case 'mov-zoom-wobble': 
                return `zoompan=z='1.1':x='iw/2-(iw/zoom/2)+10*sin(2*t)':y='ih/2-(ih/zoom/2)+10*cos(2*t)':${base}`;
            case 'mov-zoom-shake': 
                return `zoompan=z='1.2':x='iw/2-(iw/zoom/2)+20*(random(1)-0.5)':y='ih/2-(ih/zoom/2)+20*(random(1)-0.5)':${base}`;
            case 'mov-dolly-vertigo': 
                return `zoompan=z='1.0+0.5*sin(t)':${center}:${base}`;
            
            case 'zoom-slow-in': return `zoompan=z='min(1.0+(on*0.2/${totalFrames}),1.2)':${center}:${base}`;
            case 'zoom-fast-in': return `zoompan=z='min(1.0+(on*0.8/${totalFrames}),1.8)':${center}:${base}`;
            case 'zoom-slow-out': return `zoompan=z='max(1.2-(on*0.2/${totalFrames}),1.0)':${center}:${base}`;
            case 'zoom-bounce': return `zoompan=z='1.0+0.1*abs(sin(2*t))':${center}:${base}`;
            case 'dolly-zoom': return `zoompan=z='1.0+0.3*t/${d}':${center}:${base}`;
            case 'kenBurns': return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${base}`;

            /* --- 3. 3D TRANSFORMS (SIMULATED) --- */
            case 'mov-3d-flip-x': 
                return `zoompan=z='1.0+0.5*abs(sin(t))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+ih*0.2*sin(t)':${base}`;
            case 'mov-3d-flip-y': 
                return `zoompan=z='1.0+0.5*abs(cos(t))':x='iw/2-(iw/zoom/2)+iw*0.2*cos(t)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-3d-tumble':
                return `rotate='t':ow=iw:oh=ih,zoompan=z='1.2+0.2*sin(t)':${center}:${base}`;
            case 'mov-3d-roll':
                return `rotate='2*PI*t/${d}':ow=iw:oh=ih,zoompan=z=1.4:${center}:${base}`;
            case 'mov-3d-spin-axis': 
                return `zoompan=z='1.0+0.3*sin(t)':x='iw/2-(iw/zoom/2)+50*cos(t)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-3d-swing-l':
                return `rotate='0.1*sin(t)':ow=iw:oh=ih,zoompan=z=1.1:x='iw/2-(iw/zoom/2)-20*sin(t)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-3d-swing-r':
                return `rotate='-0.1*sin(t)':ow=iw:oh=ih,zoompan=z=1.1:x='iw/2-(iw/zoom/2)+20*sin(t)':y='ih/2-(ih/zoom/2)':${base}`;
            
            /* --- 4. GLITCH & CHAOS --- */
            case 'mov-glitch-snap': 
                return `zoompan=z='if(eq(mod(n,10),0),1.2,1.0)':x='if(eq(mod(n,10),0),iw/2-(iw/zoom/2)+50,iw/2-(iw/zoom/2))':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-glitch-skid':
                 return `zoompan=z=1:x='iw/2-(iw/zoom/2)+100*sin(n)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-shake-violent': 
            case 'shake-hard':
            case 'earthquake':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*100-50':y='ih/2-(ih/zoom/2)+random(on+1)*100-50':${base}`;
            case 'mov-jitter-x':
            case 'jitter':
                return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+10*sin(n*10)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-jitter-y':
                return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+10*sin(n*10)':${base}`;
            case 'mov-rgb-shift-move': 
                return `colorbalance=rs='0.5*sin(t*10)':bs='-0.5*sin(t*10)',zoompan=z=1.05:${center}:${base}`;
            case 'mov-strobe-move': 
                return `drawbox=c=white:t=fill:enable='eq(mod(n,4),0)'`;
            case 'mov-digital-tear': 
                return `crop=iw:ih:0:'if(gt(random(n),0.9),20,0)'`;
            case 'mov-frame-skip': 
                return `fps=fps=15`; // Reduce fps to simulate lag
            case 'mov-vhs-tracking':
                 return `zoompan=z=1.0:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+10*sin(t)':${base},boxblur=2:1`;
            case 'vhs-tracking': // Legacy mapping
                 return `zoompan=z=1.0:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+10*sin(t)':${base},boxblur=2:1`;

            /* --- 5. ELASTIC & FUN --- */
            case 'mov-bounce-drop': 
                return `zoompan=z=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+if(lt(t,1),500*(1-t),0)':${base}`;
            case 'mov-elastic-snap-l':
                 return `zoompan=z=1:x='iw/2-(iw/zoom/2)+500*exp(-3*t)*sin(10*t)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-elastic-snap-r':
                 return `zoompan=z=1:x='iw/2-(iw/zoom/2)-500*exp(-3*t)*sin(10*t)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-rubber-band': 
                return `zoompan=z='1.0+0.1*abs(sin(t*5))':x='iw/2-(iw/zoom/2)+20*sin(t*5)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'mov-jelly-wobble':
                return `zoompan=z='1.0+0.05*sin(t*8)':x='iw/2-(iw/zoom/2)+10*sin(t*10)':y='ih/2-(ih/zoom/2)+10*cos(t*10)':${base}`;
            case 'mov-spring-up':
                return `zoompan=z=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+300*exp(-2*t)*cos(8*t)':${base}`;
            case 'mov-spring-down':
                return `zoompan=z=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-300*exp(-2*t)*cos(8*t)':${base}`;
            case 'mov-pendulum-swing':
            case 'pendulum':
                return `rotate='0.2*sin(2*t)':ow=iw:oh=ih,zoompan=z=1.2:${center}:${base}`;
            case 'mov-pop-up': 
            case 'pop-in':
                return `zoompan=z='min(on/10,1.0)':${center}:${base}`;
            case 'mov-squash-stretch':
                // Simulated via zoom
                return `zoompan=z='1.0+0.2*sin(t*5)':${center}:${base}`;
            case 'mov-tada': 
            case 'tada':
                return `rotate='if(lt(t,1),0.1*sin(t*10),0)',zoompan=z='if(lt(t,1),1.1,1.0)':${center}:${base}`;
            case 'mov-flash-pulse': 
            case 'flash-pulse':
                return `eq=brightness='0.3*sin(t*10)',zoompan=z='1.0+0.05*sin(t*10)':${center}:${base}`;

            /* --- 6. COMMON / MANUAL ANIMATIONS --- */
            case 'pulse': return `zoompan=z='1.0+0.05*sin(t*3)':${center}:${base}`;
            case 'float': return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+20*sin(t)':${base}`;
            case 'wiggle': return `rotate='0.05*sin(t*5)':ow=iw:oh=ih,zoompan=z=1.1:${center}:${base}`;
            case 'heartbeat': return `zoompan=z='1.0+0.1*abs(sin(t*3))':${center}:${base}`;
            case 'spin-slow': return `rotate='t*0.2':ow=iw:oh=ih,zoompan=z=1.4:${center}:${base}`;
            case 'photo-flash': return `eq=brightness='if(lt(t,0.2),0.5,0)'`;
            case 'rgb-split-anim': return `colorbalance=rs='0.2*sin(t*10)':bs='-0.2*sin(t*10)'`;
            
            case 'handheld-1': return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+2*sin(t)':y='ih/2-(ih/zoom/2)+2*cos(t)':${base}`;
            case 'handheld-2': return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+5*sin(t*3)':y='ih/2-(ih/zoom/2)+5*cos(t*3)':${base}`;
            
            case 'slide-in-left': return `zoompan=z=1:x='(iw-iw/zoom)*(1-min(t,1))':y='ih/2-(ih/zoom/2)':${base}`;
            case 'slide-in-right': return `zoompan=z=1:x='(iw-iw/zoom)*min(t,1)':y='ih/2-(ih/zoom/2)':${base}`;
            case 'slide-in-bottom': return `zoompan=z=1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-min(t,1))':${base}`;
            
            case 'fade-in': return `fade=t=in:st=0:d=1`;
            case 'swing-in': return `rotate='(1-min(t,1))*0.5':ow=iw:oh=ih,zoompan=z=1.2:${center}:${base}`;

            /* --- 7. BLUR EFFECTS --- */
            case 'mov-blur-focus-in': return `boxblur=luma_radius='max(20-20*t,0)':luma_power=1`;
            case 'mov-blur-focus-out': return `boxblur=luma_radius='min(20*t,20)':luma_power=1`;
            case 'mov-blur-dreamy': return `boxblur=2:1,eq=brightness=0.05:contrast=1.1`;
            case 'mov-blur-zoom': return `zoompan=z='min(1.0+0.5*t/${d},1.5)':${center}:${base},boxblur=luma_radius='min(10*t/${d},10)':luma_power=1`;
            case 'mov-blur-pulse': return `boxblur=luma_radius='5*abs(sin(t*2))':luma_power=1`;

            default:
                if (moveId && moveId.includes('zoom')) {
                    // Fallback to a gentle zoom in
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${base}`;
                }
                return null;
        }
    }
};
