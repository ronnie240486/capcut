import path from 'path';
import fs from 'fs';

// Movimentos e efeitos
const MOVEMENTS = {
    zoomIn: d=>`scale=iw*1.1:ih*1.1,zoompan=z='min(zoom+0.0005,1.5)':d=${d*25}`,
    zoomOut:d=>`scale=iw*0.9:ih*0.9,zoompan=z='max(zoom-0.0005,1.0)':d=${d*25}`,
    panLeft:d=>`crop=iw:ih:0:0,translate=x='-t*50':y=0`,
    panRight:d=>`crop=iw:ih:0:0,translate=x='t*50':y=0`,
    fadeIn:d=>`fade=t=in:st=0:d=1`,
    fadeOut:d=>`fade=t=out:st=${d-1}:d=1`,
    rotate:d=>`rotate='PI/180*t*10':ow=rotw(iw):oh=roth(ih)`,
};

function normalizeInputs(inputs,type='video'){
    if(!Array.isArray(inputs)) throw new Error(`Inputs devem ser um array (${type})`);
    return inputs.map(i=>{
        if(!i.path||!fs.existsSync(i.path)) throw new Error(`Arquivo não encontrado: ${i.path}`);
        return { path:i.path, duration:i.duration||5 };
    });
}

function buildMovementsFilter(idx,d,movements=Object.keys(MOVEMENTS)){
    return `[${idx}:v]${movements.map(m=>MOVEMENTS[m](d)).join(',')}[v${idx}]`;
}

function buildFilterComplex(allVisuals){
    let filterComplex='';
    let lastOutput='[v0]';
    filterComplex+=buildMovementsFilter(0,allVisuals[0].duration)+';';
    lastOutput='[v0]';
    for(let i=1;i<allVisuals.length;i++){
        filterComplex+=buildMovementsFilter(i,allVisuals[i].duration)+';';
        const offset=allVisuals.slice(0,i).reduce((sum,c)=>sum+c.duration,0);
        const outName=`[vxf${i}]`;
        filterComplex+=`${lastOutput}[v${i}]xfade=transition=fade:duration=1:offset=${offset}${outName};`;
        lastOutput=outName;
    }
    return { filterComplex, lastOutput };
}

export async function handleExportVideo(job,uploadDir,callback){
    if(!job||!job.files) throw new Error("Nenhum vídeo enviado");

    const videoInputs=normalizeInputs(job.files.filter(f=>f.mimetype.startsWith('video')),'video');
    const audioInputs=normalizeInputs(job.files.filter(f=>f.mimetype.startsWith('audio')),'audio');

    if(!videoInputs.length) throw new Error("Nenhum vídeo válido encontrado");

    const outputPath=path.join(uploadDir,`export_${Date.now()}.mp4`);
    job.outputPath=outputPath;

    const { filterComplex, lastOutput } = buildFilterComplex(videoInputs);

    let args=[];
    videoInputs.forEach(v=>args.push('-i',v.path));
    audioInputs.forEach(a=>args.push('-i',a.path));

    args.push('-filter_complex', filterComplex);
    args.push('-map', lastOutput);
    if(audioInputs.length) args.push('-map',`${videoInputs.length}:a?`);
    args.push('-c:v','libx264','-preset','ultrafast','-c:a','aac','-b:a','192k','-shortest','-y',outputPath);

    if(callback) callback(job.id,args,videoInputs.reduce((sum,v)=>sum+v.duration,0));
}
