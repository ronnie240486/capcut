import fs from 'fs';
import path from 'path';

console.log('CWD:', process.cwd());
console.log('__dirname (simulated):', path.dirname(new URL(import.meta.url).pathname));
console.log('Exists videoengine:', fs.existsSync('./videoengine'));
console.log('Exists videoengine/exportVideo.js:', fs.existsSync('./videoengine/exportVideo.js'));
if (fs.existsSync('./videoengine')) {
    console.log('Contents of videoengine:', fs.readdirSync('./videoengine'));
}

