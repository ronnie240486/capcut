
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
        
        // Detailed Effect Mapping matching frontend constants
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
            
            // Basics & Artistic
            'bw': 'hue=s=0',
            'mono': 'hue=s=0',
            'sepia': 'colorbalance=rs=0.3:gs=0.2:bs=-0.2',
            'warm': 'colorbalance=rs=0.1:bs=-0.1',
            'cool': 'colorbalance=bs=0.1:rs=-0.1',
            'vivid': 'eq=saturation=1.5:contrast=1.1',
            'high-contrast': 'eq=contrast=1.5',
            'invert': 'negate',
            'night-vision': 'hue=s=0,eq=contrast=1.2:brightness=0.1,colorbalance=gs=0.5',
            'pop-art': 'eq=saturation=2:contrast=1.3',
            
            // Glitch & Distortion
            'pixelate': 'scale=iw/10:-1,scale=iw*10:-1:flags=neighbor',
            'bad-signal': 'noise=alls=20:allf=t+u',
            'vhs-distort': 'colorbalance=bm=0.1,noise=alls=10:allf=t',
            'old-film': 'noise=alls=20:allf=t+u,eq=contrast=1.2',
            'grain': 'noise=alls=10:allf=t',
        };

        // Procedural Generated Effects Support (Fallbacks)
        if (effectId.startsWith('cg-pro-')) {
            const i = parseInt(effectId.split('-')[2]) || 1;
            return `eq=contrast=${1 + (i%5)*0.1}:saturation=${1 + (i%3)*0.2}`;
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
        // Anti-Shake / High Precision 1080p Processing
        const fps = 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const progress = `(on/${frames})`; // 0.0 to 1.0
        
        // Base Zoompan: 1920x1080 internal resolution
        const base = `zoompan=d=${isImage ? frames : 1}:s=1920x1080:fps=${fps}`; 
        const centerX = `(iw/2)-(iw/zoom/2)`;
        const centerY = `(ih/2)-(ih/zoom/2)`;

        if (moveId === 'kenBurns') {
             const sS = config.startScale !== undefined ? Number(config.startScale) : 1.0;
             const eS = config.endScale !== undefined ? Number(config.endScale) : 1.3;
             const startXNorm = 0.5 + (config.startX !== undefined ? Number(config.startX) / 100 : 0);
             const startYNorm = 0.5 + (config.startY !== undefined ? Number(config.startY) / 100 : 0);
             const endXNorm = 0.5 + (config.endX !== undefined ? Number(config.endX) / 100 : 0);
             const endYNorm = 0.5 + (config.endY !== undefined ? Number(config.endY) / 100 : 0);
             
             const zExpr = `${sS}+(${eS - sS})*${progress}`;
             const xExpr = `iw*(${startXNorm}+(${endXNorm - startXNorm})*${progress})-(iw/zoom/2)`;
             const yExpr = `ih*(${startYNorm}+(${endYNorm - startYNorm})*${progress})-(ih/zoom/2)`;
             
             return `${base}:z='${zExpr}':x='${xExpr}':y='${yExpr}'`;
        }

        if (moveId && moveId.startsWith('mov-pan-')) {
            const panType = moveId.replace('mov-pan-', '');
            const z = 1.2; 
            if (panType === 'slow-l') return `${base}:z=${z}:x='iw*(0.4+(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`; 
            if (panType === 'slow-r') return `${base}:z=${z}:x='iw*(0.6-(0.2)*${progress})-(iw/zoom/2)':y='${centerY}'`;
            // Add more pan types as needed
        }

        if (moveId === 'zoom-in' || moveId === 'zoom-slow-in') return `${base}:z='1.0+(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'zoom-out' || moveId === 'zoom-slow-out') return `${base}:z='1.5-(0.5)*${progress}':x='${centerX}':y='${centerY}'`;
        if (moveId === 'dolly-zoom') return `${base}:z='1.0+(0.5)*sin(on/30*3)':x='${centerX}':y='${centerY}'`; 
        
        if (['shake', 'earthquake'].includes(moveId)) {
            const intensity = 5;
            return `${base}:z=1.1:x='${centerX}+random(1)*${intensity}-${intensity/2}':y='${centerY}+random(1)*${intensity}-${intensity/2}'`;
        }

        // Default for images: Static zoom 1
        if (isImage) return `${base}:z=1`;
        return null;
    },

    getTransitionXfade: (id) => {
        const map = {
            'wipe-up': 'wipeup', 'wipe-down': 'wipedown', 'wipe-left': 'wipeleft', 'wipe-right': 'wiperight',
            'slide-left': 'slideleft', 'slide-right': 'slideright', 'slide-up': 'slideup', 'slide-down': 'slidedown',
            'circle-open': 'circleopen', 'circle-close': 'circleclose', 
            'zoom-in': 'zoomin', 'zoom-out': 'circleclose',
            'crossfade': 'fade', 'fade': 'fade',
            'pixelize': 'pixelize', 'glitch': 'pixelize'
        };
        return map[id] || 'fade'; 
    }
};
