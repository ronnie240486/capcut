import fs from 'fs';
import path from 'path';

console.log('CWD:', process.cwd());
console.log('__dirname (simulated):', path.dirname(new URL(import.meta.url).pathname));
console.log('Exists video-engine:', fs.existsSync('./video-engine'));
console.log('Exists video-engine/exportVideo.js:', fs.existsSync('./video-engine/exportVideo.js'));
if (fs.existsSync('./video-engine')) {
    console.log('Contents of video-engine:', fs.readdirSync('./video-engine'));
}
