
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
        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,curves=contrast',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2', 
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'posterize': 'curves=posterize',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'dreamy': 'boxblur=2:1,eq=brightness=0.1'
        };
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec) => {
        const d = durationSec || 5;
        const totalFrames = Math.ceil(d * 30);
        
        // Configuração base para evitar jitter: S=1280x720, FPS=30
        // Usamos 'on' (frame number) para cálculos de interpolação mais estáveis que 'time'
        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
        const baseSettings = `d=1:s=1280x720:fps=30`;

        switch (moveId) {
            // --- ZOOMS (Ajustados para suavidade máxima) ---
            case 'zoom-slow-in':
            case 'mov-zoom-pulse-slow':
                return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}:${baseSettings}`;
            
            case 'zoom-in':
            case 'kenBurns':
                return `zoompan=z='min(1.0+(on*0.5/${totalFrames}),1.5)':${center}:${baseSettings}`;

            case 'zoom-fast-in':
            case 'mov-zoom-crash-in':
                return `zoompan=z='min(1.0+(on*1.0/${totalFrames}),2.0)':${center}:${baseSettings}`;

            case 'zoom-out':
            case 'zoom-slow-out':
                return `zoompan=z='max(1.5-(on*0.5/${totalFrames}),1.0)':${center}:${baseSettings}`;
            
            case 'zoom-bounce':
            case 'mov-zoom-bounce-in':
                return `zoompan=z='1.1+0.1*sin(on*0.2)':${center}:${baseSettings}`;

            case 'mov-zoom-twist-in':
                return `zoompan=z='1.0+(on*0.5/${totalFrames})':${center}:${baseSettings},rotate='on*0.05*PI/180'`;

            // --- PANS (Ajustados para movimento linear sem tremer) ---
            case 'pan-left':
            case 'mov-pan-slow-l':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':${baseSettings}`;
            
            case 'pan-right':
            case 'mov-pan-slow-r':
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)':${baseSettings}`;

            case 'mov-pan-slow-u':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))':${baseSettings}`;

            case 'mov-pan-slow-d':
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;

            // --- SHAKES & HANDHELD (Usando Crop Dinâmico para evitar distorção de zoompan) ---
            case 'handheld-1':
                // Escala levemente maior e move a janela de crop
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+10*sin(on*0.1)':'(ih-oh)/2+7*cos(on*0.08)'`;

            case 'handheld-2':
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+20*sin(on*0.15)':'(ih-oh)/2+15*cos(on*0.12)'`;

            case 'shake-hard':
            case 'mov-shake-violent':
            case 'earthquake':
                return `scale=1408:792,crop=1280:720:'(iw-ow)/2+random(on)*30-15':'(ih-oh)/2+random(on+1)*30-15'`;

            case 'jitter':
            case 'mov-jitter-x':
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+random(on)*10-5':(ih-oh)/2`;

            // --- 3D & EFEITOS ESPECIAIS ---
            case 'mov-3d-roll':
                return `rotate='on*2*PI/180'`;
            
            case 'mov-3d-float':
                return `scale=1344:756,crop=1280:720:'(iw-ow)/2+15*sin(on*0.05)':'(ih-oh)/2+25*cos(on*0.03)',rotate='sin(on*0.02)*0.02'`;

            case 'photo-flash':
                return `drawbox=c=white:t=fill:enable='between(mod(on,30),0,2)'`;

            default:
                // Se for ID desconhecido mas começar com 'mov-pan', tentamos um pan genérico
                if (moveId?.startsWith('mov-pan-diag')) {
                    return `zoompan=z=1.3:x='(iw-iw/zoom)*(on/${totalFrames})':y='(ih-ih/zoom)*(on/${totalFrames})':${baseSettings}`;
                }
                return null;
        }
    }
};
