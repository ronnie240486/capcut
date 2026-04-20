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
    build: (action, params, _videoPath) => {
        let filterComplex = '';
        let mapArgs = [];
        let outputOptions = [];

        switch (action) {
            case 'interpolate-real':
                const speed = parseFloat(params.speed) || 0.5;
                const factor = 1 / speed;
                filterComplex = `[0:v]scale='min(1280,iw)':-2,pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
                mapArgs = ['-map', '[v]'];
                break;

            case 'upscale-real':
                filterComplex = `[0:v]scale=1920:1080:flags=lanczos,setsar=1[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?'];
                break;

            case 'reverse-real':
                filterComplex = `[0:v]reverse[v];[0:a]areverse[a]`;
                mapArgs = ['-map', '[v]', '-map', '[a]'];
                break;

            case 'reduce-noise-real':
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
                const p = params.preset;
                let af = '';
                if (p === 'robot') af = "asetrate=44100*0.9,atempo=1.1,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3";
                else if (p === 'squirrel') af = "asetrate=44100*1.4,atempo=0.7";
                else if (p === 'monster') af = "asetrate=44100*0.6,atempo=1.6";
                else if (p === 'echo') af = "aecho=0.8:0.9:1000:0.3";
                else if (p === 'radio') af = "highpass=f=500,lowpass=f=3000,afftdn";
                else af = "anull";

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

            default:
                filterComplex = `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:1.0:5:5:0.0[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?'];
        }

        return { filterComplex, mapArgs, outputOptions };
    },
    getAtempoFilter
};
