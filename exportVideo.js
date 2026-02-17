// exportVideo.js
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Função para exportar vídeo usando FFmpeg
 * @param {string} outputPath - Caminho do arquivo final (ex: '/app/uploads/output.mp4')
 * @param {Array} videoInputs - Array de objetos de vídeo { path: string, duration: number }
 * @param {Array} audioInputs - Array de objetos de áudio { path: string, duration: number }
 * @returns {Promise<void>}
 */
export async function handleExportVideo(outputPath, videoInputs, audioInputs) {
  return new Promise((resolve, reject) => {
    try {
      // Monta o comando FFmpeg básico
      const ffmpegArgs = [
        '-y', // sobrescreve sem perguntar
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', `color=c=black:s=1920x1080:r=30`,
        '-f', 'lavfi',
        '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
      ];

      // Adiciona vídeos e áudios
      videoInputs.forEach(v => {
        ffmpegArgs.push('-loop', '1', '-t', `${v.duration}`, '-i', v.path);
      });
      audioInputs.forEach(a => {
        ffmpegArgs.push('-i', a.path);
      });

      // Saída final
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-ar', '44100',
        outputPath
      );

      // Executa FFmpeg
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      ffmpegProcess.stderr.on('data', (data) => {
        console.error(`FFmpeg stderr: ${data}`);
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Vídeo exportado com sucesso: ${outputPath}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg finalizou com código ${code}`));
        }
      });

    } catch (err) {
      reject(err);
    }
  });
}
