import { exec } from "child_process";
import fs from "fs";

export function fixWavIfNeeded(inputPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(inputPath)) {
            return reject(new Error("Arquivo não encontrado: " + inputPath));
        }

        const fixedPath = inputPath.replace(/\.wav$/i, "_fixed.wav");

        const cmd = `ffmpeg -hide_banner -loglevel error -y -i "${inputPath}" -ac 2 -ar 44100 -sample_fmt s16 "${fixedPath}"`;

        exec(cmd, (err) => {
            if (err) {
                console.error("Erro corrigindo wav:", err);
                return resolve(inputPath); // fallback: usa original
            }

            // substitui o arquivo problemático
            fs.renameSync(fixedPath, inputPath);
            resolve(inputPath);
        });
    });
}
