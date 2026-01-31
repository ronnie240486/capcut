
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

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;
        // Filtros de Cor Básicos
        if(effectId === 'bw' || effectId === 'mono' || effectId.includes('noir')) return 'hue=s=0';
        if(effectId === 'sepia' || effectId.includes('vintage')) return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
        if(effectId === 'warm') return 'curves=r=0/0 1/1:g=0/0 1/0.8:b=0/0 1/0.8';
        if(effectId === 'cool') return 'curves=r=0/0 1/0.8:g=0/0 1/0.8:b=0/0 1/1';
        if(effectId.includes('cyber')) return 'cas=0.6,vibra=50'; // Contrast Adaptive Sharpen + Vibrance
        if(effectId === 'pixelate' || effectId.includes('8bit')) return 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor';
        
        return null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; 
        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        // Cinematic Camera Movements
        if (moveId === 'kenBurns') return `${base}:z='1.0+(0.3)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'dolly-zoom') return `${base}:z='1.4-(0.4)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'pan-slow-l' || moveId === 'mov-pan-slow-l') return `${base}:z=1.2:x='iw*(0.2+(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'pan-slow-r' || moveId === 'mov-pan-slow-r') return `${base}:z=1.2:x='iw*(0.8-(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
        if (moveId === 'pan-slow-u' || moveId === 'mov-pan-slow-u') return `${base}:z=1.2:x='${centerX}':y='ih*(0.2+(0.2)*${progress})-(ih/zoom/2)'`;
        if (moveId === 'pan-slow-d' || moveId === 'mov-pan-slow-d') return `${base}:z=1.2:x='${centerX}':y='ih*(0.8-(0.2)*${progress})-(ih/zoom/2)'`;
        
        // Zooms
        if (moveId && moveId.includes('zoom-in')) return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId && moveId.includes('zoom-out')) return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        
        // Shake (Simulado com crop/move rápido)
        if (moveId && (moveId.includes('shake') || moveId.includes('earthquake'))) {
            return `crop=w=iw*0.9:h=ih*0.9:x='(iw-ow)/2+((random(1)-0.5)*${isImage ? 40 : 20})':y='(ih-oh)/2+((random(2)-0.5)*${isImage ? 40 : 20})',scale=1280:720`;
        }

        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        // --- MAPA EXAUSTIVO DE TODAS AS TRANSIÇÕES DO APP ---
        // Mapeia o ID do Frontend para o ID do xfade do FFmpeg
        
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
            'circle-close': 'circleclose',
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'diamond-in': 'diagtl', // Aproximação visual
            'diamond-out': 'diagbr', 
            'diamond-zoom': 'circleopen',
            'triangle-wipe': 'wipetl', // Wipe diagonal superior esquerdo parece triângulo
            'heart-wipe': 'circleopen', // FFmpeg não tem coração nativo, círculo é o mais próximo
            'star-zoom': 'circleopen', // Fallback para círculo
            'hex-reveal': 'circleopen', // Fallback
            'plus-wipe': 'zoomin', // Expansão do centro
            
            // === RELÓGIO E RADIAL ===
            'clock-wipe': 'radial',
            'wipe-radial': 'radial',
            'spiral-wipe': 'radial',
            
            // === PERSIANAS E GRADES (Blinds/Grid) ===
            'blind-h': 'horzopen',
            'blind-v': 'vertopen',
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
            'sketch-reveal': 'fade', // Difícil simular sketch, usa fade suave
            'fold-up': 'slideup',
            
            // === 3D TRANSFORMS (Simulações) ===
            'cube-rotate-l': 'slideleft', // Slide é a melhor aproximação 2D segura
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
            'glitch': 'pixelize',
            'glitch-chroma': 'pixelize',
            'color-glitch': 'pixelize',
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
            'blood-mist': 'dissolve', // Névoa suave
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'smoke-reveal': 'dissolve',
            'dust-burst': 'dissolve',
            'liquid-melt': 'hblur', // Derretimento = blur
            'ink-splash': 'circleopen', // Tinta expandindo
            'oil-paint': 'dissolve',
            'water-ripple': 'radial', // Ondulação circular
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
            'stretch-v': 'hblur', // Blur vertical não existe no xfade, usa hblur ou dissolve
            
            // === BÁSICOS E CORES ===
            'crossfade': 'fade',
            'fade': 'fade',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'luma-fade': 'fade'
        };

        // Verificação direta
        if (map[id]) return map[id];
        
        // Verificação por "contém" (Fallback inteligente)
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
        
        // Padrão final
        return 'fade'; 
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
