
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

            // --- 3D FLIPS (CORREÇÃO DE EIXO E LADO) ---
            // Flip X (Giro Horizontal): Variamos o X do zoompan para simular a perspectiva lateral
            case 'mov-3d-flip-x': 
                return `zoompan=z='1+0.4*abs(sin(on*0.1))':x='iw/2-(iw/zoom/2) + (iw*0.1*sin(on*0.2))':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            
            // Flip Y (Giro Vertical): Variamos o Y do zoompan
            case 'mov-3d-flip-y': 
                return `zoompan=z='1+0.4*abs(cos(on*0.1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2) + (ih*0.1*cos(on*0.2))':${baseSettings}`;

            // Tumble (Giro Desordenado): Rotação combinada com zoom pulsante
            case 'mov-3d-tumble': 
                return `rotate='n*0.1',zoompan=z='1.1+0.1*sin(on*0.1)':${center}:${baseSettings}`;

            // --- EFEITOS DE FLASH E GLITCH ---
            // Photo Flash: Brilho intenso nos primeiros 5 frames (aproximadamente 0.15s)
            case 'photo-flash': 
                return `eq=brightness='if(lt(n,5),0.6,0)':contrast='if(lt(n,5),1.5,1)'`;

            // RGB Shift: Simulado via balanço de cores oscilante
            case 'mov-rgb-shift-move': 
                return `colorbalance=rs='0.4*sin(on*0.3)':bs='-0.4*sin(on*0.3)',zoompan=z=1.05:${center}:${baseSettings}`;

            case 'mov-3d-spin-axis': 
                return `rotate='n*0.2',zoompan=z=1.2:${center}:${baseSettings}`;

            case 'mov-shake-violent': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+random(on)*60-30':y='ih/2-(ih/zoom/2)+random(on+1)*60-30':${baseSettings}`;

            default:
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
                }
                return null;
        }
    }
};
