// ===========================================================
// GameState — single source of truth for the whole sandbox.
// Every subsystem (physics, renderer, UI panels, console)
// reads/writes through this shared instance so a change made
// anywhere is instantly visible everywhere else (live preview).
// ===========================================================

import { bus } from './eventBus.js';

const PHYSICS_DEFAULTS = {
  gravity: 0.6,       // downward acceleration applied every frame (@60fps baseline)
  jumpVelocity: 14,   // upward impulse applied on jump
  moveSpeed: 5,        // horizontal top speed
  friction: 0.85,      // velocity damping applied when no horizontal input
};

const PLAYER_DEFAULTS = {
  width: 32,
  height: 48,
  x: 64,
  y: 0,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  health: 100,
  maxHealth: 100,
  score: 0,
  inventory: [], // array of collected item ids
};

export class GameState {
  constructor() {
    this.physics = { ...PHYSICS_DEFAULTS };
    this.player = { ...PLAYER_DEFAULTS };
    this.currentSceneId = null;
    this.editMode = false;
    this.paused = false;
    this.activeBrush = null; // { category, tileType } selected in the palette / eraser
  }

  // ---- physics -------------------------------------------------
  updatePhysics(partial, { silent = false } = {}) {
    Object.assign(this.physics, partial);
    if (!silent) bus.emit('physics:changed', this.physics);
  }

  // ---- player ----------------------------------------------------
  resetPlayerToSpawn(spawn) {
    this.player.x = spawn?.x ?? PLAYER_DEFAULTS.x;
    this.player.y = spawn?.y ?? PLAYER_DEFAULTS.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    bus.emit('player:changed', this.player);
  }

  damagePlayer(amount) {
    this.player.health = Math.max(0, this.player.health - amount);
    bus.emit('player:changed', this.player);
    if (this.player.health === 0) bus.emit('player:died', this.player);
  }

  healPlayer(amount) {
    this.player.health = Math.min(this.player.maxHealth, this.player.health + amount);
    bus.emit('player:changed', this.player);
  }

  addScore(amount) {
    this.player.score += amount;
    bus.emit('player:changed', this.player);
  }

  collectItem(itemId) {
    this.player.inventory.push(itemId);
    bus.emit('player:changed', this.player);
  }

  fullPlayerReset() {
    Object.assign(this.player, structuredCloneSafe(PLAYER_DEFAULTS));
    bus.emit('player:changed', this.player);
  }

  // ---- mode --------------------------------------------------
  setEditMode(on) {
    this.editMode = on;
    bus.emit('mode:changed', { editMode: this.editMode });
  }

  setPaused(on) {
    this.paused = on;
    bus.emit('pause:changed', { paused: this.paused });
  }

  setActiveBrush(brush) {
    this.activeBrush = brush;
    bus.emit('brush:changed', this.activeBrush);
  }
}

function structuredCloneSafe(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

// Singleton shared across the whole app.
export const state = new GameState();
