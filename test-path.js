import fs from 'fs';
import path from 'path';

console.log('CWD:', process.cwd());
console.log('__dirname (simulated):', path.dirname(new URL(import.meta.url).pathname));
console.log('Exists video_engine:', fs.existsSync('./video_engine'));
console.log('Exists video_engine/exportVideo.js:', fs.existsSync('./video_engine/exportVideo.js'));
if (fs.existsSync('./video_engine')) {
    console.log('Contents of video_engine:', fs.readdirSync('./video_engine'));
}
