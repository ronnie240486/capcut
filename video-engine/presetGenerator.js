
/**
 * FFmpeg PRESETS ENGINE
 * Sincronizado com index.html para fidelidade visual
 */

const FINAL_FILTER = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p,fps=30';

module.exports = {
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

    // Mapeia Efeitos de Cor (Filters)
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;
        
        // --- CINEMATIC & PRO ---
        if(effectId === 'teal-orange') return 'curves=r=0/0 0.25/0.15 0.5/0.5 0.75/0.85 1/1:b=0/0 0.25/0.35 0.5/0.5 0.75/0.65 1/1';
        if(effectId === 'noir' || effectId === 'mono' || effectId === 'b-and-w-low') return 'hue=s=0,contrast=1.2';
        if(effectId === 'vintage-warm' || effectId === 'sepia') return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
        if(effectId === 'cool-morning' || effectId === 'cool') return 'curves=r=0/0 1/0.8:g=0/0 1/0.8:b=0/0 1/1';
        if(effectId === 'cyberpunk') return 'cas=0.6,vibra=50,curves=g=0/0 0.5/0.4 1/1'; 
        if(effectId === 'matrix') return 'colorbalance=gs=0.5:gshadows=0.5,hue=h=90';
        if(effectId === 'horror') return 'colorbalance=rs=0.3:rm=0.3:rh=0.3,hue=s=0.5,noise=alls=20:allf=t+u';
        if(effectId === 'dreamy-blur' || effectId === 'dreamy') return 'gblur=sigma=2,curves=all=0/0 0.5/0.6 1/1';
        if(effectId === 'vibrant' || effectId === 'vivid') return 'vibra=intensity=0.6:saturation=1.5';
        if(effectId === 'fade') return 'curves=all=0/0.1 1/0.9';
        if(effectId === 'night-vision') return 'hue=s=0,curves=g=0/0 1/1:r=0/0 1/0:b=0/0 1/0,noise=alls=30:allf=t+u';
        if(effectId === 'scifi') return 'curves=b=0/0.1 1/1:r=0/0 1/0.9';
        
        // --- ARTISTIC & GLITCH ---
        if(effectId === 'pixelate' || effectId.includes('8bit')) return 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor';
        if(effectId === 'posterize') return 'curves=all=0/0 0.1/0.1 0.2/0.2 0.3/0.3 0.4/0.4 0.5/0.5 0.6/0.6 0.7/0.7 0.8/0.8 0.9/0.9 1/1'; // Aproximação
        if(effectId === 'invert') return 'negate';
        if(effectId === 'high-contrast') return 'eq=contrast=2.0';
        if(effectId === 'deep-fried') return 'eq=saturation=3:contrast=2,unsharp=5:5:2.0:5:5:2.0';
        
        // --- RETRO ---
        if(effectId === 'old-film') return 'noise=alls=20:allf=t+u,eq=saturation=0.7';
        if(effectId === 'vignette') return 'vignette=PI/4';
        
        return null;
    },

    // Mapeia Movimentos de Câmera (Zoom/Pan)
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; 
        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // 1. Cinematic Pans
        if (moveId === 'kenBurns') return `${base}:z='1.0+(0.3)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'pan-slow-l' || moveId === 'mov-pan-slow-l') return `${base}:z=1.2:x='iw*(0.2+(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'pan-slow-r' || moveId === 'mov-pan-slow-r') return `${base}:z=1.2:x='iw*(0.8-(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'pan-slow-u' || moveId === 'mov-pan-slow-u') return `${base}:z=1.2:x='${centerX}':y='ih*(0.2+(0.2)*${progress})-(ih/zoom/2)'`;
        if (moveId === 'pan-slow-d' || moveId === 'mov-pan-slow-d') return `${base}:z=1.2:x='${centerX}':y='ih*(0.8-(0.2)*${progress})-(ih/zoom/2)'`;
        
        // 2. Zooms
        if (moveId && (moveId.includes('zoom-in') || moveId === 'mov-zoom-slow-in')) return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId && (moveId.includes('zoom-out') || moveId === 'mov-zoom-slow-out')) return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'dolly-zoom') return `${base}:z='1.4-(0.4)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'mov-zoom-crash-in') return `${base}:z='1.0+(2.0)*${progress}':x='${centerX}':y='${centerY}'`; // Rápido
        
        // 3. Shakes & Chaos (Simulado com crop randômico)
        if (moveId && (moveId.includes('shake') || moveId.includes('earthquake') || moveId.includes('jitter') || moveId.includes('handheld'))) {
            const intensity = moveId.includes('violent') || moveId.includes('earthquake') ? 40 : 10;
            return `crop=w=iw*0.9:h=ih*0.9:x='(iw-ow)/2+((random(1)-0.5)*${intensity})':y='(ih-oh)/2+((random(2)-0.5)*${intensity})',scale=1280:720`;
        }

        // 4. Elastic / Bounce (Simulação simples de zoom in/out)
        if (moveId && (moveId.includes('bounce') || moveId.includes('elastic'))) {
             return `${base}:z='if(lt(${progress},0.5), 1.0+0.2*sin(${progress}*3.14), 1.2-0.2*sin((${progress}-0.5)*3.14))':x='${centerX}':y='${centerY}'`;
        }

        if (isImage) return `${base}:z=1`;
        return null;
    },

    // Mapeamento EXAUSTIVO de Transições (Frontend ID -> FFmpeg xfade)
    getTransitionXfade: (id) => {
        const map = {
            // === GEOMETRIC & WIPES (Direcionais) ===
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'push-left': 'slideleft',
            'push-right': 'slideright',
            'push-up': 'slideup',
            'push-down': 'slidedown',
            
            // === FORMAS GEOMÉTRICAS (Shapes) ===
            'circle-open': 'circleopen',
            'circle-close': 'circleclose', // Simula fechamento invertendo ordem visualmente
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'diamond-in': 'diagtl', // Aproximação visual (Losango expandindo)
            'diamond-out': 'diagbr', 
            'diamond-zoom': 'circleopen',
            'triangle-wipe': 'wipetl', // Wipe diagonal superior
            'heart-wipe': 'circleopen', // Fallback visual
            'star-zoom': 'circleopen', // Fallback visual
            'hex-reveal': 'circleopen', // Fallback visual
            'plus-wipe': 'zoomin', // Expansão do centro
            
            // === RELÓGIO E RADIAL ===
            'clock-wipe': 'radial', // O FFmpeg tem 'radial' que é igual ao relógio
            'wipe-radial': 'radial',
            'spiral-wipe': 'radial',
            
            // === PERSIANAS E GRADES (Blinds/Grid) ===
            'blind-h': 'horzopen', // Persianas Horizontais
            'blind-v': 'vertopen', // Persianas Verticais
            'stripes-h': 'horzopen',
            'stripes-v': 'vertopen',
            'barn-door-h': 'horzopen',
            'barn-door-v': 'vertopen',
            'shutters': 'horzclose',
            'checker-wipe': 'pixelize', // Xadrez vira pixelização (visual de blocos)
            'checkerboard': 'pixelize',
            'grid-flip': 'pixelize',
            'mosaic-small': 'pixelize',
            'mosaic-large': 'pixelize',
            'dots-reveal': 'pixelize',
            
            // === PAPEL E TEXTURA ===
            'paper-rip': 'wipetl', // Rasgo diagonal
            'rip-diag': 'wipetl',
            'page-turn': 'slideleft',
            'paper-unfold': 'horzopen',
            'burn-paper': 'circleopen', // Queimadura expandindo do centro
            'sketch-reveal': 'fade', // Fade suave
            'fold-up': 'slideup',
            
            // === 3D TRANSFORMS (Simulações) ===
            'cube-rotate-l': 'slideleft', 
            'cube-rotate-r': 'slideright',
            'cube-rotate-u': 'slideup',
            'cube-rotate-d': 'slidedown',
            'door-open': 'horzopen',
            'flip-card': 'hlslice', // Slice horizontal parece flip
            'room-fly': 'zoomin',
            'perspective-left': 'slideleft',
            'perspective-right': 'slideright',
            
            // === ZOOM E SPIN ===
            'zoom-in': 'zoomin',
            'zoom-out': 'zoomout',
            'pull-away': 'zoomout',
            'zoom-neg': 'zoomout',
            'cyber-zoom': 'zoomin',
            'infinity-1': 'zoomin',
            'spin-zoom-in': 'radial', // Radial simula giro
            'spin-zoom-out': 'radial',
            'spin-cw': 'radial',
            'spin-ccw': 'radial',
            'zoom-spin-fast': 'radial',
            
            // === GLITCH, DIGITAL E CYBER ===
            'glitch': 'pixelize', // O mais próximo de glitch nativo
            'glitch-chroma': 'pixelize',
            'color-glitch': 'pixelize', // "Falha de Cor"
            'urban-glitch': 'pixelize',
            'visual-buzz': 'pixelize',
            'block-glitch': 'pixelize',
            'pixel-sort': 'pixelize',
            'datamosh': 'hblur', // Motion blur horizontal
            'corrupt-img': 'hblur',
            'digital-noise': 'dissolve', // Dissolve granulado
            'hologram': 'fade',
            'scan-line-v': 'vuslice', // Slice vertical
            'cyber-slice': 'hlslice',
            'noise-jump': 'dissolve',
            
            // === LUZ, FLASH E ATMOSFERA ===
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flash': 'fadewhite',
            'flashback': 'fadewhite',
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'glow-intense': 'fadewhite',
            'lens-flare': 'fadewhite',
            'god-rays': 'fadewhite',
            'light-leak-tr': 'fadewhite',
            'flare-pass': 'fadewhite',
            'fire-burn': 'circleopen', // Fogo expandindo
            
            // === BLUR, FUMAÇA E LÍQUIDO ===
            'filter-blur': 'hblur',
            'blur-dissolve': 'hblur',
            'blur-warp': 'hblur',
            'dynamic-blur': 'hblur',
            'zoom-blur-l': 'hblur',
            'blood-mist': 'dissolve', 
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'smoke-reveal': 'dissolve',
            'dust-burst': 'dissolve',
            'liquid-melt': 'hblur', 
            'ink-splash': 'circleopen', 
            'oil-paint': 'dissolve',
            'water-ripple': 'radial', 
            'water-drop': 'circleopen',
            'bubble-pop': 'circleopen',
            'bubble-blur': 'radial',
            
            // === ELASTIC E FUN ===
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'elastic-up': 'slideup',
            'elastic-down': 'slidedown',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur',
            'swirl': 'radial',
            'kaleidoscope': 'radial',
            'morph': 'dissolve',
            'turbulence': 'hblur',
            'stretch-h': 'hblur',
            'stretch-v': 'hblur',
            
            // === BÁSICOS E CORES ===
            'crossfade': 'fade',
            'fade': 'fade',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'luma-fade': 'fade'
        };

        // Verificação exata
        if (map[id]) return map[id];
        
        // Verificação inteligente por string parcial (Fallback robusto)
        if (id.includes('wipe-up')) return 'wipeup';
        if (id.includes('wipe-down')) return 'wipedown';
        if (id.includes('wipe-left')) return 'wipeleft';
        if (id.includes('wipe-right')) return 'wiperight';
        
        if (id.includes('slide-up')) return 'slideup';
        if (id.includes('slide-down')) return 'slidedown';
        if (id.includes('slide-left')) return 'slideleft';
        if (id.includes('slide-right')) return 'slideright';
        
        if (id.includes('zoom')) return 'zoomin';
        if (id.includes('spin')) return 'radial';
        if (id.includes('circle')) return 'circleopen';
        if (id.includes('blur')) return 'hblur';
        if (id.includes('glitch')) return 'pixelize'; // Garante que qualquer glitch caia aqui
        if (id.includes('flash')) return 'fadewhite';
        if (id.includes('burn')) return 'fadewhite';
        if (id.includes('blind')) return 'horzopen';
        
        // Padrão final de segurança
        return 'fade'; 
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
