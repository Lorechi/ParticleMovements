import { CameraField } from './cameraField.js';
import { Particles } from './particles.js';
import { mountControls } from './controls.js';
const settings = { count: 10000, flowSpeed: .28, turbulence: 1.5, damping: .968, repulsion: 2.5, obstacleRadius: .35, distribution: .1, threshold: .12, backgroundAdapt: .02, particleSize: 1.5, trail: 0, invert: false, flipX: true, flipY: false, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };
const canvas = document.querySelector('#particles'), debug = document.querySelector('#camera-debug');
const particles = new Particles(canvas, settings); const field = new CameraField(document.querySelector('#camera'), debug, settings); const panel = mountControls(settings, () => field.reset());
let last = performance.now(), lastCameraUpdate = 0;
function frame(now) { particles.resize(); particles.setCount(settings.count); if (now - lastCameraUpdate > 66) { field.update(); lastCameraUpdate = now; } particles.update(field, now, (now - last) / 1000); particles.render(); last = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame); field.start();
addEventListener('resize', () => particles.resize()); addEventListener('keydown', async e => { const key = e.key.toLowerCase(); if (key === 'h') panel.classList.toggle('hidden'); if (key === 'd') { field.showDebug = !field.showDebug; debug.style.display = field.showDebug ? 'block' : 'none'; } if (key === 'r') field.reset(); if (key === 'i') settings.invert = !settings.invert; if (key === 'f') { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } });
