const fs = require("fs");

const presets = {};

// ---------- ZOOM (40) ----------
for (let i = 1; i <= 40; i++) {
  presets[`zoomIn_${i}`] = {
    zoom: {
      from: 1.0,
      to: 1.0 + i * 0.01,
      frames: 60 + i * 4
    }
  };
}

// ---------- SHAKE (20) ----------
for (let i = 1; i <= 20; i++) {
  presets[`shake_${i}`] = {
    shake: { intensity: i }
  };
}

// ---------- ROTATE (20) ----------
for (let i = 1; i <= 20; i++) {
  presets[`rotate_${i}`] = {
    rotate: { angle: i % 2 === 0 ? i : -i }
  };
}

// ---------- COR (50) ----------
for (let i = 1; i <= 50; i++) {
  presets[`cinematic_${i}`] = {
    eq: {
      contrast: 1 + i * 0.01,
      saturation: 1 + i * 0.005
    }
  };
}

// ---------- BLUR / GLOW (30) ----------
for (let i = 1; i <= 15; i++) {
  presets[`blur_${i}`] = { blur: { strength: i } };
  presets[`glow_${i}`] = { glow: { intensity: i / 20 } };
}

// ---------- TRANSIÇÕES (40) ----------
const transitions = ["fade", "slideleft", "slideright", "circleopen"];
let t = 1;
for (const type of transitions) {
  for (let d = 0.3; d <= 1.0; d += 0.2) {
    presets[`transition_${t++}`] = {
      transition: { type, duration: Number(d.toFixed(1)) }
    };
  }
}

fs.writeFileSync(
  "./presets.js",
  "module.exports = " + JSON.stringify(presets, null, 2)
);

console.log("✅ Presets gerados:", Object.keys(presets).length);
