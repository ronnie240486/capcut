const { spawn } = require('child_process');
const transitionBuilder = require('./video-engine/transitionBuilder');
const presetGenerator = require('./video-engine/presetGenerator');

module.exports = async function exportVideo({
    clips,
    fileMap,
    mediaLibrary,
    outputPath
}) {

    const timeline = transitionBuilder.buildTimeline(
        clips,
        fileMap,
        mediaLibrary
    );

    const ffmpegArgs = [
        ...timeline.inputs,

        '-filter_complex', timeline.filterComplex,

        '-map', timeline.outputMapVideo,
        '-map', timeline.outputMapAudio,

        '-shortest',                 // 🔒 CRÍTICO

        ...presetGenerator.getVideoArgs(),
        ...presetGenerator.getAudioArgs(),

        '-y',
        outputPath
    ];

    console.log('FFmpeg CMD:\nffmpeg ' + ffmpegArgs.join(' '));

    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ffmpegArgs);

        ff.stderr.on('data', d => console.log(d.toString()));

        ff.on('close', code => {
            if (code === 0) resolve(outputPath);
            else reject(new Error('FFmpeg falhou: ' + code));
        });
    });
};
