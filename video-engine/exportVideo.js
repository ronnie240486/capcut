const { exec } = require("child_process");
const buildFilters = require("./filterBuilder");

function exportVideo({ input, effects, output }) {
  const filters = buildFilters(effects);

  const cmd = `
    ffmpeg -y -i ${input}
    -vf "${filters}"
    -c:v libx264
    -pix_fmt yuv420p
    ${output}
  `;

  exec(cmd, (err) => {
    if (err) console.error("❌ Erro:", err);
    else console.log("✅ Export finalizado");
  });
}

module.exports = exportVideo;
