
import path from 'path';
import fs from 'fs';
import transitionBuilder from './transitionBuilder.js';
import presetGenerator from './presetGenerator.js';

export default async function handleExport(job, uploadDir, createFFmpegJob) {
    console.log("Iniciando exportação para Job:", job.id);

    // 1. Validar Project State
    const projectStateStr = job.params.projectState;
    if (!projectStateStr) {
        job.status = 'failed';
        job.error = "Dados do projeto não encontrados (projectState missing).";
        return;
    }

    let projectState;
    try {
        projectState = JSON.parse(projectStateStr);
    } catch (e) {
        job.status = 'failed';
        job.error = "Dados do projeto corrompidos.";
        return;
    }

    const clips = projectState.clips || [];
    if (clips.length === 0) {
        job.status = 'failed';
        job.error = "Timeline vazia.";
        return;
    }

    // 2. Mapear Arquivos Físicos
    const fileMap = {};
    if (job.files && job.files.length > 0) {
        job.files.forEach(f => {
            fileMap[f.originalname] = f.path;
        });
    }

    // 3. Filtrar e Ordenar Clipes Visuais (Video, Imagem, Camadas)
    const visualClips = clips
        .filter(c => ['video', 'image', 'camada'].includes(c.track) || c.type === 'video' || c.type === 'image')
        .sort((a, b) => a.start - b.start);

    if (visualClips.length === 0) {
        job.status = 'failed';
        job.error = "Nenhum clipe visual para exportar.";
        return;
    }

    const outputPath = path.join(uploadDir, `export-${Date.now()}.mp4`);
    job.outputPath = outputPath;

    // 4. Construir Timeline FFmpeg
    const { inputs, filterComplex, outputMap } = transitionBuilder.buildTimeline(visualClips, fileMap);

    if (!filterComplex) {
        job.status = 'failed';
        job.error = "Erro ao gerar filtros de renderização.";
        return;
    }

    // 5. Montar Argumentos
    const finalArgs = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', outputMap,
        ...presetGenerator.getVideoArgs(),
        '-y', outputPath
    ];

    console.log("FFmpeg Filter Chain:", filterComplex);

    // Calcular duração estimada
    const totalDuration = visualClips.reduce((acc, c) => acc + (c.duration || 5), 0);

    createFFmpegJob(job.id, finalArgs, totalDuration);
};
