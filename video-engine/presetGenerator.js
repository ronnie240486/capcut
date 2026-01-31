
/**
 * FFmpeg PRESETS ENGINE
 * Mapeia efeitos visuais e movimentos do Frontend para filtros FFmpeg
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

    // --- 1. EFEITOS DE COR E ESTILO (FILTERS) ---
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;
        
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
        
        // Artistic & Glitch
        if(effectId === 'pixelate' || effectId.includes('8bit')) return 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor';
        if(effectId === 'posterize' || effectId === 'pop-art') return 'curves=all=0/0 0.1/0.1 0.2/0.2 0.3/0.3 0.4/0.4 0.5/0.5 0.6/0.6 0.7/0.7 0.8/0.8 0.9/0.9 1/1'; 
        if(effectId === 'invert') return 'negate';
        if(effectId === 'high-contrast') return 'eq=contrast=2.0';
        if(effectId === 'deep-fried') return 'eq=saturation=3:contrast=2,unsharp=5:5:2.0:5:5:2.0';
        if(effectId === 'sketch-sim') return 'edgedetect=low=0.1:high=0.4,negate';
        
        // Retro
        if(effectId === 'old-film') return 'noise=alls=20:allf=t+u,eq=saturation=0.7';
        if(effectId === 'vignette') return 'vignette=PI/4';
        
        return null;
    },

    // --- 2. MOVIMENTOS DE CÂMERA (ZOOMPAN / CROP) ---
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; 
        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // Cinematic Pans (Panorâmicas)
        if (moveId === 'kenBurns') return `${base}:z='1.0+(0.3)*${progress}':x='${centerX}':y='${centerY}'`;
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
        
        // Shakes & Chaos (Earthquake / Jitter)
        // Simulado usando crop randômico a cada frame
        if (moveId && (moveId.includes('shake') || moveId.includes('earthquake') || moveId.includes('jitter') || moveId.includes('handheld') || moveId.includes('violent'))) {
            const intensity = (moveId.includes('violent') || moveId.includes('earthquake')) ? 40 : 10;
            return `crop=w=iw*0.9:h=ih*0.9:x='(iw-ow)/2+((random(1)-0.5)*${intensity})':y='(ih-oh)/2+((random(2)-0.5)*${intensity})',scale=1280:720`;
        }

        // Pulse / Bounce (Zoom oscilante)
        if (moveId && (moveId.includes('bounce') || moveId.includes('pulse') || moveId.includes('heartbeat'))) {
             return `${base}:z='if(lt(${progress},0.5), 1.0+0.1*sin(${progress}*2*3.14), 1.1-0.1*sin((${progress}-0.5)*2*3.14))':x='${centerX}':y='${centerY}'`;
        }

        // Se for imagem e não tiver movimento, aplica um micro-zoom padrão para não ficar estático
        if (isImage) return `${base}:z='1.0+(0.05)*${progress}':x='${centerX}':y='${centerY}'`;
        
        return null;
    },

    // --- 3. TRANSIÇÕES (XFADE) - MAPEAMENTO COMPLETO ---
    getTransitionXfade: (id) => {
        const map = {
            // === CAPCUT TRENDS & GLITCH (Proxy) ===
            'blood-mist': 'dissolve', // Não existe mist nativo, dissolve é suave
            'black-smoke': 'fadeblack', // Fade para preto simula fumaça escura
            'white-smoke': 'fadewhite', // Fade para branco simula fumaça clara
            'fire-burn': 'circleopen', // Círculo de fogo expandindo
            'burn': 'circleopen',
            'color-glitch': 'pixelize', // "Falha de C" -> Pixelização é o glitch padrão
            'glitch-chroma': 'pixelize',
            'urban-glitch': 'hblur', // Blur horizontal rápido
            'visual-buzz': 'pixelize',
            'rip-diag': 'wipetl', // "Rasgo Diagonal" -> Wipe Top-Left
            'paper-rip': 'wipetl',
            'zoom-neg': 'zoomin', // Inversão de cores não tem no xfade, usa zoom
            'infinity-1': 'distance', 
            'digital-paint': 'hblur',
            'brush-wind': 'slideleft',
            'dust-burst': 'dissolve',
            'lens-flare': 'fadewhite', // Flare é luz branca
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
            'cyber-slice': 'rectcrop', // Corte retangular
            'scan-line-v': 'vuslice', // Scan vertical

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
            'cover-left': 'slideleft',
            
            // === FORMAS GEOMÉTRICAS (Shapes) ===
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'diamond-in': 'diagtl', // Losango expandindo (aprox. diagonal)
            'diamond-out': 'diagbr', 
            'diamond-zoom': 'circleopen',
            'triangle-wipe': 'wipetl', // Triângulo (aprox.)
            'heart-wipe': 'circleopen', // Coração (fallback para círculo)
            'star-zoom': 'circleopen', // Estrela (fallback)
            'hex-reveal': 'circleopen', 
            'plus-wipe': 'zoomin', // Cruz (aprox.)
            
            // === RELÓGIO E RADIAL ===
            'clock-wipe': 'radial', // Ponteiro de relógio
            'wipe-radial': 'radial',
            'spiral-wipe': 'radial',
            'swirl': 'radial',
            
            // === PERSIANAS E GRADES ===
            'blind-h': 'horzopen', // Persianas Horizontais
            'blind-v': 'vertopen', // Persianas Verticais
            'stripes-h': 'horzopen',
            'stripes-v': 'vertopen',
            'barn-door-h': 'horzopen',
            'barn-door-v': 'vertopen',
            'shutters': 'horzclose',
            'checker-wipe': 'pixelize', // Xadrez (Pixelize simula blocos)
            'checkerboard': 'pixelize',
            'grid-flip': 'pixelize',
            'mosaic-small': 'pixelize',
            'mosaic-large': 'pixelize',
            'dots-reveal': 'pixelize',
            
            // === PAPEL E TEXTURA ===
            'page-turn': 'slideleft',
            'paper-unfold': 'horzopen',
            'burn-paper': 'circleopen',
            'sketch-reveal': 'fade',
            'fold-up': 'slideup',
            
            // === 3D TRANSFORMS (Simulações) ===
            'cube-rotate-l': 'slideleft', 
            'cube-rotate-r': 'slideright',
            'cube-rotate-u': 'slideup',
            'cube-rotate-d': 'slidedown',
            'door-open': 'horzopen',
            'flip-card': 'hlslice', 
            'room-fly': 'zoomin',
            'perspective-left': 'slideleft',
            'perspective-right': 'slideright',
            
            // === ZOOM E SPIN ===
            'zoom-in': 'zoomin',
            'zoom-out': 'zoomout',
            'pull-away': 'zoomout',
            'zoom-blur-l': 'hblur',
            'spin-zoom-in': 'radial',
            'spin-zoom-out': 'radial',
            'spin-cw': 'radial',
            'spin-ccw': 'radial',
            'whip-left': 'slideleft',
            'whip-right': 'slideright',
            
            // === LUZ E ÓTICA ===
            'flash-bang': 'fadewhite',
            'exposure': 'fadewhite',
            'glow-intense': 'fadewhite',
            'flare-pass': 'fadewhite',
            'god-rays': 'fadewhite',
            'light-leak-tr': 'fadewhite',
            'bokeh-blur': 'hblur',
            
            // === LÍQUIDO E ORGÂNICO ===
            'liquid-melt': 'hblur', // Derretimento
            'ink-splash': 'circleopen', // Tinta
            'oil-paint': 'dissolve',
            'water-ripple': 'radial',
            'water-drop': 'circleopen',
            'bubble-pop': 'circleopen',
            'smoke-reveal': 'dissolve',
            
            // === ELÁSTICO E WARP ===
            'elastic-left': 'slideleft',
            'elastic-right': 'slideright',
            'bounce-scale': 'zoomin',
            'jelly': 'hblur',
            'morph': 'dissolve',
            'turbulence': 'hblur',
            'stretch-h': 'hblur',
            'stretch-v': 'hblur',
            
            // === BÁSICOS ===
            'crossfade': 'fade',
            'fade': 'fade',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'luma-fade': 'fade'
        };

        // 1. Verificação Exata
        if (map[id]) return map[id];
        
        // 2. Verificação por Palavra-Chave (Fallback Inteligente)
        // Isso garante que variações como 'wipe-up-fast' caiam em 'wipe-up'
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
        if (id.includes('glitch')) return 'pixelize'; 
        if (id.includes('flash')) return 'fadewhite';
        if (id.includes('burn')) return 'fadewhite';
        if (id.includes('blind')) return 'horzopen';
        if (id.includes('clock')) return 'radial';
        if (id.includes('mosaic')) return 'pixelize';
        
        // 3. Fallback Final
        return 'fade'; 
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
