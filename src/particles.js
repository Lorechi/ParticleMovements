const VERT = `attribute vec2 position; uniform float pointSize; void main(){gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.,1.); gl_PointSize=pointSize;}`;
const FRAG = `precision mediump float; uniform float color; void main(){vec2 p=gl_PointCoord-.5; if(dot(p,p)>.25) discard; gl_FragColor=vec4(vec3(color),1.);}`;
export class Particles {
  constructor(canvas, settings) { this.canvas = canvas; this.settings = settings; this.gl = canvas.getContext('webgl', { alpha: false, antialias: false }); if (!this.gl) throw new Error('WebGL is required.'); this.count = 0; this.initGL(); this.resize(); this.setCount(settings.count); }
  initGL() { const gl = this.gl, compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return s; }; const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p); this.program = p; this.buffer = gl.createBuffer(); this.loc = gl.getAttribLocation(p, 'position'); this.pointSize = gl.getUniformLocation(p, 'pointSize'); this.color = gl.getUniformLocation(p, 'color'); }
  resize() { const dpr = Math.min(devicePixelRatio, 1.5), w = innerWidth * dpr, h = innerHeight * dpr; if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.gl.viewport(0, 0, w, h); } }
  setCount(n) { n = Math.floor(n); if (n === this.count) return; this.count = n; this.pos = new Float32Array(n * 2); this.vel = new Float32Array(n * 2); this.spawnY = new Float32Array(n); this.densityWidth = 64; this.densityHeight = 36; this.density = new Float32Array(this.densityWidth * this.densityHeight); this.densityTemp = new Float32Array(this.density.length); for (let i = 0; i < n; i++) { this.pos[i * 2] = Math.random(); this.pos[i * 2 + 1] = Math.random(); this.spawnY[i] = Math.random(); } }
  buildDensity() {
    const p = this.pos, d = this.density, t = this.densityTemp, w = this.densityWidth, h = this.densityHeight;
    d.fill(0);
    for (let i = 0; i < this.count; i++) { const x = Math.max(0, Math.min(w - 1, (p[i * 2] * w) | 0)), y = Math.max(0, Math.min(h - 1, (p[i * 2 + 1] * h) | 0)); d[y * w + x]++; }
    // Small separable blur: a smooth density gradient, rather than cell-by-cell jitter.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const left = d[y * w + Math.max(0, x - 1)], mid = d[y * w + x], right = d[y * w + Math.min(w - 1, x + 1)]; t[y * w + x] = (left + mid * 2 + right) * .25; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const up = t[Math.max(0, y - 1) * w + x], mid = t[y * w + x], down = t[Math.min(h - 1, y + 1) * w + x]; d[y * w + x] = (up + mid * 2 + down) * .25; }
  }
  update(field, time, dt) {
    const s = this.settings, p = this.pos, v = this.vel, d = Math.min(dt, .033), radius = s.obstacleRadius, f = field.smooth, fw = field.w, fh = field.h, dw = this.densityWidth, dh = this.densityHeight, density = this.density, expectedDensity = this.count / (dw * dh);
    this.buildDensity();
    // Velocities converge to the base flow rather than accumulating forever.
    const recovery = 1 - Math.pow(s.damping, d * 60);
    for (let i = 0; i < this.count; i++) {
      const j = i * 2, x = p[j], y = p[j + 1];
      const wave = Math.sin(y * 10 + time * .00035) + .55 * Math.sin(x * 15 - time * .00022);
      let targetX = s.flowSpeed * (1.1 + .12 * Math.cos(wave * s.turbulence));
      let targetY = s.flowSpeed * .18 * Math.sin(wave * s.turbulence + x * 5);
      const dx = Math.max(1, Math.min(dw - 2, (x * dw) | 0)), dy = Math.max(1, Math.min(dh - 2, (y * dh) | 0)), di = dy * dw + dx;
      // Only excess density creates pressure. This restores an even spread without
      // interfering with the gentle base flow in already sparse areas.
      const pressure = value => Math.max(0, value - expectedDensity) / expectedDensity;
      const densityGX = Math.max(-3, Math.min(3, pressure(density[di + 1]) - pressure(density[di - 1])));
      const densityGY = Math.max(-3, Math.min(3, pressure(density[di + dw]) - pressure(density[di - dw])));
      targetX -= densityGX * s.distribution; targetY -= densityGY * s.distribution;
      const px = Math.max(1, Math.min(fw - 2, (x * fw) | 0)), py = Math.max(1, Math.min(fh - 2, (y * fh) | 0)), index = py * fw + px, occupied = f[index];
      if (occupied > .02) { const gx = f[index + 1] - f[index - 1], gy = f[index + fw] - f[index - fw], glen = Math.hypot(gx, gy) + .0001, influence = occupied * s.repulsion * (1 + radius * 4); targetX -= gx / glen * influence; targetY -= gy / glen * influence; }
      v[j] += (targetX - v[j]) * recovery; v[j + 1] += (targetY - v[j + 1]) * recovery;
      const nextX = x + v[j] * d, nextY = y + v[j + 1] * d;
      // This is a source/sink stream, not a torus: particles continuously enter from the left.
      if (nextX > 1 || nextX < -.05) { p[j] = 0; p[j + 1] = this.spawnY[i]; v[j] = s.flowSpeed; v[j + 1] = 0; this.spawnY[i] = (this.spawnY[i] + .61803398875) % 1; }
      else { p[j] = nextX; p[j + 1] = (nextY + 1) % 1; }
    }
  }
  render() { const gl = this.gl, s = this.settings; gl.clearColor(s.invert ? 1 : 0, s.invert ? 1 : 0, s.invert ? 1 : 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.pos, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.loc); gl.vertexAttribPointer(this.loc, 2, gl.FLOAT, false, 0, 0); gl.uniform1f(this.pointSize, s.particleSize * Math.min(devicePixelRatio, 1.5)); gl.uniform1f(this.color, s.invert ? 0 : 1); gl.drawArrays(gl.POINTS, 0, this.count); }
}
