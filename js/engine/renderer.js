// ===========================================================
// Renderer — draws the current scene + player + HUD overlay to
// the canvas every frame. Purely reads state; never mutates it.
// ===========================================================

const TILE = 32;

export class Renderer {
  constructor({ ctx, canvas, state, assetLoader, sceneManager }) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.state = state;
    this.assetLoader = assetLoader;
    this.sceneManager = sceneManager;
    this.camera = { x: 0 };
  }

  draw() {
    const { ctx, canvas } = this;
    const scene = this.sceneManager.getActiveScene();
    if (!scene) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    this._updateCamera(scene);

    ctx.save();
    // ---- sky ------------------------------------------------------
    ctx.fillStyle = scene.background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this._drawParallax(scene);

    // ---- world space (camera translated) ---------------------------
    ctx.save();
    ctx.translate(-Math.round(this.camera.x), 0);

    scene.platforms.forEach((p) => this._drawTile(p, scene));
    scene.triggers.forEach((t) => this._drawTrigger(t));
    scene.obstacles.forEach((o) => this._drawTile(o, scene));
    scene.collectibles.forEach((c) => this._drawCollectible(c));
    this._drawPlayer();

    if (this.state.editMode) this._drawGrid(scene);
    ctx.restore();
    ctx.restore();

    this._drawHUD(scene);
  }

  _updateCamera(scene) {
    const p = this.state.player;
    const half = this.canvas.width / 2;
    const target = clamp(p.x + p.width / 2 - half, 0, Math.max(0, scene.width - this.canvas.width));
    // simple smoothing so scene switches / edits don't jump-cut violently
    this.camera.x += (target - this.camera.x) * 0.18;
    if (Math.abs(target - this.camera.x) < 0.5) this.camera.x = target;
  }

  _drawParallax(scene) {
    const { ctx, canvas } = this;
    const layerX = -(this.camera.x * 0.3) % 240;
    ctx.fillStyle = shade(scene.background.color, -18);
    for (let x = layerX - 240; x < canvas.width + 240; x += 240) {
      ctx.beginPath();
      ctx.ellipse(x + 60, canvas.height - 40, 110, 46, 0, Math.PI, 0, true);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const cloudX = -(this.camera.x * 0.15) % 320;
    for (let x = cloudX - 320; x < canvas.width + 320; x += 320) {
      this._cloud(x + 90, 70);
      this._cloud(x + 220, 120);
    }
  }

  _cloud(x, y) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(x, y, 26, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 20, y + 4, 20, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 20, y + 4, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawTile(entity, scene) {
    const { ctx } = this;
    const def = this.assetLoader.getDef(entity.tileType);
    const envColor = entity.category === 'platform' ? scene.background.groundColor : scene.background.tileTint;
    const tint = entity.tint || envColor || def?.color || '#888';

    if (def?.image) {
      ctx.drawImage(def.image, entity.x, entity.y, entity.w, entity.h);
      return;
    }
    ctx.fillStyle = tint;
    if (entity.category === 'obstacle' && def?.id === 'spike') {
      ctx.beginPath();
      const n = Math.max(1, Math.round(entity.w / 16));
      const step = entity.w / n;
      for (let i = 0; i < n; i++) {
        ctx.moveTo(entity.x + i * step, entity.y + entity.h);
        ctx.lineTo(entity.x + i * step + step / 2, entity.y);
        ctx.lineTo(entity.x + i * step + step, entity.y + entity.h);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      roundRect(ctx, entity.x, entity.y, entity.w, entity.h, 3);
      ctx.fill();
      ctx.strokeStyle = shade(tint, -25);
      ctx.lineWidth = 2;
      roundRect(ctx, entity.x + 1, entity.y + 1, entity.w - 2, entity.h - 2, 3);
      ctx.stroke();
    }
  }

  _drawTrigger(t) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#b39ddb';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#b39ddb';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(t.x, t.y, t.w, t.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('→', t.x + t.w / 2, t.y + t.h / 2 + 6);
    ctx.restore();
  }

  _drawCollectible(c) {
    if (c.collected) return;
    const { ctx } = this;
    const def = this.assetLoader.getDef(c.tileType);
    const bob = Math.sin(performance.now() / 260 + c.phase) * 4;
    const tint = c.tint || def?.color || '#ffd54f';

    if (def?.image) {
      ctx.drawImage(def.image, c.x, c.y + bob, c.w, c.h);
      return;
    }
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bob);
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(0, 0, c.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(tint, -30);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  _drawPlayer() {
    const { ctx } = this;
    const p = this.state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    // body
    ctx.fillStyle = '#ff5252';
    roundRect(ctx, 0, 0, p.width, p.height, 6);
    ctx.fill();
    // eyes (indicate facing)
    ctx.fillStyle = '#fff';
    const eyeX = p.facing === 1 ? p.width - 12 : 4;
    ctx.beginPath();
    ctx.arc(eyeX + 4, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(eyeX + 4 + p.facing * 1.5, 14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawGrid(scene) {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const startX = Math.floor(this.camera.x / TILE) * TILE;
    for (let x = startX; x < this.camera.x + canvas.width + TILE; x += TILE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, scene.height);
      ctx.stroke();
    }
    for (let y = 0; y < scene.height; y += TILE) {
      ctx.beginPath();
      ctx.moveTo(this.camera.x, y);
      ctx.lineTo(this.camera.x + canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawHUD(scene) {
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const p = this.state.player;
    setText('hud-health-val', Math.round(p.health));
    setText('hud-score-val', p.score);
    setText('hud-inventory-val', p.inventory.length);
    setText('hud-scene-val', scene.name);
  }
}

export function worldToScene(canvas, camera, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX + camera.x;
  const y = (clientY - rect.top) * scaleY;
  return { x, y };
}

export function snapToGrid(v, size = TILE) {
  return Math.round(v / size) * size;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function shade(hex, percent) {
  const n = hexToRgb(hex);
  if (!n) return hex;
  const f = (c) => clamp(Math.round(c + (percent / 100) * 255), 0, 255);
  return `rgb(${f(n.r)}, ${f(n.g)}, ${f(n.b)})`;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
