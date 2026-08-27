// ===========================================================
// GameLoop — the single requestAnimationFrame driver. It never
// restarts: physics + inspector state are read fresh every
// frame, which is what makes slider/console edits apply live.
// ===========================================================

export class GameLoop {
  constructor({ physics, renderer, onTick }) {
    this.physics = physics;
    this.renderer = renderer;
    this.onTick = onTick;
    this._raf = null;
    this._last = 0;
    this._fpsAcc = 0;
    this._fpsCount = 0;
    this._fpsLast = 0;
  }

  start() {
    if (this._raf) return;
    this._last = performance.now();
    const frame = (now) => {
      const dt = Math.min(now - this._last, 100); // clamp huge gaps (tab switch)
      this._last = now;

      this.physics.update(dt);
      this.renderer.draw();
      this._trackFps(now, dt);
      if (this.onTick) this.onTick(dt);

      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _trackFps(now, dt) {
    this._fpsAcc += dt;
    this._fpsCount += 1;
    if (now - this._fpsLast > 500) {
      const fps = Math.round(1000 / (this._fpsAcc / this._fpsCount));
      const el = document.getElementById('fps-counter');
      if (el) el.textContent = `${fps} fps`;
      this._fpsAcc = 0;
      this._fpsCount = 0;
      this._fpsLast = now;
    }
  }
}
