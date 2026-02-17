
/**
 * Helper to generate 'atempo' filters for speed adjustment.
 * FFmpeg atempo filter is limited between 0.5 and 2.0, so we chain them.
 */
function getAtempoFilter(speed) {
    let s = speed;
    const filters = [];
    while (s < 0.5) {
        filters.push('atempo=0.5');
        s /= 0.5;
    }
    while (s > 2.0) {
        filters.push('atempo=2.0');
        s /= 2.0;
    }
    filters.push(`atempo=${s.toFixed(2)}`);
    return filters.join(',');
}

export default {
    /**
     * Builds the filter graph based on the action type.
     */
    build: (action, params, videoPath) => {
        let filterComplex = '';
        let mapArgs = [];
        let outputOptions = [];

        switch (action) {
            case 'interpolate-real':
                const speed = parseFloat(params.speed) || 0.5;
                const factor = 1 / speed;
                // Mininterpolate requires even dimensions for MCI/OBMC modes.
                // Scale to trunc(width/2)*2 ensures even dimensions.
                filterComplex = `[0:v]scale=trunc(min(1280,iw)/2)*2:trunc(min(720,ih)/2)*2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
                mapArgs = ['-map', '[v]'];
                // We ignore audio for slow motion interpolation usually, or we'd need to stretch it too
                break;

            case 'upscale-real':
                // Lanczos scaling to 1080p
                filterComplex = `[0:v]scale=1920:1080:flags=lanczos,setsar=1[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?']; // Keep audio if exists
                break;

            case 'reverse-real':
                filterComplex = `[0:v]reverse[v];[0:a]areverse[a]`;
                mapArgs = ['-map', '[v]', '-map', '[a]'];
                break;

            case 'reduce-noise-real':
                // Highpass/Lowpass + Afftdn (Audio FFT Denoise)
                filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]']; // Pass video through
                outputOptions = ['-c:v', 'copy']; // Don't re-encode video
                break;

            case 'remove-silence-real':
                const stopDur = params.duration || 0.5;
                const thresh = params.threshold || -30;
                filterComplex = `[0:a]silenceremove=stop_periods=-1:stop_duration=${stopDur}:stop_threshold=${thresh}dB[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]'];
                // Video sync is tricky with silenceremove on audio only. 
                // For safety in this MVP, we might desync if we don't trim video. 
                outputOptions = ['-c:v', 'copy'];
                break;

            case 'isolate-voice-real':
                // Simple EQ Isolation
                filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;
            
            case 'voice-fx-real':
                // Presets for voice effects
                const p = params.preset;
                let af = '';
                if(p === 'robot') af = "asetrate=44100*0.9,atempo=1.1,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3";
                else if(p === 'squirrel') af = "asetrate=44100*1.4,atempo=0.7"; // Chipmunk
                else if(p === 'monster') af = "asetrate=44100*0.6,atempo=1.6"; // Deep
                else if(p === 'echo') af = "aecho=0.8:0.9:1000:0.3";
                else if(p === 'radio') af = "highpass=f=500,lowpass=f=3000,afftdn";
                else af = "anull"; // Default
                
                filterComplex = `[0:a]${af}[a]`;
                mapArgs = ['-map', '0:v?', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;

            default:
                // Safe default: Ensure dimensions are divisible by 2
                filterComplex = `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:1.0:5:5:0.0[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?'];
        }

        return { filterComplex, mapArgs, outputOptions };
    },

    getFFmpegFilterFromEffect: (effectId) => {
        if (!effectId) return null;

        // --- 1. PROCEDURAL EFFECTS (MATCHING FRONTEND CONSTANTS) ---
        
        const cgMatch = effectId.match(/^cg-pro-(\d+)$/);
        if (cgMatch) {
            const i = parseInt(cgMatch[1], 10);
            const contrast = 1 + (i % 5) * 0.1;
            const sat = 1 + (i % 3) * 0.2;
            const hue = (i * 15) % 360;
            return `eq=contrast=${contrast.toFixed(2)}:saturation=${sat.toFixed(2)},hue=h=${hue}`;
        }

        const vinMatch = effectId.match(/^vintage-style-(\d+)$/);
        if (vinMatch) {
            const i = parseInt(vinMatch[1], 10);
            const sepia = 0.3 + (i % 5) * 0.1;
            return `eq=saturation=0.5:contrast=0.9:brightness=0.1,colorbalance=rs=${sepia.toFixed(2)}:bs=-${(sepia/2).toFixed(2)}`;
        }

        // --- 2. STATIC NAMED EFFECTS ---
        const effects = {
            'teal-orange': 'colorbalance=rs=0.2:bs=-0.2:gs=0:rm=0.2:gm=0:bm=-0.2:rh=0.2:gh=0:bh=-0.2,eq=saturation=1.3',
            'noir': 'hue=s=0,eq=contrast=1.5:brightness=-0.1',
            'warm': 'colorbalance=rs=0.3:gs=0:bs=-0.3,eq=saturation=0.8:contrast=1.1',
            'cool': 'colorbalance=rs=-0.1:bs=0.2,eq=brightness=0.1',
            'vivid': 'eq=saturation=1.8:contrast=1.2',
            'mono': 'hue=s=0,eq=contrast=1.2',
        };
        
        return effects[effectId] || null;
    },

    getMovementFilter: (moveId, durationSec = 5, isImage = false, config = {}, targetRes = {w:1280, h:720}, targetFps = 30) => {
        const fps = targetFps || 30;
        const frames = Math.max(1, Math.ceil(durationSec * fps));
        const w = targetRes.w;
        const h = targetRes.h;
        
        let z = '1.0';
        let x = '(iw-ow)/2';
        let y = '(ih-oh)/2';
        let extra = ''; 
        
        // --- 1. PROCEDURAL PARSING (mov- prefix) ---
        if (moveId && moveId.startsWith('mov-pan-')) {
            z = '1.2';
            if (moveId.includes('slow-l')) x = `(iw-ow)*(on/${frames})`;
            else if (moveId.includes('slow-r')) x = `(iw-ow)*(1-on/${frames})`;
        }
        // --- ZOOMS ---
        else if (moveId && moveId.startsWith('mov-zoom-')) {
            if (moveId.includes('crash-in')) {
                z = `min(zoom+0.05,2.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('fast-in')) {
                z = `min(zoom+0.05,1.5)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('slow-in')) {
                z = `min(zoom+0.0015,1.2)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('slow-out')) {
                z = `max(1.2-0.0015*on,1.0)`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            } else if (moveId.includes('bounce')) {
                z = `1.0+0.1*sin(2*PI*on/(${frames}/2))`;
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
            }
        }
        // --- DOLLY ---
        else if (moveId && moveId.startsWith('mov-dolly-')) {
             if (moveId.includes('zoom')) {
                z = `max(1.4-0.015*on,1.0)`; 
                x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
             }
        }
        // --- 2. LEGACY ---
        else if (moveId === 'kenBurns') {
            const startScale = config.startScale || 1.0;
            const endScale = config.endScale || 1.3;
            z = `${startScale}+(${endScale}-${startScale})*on/${frames}`;
            x = `(iw/2)-(iw/zoom/2)`; y = `(ih/2)-(ih/zoom/2)`;
        }
        else {
             z = '1.0'; x = '(iw-ow)/2'; y = '(ih-oh)/2';
        }
        
        return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}${extra}`;
    },

    getTransitionXfade: (id) => {
        const map = {
            'fade': 'fade', 
            'crossfade': 'fade', 
            'black': 'fadeblack', 
            'white': 'fadewhite'
        };
        return map[id] || 'fade';
    },
    
    getAtempoFilter
};
