// videoBuilderFull.js

import presetGenerator from './presetGenerator.js';

// --- Helpers ---
function escapeDrawText(text) {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\')
               .replace(/:/g, '\\:')
               .replace(/'/g, "\\'")
               .replace(/\(/g, '\\(')
               .replace(/\)/g, '\\)')
               .replace(/\[/g, '\\[')
               .replace(/\]/g, '\\]');
}

function wrapText(text, maxCharsPerLine) {
    if (!text) return '';
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0] || '';
    for (let i = 1; i < words.length; i++) {
        if (currentLine.length + 1 + words[i].length <= maxCharsPerLine) {
            currentLine += ' ' + words[i];
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);
    return lines.join('\n');
}

// --- Export ---
export default {
    buildTimeline: (clips, fileMap, mediaLibrary, exportConfig = {}, explicitTotalDuration = 30) => {
        let inputs = [];
        let filterChain = '';
        let inputIndexCounter = 0;

        const resMap = {
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 }
        };
        const targetRes = resMap[exportConfig.resolution] || resMap['720p'];
        const targetFps = parseInt(exportConfig.fps) || 30;

        const SCALE_FILTER = `scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,fps=${targetFps},format=yuv420p`;

        const maxClipEnd = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
        const projectDuration = Math.max(explicitTotalDuration, maxClipEnd, 1);

        const mainTrackClips = clips.filter(c => c.track === 'video').sort((a, b) => a.start - b.start);
        const overlayClips = clips.filter(c => ['text','subtitle','camada'].includes(c.track)).sort((a,b)=>a.start-b.start);
        const audioClips = clips.filter(c => ['audio','narration','music','sfx'].includes(c.track) || (c.type==='audio' && !['video','camada','text'].includes(c.track)));

        // --- 0. Base Video & Audio ---
        let baseVideoStream = '[bg_base]';
        const bgFile = fileMap['background'];
        if (bgFile) {
            inputs.push('-loop','1','-t',projectDuration.toString(),'-i',bgFile);
            const bgIdx = inputIndexCounter++;
            filterChain += `[${bgIdx}:v]scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=increase,scale=trunc(iw/2)*2:trunc(ih/2)*2,crop=${targetRes.w}:${targetRes.h},setsar=1,fps=${targetFps},format=yuv420p[bg_base];`;
        } else {
            inputs.push('-f','lavfi','-t',projectDuration.toString(),'-i',`color=c=black:s=${targetRes.w}x${targetRes.h}:r=${targetFps}`);
            baseVideoStream = `[${inputIndexCounter++}:v]`;
        }

        // Base silence
        let baseAudioStream = '[base_audio_silence]';
        inputs.push('-f','lavfi','-t',projectDuration.toString(),'-i','anullsrc=channel_layout=stereo:sample_rate=44100');
        const silenceIdx = inputIndexCounter++;
        filterChain += `[${silenceIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[base_audio_silence];`;

        // --- 1. Main Video Track ---
        let mainTrackVideoStream = null;
        let mainTrackAudioStream = null;
        if (mainTrackClips.length>0) {
            let mainLabels = [];
            let mainAudioLabels = [];
            mainTrackClips.forEach((clip,i)=>{
                const filePath = fileMap[clip.fileName]; if(!filePath) return;
                const duration = Math.max(0.1, parseFloat(clip.duration)||5);
                if(clip.type==='image') inputs.push('-loop','1','-t',(duration+1).toString(),'-i',filePath);
                else inputs.push('-i',filePath);

                const idx = inputIndexCounter++;
                let curV = `[${idx}:v]`;

                const addFilter = (txt)=>{ if(!txt) return; const lbl=`vtmp${i}_${Math.random().toString(36).substr(2,5)}`; filterChain+=`${curV}${txt}[${lbl}];`; curV=`[${lbl}]`; };

                addFilter(SCALE_FILTER);
                if(clip.type!=='image') addFilter(`trim=start=${clip.mediaStartOffset||0}:duration=${duration},setpts=PTS-STARTPTS`);
                else addFilter(`setpts=PTS-STARTPTS`);

                if(clip.effect){ const fx=presetGenerator.getFFmpegFilterFromEffect(clip.effect); if(fx) addFilter(fx); }

                if(clip.properties && clip.properties.movement){
                    const mv=presetGenerator.getMovementFilter(clip.properties.movement.type,duration,clip.type==='image',clip.properties.movement.config,targetRes,targetFps);
                    if(mv) addFilter(mv);
                } else if(clip.type==='image'){
                    addFilter(presetGenerator.getMovementFilter(null,duration,true,{},targetRes,targetFps));
                }

                addFilter(`scale=${targetRes.w}:${targetRes.h}:flags=lanczos,setsar=1,format=yuv420p`);
                mainLabels.push({label:curV,duration:duration,transition:clip.transition});

                // Audio
                if(clip.type==='video' && mediaLibrary[clip.fileName]?.hasAudio){
                    const audLbl=`a_main_${i}`;
                    const vol = clip.properties.volume!==undefined?clip.properties.volume:1;
                    filterChain+=`[${idx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp,atrim=start=${clip.mediaStartOffset||0}:duration=${duration},asetpts=PTS-STARTPTS,volume=${vol}[${audLbl}];`;
                    mainAudioLabels.push(`[${audLbl}]`);
                } else {
                    const audLbl=`a_pad_${i}`;
                    const padIdx=inputIndexCounter++;
                    inputs.push('-f','lavfi','-t',duration.toString(),'-i','anullsrc=channel_layout=stereo:sample_rate=44100');
                    filterChain+=`[${padIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp[${audLbl}];`;
                    mainAudioLabels.push(`[${audLbl}]`);
                }
            });

            // Xfade main track
            if(mainLabels.length>0){
                let curV=mainLabels[0].label;
                let curA=mainAudioLabels[0];
                let accDur=mainLabels[0].duration;
                for(let i=1;i<mainLabels.length;i++){
                    const next=mainLabels[i];
                    const trans=next.transition||{id:'fade',duration:0.5};
                    const d=Math.min(trans.duration||0.04,accDur);
                    const offset=accDur-d<0?0:accDur-d;
                    const trId=presetGenerator.getTransitionXfade(trans.id);
                    const nV=`mix_v_${i}_${Math.random().toString(36).substr(2,3)}`;
                    const nA=`mix_a_${i}_${Math.random().toString(36).substr(2,3)}`;
                    filterChain+=`${curV}${next.label}xfade=transition=${trId}:duration=${d}:offset=${offset}[${nV}];`;
                    filterChain+=`${curA}${mainAudioLabels[i]}acrossfade=d=${d}:c1=tri:c2=tri[${nA}];`;
                    curV=`[${nV}]`; curA=`[${nA}]`; accDur=offset+next.duration;
                }
                mainTrackVideoStream=curV; mainTrackAudioStream=curA;
            }
        }

        // --- 2. Base + Main Track Overlay ---
        let finalComp=baseVideoStream;
        if(mainTrackVideoStream){
            const compLbl=`comp_base`;
            filterChain+=`${baseVideoStream}${mainTrackVideoStream}overlay=x=0:y=0:eof_action=pass[${compLbl}];`;
            finalComp=`[${compLbl}]`;
        }

        // --- 3. Overlays & Texts ---
        overlayClips.forEach((clip,i)=>{
            let overlayInputLabel='', sf=targetRes.w/1280;
            if(clip.type==='text'){
                const bgLbl=`txtbg_${i}_${Math.random().toString(36).substr(2,3)}`;
                filterChain+=`color=c=black@0.0:s=${targetRes.w}x${targetRes.h}:r=${targetFps}:d=${clip.duration}[${bgLbl}];`;
                let txt=wrapText(clip.properties.text||'',targetRes.w>1280?50:30);
                const escTxt=escapeDrawText(txt);
                let color=clip.properties.textDesign?.color||'white'; if(color==='transparent') color='white@0.0';
                const fontsize=Math.round(80*sf*(clip.properties.transform?.scale||1));
                let x='(w-text_w)/2',y='(h-text_h)/2';
                if(clip.properties.transform){const t=clip.properties.transform; if(t.x)x+=`+(${t.x}*${sf})`; if(t.y)y+=`+(${t.y}*${sf})`;}
                let styles=''; if(clip.properties.textDesign?.stroke){const s=clip.properties.textDesign.stroke; if(s.width>0)styles+=`:borderw=${s.width*sf}:bordercolor=${s.color||'black'}`;}
                if(clip.properties.textDesign?.shadow){const sh=clip.properties.textDesign.shadow;if(sh.x||sh.y)styles+=`:shadowx=${(sh.x||2)*sf}:shadowy=${(sh.y||2)*sf}:shadowcolor=${sh.color||'black@0.5'}`;}
                const fontFile="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
                const fontArg=`:fontfile='${fontFile}'`;
                const txtLbl=`txt_${i}_${Math.random().toString(36).substr(2,3)}`;
                filterChain+=`[${bgLbl}]drawtext=text='${escTxt}'${fontArg}:fontcolor=${color}:fontsize=${fontsize}:x=${x}:y=${y}${styles}[${txtLbl}];`;
                overlayInputLabel=`[${txtLbl}]`;
            } else {
                const filePath=fileMap[clip.fileName]; if(!filePath)return;
                if(clip.type==='image') inputs.push('-loop','1','-t',(clip.duration+1).toString(),'-i',filePath); else inputs.push('-i',filePath);
                const idx=inputIndexCounter++;
                const rawLbl=`[${idx}:v]`;
                const outLbl=`ov_proc_${i}_${Math.random().toString(36).substr(2,3)}`;
                let filters=[];
                if(clip.type==='video'){ const st=clip.mediaStartOffset||0; filters.push(`trim=start=${st}:duration=${clip.duration},setpts=PTS-STARTPTS`);}
                else filters.push(`trim=duration=${clip.duration},setpts=PTS-STARTPTS`);
                if(clip.effect){ const fx=presetGenerator.getFFmpegFilterFromEffect(clip.effect); if(fx)filters.push(fx);}
                const scale=clip.properties.transform?.scale||0.5; const w=Math.max(2,Math.floor(targetRes.w*scale/2)*2);
                filters.push(`scale=${w}:-2`);
                if(clip.properties.transform?.rotation) filters.push(`rotate=${clip.properties.transform.rotation}*PI/180:c=none:ow=rotw(iw):oh=roth(ih)`);
                filters.push('format=yuv420p');
                filterChain+=`${rawLbl}${filters.join(',')}[${outLbl}];`;
                overlayInputLabel=`[${outLbl}]`;
            }

            const shiftLbl=`shift_${i}_${Math.random().toString(36).substr(2,3)}`;
            filterChain+=`${overlayInputLabel}setpts=PTS+${clip.start}/TB[${shiftLbl}];`;
            const nextComp=`comp_${i}_${Math.random().toString(36).substr(2,3)}`;
            filterChain+=`${finalComp}[${shiftLbl}]overlay=x=(W-w)/2:y=(H-h)/2:enable='between(t,${clip.start},${clip.start+clip.duration})':eof_action=pass[${nextComp}];`;
            finalComp=`[${nextComp}]`;
        });

        // --- 4. Audio Mix ---
        let audioMixInputs=[baseAudioStream];
        const safeAudioFmt='aformat=sample_rates=44100:channel_layouts=stereo:sample_fmts=fltp';
        if(mainTrackAudioStream) audioMixInputs.push(mainTrackAudioStream);
        audioClips.forEach((clip,i)=>{
            const fp=fileMap[clip.fileName]; if(!fp)return;
            inputs.push('-i',fp); const idx=inputIndexCounter++;
            const lbl=`sfx_${i}`;
            const startTrim=clip.mediaStartOffset||0;
            const volume=clip.properties.volume!==undefined?clip.properties.volume:1;
            const delayMs=Math.round(clip.start*1000);
            filterChain+=`[${idx}:a]atrim=start=${startTrim}:duration=${startTrim+clip.duration},asetpts=PTS-STARTPTS,${safeAudioFmt},volume=${volume},adelay=${delayMs}|${delayMs}[${lbl}];`;
            audioMixInputs.push(`[${lbl}]`);
        });

        let finalAudio='[final_audio_out]';
        filterChain+=`${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=first:dropout_transition=0:normalize=0[final_audio_out];`;
        if(filterChain.endsWith(';')) filterChain=filterChain.slice(0,-1);

        return { inputs, filterComplex: filterChain, outputMapVideo: finalComp, outputMapAudio: finalAudio };
    }
};
