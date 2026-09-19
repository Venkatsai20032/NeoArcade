// Canvas Visual FX & Particle System

class ParticleCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.confetti = [];
    this.ambientNodes = [];
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.initAmbient();
    this.animate();
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  initAmbient() {
    this.ambientNodes = [];
    const count = Math.floor((this.width * this.height) / 18000);
    for (let i = 0; i < count; i++) {
      this.ambientNodes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.6 + 0.6,
        color: Math.random() > 0.5 ? 'rgba(0, 240, 255, ' : 'rgba(255, 0, 85, ',
        alpha: Math.random() * 0.5 + 0.1
      });
    }
  }

  emitBurst(x, y, color = '#00f0ff', count = 28) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1.5,
        color,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.015
      });
    }
  }

  emitVictoryConfetti() {
    const colors = ['#00f0ff', '#ff0055', '#ffb700', '#00ff88', '#9d00ff', '#ffffff'];
    for (let i = 0; i < 150; i++) {
      this.confetti.push({
        x: Math.random() * this.width,
        y: -10 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2.5,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: Math.random() * 0.003 + 0.002
      });
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Render Ambient floating particles
    for (let p of this.ambientNodes) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color + p.alpha + ')';
      this.ctx.fill();
    }

    // Render Action Burst Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.life;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.fill();
      this.ctx.restore();
    }

    // Render Confetti
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.rotSpeed;
      c.life -= c.decay;

      if (c.y > this.height + 50 || c.life <= 0) {
        this.confetti.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.min(1, c.life * 2);
      this.ctx.translate(c.x, c.y);
      this.ctx.rotate((c.rot * Math.PI) / 180);
      this.ctx.fillStyle = c.color;
      this.ctx.shadowColor = c.color;
      this.ctx.shadowBlur = 6;
      this.ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      this.ctx.restore();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.fxCanvas = new ParticleCanvas('fx-canvas');
});
