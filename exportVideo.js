// exportVideo.js

import fs from 'fs';
import { exec } from 'child_process';

/**
 * Helper para normalizar inputs de vídeo ou áudio
 * Garante que cada item seja { path, duration }
 * Se a duração não estiver definida, usa a padrão (defaultDuration)
 */
function normalizeInputs(inputs, defaultDuration = 4) {
  if (!Array.isArray(inputs)) {
    throw new Error('Inputs devem ser um array');
  }

  return inputs.map(item => {
    if (typeof item === 'string') {
      // Se for string, transforma em objeto
      return { path: item, duration: defaultDuration };
    }

    if (!item.path) {
      throw new Error(`Input inválido: ${JSON.stringify(item)} (falta path)`);
    }

    // Se duration não existe, usa default
    return { path: item.path, duration: item.duration ?? defaultDuration };
  });
}

/**
 * Função principal que exporta o vídeo
 * @param {string} outputPath - caminho final do vídeo
 * @param {Array} videoInputs - array de { path, duration }
 * @param {Array} audioInputs - array de { path, duration }
 */
export async function handleExportVideo(outputPath, videoInputs, audioInputs) {
  try {
    console.log('DEBUG - videoInputs antes da normalização:', videoInputs);
    console.log('DEBUG - audioInputs antes da normalização:', audioInputs);

    // Normaliza os inputs
    const videos = normalizeInputs(videoInputs);
    const audios = normalizeInputs(audioInputs);

    console.log('DEBUG - videoInputs normalizados:', videos);
    console.log('DEBUG - audioInputs normalizados:', audios);

    // Exemplo simples de construção do comando FFmpeg
    // Aqui você pode adicionar suas transições, zoompan, etc.
    let ffmpegCmd = `ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=30 `;

    // Adiciona cada vídeo como input
    videos.forEach((v, i) => {
      ffmpegCmd += `-loop 1 -t ${v.duration} -i "${v.path}" `;
    });

    // Adiciona cada áudio como input
    audios.forEach((a, i) => {
      ffmpegCmd += `-i "${a.path}" `;
    });

    // Exemplo de saída simples (sem filtros complexos ainda)
    ffmpegCmd += `-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p `;
    ffmpegCmd += `-c:a aac -b:a 192k -ac 2 -ar 44100 `;
    ffmpegCmd += `"${outputPath}"`;

    console.log('DEBUG - Comando FFmpeg:', ffmpegCmd);

    // Executa FFmpeg
    await new Promise((resolve, reject) => {
      exec(ffmpegCmd, (error, stdout, stderr) => {
        if (error) {
          console.error('Erro FFmpeg:', stderr);
          return reject(error);
        }
        console.log('FFmpeg finalizado com sucesso!');
        resolve();
      });
    });
  } catch (err) {
    console.error('Erro em handleExportVideo:', err);
    throw err;
  }
}
