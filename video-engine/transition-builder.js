
import presetGenerator from './presetGenerator.js';

export default {
    buildTimeline: (clips, fileMap, mediaLibrary) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        // Tracks
        const mainTrackClips = clips.filter(c => c.track === 'video').sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => ['text', 'camada', 'subtitle'].includes(c.track));
        const audioClips = clips.filter(c => ['audio', 'narration', 'music', 'sfx'].includes(c.track));

        let mainStream = '[black_bg]';
        
        // 1. Base Track
        if (mainTrackClips.length === 0) {
            inputs.push('-f', 'lavfi', '-t', '5', '-i', 'color=c=black:s=1280x720:r=30');
            mainStream = `[${inputIndexCounter++}:v]`;
        } else {
            let streams = [];
            mainTrackClips.forEach((clip, i) => {
                const path = fileMap[clip.fileName];
                if (!path) return;
                
                const dur = clip.duration;
                if(clip.type === 'image') inputs.push('-loop', '1', '-t', (dur+1).toString(), '-i', path);
                else inputs.push('-i', path);
                
                const idx = inputIndexCounter++;
                let lbl = `[${idx}:v]`;
                
                // Scale & Trim
                const next = `v${i}`;
                const trim = clip.type === 'image' ? '' : `trim=start=${clip.mediaStartOffset || 0}:duration=${(clip.mediaStartOffset||0)+dur},setpts=PTS-STARTPTS,`;
                filterChain += `${lbl}${trim}scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[${next}];`;
                streams.push(`[${next}]`);
            });
            
            if(streams.length > 0) {
                filterChain += `${streams.join('')}concat=n=${streams.length}:v=1:a=0[base_v];`;
                mainStream = '[base_v]';
            }
        }
        
        // 2. Overlays
        let currentV = mainStream;
        overlayClips.forEach((clip, i) => {
             // Basic overlay logic for text/images
             // ... simplified for robustness
             if (clip.type === 'text') {
                 // Skip complex drawtext for now to prevent errors without fonts
             }
        });

        // 3. Audio
        // Simplified Mix
        let audioOut = '[aout]';
        inputs.push('-f', 'lavfi', '-t', '0.1', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        const dummyAudioIdx = inputIndexCounter++;
        filterChain += `[${dummyAudioIdx}:a]anull[aout];`; // Placeholder

        return {
            inputs,
            filterComplex: filterChain,
            outputMapVideo: currentV,
            outputMapAudio: audioOut
        };
    }
};
