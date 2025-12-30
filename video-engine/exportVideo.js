const path = require('path');
const fs = require('fs');
const transitionBuilder = require('./transitionBuilder');
const presetGenerator = require('./presetGenerator');

module.exports = async function handleExport(job, uploadDir, createFFmpegJob) {
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

    // 2. Mapear Arquivos Físicos (Uploads do Multer)
    // O Multer coloca os arquivos em job.files. Precisamos acessá-los pelo 'originalname' ou campo correspondente.
    // O App.tsx envia o nome do arquivo original no FormData.
    const fileMap = {};
    if (job.files && job.files.length > 0) {
        job.files.forEach(f => {
            // O App.tsx usa o nome exato do arquivo como chave
            fileMap[f.originalname] = f.path;
        });
    }

    // 3. Filtrar e Ordenar Clipes Visuais
    // Focamos em Video e Imagem para a stream de vídeo principal
    // Ignoramos áudio por enquanto neste MVP de exportação visual, ou processamos separadamente se necessário
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

    // 4. Construir Argumentos FFmpeg Baseados nos Clipes
    // Passamos a lista de clipes e o mapa de arquivos para o builder
    const { inputs, filterComplex, outputMap } = transitionBuilder.buildTimeline(visualClips, fileMap);

    if (!filterComplex) {
        job.status = 'failed';
        job.error = "Erro ao gerar filtros de renderização.";
        return;
    }

    // 5. Montar Comando Final
    const finalArgs = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', outputMap,
        ...presetGenerator.getVideoArgs(), // Codec libx264, pix_fmt, etc.
        '-y', outputPath
    ];

    console.log("FFmpeg Filter:", filterComplex);

    // Calcular duração total estimada para barra de progresso
    const totalDuration = visualClips.reduce((acc, c) => acc + (c.duration || 5), 0);

    createFFmpegJob(job.id, finalArgs, totalDuration);
};
