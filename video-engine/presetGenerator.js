
/**
 * FFmpeg FULL PRESETS + MOVEMENTS
 * Production-safe version with SMOOTH ABSOLUTE INTERPOLATION
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
        
        const effects = {
            // Cinematic Pro
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2,eq=contrast=1.1:saturation=1.3',
            'matrix': 'colorbalance=gs=0.4:rs=-0.2:bs=-0.2,eq=contrast=1.2:saturation=1.2',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'vintage-warm': 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.2:saturation=0.8',
            'cool-morning': 'colorbalance=bs=0.2:rs=-0.1,eq=brightness=0.05',
            'cyberpunk': 'eq=contrast=1.2:saturation=1.5,colorbalance=bs=0.2:gs=0.1',
            'dreamy-blur': 'gblur=sigma=2,eq=brightness=1.1',
            'horror': 'hue=s=0.2,eq=contrast=1.5:brightness=-0.2',
            'underwater': 'colorbalance=bs=0.4:gs=0.1,eq=brightness=-0.1',
            'sunset': 'colorbalance=rs=0.3:bs=-0.2,eq=saturation=1.4',
            
            // Basics
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'sepia-max': 'colorbalance=rs=0.4:gs=0.2:bs=-0.4',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'posterize': 'curves=posterize',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            
            // Glitch & Artistic
            'pop-art': 'eq=saturation=2:contrast=1.3',
            'sketch-sim': 'edgedetect=mode=colormix:high=0',
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t'
        };

        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]);
            return `contrast=${1 + (i%5)*0.1}:saturation=${1 + (i%3)*0.2}`;
        }
        if (effectId.startsWith('vintage-style-')) {
             return 'colorbalance=rs=0.2:bs=-0.2,eq=gamma=1.1';
        }
        if (effectId.startsWith('cyber-neon-')) {
             return 'eq=contrast=1.3:saturation=1.5';
        }

        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}) => {
        // SMOOTH MOVEMENT LOGIC
        // We use 'on' (current frame index) and Total Frames to create a linear interpolation (Lerp).
        // This avoids the 'jitter' caused by recursive relative math (zoom+0.001).
        
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        
        // Base zoompan settings. s=1280x720 forces the internal canvas to be HD, preventing low-res upscale jitter.
        const base = `zoompan=d=${isImage ? frames : 1}:s=1280x720:fps=${fps}`; 

        // Normalized progress (0.0 to 1.0)
        // We use (on+1) to ensure we reach the end target smoothly
        const progress = `(on/${frames})`; 

        switch (moveId) {
            case 'kenBurns':
                 // Parameters
                 const sS = config.startScale !== undefined ? Number(config.startScale) : 1.0;
                 const eS = config.endScale !== undefined ? Number(config.endScale) : 1.3; // Lower default end scale for smoothness
                 
                 // Offsets are -50 to 50. Convert to -0.5 to 0.5.
                 // We add 0.5 to center it (0.0 to 1.0 coordinate space)
                 const startXNorm = 0.5 + (config.startX !== undefined ? Number(config.startX) / 100 : 0);
                 const startYNorm = 0.5 + (config.startY !== undefined ? Number(config.startY) / 100 : 0);
                 const endXNorm = 0.5 + (config.endX !== undefined ? Number(config.endX) / 100 : 0);
                 const endYNorm = 0.5 + (config.endY !== undefined ? Number(config.endY) / 100 : 0);
                 
                 // Absolute Zoom Formula
                 const zExpr = `${sS}+(${eS - sS})*${progress}`;
                 
                 // Absolute Center Position Formula (Lerp)
                 const cxExpr = `${startXNorm}+(${endXNorm - startXNorm})*${progress}`;
                 const cyExpr = `${startYNorm}+(${endYNorm - startYNorm})*${progress}`;

                 // Convert Center (cx, cy) to Top-Left corner (x, y) required by zoompan
                 // x = (Center_X * Image_Width) - (Viewport_Width / 2)
                 // Viewport_Width = Image_Width / Zoom
                 const xExpr = `iw*(${cxExpr})-(iw/zoom/2)`;
                 const yExpr = `ih*(${cyExpr})-(ih/zoom/2)`;
                 
                 return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;

            case 'zoom-in':
            case 'zoom-slow-in':
                // Absolute Zoom from 1.0 to 1.5, perfectly centered
                return `${base}:z='1.0+(0.5)*${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            
            case 'zoom-fast-in':
                 // Absolute Zoom from 1.0 to 2.0
                 return `${base}:z='1.0+(1.0)*${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            
            case 'zoom-out':
            case 'zoom-slow-out':
                // Absolute Zoom from 1.5 to 1.0
                return `${base}:z='1.5-(0.5)*${progress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            
            case 'pan-left':
                // Move viewport from Left (0) to Right (max) to simulate image moving Left? 
                // Or Standard Pan: Show left side then right side.
                // Center starts at 0.4 and goes to 0.6
                return `${base}:z=1.2:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            
            case 'pan-right':
                 // Center starts at 0.6 and goes to 0.4
                return `${base}:z=1.2:x='iw*(0.6-(0.2)*${progress})-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            
            case 'pan-up':
                return `${base}:z=1.2:x='iw/2-(iw/zoom/2)':y='ih*(0.4+(0.2)*${progress})-(ih/zoom/2)'`;
            
            case 'pan-down':
                return `${base}:z=1.2:x='iw/2-(iw/zoom/2)':y='ih*(0.6-(0.2)*${progress})-(ih/zoom/2)'`;

            case 'shake':
            case 'earthquake':
            case 'handheld-1':
                // Random shake remains for specific effects
                return `${base}:z=1.1:x='iw/2-(iw/zoom/2)+random(1)*10-5':y='ih/2-(ih/zoom/2)+random(1)*10-5'`;
            
            case 'pulse':
                return `${base}:z='1+0.05*sin(on/30*2*6.28)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
            
            default:
                if (isImage) return `${base}:z=1`;
                return null;
        }
    },

    getTransitionXfade: (id) => {
        const map = {
            'crossfade': 'fade',
            'mix': 'fade',
            'fade-classic': 'fade',
            'fade': 'fade',
            'black': 'fadeblack',
            'white': 'fadewhite',
            'flash-black': 'fadeblack',
            'flash-white': 'fadewhite',
            'flash': 'fadewhite',
            'blur-dissolve': 'distance',
            'blur': 'distance',
            'dynamic-blur': 'distance',
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
            'iris-in': 'circleopen',
            'iris-out': 'circleclose',
            'zoom-in': 'zoomin',
            'zoomin': 'zoomin',
            'zoom-out': 'circleclose', // Fallback mapped to circleclose to allow "zoom out" feel without invalid filter
            'zoomout': 'circleclose',
            'pull-away': 'distance',
            'glitch': 'pixelize',
            'pixelize': 'pixelize',
            'pixel-sort': 'pixelize',
            'rgb-shake': 'hblur',
            'color-glitch': 'distance',
            'urban-glitch': 'squeezev'
        };
        return map[id] || 'fade';
    },

    getFinalVideoFilter: () => FINAL_FILTER
};
