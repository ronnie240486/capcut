
export default {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'ultrafast', 
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
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

    // --- 1. COLOR & STYLE FILTERS ---
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;
        
        // Requested Special Effects
        if(effectId === 'zoom-neg' || effectId === 'negative') return 'negate'; // Invert colors
        if(effectId === 'flash-chroma' || effectId === 'flash-c' || effectId === 'color-glitch') return 'hue=h=90:s=2'; // Color shift
        
        // Cinematic & Pro
        if(effectId === 'teal-orange') return 'curves=r=0/0 0.25/0.15 0.5/0.5 0.75/0.85 1/1:b=0/0 0.25/0.35 0.5/0.5 0.75/0.65 1/1';
        if(effectId === 'noir' || effectId === 'mono' || effectId === 'b-and-w-low') return 'hue=s=0,contrast=1.2';
        if(effectId === 'vintage-warm' || effectId === 'sepia' || effectId.includes('vintage')) return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
        if(effectId === 'cool-morning' || effectId === 'cool' || effectId === 'cold-blue') return 'curves=r=0/0 1/0.8:g=0/0 1/0.8:b=0/0 1/1';
        if(effectId === 'cyberpunk' || effectId.includes('neon')) return 'cas=0.6,vibra=50,curves=g=0/0 0.5/0.4 1/1'; 
        if(effectId === 'matrix') return 'colorbalance=gs=0.5:gshadows=0.5,hue=h=90';
        if(effectId === 'horror') return 'colorbalance=rs=0.3:rm=0.3:rh=0.3,hue=s=0.5,noise=alls=20:allf=t+u';
        if(effectId === 'dreamy-blur' || effectId === 'dreamy') return 'gblur=sigma=2,curves=all=0/0 0.5/0.6 1/1';
        if(effectId === 'vibrant' || effectId === 'vivid') return 'vibra=intensity=0.6:saturation=1.5';
        if(effectId === 'fade' || effectId === 'muted') return 'curves=all=0/0.1 1/0.9';
        if(effectId === 'night-vision') return 'hue=s=0,curves=g=0/0 1/1:r=0/0 1/0:b=0/0 1/0,noise=alls=30:allf=t+u';
        if(effectId === 'scifi') return 'curves=b=0/0.1 1/1:r=0/0 1/0.9';
        if(effectId === 'golden-hour' || effectId === 'warm' || effectId === 'sunset') return 'curves=r=0/0 1/1:g=0/0 1/0.8:b=0/0 1/0.7';
        if(effectId === 'pastel') return 'curves=all=0/0.1 1/0.9,eq=saturation=0.8';
        if(effectId === 'underwater') return 'eq=brightness=-0.1:saturation=1.2,curves=r=0/0 1/0.8:b=0/0.2 1/1';
        
        // Artistic & Glitch
        if(effectId === 'pixelate' || effectId.includes('8bit')) return 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor';
        if(effectId === 'posterize' || effectId === 'pop-art') return 'curves=all=0/0 0.1/0.1 0.2/0.2 0.3/0.3 0.4/0.4 0.5/0.5 0.6/0.6 0.7/0.7 0.8/0.8 0.9/0.9 1/1'; 
        if(effectId === 'invert') return 'negate';
        if(effectId === 'high-contrast') return 'eq=contrast=2.0';
        if(effectId === 'deep-fried') return 'eq=saturation=3:contrast=2,unsharp=5:5:2.0:5:5:2.0';
        if(effectId === 'sketch-sim') return 'edgedetect=low=0.1:high=0.4,negate';
        if(effectId === 'glitch-pro-1') return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'; 
        
        // Retro
        if(effectId === 'old-film') return 'noise=alls=20:allf=t+u,eq=saturation=0.7';
        if(effectId === 'vignette') return 'vignette=PI/4';
        if(effectId === 'grain' || effectId === 'noise') return 'noise=alls=20:allf=t+u';
        if(effectId === 'sepia-max') return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';

        // Custom Color Grading (cg-pro-*)
        if(effectId.startsWith('cg-pro-')) {
            const num = parseInt(effectId.split('-')[2]) || 1;
            const sat = 1 + (num % 5) * 0.1;
            const con = 1 + (num % 3) * 0.1;
            return `eq=saturation=${sat}:contrast=${con}`;
        }
        
        return null;
    },

    // --- 2. CAMERA MOVEMENTS (ZoomPan / Crop) ---
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; 
        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // Cinematic Pans (Panorâmicas)
        if (moveId === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            return `${base}:z='${startScale}+(${endScale}-${startScale})*${progress}':x='${centerX}':y='${centerY}'`;
        }
        
        if (moveId === 'pan-slow-l' || moveId === 'mov-pan-slow-l') return `${base}:z=1.2:x='iw*(0.2+(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'pan-slow-r' || moveId === 'mov-pan-slow-r') return `${base}:z=1.2:x='iw*(0.8-(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'pan-slow-u' || moveId === 'mov-pan-slow-u') return `${base}:z=1.2:x='${centerX}':y='ih*(0.2+(0.2)*${progress})-(ih/zoom/2)'`;
        if (moveId === 'pan-slow-d' || moveId === 'mov-pan-slow-d') return `${base}:z=1.2:x='${centerX}':y='ih*(0.8-(0.2)*${progress})-(ih/zoom/2)'`;
        
        if (moveId === 'mov-pan-fast-l') return `${base}:z=1.2:x='iw*(0.0+(0.5)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'mov-pan-fast-r') return `${base}:z=1.2:x='iw*(1.0-(0.5)*${progress})-(iw/zoom/2)':y='${centerY}'`;

        // Zooms
        if (moveId && (moveId.includes('zoom-in') || moveId === 'mov-zoom-slow-in')) return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId && (moveId.includes('zoom-out') || moveId === 'mov-zoom-slow-out' || moveId === 'pull-away')) return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'dolly-zoom') return `${base}:z='1.4-(0.4)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'mov-zoom-crash-in') return `${base}:z='1.0+(2.0)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'mov-zoom-crash-out') return `${base}:z='3.0-(2.0)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'mov-zoom-wobble') return `${base}:z='1.2+0.1*sin(${progress}*10)':x='${centerX}':y='${centerY}'`;
        
        // Shakes
        if (moveId && (moveId.includes('shake') || moveId.includes('earthquake') || moveId.includes('jitter') || moveId.includes('handheld') || moveId.includes('violent'))) {
            const intensity = (moveId.includes('violent') || moveId.includes('earthquake')) ? 40 : 10;
            return `crop=w=iw*0.9:h=ih*0.9:x='(iw-ow)/2+((random(1)-0.5)*${intensity})':y='(ih-oh)/2+((random(2)-0.5)*${intensity})',scale=1280:720`;
        }

        // Pulse
        if (moveId && (moveId.includes('bounce') || moveId.includes('pulse') || moveId.includes('heartbeat'))) {
             return `${base}:z='if(lt(${progress},0.5), 1.0+0.1*sin(${progress}*2*3.14), 1.1-0.1*sin((${progress}-0.5)*2*3.14))':x='${centerX}':y='${centerY}'`;
        }

        if (isImage) return `${base}:z='1.0+(0.05)*${progress}':x='${centerX}':y='${centerY}'`;
        
        return null;
    },

    // --- 3. TRANSITIONS (XFADE) ---
    getTransitionXfade: (id) => {
        const map = {
            'blood-mist': 'dissolve',
            'black-smoke': 'fadeblack', 
            'white-smoke': 'fadewhite', 
            'fire-burn': 'circleopen', 
            'burn': 'circleopen',
            'color-glitch': 'pixelize',
            'glitch-chroma': 'pixelize',
            'urban-glitch': 'hblur', 
            'visual-buzz': 'pixelize',
            'rip-diag': 'wipetl', 
            'paper-rip': 'wipetl',
            'zoom-neg': 'zoomin', // Default map
            'infinity-1': 'distance', 
            'digital-paint': 'hblur',
            'brush-wind': 'slideleft',
            'dust-burst': 'dissolve',
            'lens-flare': 'fadewhite', 
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flashback': 'fadewhite',
            'glitch': 'pixelize',
            'pixel-sort': 'pixelize',
            'datamosh': 'hblur',
            'rgb-shake': 'pixelize',
            'hologram': 'fade',
            'digital-noise': 'pixelize',
            'noise-jump': 'pixelize',
            'cyber-slice': 'rectcrop', 
            'scan-line-v': 'vuslice',
            'glitch-scan': 'vuslice',
            'block-glitch': 'pixelize',
            'cyber-zoom': 'zoomin',
            'color-tear': 'hblur',
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'crossfade': 'fade',
            'fade': 'fade',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'luma-fade': 'fade',
            'film-roll': 'slideup',
            'blur-warp': 'hblur'
        };

        if (map[id]) return map[id];
        
        if (id.includes('wipe-up')) return 'wipeup';
        if (id.includes('wipe-down')) return 'wipedown';
        if (id.includes('slide')) return 'slideleft';
        if (id.includes('zoom')) return 'zoomin';
        if (id.includes('spin')) return 'radial';
        if (id.includes('circle')) return 'circleopen';
        if (id.includes('blur')) return 'hblur';
        if (id.includes('glitch')) return 'pixelize'; 
        if (id.includes('flash')) return 'fadewhite';
        
        return 'fade'; 
    }
};
