const FIELD_W = 80;
const FIELD_H = 45;

export class CameraField {
  constructor(video, debugCanvas, settings) {
    this.video = video; this.debug = debugCanvas; this.debugCtx = debugCanvas.getContext('2d'); this.processCanvas = document.createElement('canvas'); this.processCanvas.width = FIELD_W; this.processCanvas.height = FIELD_H; this.ctx = this.processCanvas.getContext('2d', { willReadFrequently: true });
    this.settings = settings; this.w = FIELD_W; this.h = FIELD_H; this.size = FIELD_W * FIELD_H;
    this.luma = new Float32Array(this.size); this.background = new Float32Array(this.size); this.mask = new Float32Array(this.size); this.smooth = new Float32Array(this.size); this.temp = new Float32Array(this.size);
    this.ready = false; this.relearn = true; this.frame = 0; this.showDebug = false;
  }
  async start() {
    try { this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
    catch (error) { console.warn('Camera unavailable: particles will keep flowing.', error); return; }
    await new Promise(resolve => this.video.addEventListener('loadeddata', resolve, { once: true }));
    this.ready = true;
  }
  reset() { this.relearn = true; }
  update() {
    if (!this.ready || this.video.readyState < 2) return;
    const s = this.settings, c = this.ctx, vw = this.video.videoWidth, vh = this.video.videoHeight;
    const left = s.cropLeft, right = s.cropRight, top = s.cropTop, bottom = s.cropBottom;
    const sx = vw * left, sy = vh * top, sw = Math.max(1, vw * (1 - left - right)), sh = Math.max(1, vh * (1 - top - bottom));
    c.save(); c.setTransform(s.flipX ? -1 : 1, 0, 0, s.flipY ? -1 : 1, s.flipX ? this.w : 0, s.flipY ? this.h : 0); c.drawImage(this.video, sx, sy, sw, sh, 0, 0, this.w, this.h); c.restore();
    const pixels = c.getImageData(0, 0, this.w, this.h).data;
    const adapt = this.relearn ? 1 : s.backgroundAdapt;
    for (let i = 0, p = 0; i < this.size; i++, p += 4) { const l = (pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722) / 255; this.luma[i] = l; this.background[i] += (l - this.background[i]) * adapt; this.mask[i] = Math.max(0, Math.abs(l - this.background[i]) - s.threshold) / Math.max(.001, 1 - s.threshold); }
    this.relearn = false; this.blur(); if (this.showDebug) this.drawDebug(); this.frame++;
  }
  blur() {
    const w = this.w, h = this.h, a = this.mask, t = this.temp, o = this.smooth;
    const radius = 1 + Math.round(this.settings.obstacleRadius * 5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sum = 0, n = 0; for (let k = -radius; k <= radius; k++) { const xx = Math.max(0, Math.min(w - 1, x + k)); sum += a[y * w + xx]; n++; } t[y * w + x] = sum / n; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sum = 0, n = 0; for (let k = -radius; k <= radius; k++) { const yy = Math.max(0, Math.min(h - 1, y + k)); sum += t[yy * w + x]; n++; } o[y * w + x] = sum / n; }
  }
  drawDebug() {
    const ctx = this.debugCtx, scaleX = this.debug.width / this.w, scaleY = this.debug.height / this.h;
    ctx.save(); ctx.clearRect(0, 0, this.debug.width, this.debug.height); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.processCanvas, 0, 0, this.debug.width, this.debug.height);
    // Red overlay = occupied foreground. Cyan arrows = direction particles are pushed.
    for (let y = 1; y < this.h - 1; y++) for (let x = 1; x < this.w - 1; x++) { const i = y * this.w + x, occupied = this.smooth[i]; if (occupied > .04) { ctx.fillStyle = `rgba(255,55,45,${Math.min(.72, occupied * .8)})`; ctx.fillRect(x * scaleX, y * scaleY, scaleX + 1, scaleY + 1); } }
    ctx.strokeStyle = '#51efff'; ctx.fillStyle = '#51efff'; ctx.lineWidth = 1.5;
    for (let y = 3; y < this.h - 3; y += 4) for (let x = 3; x < this.w - 3; x += 4) { const i = y * this.w + x, occupied = this.smooth[i]; if (occupied < .08) continue; const gx = this.smooth[i + 1] - this.smooth[i - 1], gy = this.smooth[i + this.w] - this.smooth[i - this.w], length = Math.hypot(gx, gy); if (length < .002) continue; const px = (x + .5) * scaleX, py = (y + .5) * scaleY, dx = -gx / length * 13, dy = -gy / length * 13; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + dx, py + dy); ctx.stroke(); ctx.beginPath(); ctx.arc(px + dx, py + dy, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('CAMERA / OBSTACLE FIELD', 10, 19); ctx.fillStyle = '#ff665b'; ctx.fillText('red: detected foreground', 10, this.debug.height - 27); ctx.fillStyle = '#51efff'; ctx.fillText('cyan: particle force → empty space', 10, this.debug.height - 10); ctx.restore();
  }
}
