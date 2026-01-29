const { spawn } = require('child_process');
const path = require('path');
const presetGenerator = require('./video-engine/presetGenerator');
const transitionBuilder = require('./video-engine/transitionBuilder');

module.exports = function exportVideo({ clips, fileMap, mediaLibrary, output }) {
  return new Promise((resolve, reject) => {

    // 🔒 DEFESAS
    if (!Array.isArray(clips)) clips = [];
    if (!fileMap) fileMap = {};
    if (!mediaLibrary) mediaLibrary = {};

    const outputPath = output || path.join('/tmp', `export_${Date.now()}.mp4`);

    let timeline;
    try {
      timeline = transitionBuilder.buildTimeline(
        clips,
        fileMap,
        mediaLibrary
      );
    } catch (err) {
      return reject(new Error('Erro ao montar timeline: ' + err.message));
    }

    if (
      !timeline ||
      !Array.isArray(timeline.inputs) ||
      !timeline.outputMapVideo ||
      !timeline.outputMapAudio
    ) {
      return reject(new Error('Timeline inválida gerada'));
    }

    // 🔒 PRESETS SEGUROS
    const videoArgs = typeof presetGenerator.getVideoArgs === 'function'
      ? presetGenerator.getVideoArgs()
      : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];

    const audioArgs = typeof presetGenerator.getAudioArgs === 'function'
      ? presetGenerator.getAudioArgs()
      : ['-c:a', 'aac', '-b:a', '192k'];

    const ffmpegArgs = [
      ...timeline.inputs,

      ...(timeline.filterComplex
        ? ['-filter_complex', timeline.filterComplex]
        : []),

      '-map', timeline.outputMapVideo,
      '-map', timeline.outputMapAudio,

      '-shortest',

      ...videoArgs,
      ...audioArgs,

      '-movflags', '+faststart',
      '-y',
      outputPath
    ];

    // 🔎 LOG PARA DEPURAÇÃO REAL
    console.log('FFmpeg command:\nffmpeg ' + ffmpegArgs.join(' '));

    const ff = spawn('ffmpeg', ffmpegArgs);

    let stderr = '';

    ff.stderr.on('data', d => {
      stderr += d.toString();
    });

    ff.on('close', code => {
      if (code !== 0) {
        console.error(stderr);
        return reject(new Error('FFmpeg falhou: ' + code));
      }
      resolve(outputPath);
    });
  });
};
