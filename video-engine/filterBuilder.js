
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
                if (params.hasVideo) {
                    filterComplex = `[0:v]scale='min(1280,trunc(iw/2)*2)':-2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
                    mapArgs = ['-map', '[v]'];
                }
                break;

            case 'upscale-real':
                // Lanczos scaling to 1080p
                if (params.hasVideo) {
                    filterComplex = `[0:v]scale=1920:1080:flags=lanczos,setsar=1[v]`;
                    mapArgs = params.hasAudio ? ['-map', '[v]', '-map', '0:a'] : ['-map', '[v]'];
                }
                break;

            case 'reverse-real':
                if (params.hasVideo && params.hasAudio) {
                    filterComplex = `[0:v]reverse[v];[0:a]areverse[a]`;
                    mapArgs = ['-map', '[v]', '-map', '[a]'];
                } else if (params.hasVideo) {
                    filterComplex = `[0:v]reverse[v]`;
                    mapArgs = ['-map', '[v]'];
                } else if (params.hasAudio) {
                    filterComplex = `[0:a]areverse[a]`;
                    mapArgs = ['-map', '[a]'];
                }
                break;

            case 'reduce-noise-real':
                // Highpass/Lowpass + Afftdn (Audio FFT Denoise)
                if (params.hasAudio) {
                    filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                    mapArgs = params.hasVideo ? ['-map', '0:v', '-map', '[a]'] : ['-map', '[a]'];
                    if (params.hasVideo) outputOptions = ['-c:v', 'copy'];
                } else {
                    if (params.hasVideo) {
                        mapArgs = ['-map', '0:v'];
                        outputOptions = ['-c:v', 'copy'];
                    }
                }
                break;

            case 'remove-silence-real':
                const stopDur = params.duration || 0.5;
                const thresh = params.threshold || -30;
                if (params.hasAudio) {
                    filterComplex = `[0:a]silenceremove=stop_periods=-1:stop_duration=${stopDur}:stop_threshold=${thresh}dB[a]`;
                    mapArgs = params.hasVideo ? ['-map', '0:v', '-map', '[a]'] : ['-map', '[a]'];
                    if (params.hasVideo) outputOptions = ['-c:v', 'copy'];
                } else {
                    if (params.hasVideo) {
                        mapArgs = ['-map', '0:v'];
                        outputOptions = ['-c:v', 'copy'];
                    }
                }
                break;

            case 'isolate-voice-real':
                // Simple EQ Isolation
                if (params.hasAudio) {
                    filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                    mapArgs = params.hasVideo ? ['-map', '0:v', '-map', '[a]'] : ['-map', '[a]'];
                    if (params.hasVideo) outputOptions = ['-c:v', 'copy'];
                } else {
                    if (params.hasVideo) {
                        mapArgs = ['-map', '0:v'];
                        outputOptions = ['-c:v', 'copy'];
                    }
                }
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
                
                if (params.hasAudio) {
                    filterComplex = `[0:a]${af}[a]`;
                    mapArgs = params.hasVideo ? ['-map', '0:v', '-map', '[a]'] : ['-map', '[a]'];
                    if (params.hasVideo) outputOptions = ['-c:v', 'copy'];
                } else {
                    if (params.hasVideo) {
                        mapArgs = ['-map', '0:v'];
                        outputOptions = ['-c:v', 'copy'];
                    }
                }
                break;

            case 'deep-sync-real':
                // Deep-Sync Sensorial: Visual pulsing + bass boost
                // Using trunc(iw/2)*2 for even dimensions, essential for many encoders
                const dsPrep = "scale='trunc(iw/2)*2':'trunc(ih/2)*2',format=yuv420p";
                const visualFilter = `${dsPrep},eq=contrast='1+0.15*abs(sin(2*PI*t*1.5))':brightness='0.03*abs(sin(2*PI*t*1.5))'`;
                
                if (params.hasVideo && params.hasAudio) {
                    filterComplex = `[0:v]${visualFilter}[v];[0:a]bass=g=12,volume=1.2[a]`;
                    mapArgs = ['-map', '[v]', '-map', '[a]'];
                } else if (params.hasVideo) {
                    filterComplex = `[0:v]${visualFilter}[v]`;
                    mapArgs = ['-map', '[v]'];
                } else if (params.hasAudio) {
                    filterComplex = `[0:a]bass=g=12,volume=1.2[a]`;
                    mapArgs = ['-map', '[a]'];
                }
                break;

            case 'morpheus-real':
                // Neural Morphing Simulation: Complex stylistic filters
                const style = params.style || 'Vidro Líquido';
                let styleFilter = '';
                
                // Using trunc(iw/2)*2 to ensure even dimensions
                const basePrep = "scale='trunc(iw/2)*2':'trunc(ih/2)*2',format=yuv420p";

                if (style === 'Vidro Líquido') {
                    styleFilter = `${basePrep},boxblur=2:1,unsharp=5:5:1.0:5:5:0.0,vignette=0.3,curves=preset=lighter`;
                } else if (style === 'Éter Quântico') {
                    styleFilter = `${basePrep},hue=h=200:s=0.5,gblur=sigma=1.5,eq=contrast=1.4:brightness=0.08,unsharp=7:7:2.5`;
                } else if (style === 'Cyberpunk Orgânico') {
                    styleFilter = `${basePrep},hue=s=2.0:h=300,eq=contrast=1.5:brightness=-0.05,unsharp=5:5:1.5,vignette=0.5`;
                } else {
                    styleFilter = `${basePrep},unsharp=3:3:1.0`;
                }

                if (params.hasVideo) {
                    filterComplex = `[0:v]${styleFilter}[v]`;
                    mapArgs = params.hasAudio ? ['-map', '[v]', '-map', '0:a'] : ['-map', '[v]'];
                } else if (params.hasAudio) {
                    mapArgs = ['-map', '0:a'];
                }
                break;

            default:
                // Safe default: Ensure dimensions are divisible by 2 and at least 2px
                // Scale filter: width=max(2,trunc(iw/2)*2), height=max(2,trunc(ih/2)*2)
                if (params.hasVideo) {
                    filterComplex = `[0:v]scale='max(2,trunc(iw/2)*2)':'max(2,trunc(ih/2)*2)',unsharp=5:5:1.0:5:5:0.0[v]`;
                    mapArgs = params.hasAudio ? ['-map', '[v]', '-map', '0:a'] : ['-map', '[v]'];
                } else if (params.hasAudio) {
                    mapArgs = ['-map', '0:a'];
                }
        }

        return { filterComplex, mapArgs, outputOptions };
    },
    getAtempoFilter
};
