import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

async function preRenderImageClip(imagePath, duration, outputPath, zoom = 1.05) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .loop(duration)
      .inputFormat("png")
      .videoFilters([
        `scale=1920:1080:force_original_aspect_ratio=decrease`,
        `pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black`,
        `zoompan=d=${Math.floor(duration * 30)}:s=1920x1080:fps=30:z='1+(${zoom}-1)*(on/${Math.floor(duration * 30)})':x='(iw/2)-(iw/zoom/2)':y='(ih/2)-(ih/zoom/2)'`
      ])
      .outputOptions(["-c:v libx264", "-pix_fmt yuv420p", "-preset ultrafast"])
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });
}

async function generateVideoWithTransitions(clips, audioFiles, outputPath) {
  const tempDir = "/tmp";
  const preRendered = [];

  // 1️⃣ Pré-renderizar imagens
  for (let i = 0; i < clips.length; i++) {
    const outFile = path.join(tempDir, `clip_${i}.mp4`);
    await preRenderImageClip(clips[i].image, clips[i].duration, outFile, clips[i].zoom || 1.05);
    preRendered.push({ file: outFile, duration: clips[i].duration });
  }

  // 2️⃣ Criar lista de inputs para concatenação com transições
  let filterComplex = "";
  let inputArgs = "";
  preRendered.forEach((clip, i) => {
    inputArgs += `-i ${clip.file} `;
  });

  // Gerar xfade entre vídeos
  filterComplex += preRendered
    .map((clip, i) => `[${i}:v]scale=1920:1080,setpts=PTS-STARTPTS[v${i}]`)
    .join("; ") + "; ";

  for (let i = 0; i < preRendered.length - 1; i++) {
    const offset = preRendered.slice(0, i + 1).reduce((sum, c, idx) => idx === i ? 0 : sum + c.duration, 0);
    filterComplex += `[v${i}][v${i + 1}]xfade=transition=fade:duration=0.5:offset=${offset}[vxf${i}]; `;
  }

  const finalVideoLabel = preRendered.length > 1 ? `[vxf${preRendered.length - 2}]` : `[v0]`;

  // 3️⃣ Preparar áudio mix com crossfade
  let audioFilters = "";
  audioFiles.forEach((audio, i) => {
    inputArgs += `-i ${audio} `;
    audioFilters += `[${i + preRendered.length}:a]atrim=start=0:duration=${clips[i].duration},asetpts=PTS-STARTPTS[a${i}]; `;
  });

  for (let i = 0; i < audioFiles.length - 1; i++) {
    audioFilters += `[a${i}][a${i + 1}]acrossfade=d=0.5:c1=tri:c2=tri[a${i + 1}xf]; `;
  }

  const finalAudioLabel = audioFiles.length > 1 ? `[a${audioFiles.length - 1}xf]` : `[a0]`;

  // 4️⃣ Executar FFmpeg
  return new Promise((resolve, reject) => {
    ffmpeg()
      .inputOptions(inputArgs.split(" ").filter(Boolean))
      .complexFilter(filterComplex + audioFilters)
      .outputOptions([
        "-map", finalVideoLabel,
        "-map", finalAudioLabel,
        "-c:v libx264",
        "-c:a aac",
        "-b:a 192k",
        "-pix_fmt yuv420p",
        "-preset ultrafast",
        "-movflags +faststart",
        "-shortest"
      ])
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });
}

// 5️⃣ Exemplo de uso
(async () => {
  const clips = [
    { image: "/app/uploads/1771305100930-script_image_1771304135484_0.png", duration: 4.45 },
    { image: "/app/uploads/1771305101716-script_image_1771304137604_1.png", duration: 3.97 },
    { image: "/app/uploads/1771305101953-script_image_1771304138145_2.png", duration: 4.61 },
    { image: "/app/uploads/1771305102125-script_image_1771304138880_3.png", duration: 4.21 },
    // ... demais clipes
  ];

  const audioFiles = [
    "/app/uploads/1771305101700-script_audio_1771304135484_0.wav",
    "/app/uploads/1771305101941-script_audio_1771304137604_1.wav",
    "/app/uploads/1771305102109-script_audio_1771304138145_2.wav",
    "/app/uploads/1771305102337-script_audio_1771304138880_3.wav",
    // ... demais áudios
  ];

  try {
    await generateVideoWithTransitions(clips, audioFiles, "/app/uploads/final_video.mp4");
    console.log("✅ Vídeo final gerado com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao gerar vídeo:", err);
  }
})();
