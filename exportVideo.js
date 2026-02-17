const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Função para gerar clipes individuais
async function generateClip(clipIndex, images, audio, outputDir) {
  return new Promise((resolve, reject) => {
    const outputFile = path.join(outputDir, `clip_${clipIndex}.mp4`);

    // Monta filter_complex para duas imagens e fade simples
    const filterComplex = `
      [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,
      pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,
      setsar=1,fps=30,format=yuv420p[v0];
      [1:v]scale=1920:1080:force_original_aspect_ratio=decrease,
      pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,
      setsar=1,fps=30,format=yuv420p[v1];
      [v0][v1]xfade=transition=fade:duration=0.5:offset=2[vout]
    `.replace(/\s+/g, ' ');

    const ffmpegArgs = [
      "-y",
      "-i", images[0],
      "-i", images[1],
      "-i", audio,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "2:a",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      outputFile
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    ffmpeg.stderr.on("data", (data) => {
      console.log(`FFmpeg [clip ${clipIndex}]: ${data}`);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(outputFile);
      else reject(new Error(`FFmpeg clip ${clipIndex} failed with code ${code}`));
    });
  });
}

// Função para concatenar todos os clipes
async function concatClips(clips, outputFile) {
  const listFile = "list.txt";
  fs.writeFileSync(listFile, clips.map(c => `file '${c}'`).join("\n"));

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      outputFile
    ]);

    ffmpeg.stderr.on("data", (data) => console.log(`FFmpeg concat: ${data}`));

    ffmpeg.on("close", (code) => {
      fs.unlinkSync(listFile);
      if (code === 0) resolve(outputFile);
      else reject(new Error(`FFmpeg concat failed with code ${code}`));
    });
  });
}

// Exporta vídeo final
async function exportVideo(clipsData, outputFile) {
  const tempDir = "./temp_clips";
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const clipFiles = [];

  for (let i = 0; i < clipsData.length; i++) {
    const { images, audio } = clipsData[i];
    const clipFile = await generateClip(i, images, audio, tempDir);
    clipFiles.push(clipFile);
  }

  await concatClips(clipFiles, outputFile);

  // Limpa arquivos temporários
  clipFiles.forEach(f => fs.unlinkSync(f));
  fs.rmdirSync(tempDir);

  console.log("Export finalizado:", outputFile);
}

module.exports = { exportVideo };
