// exportVideo.js
import { spawn } from 'child_process';

/**
 * Exporta vídeo combinando imagens e áudios.
 * @param {string} outputPath - Caminho do arquivo final.
 * @param {Array|Object} videoInputs - Array de objetos de vídeo { path, duration } ou objeto único.
 * @param {Array|Object} audioInputs - Array de objetos de áudio { path, duration } ou objeto único.
 * @returns {Promise<void>}
 */
export async function handleExportVideo(outputPath, videoInputs, audioInputs) {
  return new Promise((resolve, reject) => {
    // 🔹 Garantir que sejam arrays
    if (!Array.isArray(videoInputs)) videoInputs = [videoInputs];
    if (!Array.isArray(audioInputs)) audioInputs = [audioInputs];

    // 🔹 Validar formatos corretos
    if (!videoInputs.every(v => v.path && v.duration)) {
      return reject(new Error('Todos os videoInputs devem ter { path, duration }'));
    }
    if (!audioInputs.every(a => a.path && a.duration)) {
      return reject(new Error('Todos os audioInputs devem ter { path, duration }'));
    }

    // 🔹 Montar argumentos do FFmpeg (exemplo simplificado)
    const ffmpegArgs = [];

    // Entrada de cada vídeo
    videoInputs.forEach(v => {
      ffmpegArgs.push('-loop', '1', '-t', `${v.duration}`, '-i', v.path);
    });

    // Entrada de cada áudio
    audioInputs.forEach(a => {
      ffmpegArgs.push('-i', a.path);
    });

    // Saída final simplificada (substitua com seus filtros reais)
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      outputPath
    );

    console.log('FFmpeg args:', ffmpegArgs);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stdout.on('data', data => console.log('FFmpeg:', data.toString()));
    ffmpeg.stderr.on('data', data => console.log('FFmpeg ERR:', data.toString()));

    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', err => reject(err));
  });
}
