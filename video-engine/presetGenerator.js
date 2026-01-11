
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

    // --- EFFECT MAPPING ---
    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // Helper for common filters
        const contrast = (val) => `eq=contrast=${val}`;
        const saturate = (val) => `eq=saturation=${val}`;
        const bright = (val) => `eq=brightness=${val}`;
        const hue = (val) => `hue=h=${val}`;
        
        const map = {
            // Cinematic Pro
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,curves=contrast',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2', 
            'noir': 'hue=s=0,eq=contrast=1.3:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            
            // Basic Filters
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'mono': 'hue=s=0',
            'bw': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'vintage': 'colorbalance=rs=0.2:gs=0.1:bs=-0.2,eq=contrast=0.9',
            'dreamy': 'boxblur=2:1,eq=brightness=0.1:saturation=1.2',

            // Artistic
            'pop-art': 'eq=saturation=3:contrast=1.5',
            'sketch-sim': 'hue=s=0,eq=contrast=5:brightness=0.2', // Rough approximation
            'invert': 'negate',
            'high-contrast': 'eq=contrast=2.0',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            
            // Glitch & Retro
            'pixelize': 'scale=iw/10:ih/10,scale=iw*10:ih*10:flags=neighbor',
            'noise': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'eq=saturation=1.5,boxblur=1:1,noise=alls=10:allf=t',
            'old-film': 'eq=saturation=0.5:contrast=0.8,noise=alls=15:allf=t',
            
            // Lighting
            'exposure': 'eq=brightness=0.3',
            'darken': 'eq=brightness=-0.3',
        };

        // Handle Procedural IDs
        if (map[effectId]) return map[effectId];

        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const c = 1 + (i % 5) * 0.1;
            const s = 1 + (i % 3) * 0.2;
            const h = (i * 15) % 360;
            return `eq=contrast=${c}:saturation=${s},hue=h=${h}`;
        }

        if (effectId.startsWith('vintage-style-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            const sepia = 0.1 + (i % 5) * 0.05;
            return `colorbalance=rs=${sepia}:bs=-${sepia},eq=contrast=0.9`;
        }
        
        if (effectId.startsWith('cyber-neon-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=contrast=1.2:saturation=1.5,hue=h=${i*10}`;
        }
        
        if (effectId.startsWith('nature-fresh-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `eq=saturation=1.3:brightness=0.05,hue=h=-${i*2}`;
        }

        if (effectId.startsWith('noir-style-')) {
             const i = parseInt(effectId.split('-')[2]) || 1;
             return `hue=s=0,eq=contrast=${1 + i*0.05}:brightness=${-0.1 + i*0.01}`;
        }
        
        // Generic Fallbacks based on string inclusion
        if (effectId.includes('neon')) return 'eq=saturation=2:contrast=1.1';
        if (effectId.includes('blur')) return 'boxblur=5:1';
        if (effectId.includes('sharp')) return 'unsharp=5:5:1.0:5:5:0.0';

        return null;
    },

    // --- MOVEMENT MAPPING ---
    getMovementFilter: (moveId, durationSec) => {
        const d = durationSec || 5;
        // Total Frames is used for normalization in zoompan (on/totalFrames)
        // However, zoompan 'd' param effectively controls step size. 
        // We use standard FPS=30.
        const fps = 30;
        const totalFrames = Math.ceil(d * 30);
        
        // Base ZoomPan Config
        // d=1 means the zoompan output duration is 1 frame per input frame (preserving speed). 
        // s=1280x720 ensures output resolution.
        const base = `:d=1:s=1280x720:fps=30`; 
        const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

        switch (moveId) {
            // === 1. CAMERA PANS ===
            case 'mov-pan-slow-l': 
                // Zoom 1.2, pan from center to right (showing left) or right to left
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-slow-r': 
                return `zoompan=z=1.2:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-slow-u': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-(on/${totalFrames}))'${base}`;
            case 'mov-pan-slow-d': 
                return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${totalFrames})'${base}`;
            
            case 'mov-pan-fast-l': 
                return `zoompan=z=1.4:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)'${base}`;
            case 'mov-pan-fast-r': 
                return `zoompan=z=1.4:x='(iw-iw/zoom)*(1-(on/${totalFrames}))':y='ih/2-(ih/zoom/2)'${base}`;
                
            // === 2. DYNAMIC ZOOMS ===
            case 'mov-zoom-crash-in': 
            case 'zoom-fast-in':
            case 'zoom-in':
                return `zoompan=z='min(1.0+(on*1.5/${totalFrames}),2.5)':${center}${base}`;
            
            case 'mov-zoom-crash-out': 
            case 'zoom-out':
                return `zoompan=z='max(2.5-(on*1.5/${totalFrames}),1.0)':${center}${base}`;
                
            case 'mov-zoom-slow-in':
            case 'zoom-slow-in':
            case 'kenBurns':
                 return `zoompan=z='min(1.0+(on*0.5/${totalFrames}),1.4)':${center}${base}`;

            case 'mov-zoom-slow-out':
            case 'zoom-slow-out':
                 return `zoompan=z='max(1.4-(on*0.5/${totalFrames}),1.0)':${center}${base}`;

            case 'mov-zoom-bounce':
            case 'zoom-bounce':
            case 'mov-zoom-bounce-in':
                 // Sin wave zoom
                 return `zoompan=z='1.0+0.1*abs(sin(on*0.1))':${center}${base}`;
            
            case 'mov-zoom-pulse-slow':
                 return `zoompan=z='1.0+0.05*sin(on*0.05)':${center}${base}`;
            case 'mov-zoom-pulse-fast':
            case 'pulse':
                 return `zoompan=z='1.0+0.1*sin(on*0.2)':${center}${base}`;

            case 'mov-dolly-vertigo':
            case 'dolly-zoom':
                 // Simulate dolly zoom by zooming in while scaling (requires crop/scale combo ideally, but zoompan approximates visual change)
                 return `zoompan=z='min(1.0+(on*1.0/${totalFrames}),2.0)':${center}${base}`;

            // === 3. SHAKES & HANDHELD ===
            case 'handheld-1':
                 return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+sin(on*0.1)*2':y='ih/2-(ih/zoom/2)+cos(on*0.13)*2'${base}`;
            case 'handheld-2':
                 return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+sin(on*0.2)*5':y='ih/2-(ih/zoom/2)+cos(on*0.25)*5'${base}`;
            case 'shake-hard':
            case 'mov-shake-violent':
                 return `zoompan=z=1.2:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*50':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*50'${base}`;
            case 'earthquake':
                 return `zoompan=z=1.1:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*30':y='ih/2-(ih/zoom/2)+(random(1)-0.5)*30'${base}`;
            case 'jitter':
            case 'mov-jitter-x':
                 return `zoompan=z=1.05:x='iw/2-(iw/zoom/2)+(random(1)-0.5)*10':y='ih/2-(ih/zoom/2)'${base}`;

            // === 4. ROTATION / SPIN ===
            case 'mov-3d-spin-axis': 
            case 'spin-slow':
                // Rotate filter. Note: This changes filter chain structure in builder, but returning here works if builder appends
                return `rotate='t*0.5':ow=iw:oh=ih:c=black`;
            
            case 'mov-3d-swing-l':
            case 'pendulum':
                return `rotate='sin(t*2)*0.1':ow=iw:oh=ih:c=black`;
            
            case 'wiggle':
                return `rotate='sin(t*10)*0.05':ow=iw:oh=ih:c=black`;
            
            // === 5. ENTRY ANIMATIONS (Simulated with Zoom/Crop) ===
            case 'slide-in-left': 
                // Pan from Left: x goes from 0 to center? No, x defines top-left corner of viewport.
                // To slide in from left, we pan the viewport from left-most to center.
                // Actually easier to just zoom in from a side.
                return `zoompan=z=1.0:x='if(lte(on,30),(iw/2-(iw/zoom/2)) - (iw)*(1-on/30), iw/2-(iw/zoom/2))':y='ih/2-(ih/zoom/2)'${base}`;
            
            case 'slide-in-bottom':
                return `zoompan=z=1.0:y='if(lte(on,30),(ih/2-(ih/zoom/2)) + (ih)*(1-on/30), ih/2-(ih/zoom/2))':x='iw/2-(iw/zoom/2)'${base}`;
            
            case 'pop-in':
                // Start z=0 (invalid), start z=0.1 to 1
                return `zoompan=z='if(lte(on,15),min(on/15,1.0),1.0)':${center}${base}`;
            
            // === 6. EFFECTS ===
            case 'photo-flash':
            case 'strobe':
            case 'mov-strobe-move':
                return `eq=brightness='if(lt(mod(n,10),5),0.5,0)'`;
            
            case 'heartbeat':
                return `zoompan=z='if(lt(mod(on,30),5),1.2,1.0)':${center}${base}`;
            
            case 'mov-frame-skip':
                return `fps=10`;

            default:
                // Fallback for any unknown moveId that contains "zoom"
                if (moveId && moveId.includes('zoom')) {
                    return `zoompan=z='min(1.0+(on*0.3/${totalFrames}),1.3)':${center}${base}`;
                }
                return null;
        }
    },

    // --- TRANSITION MAPPING (XFADE) ---
    getTransitionXfade: (transId) => {
        const map = {
            'fade-classic': 'fade',
            'crossfade': 'fade',
            'wipe-up': 'wipeup',
            'wipe-down': 'wipedown',
            'wipe-left': 'wipeleft',
            'wipe-right': 'wiperight',
            'slide-left': 'slideleft',
            'slide-right': 'slideright',
            'slide-up': 'slideup',
            'slide-down': 'slidedown',
            'circle-open': 'circleopen',
            'circle-close': 'circleclose',
            'diamond-in': 'diagtl',
            'diamond-out': 'diagbr',
            'clock-wipe': 'clock',
            'iris-in': 'iris',
            'iris-out': 'iris',
            'pixelize': 'pixelize',
            'zoom-in': 'zoomin',
            'zoom-out': 'zoomout',
            'blood-mist': 'dissolve', // Fallback
            'black-smoke': 'fadeblack',
            'white-smoke': 'fadewhite',
            'flash-white': 'fadewhite',
            'flash-black': 'fadeblack',
            'glitch': 'glitchdisplace',
            'color-glitch': 'glitchmem',
            'rip-diag': 'wipetl',
            'checker-wipe': 'checkerboard',
            'blind-h': 'hblur',
            'blind-v': 'vblur',
            'mix': 'fade',
            'dissolve': 'dissolve',
            'hologram': 'holographic', // If ffmpeg supports or fallback
            'pixel-sort': 'pixelize',
            'mosaic-small': 'mosaic',
            'mosaic-large': 'mosaic',
            'spiral-wipe': 'spiral',
            'page-turn': 'coverleft', // Approx
            'burn': 'luma', // Approx
            'whip-left': 'whipleft',
            'whip-right': 'whipright',
            'distance': 'distance',
            'smoothleft': 'smoothleft',
            'smoothright': 'smoothright',
            'smoothup': 'smoothup',
            'smoothdown': 'smoothdown'
        };
        return map[transId] || 'fade';
    }
};
