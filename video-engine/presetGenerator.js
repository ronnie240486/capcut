
export default {
    getVideoArgs: () => [
        '-c:v', 'libx264',
        '-preset', 'veryfast', // Otimizado para renderização rápida
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

    // --- 1. EFFECTS (Mapeamento de CSS Filters para FFmpeg 'eq', 'curves', 'hue') ---
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // Procedural Color Grades (cg-pro-1 a 50)
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const con = (1 + (i % 5) * 0.1).toFixed(2);
            const sat = (1 + (i % 3) * 0.2).toFixed(2);
            const hue = (i * 15) % 360;
            return `eq=contrast=${con}:saturation=${sat},hue=h=${hue}`;
        }

        // Procedural Vintage (vintage-style-1 a 30)
        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
            const i = parseInt(vinMatch[1], 10);
            const intensity = 0.3 + (i % 5) * 0.1;
            // Simulação de Sepia usando colorbalance
            return `eq=saturation=0.5:contrast=0.9,colorbalance=rs=${intensity}:bs=-${intensity}`;
        }

        // Mapeamento Estático Completo
        const effects = {
            // Cinematic & Colors
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.05',
            'matrix': 'colorbalance=gs=0.3:gh=0.3,eq=contrast=1.2:saturation=1.5',
            'vintage-warm': 'colorbalance=rs=0.3:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.1',
            'cyberpunk': 'eq=contrast=1.4:saturation=2.0,colorbalance=rs=0.2:bs=0.3',
            'horror': 'hue=s=0.2,eq=contrast=1.5:brightness=-0.2,vignette',
            'golden-hour': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=saturation=1.4',
            'night-vision': 'hue=s=0,colorbalance=gs=0.5,noise=alls=30:allf=t+u',
            'scifi': 'eq=contrast=1.3,colorbalance=bs=0.4',
            'posterize': 'curves=posterize', // Requer build complexo, fallback para eq
            'fade': 'eq=contrast=0.8:brightness=0.1',
            'vibrant': 'eq=saturation=2.5:contrast=1.1',
            'muted': 'eq=saturation=0.5:contrast=0.9',
            'b-and-w-low': 'hue=s=0,eq=contrast=0.8',
            'cold-blue': 'colorbalance=bs=0.4,eq=saturation=0.8',

            // Glitch & Distortion
            'glitch-scan': 'drawgrid=y=0:h=4:t=1:c=black@0.5,hue=H=2*PI*t:s=1.5',
            'scan-line-v': 'drawgrid=x=0:w=4:t=1:c=black@0.5',
            'chromatic': "geq=r='p(X+5,Y)':g='p(X,Y)':b='p(X-5,Y)'",
            'rgb-split': "geq=r='p(X+10,Y)':g='p(X,Y)':b='p(X-10,Y)'",
            'glitch-chroma': "geq=r='p(X+15,Y)':g='p(X,Y)':b='p(X-15,Y)',hue=s=2",
            'urban-glitch': "hue=H=2*PI*t:s=2,eq=contrast=1.2,drawgrid=y=0:h=16:t=2:c=black@0.3",
            'pixelate': 'scale=iw/20:ih/20:flags=nearest,scale=iw*20:ih*20:flags=neighbor',
            'block-glitch': 'scale=iw/10:ih/10:flags=nearest,scale=iw*10:ih*10:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u,eq=contrast=1.5:brightness=0.1',
            'vhs-distort': 'noise=alls=10:allf=t+u,eq=saturation=1.3,gblur=sigma=1',

            // Overlays & Textures (Simulated via filters)
            'old-film': 'noise=alls=20:allf=t+u,vignette=PI/4,hue=s=0.5',
            'grain': 'noise=alls=30:allf=t+u',
            'vignette': 'vignette=PI/3',
            'super8': 'vignette=PI/4,hue=s=0.7,colorbalance=rs=0.1:bs=-0.1',
            'dreamy': 'gblur=sigma=5,eq=brightness=0.1:saturation=1.2',
            'strobe': "drawbox=t=fill:c=white@0.5:enable='lt(mod(t,0.1),0.05)'"
        };

        return effects[effectId] || null;
    },

    // --- 2. MOVEMENTS (Mapeamento de CSS Animations para 'zoompan' e matemática) ---
    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        // zoompan requer d (duration) em frames totais
        const frames = Math.ceil(durationSec * fps); 
        // s (size) define o tamanho do canvas de saída (o zoompan faz crop interno)
        const sizeStr = `s=${targetRes.w}x${targetRes.h}`;
        
        let z = '1.0'; // Zoom expression
        let x = '0';   // X expression (top-left corner of the crop area)
        let y = '0';   // Y expression
        let extra = ''; // Filtros adicionais encadeados

        // Normalização de IDs para garantir match
        const id = moveId || '';

        // -- PANS (Cinematic) --
        if (id.includes('pan-slow-l')) { z='1.2'; x=`(iw-ow)*(on/${frames})`; y='(ih-oh)/2'; }
        else if (id.includes('pan-slow-r')) { z='1.2'; x=`(iw-ow)*(1-on/${frames})`; y='(ih-oh)/2'; }
        else if (id.includes('pan-slow-u')) { z='1.2'; x='(iw-ow)/2'; y=`(ih-oh)*(on/${frames})`; }
        else if (id.includes('pan-slow-d')) { z='1.2'; x='(iw-ow)/2'; y=`(ih-oh)*(1-on/${frames})`; }
        else if (id.includes('pan-fast-l')) { z='1.2'; x=`(iw-ow)*((on*2)/${frames})`; y='(ih-oh)/2'; }
        else if (id.includes('pan-fast-r')) { z='1.2'; x=`(iw-ow)*(1-(on*2)/${frames})`; y='(ih-oh)/2'; }
        else if (id.includes('pan-diag-tl')) { z='1.2'; x=`(iw-ow)*(on/${frames})`; y=`(ih-oh)*(on/${frames})`; }
        else if (id.includes('pan-diag-tr')) { z='1.2'; x=`(iw-ow)*(1-on/${frames})`; y=`(ih-oh)*(on/${frames})`; }
        else if (id.includes('pan-diag-bl')) { z='1.2'; x=`(iw-ow)*(on/${frames})`; y=`(ih-oh)*(1-on/${frames})`; }
        else if (id.includes('pan-diag-br')) { z='1.2'; x=`(iw-ow)*(1-on/${frames})`; y=`(ih-oh)*(1-on/${frames})`; }

        // -- ZOOMS (Dynamic) --
        else if (id.includes('kenBurns')) {
            const start = config.startScale || 1.0;
            const end = config.endScale || 1.3;
            // Interpolação linear de zoom
            z = `${start}+(${end}-${start})*on/${frames}`;
            // Mantém centralizado: x = (largura_imagem - largura_crop_zoom) / 2
            x = '(iw-ow)/2'; y = '(ih-oh)/2';
        }
        else if (id.includes('zoom-slow-in') || id === 'zoom-in') { z=`min(1.0+0.0015*on,1.5)`; x='(iw-ow)/2'; y='(ih-oh)/2'; }
        else if (id.includes('zoom-fast-in')) { z=`min(1.0+0.008*on,2.0)`; x='(iw-ow)/2'; y='(ih-oh)/2'; }
        else if (id.includes('zoom-slow-out') || id === 'zoom-out') { z=`max(1.5-0.0015*on,1.0)`; x='(iw-ow)/2'; y='(ih-oh)/2'; }
        else if (id.includes('zoom-crash-in')) { z=`min(1.0+0.05*on,3.0)`; x='(iw-ow)/2'; y='(ih-oh)/2'; } // Zoom muito rápido
        else if (id.includes('zoom-crash-out')) { z=`max(3.0-0.05*on,1.0)`; x='(iw-ow)/2'; y='(ih-oh)/2'; }
        else if (id.includes('zoom-bounce')) { z=`1.0+0.2*sin(2*PI*on/(${frames}/2))`; x='(iw-ow)/2'; y='(ih-oh)/2'; }
        
        // -- GLITCH & SHAKES (Matemática de 'random' e 'mod') --
        else if (id.includes('shake') || id.includes('earthquake') || id.includes('violent')) {
            const intensity = id.includes('earthquake') ? 40 : 10;
            z='1.1'; // Zoom leve para não mostrar bordas pretas
            x=`(iw-ow)/2 + (random(1)-0.5)*${intensity}`;
            y=`(ih-oh)/2 + (random(1)-0.5)*${intensity}`;
        }
        else if (id.includes('jitter')) {
            z='1.05';
            x=`(iw-ow)/2 + if(lt(mod(on,2),1), 5, -5)`; // Treme a cada frame
            y=`(ih-oh)/2`;
        }
        else if (id.includes('glitch-snap')) {
            z='1.0';
            // Deslocamento agressivo ocasional
            x=`(iw-ow)/2 + if(gt(random(1),0.9), (random(1)-0.5)*100, 0)`; 
            y=`(ih-oh)/2`;
            extra = ',rgbashift=rh=10:bv=10:enable=\'gt(random(1),0.9)\'';
        }
        
        // -- 3D SIMULATED (Usando perspective filter é muito pesado, simulamos com Pan agressivo ou rotação) --
        // Nota: zoompan não faz rotação 3D real. Usamos 'rotate' ou 'shear' se necessário, mas zoompan é mais seguro.
        // Para "3D Flip", a melhor simulação simples no backend sem OpenGL é um scale horizontal invertendo.
        else if (id.includes('3d-roll')) {
             return `rotate=2*PI*t/${durationSec}:ow=iw:oh=ih:c=none`; // Rotação real 360
        }
        else if (id.includes('3d-flip')) {
             // Simulação de flip scale
             // Não suportado perfeitamente em linha única simples sem split complexo.
             // Fallback para um zoom twist
             return `rotate=sin(2*PI*t/${durationSec})*0.1:ow=iw:oh=ih`; 
        }

        // -- ELASTIC & FUN --
        else if (id.includes('bounce-drop')) {
            z='1.0';
            y=`(ih-oh)/2 + abs(sin(2*PI*t))*100`; // Pula no eixo Y
            x='(iw-ow)/2';
        }
        else if (id.includes('jelly')) {
             // Oscilação rápida
             z=`1.0+0.05*sin(10*t)`;
             x='(iw-ow)/2'; y='(ih-oh)/2';
        }

        // Default Image Static Zoom (se nenhum for escolhido para imagem)
        else if (isImage) {
            z='min(1.0+0.001*on,1.1)'; 
            x='(iw-ow)/2'; y='(ih-oh)/2';
        }

        return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:${sizeStr}:fps=${fps}${extra}`;
    },

    // --- 3. TRANSITIONS (Mapeamento Exaustivo para XFADE) ---
    // FFmpeg Xfade suporta muitas transições. Mapeamos os nomes "bonitos" do frontend para os "técnicos" do FFmpeg.
    getTransitionXfade: (id) => {
        const map = {
            // Básicos
            'fade': 'fade', 'crossfade': 'fade', 'mix': 'fade', 'dissolve': 'dissolve',
            'black': 'fadeblack', 'white': 'fadewhite', 'flash': 'fadewhite', 'flash-white': 'fadewhite', 'flash-black': 'fadeblack',
            
            // Wipes & Slides
            'wipe-left': 'wipeleft', 'wipe-right': 'wiperight', 'wipe-up': 'wipeup', 'wipe-down': 'wipedown',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'push-left': 'slideleft', 'push-right': 'slideright', // Push é similar a slide no xfade
            'smooth-left': 'smoothleft', 'smooth-right': 'smoothright',
            
            // Geométricos
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 'circle': 'circleopen',
            'rect-crop': 'rectcrop', 'inset-bottom': 'rectcrop',
            'diamond-in': 'diagtl', 'diamond-out': 'diagbr', // Aprox
            'checker-wipe': 'hlslice', // Aprox visual de checker
            'clock-wipe': 'clock', 'clock': 'clock',
            'radial': 'radial', 'wiperadial': 'radial',
            
            // Glitch & Cyber (Mapeados para os mais caóticos)
            'glitch': 'pixelize', 'pixelize': 'pixelize', 'pixel-sort': 'pixelize',
            'color-glitch': 'hblur', 'urban-glitch': 'wipetl',
            'rgb-shake': 'hblur', 'hologram': 'dissolve', // Fallback suave
            'digital-noise': 'pixelize',
            'cyber-zoom': 'zoomin',
            
            // Zoom & 3D Simulado
            'zoom-in': 'zoomin', 'zoom-out': 'zoomout',
            'spin-cw': 'radial', 'spin-ccw': 'radial', // Radial gira
            'whip-left': 'wipeleft', 'whip-right': 'wiperight', // Whip é rápido, wipe serve
            'cube-rotate': 'slideright', // Não tem cubo 3d nativo no xfade padrão
            
            // Líquidos e Orgânicos
            'liquid-melt': 'dissolve', 'ink-splash': 'circleopen',
            'blood-mist': 'fade', // Complicado simular sangue sem assets
            'smoke': 'dissolve',
            'water-ripple': 'hblur',
            
            // Outros / Fallbacks inteligentes
            'burn': 'dissolve', 'fire-burn': 'dissolve',
            'blur-dissolve': 'distance', 'filter-blur': 'distance',
            'page-turn': 'wipetl', 'paper-unfold': 'wipebl',
            'mosaic': 'pixelize'
        };

        // Retorna o xfade correspondente ou 'fade' (padrão seguro)
        return map[id] || 'fade';
    }
};
