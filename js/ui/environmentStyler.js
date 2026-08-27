// ===========================================================
// EnvironmentStyler — color pickers + hex fields for sky
// background, tile tint and ground/floor color. Writes straight
// onto the active scene's `background` object, which the
// Renderer reads every frame, so changes appear instantly.
// ===========================================================

import { bus } from '../state/eventBus.js';

const ROWS = [
  { key: 'color', color: 'color-sky', hex: 'hex-sky', fallback: '#5c94fc' },
  { key: 'tileTint', color: 'color-tint', hex: 'hex-tint', fallback: '#8b5a2b' },
  { key: 'groundColor', color: 'color-ground', hex: 'hex-ground', fallback: '#3a2413' },
];

const HEX_RE = /^#([0-9a-f]{6})$/i;

export class EnvironmentStyler {
  constructor({ state, sceneManager }) {
    this.state = state;
    this.sceneManager = sceneManager;

    ROWS.forEach((row) => {
      row.colorEl = document.getElementById(row.color);
      row.hexEl = document.getElementById(row.hex);
    });

    this._syncFromScene();
    this._bind();
    bus.on('scene:changed', () => this._syncFromScene());
    bus.on('scene:styled', () => this._syncFromScene()); // e.g. changed via /tint, /bg console commands
  }

  _bind() {
    ROWS.forEach((row) => {
      row.colorEl.addEventListener('input', () => this._apply(row, row.colorEl.value));
      row.hexEl.addEventListener('change', () => {
        const v = normalizeHex(row.hexEl.value);
        if (v) this._apply(row, v);
        else row.hexEl.value = row.colorEl.value; // reject invalid input, restore last good value
      });
    });
  }

  _apply(row, hex) {
    const scene = this.sceneManager.getActiveScene();
    if (!scene) return;
    scene.background[row.key] = hex;
    row.colorEl.value = hex;
    row.hexEl.value = hex;
    this.sceneManager.persist();
    bus.emit('scene:styled', scene);
  }

  _syncFromScene() {
    const scene = this.sceneManager.getActiveScene();
    if (!scene) return;
    ROWS.forEach((row) => {
      const value = scene.background[row.key] || row.fallback;
      row.colorEl.value = value;
      row.hexEl.value = value;
    });
  }
}

function normalizeHex(v) {
  const s = v.trim().startsWith('#') ? v.trim() : `#${v.trim()}`;
  return HEX_RE.test(s) ? s : null;
}
