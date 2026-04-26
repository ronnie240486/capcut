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

module.exports = {
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
                // Mininterpolate + Scale to safe dimensions (1280 width, height divisible by 2)
                filterComplex = `[0:v]scale='min(1280,iw)':-2,pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc[v]`;
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
                // Usually this requires complex syncing or dropping video frames which ffmpeg does automatically if V is mapped but A is shortened?
                // For safety in this MVP, we might desync if we don't trim video. 
                // A safer 'jump cut' requires analyzing timestamps first. 
                // For now, we apply to audio and let FFmpeg try to match or just process audio.
                // Assuming this is mostly for audio clips based on the app usage.
                outputOptions = ['-c:v', 'copy'];
                break;

            case 'isolate-voice-real':
                // Simple EQ Isolation
                filterComplex = `[0:a]highpass=f=200,lowpass=f=3000,afftdn[a]`;
                mapArgs = ['-map', '0:v', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;
            
            case 'voice-fx-real': {
                if (params.hasAudio === false) {
                    return { filterComplex: '', mapArgs: [], outputOptions: [] };
                }
                const p = params.preset;
                let af = '';
                if(p === 'robot') af = "asetrate=44100*0.9,atempo=1.1,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3";
                else if(p === 'squirrel' || p === 'chipmunk' || p === 'helium' || p === 'baby') af = "asetrate=44100*1.4,atempo=0.7"; // High pitch
                else if(p === 'monster' || p === 'giant' || p === 'orc') af = "asetrate=44100*0.6,atempo=1.6"; // Deep pitch
                else if(p === 'minion') af = "asetrate=44100*1.3,atempo=0.8,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3";
                else if(p === 'villain' || p === 'demon') af = "apad=pad_dur=1,asetrate=44100*0.7,atempo=1.4,aecho=0.8:0.88:60:0.4";
                else if(p === 'hero') af = "equalizer=f=1000:t=q:w=1:g=2,equalizer=f=200:t=q:w=1:g=2"; 
                else if(p === 'old_man') af = "asetrate=44100*0.8,atempo=1.25,tremolo=f=5:d=0.5";
                else if(p === 'witch') af = "asetrate=44100*1.1,atempo=0.9,tremolo=f=10:d=0.3";
                else if(p === 'dwarf' || p === 'wario') af = "asetrate=44100*0.85,atempo=1.18";
                else if(p === 'alien') af = "apad=pad_dur=1,vibrato=f=10:d=0.5,aecho=0.8:0.88:100:0.3";
                else if(p === 'cyborg' || p === 'dalek') af = "asetrate=44100*0.9,atempo=1.1,volume=1.5,vibrato=f=50:d=1";
                else if(p === 'ai_assistant') af = "highpass=f=200,lowpass=f=4000,volume=1.2";
                else if(p === 'astronaut' || p === 'walkie_talkie') af = "apad=pad_dur=1,highpass=f=500,lowpass=f=3000,volume=1.5,aecho=0.8:0.88:50:0.2";
                else if(p === 'telephone') af = "highpass=f=400,lowpass=f=2000,volume=1.3";
                else if(p === 'glitch') af = "apad=pad_dur=1,tremolo=f=20:d=1,aecho=0.8:0.88:5:0.5";
                else if(p === 'ghost' || p === 'poltergeist') af = "apad=pad_dur=1.5,aecho=0.8:0.9:1000:0.3,vibrato=f=5:d=0.5";
                else if(p === 'zombie') af = "asetrate=44100*0.5,atempo=2.0";
                else if(p === 'killer') af = "volume=1.2,equalizer=f=100:t=q:w=1:g=5";
                else if(p === 'echo' || p === 'echo_voice') af = "apad=pad_dur=1.5,aecho=0.8:0.9:1000:0.3";
                else if(p === 'cavern' || p === 'cave') af = "apad=pad_dur=1.5,aecho=0.8:0.88:150:0.4,aecho=0.8:0.88:300:0.25";
                else if(p === 'hall' || p === 'cathedral') af = "apad=pad_dur=1.5,aecho=0.8:0.88:200:0.3,aecho=0.8:0.88:400:0.2";
                else if(p === 'bathroom') af = "apad=pad_dur=1,aecho=0.8:0.88:50:0.4,aecho=0.8:0.88:80:0.25";
                else if(p === 'mega_megaphon' || p === 'megaphone') af = "amix=inputs=1:weights=1,astats=measure=peak,alimiter=level_in=2:level_out=0.9,highpass=f=800,lowpass=f=2000,acrusher=level_in=10:level_out=1:bits=8:mode=log:aa=1";
                else if(p === 'windy') af = "highpass=f=100,lowpass=f=5000,apulsator=hz=2,tremolo=f=5:d=0.5";
                else if(p === 'fire') af = "apad=pad_dur=1,highpass=f=100,lowpass=f=8000,aecho=0.8:0.88:10:0.1,apulsator=hz=10";
                else if(p === 'underwater') af = "apad=pad_dur=1,lowpass=f=500,aecho=0.8:0.88:20:0.3";
                else if(p === 'space') af = "apad=pad_dur=2,aecho=0.8:0.9:2000:0.5";
                else if(p === 'fan') af = "tremolo=f=20:d=0.8";
                else if(p === 'vibrato') af = "vibrato=f=10:d=0.5";
                else if(p === 'drunk') af = "apad=pad_dur=1,atempo=0.9,vibrato=f=2:d=0.5,aecho=0.8:0.88:50:0.3";
                else if(p === 'man_to_woman') af = "asetrate=44100*1.2,atempo=0.83";
                else if(p === 'woman_to_man') af = "asetrate=44100*0.8,atempo=1.25";
                else if(p === 'fast') af = "atempo=1.5";
                else if(p === 'slow') af = "atempo=0.75";
                else if(p === 'reverse') af = "areverse";
                else if(p === 'radio') af = "highpass=f=500,lowpass=f=3000,afftdn";
                else af = "anull"; // Default
                
                filterComplex = `[0:a]${af}[a]`;
                mapArgs = ['-map', '0:v?', '-map', '[a]'];
                outputOptions = ['-c:v', 'copy'];
                break;
            }

            default:
                // Safe default: Ensure dimensions are divisible by 2
                filterComplex = `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,unsharp=5:5:1.0:5:5:0.0[v]`;
                mapArgs = ['-map', '[v]', '-map', '0:a?'];
        }

        return { filterComplex, mapArgs, outputOptions };
    },
    getAtempoFilter
};
