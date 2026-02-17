
export default {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', 
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-vsync', '1', // CFR: Sincronia de vídeo
        '-r', '30'
    ],

    getAudioArgs: () => [
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2'
    ],

    getAudioExtractArgs: () => [
        '-vn',
        '-acodec', 'libmp3lame',
        '-q:a', '2'
    ],

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;
        
        // Mapeamento de efeitos visuais "Reais" usando filtros complexos do FFmpeg
        const effects = {
            // --- GLITCH & DISTORÇÃO ---
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'scan-line-v': 'drawgrid=x=0:w=4:t=1:c=black@0.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            // RGB Split mais forte para glitch de cor
            'rgb-split': "geq=r='p(X+20,Y)':g='p(X,Y)':b='p(X-20,Y)'",
            'glitch-chroma': "geq=r='p(X+15,Y)':g='p(X,Y)':b='p(X-15,Y)',hue=s=2", 
            
            // Urban Glitch: Hue Cycle + Grid lines + Contrast
            'urban-glitch': "hue=H=2*PI*t:s=2,eq=contrast=1.2,drawgrid=y=0:h=16:t=2:c=black@0.3",

            // Ensure min dim of 2 for pixelate steps
            'pixelate': 'scale=max(2,trunc(iw/20)):max(2,trunc(ih/20)):flags=nearest,scale=iw*20:ih*20:flags=neighbor',
            'block-glitch': 'scale=max(2,trunc(iw/10)):max(2,trunc(ih/10)):flags=nearest,scale=iw*10:ih*10:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u,eq=contrast=1.5:brightness=0.1',
            'vhs-distort': 'curves=r=0/0.1 0.5/0.5 1/1:g=0/0 0.5/0.5 1/1:b=0/0 0.5/0.5 1/0.9,noise=alls=10:allf=t+u,eq=saturation=1.3',
            'glitch-pro-1': "geq=r='p(X+10*sin(T*10),Y)':g='p(X,Y)':b='p(X,Y)'",

            // --- CORES & CINEMA ---
            'zoom-neg': 'negate',
            'negative': 'negate',
            'invert': 'negate',
            'flash-chroma': 'hue=h=90:s=2',
            'flash-c': 'hue=h=90:s=2',
            // Color Glitch: Cycle Hue rapidly
            'color-glitch': 'hue=H=2*PI*t:s=2', 
            'color-tear': 'hue=H=PI*t:s=3',
            
            'teal-orange': 'curves=r=0/0 0.25/0.15 0.5/0.5 0.75/0.85 1/1:b=0/0 0.25/0.35 0.5/0.5 0.75/0.65 1/1',
            'noir': 'hue=s=0,contrast=1.5,eq=brightness=-0.1',
            'mono': 'hue=s=0,contrast=1.2',
            'b-and-w-low': 'hue=s=0,contrast=1.2',
            'vintage-warm': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
            'sepia': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
            'cool-morning': 'curves=r=0/0 1/0.8:g=0/0 1/0.8:b=0/0 1/1',
            'cool': 'eq=saturation=0.8,colorbalance=rs=-0.1:gs=0:bs=0.1',
            'cold-blue': 'hue=h=10,eq=saturation=0.5,colorbalance=bs=0.3',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=rs=0.2:gs=-0.1:bs=0.3',
            'radioactive': 'hue=h=90:s=2,eq=contrast=1.5',
            'night-vision': 'hue=s=0,colorbalance=gs=0.5,noise=alls=30:allf=t+u',
            
            // --- RETRO ---
            'old-film': 'noise=alls=20:allf=t+u,vignette=PI/4,hue=s=0.5',
            'grain': 'noise=alls=30:allf=t+u',
            'noise': 'noise=alls=50:allf=t+u',
            'vignette': 'vignette=PI/3',
            'super8': 'vignette=PI/4,hue=s=0.7,curves=r=0/0 0.5/0.6 1/1:b=0/0 0.5/0.4 1/1',

            // --- ARTÍSTICO ---
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'sketch-sim': 'edgedetect=low=0.1:high=0.4,negate,hue=s=0',
            'dreamy': 'gblur=sigma=5,eq=brightness=0.1:saturation=1.2',
            'soft-angel': 'gblur=sigma=2,eq=brightness=0.2:contrast=0.9',
            'underwater': 'eq=saturation=0.8,colorbalance=rs=-0.2:gs=0.1:bs=0.3,gblur=sigma=2'
        };
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const w = targetRes.w;
        const h = targetRes.h;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const zStep = (frames * 0.0015).toFixed(4); // Smooth zoom step
        
        // Base ZoomPan logic
        // z = zoom, d = duration, s = size output, x/y = viewport position
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        
        // --- PULSE / HEARTBEAT LOGIC ---
        if (moveId && (moveId.includes('pulse') || moveId.includes('heartbeat'))) {
            // Default base frequency: 0.5 Hz (1 pulse every 2 seconds) - SLOWER
            let baseFreq = 0.5;
            
            if (moveId.includes('fast')) baseFreq = 2.0;
            
            // Respect the 'speed' config from the UI slider (defaults to 1)
            const speedMulti = config.speed || 1.0;
            const freq = baseFreq * speedMulti;

            // Oscillation using sin(). time is in seconds.
            // 1.05 + 0.05 * sin(...) oscillates between 1.0 and 1.1
            z = `1.05+0.05*sin(2*PI*time*${freq})`;
            x = `(iw/2)-(iw/zoom/2)`;
            y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (moveId === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            // Simple center zoom
            x = `(iw/2)-(iw/zoom/2)`;
            y = `(ih/2)-(ih/zoom/2)`;
        } 
        else if (moveId === 'zoom-in' || (isImage && !moveId)) {
            // Default gentle zoom in
            z = `min(zoom+0.0015,1.5)`;
            x = `(iw/2)-(iw/zoom/2)`;
            y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (moveId === 'zoom-out') {
            z = `max(1.5-0.0015*on,1.0)`;
            x = `(iw/2)-(iw/zoom/2)`;
            y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (moveId === 'pan-slow-l' || moveId === 'slide-left') {
            z = '1.2'; // Must zoom in slightly to pan without black bars
            x = `(iw-ow)*(on/${frames})`; // Moves viewport right -> content moves left
            y = `(ih-oh)/2`;
        }
        else if (moveId === 'pan-slow-r' || moveId === 'slide-right') {
            z = '1.2';
            x = `(iw-ow)*(1-on/${frames})`; // Content moves right
            y = `(ih-oh)/2`;
        }
        else if (moveId === 'pan-slow-u' || moveId === 'slide-up') {
            z = '1.2';
            x = `(iw-ow)/2`;
            y = `(ih-oh)*(on/${frames})`; // Content moves up
        }
        else if (moveId === 'pan-slow-d' || moveId === 'slide-down') {
            z = '1.2';
            x = `(iw-ow)/2`;
            y = `(ih-oh)*(1-on/${frames})`; // Content moves down
        }
        else if (moveId === 'zoom-crash-in') {
            z = `min(zoom+0.05,2.0)`; // Fast zoom
            x = `(iw/2)-(iw/zoom/2)`;
            y = `(ih/2)-(ih/zoom/2)`;
        }
        else if (moveId && (moveId.includes('shake') || moveId.includes('jitter') || moveId.includes('earthquake'))) {
            // Simulate shake with cropping
            const intensity = moveId.includes('earthquake') ? 20 : 10;
            return `crop=w=iw-${intensity*2}:h=ih-${intensity*2}:x=${intensity}+random(1)*${intensity}:y=${intensity}+random(1)*${intensity},scale=${w}:${h}`;
        }

        // Return Standard Zoompan filter
        return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
    },

    getTransitionXfade: (id) => {
        // TABELA OFICIAL DE XFADE DO FFMPEG MAPEDA PARA NOSSOS IDs
        const map = {
            // --- BÁSICOS ---
            'fade': 'fade',
            'crossfade': 'fade',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'black': 'fadeblack', 
            'white': 'fadewhite',
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            
            // --- GEOMÉTRICO (WIPES) ---
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'rect-crop': 'rectcrop',
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'diamond-in': 'diagtl', // Aproximação
            'diamond-out': 'diagbr', 
            'checker-wipe': 'checkerboard',
            'checkerboard': 'checkerboard',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'radial': 'radial',
            'clock-wipe': 'radial',
            'spiral-wipe': 'radial',
            'wipe-radial': 'radial',
            
            // --- MOVIMENTO (SLIDES) ---
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'push-left': 'slideleft',
            'push-right': 'slideright',
            'smooth-left': 'smoothleft',
            'smooth-right': 'smoothright',
            'squeeze-h': 'squeezeh',
            'squeeze-v': 'squeezev',
            'zoom-in': 'zoomin',
            
            // --- GLITCH & MODERN ---
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'hologram': 'pixelize',
            'glitch': 'pixelize', 
            'glitch-chroma': 'pixelize', 
            'color-glitch': 'hblur', 
            'urban-glitch': 'hblur', // Maps to hblur as xfade can't do hue shifts
            'rgb-split': 'distance',
            'color-tear': 'wipetl',
            
            // --- APROXIMAÇÕES VISUAIS ---
            'page-turn': 'wipetl',
            'cube-rotate-l': 'slideleft', 
            'cube-rotate-r': 'slideright',
            'spin-cw': 'radial', 
            'spin-ccw': 'radial',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            'whip-up': 'slideup',
            'whip-down': 'slidedown',
            'luma-fade': 'fade', // Luma precisa de map externo, fallback
            'blur-warp': 'hblur',
            'morph': 'morph', // Requer ffmpeg mais novo
            'whip-diagonal-1': 'wipetl',
            'whip-diagonal-2': 'wipebr'
        };
        
        // Retorna o mapeamento ou 'fade' como fallback seguro para não quebrar o render
        return map[id] || 'fade';
    }
};
