// ===========================================================
// PhysicsEngine — gravity, movement, collision resolution and
// gameplay reactions (pickups, damage, scene-exit triggers).
// Reads tunable values straight from GameState.physics every
// frame, so inspector sliders / console commands apply live
// with zero extra plumbing.
// ===========================================================

import { aabbOverlap } from '../entities/entity.js';

const DT_BASELINE = 1000 / 60; // physics constants are tuned assuming 60fps

export class PhysicsEngine {
  constructor({ state, input, assetLoader, sceneManager, bus }) {
    this.state = state;
    this.input = input;
    this.assetLoader = assetLoader;
    this.sceneManager = sceneManager;
    this.bus = bus;
  }

  /** @param {number} dtMs milliseconds since last frame */
  update(dtMs) {
    const scene = this.sceneManager.getActiveScene();
    if (!scene) return;
    if (this.state.paused || this.state.editMode) return;

    const dtFactor = clamp(dtMs / DT_BASELINE, 0, 3); // avoid huge jumps on tab-switch
    const { physics } = this.state;
    const player = this.state.player;
    const inputState = this.input.state;

    // --- horizontal movement -------------------------------------------------
    if (inputState.left && !inputState.right) {
      player.vx = -physics.moveSpeed;
      player.facing = -1;
    } else if (inputState.right && !inputState.left) {
      player.vx = physics.moveSpeed;
      player.facing = 1;
    } else {
      player.vx *= Math.pow(physics.friction, dtFactor);
      if (Math.abs(player.vx) < 0.02) player.vx = 0;
    }

    // --- jump / gravity --------------------------------------------------
    if (inputState.jump && player.onGround) {
      player.vy = -physics.jumpVelocity;
      player.onGround = false;
    }
    player.vy += physics.gravity * dtFactor;
    player.vy = clamp(player.vy, -1000, 30); // terminal velocity guard

    // --- integrate + resolve collisions axis by axis --------------------------
    player.onGround = false;
    this._moveAxis(player, 'x', player.vx * dtFactor, scene);
    this._moveAxis(player, 'y', player.vy * dtFactor, scene);

    // --- world bounds ------------------------------------------------------
    player.x = clamp(player.x, 0, scene.width - player.width);
    if (player.y > scene.height + 200) {
      this._respawn(scene, 15);
    }

    // --- obstacles / collectibles / triggers ---------------------------------
    this._resolveOverlaps(scene);

    this.bus.emit('player:tick', player);
  }

  _moveAxis(player, axis, delta, scene) {
    if (delta === 0) return;
    if (axis === 'x') player.x += delta; else player.y += delta;

    for (const plat of scene.platforms) {
      const def = this.assetLoader.getDef(plat.tileType);
      if (def && def.solid === false) continue;
      if (!aabbOverlap(playerBounds(player), plat)) continue;

      if (axis === 'x') {
        if (delta > 0) player.x = plat.x - player.width;
        else if (delta < 0) player.x = plat.x + plat.w;
        player.vx = 0;
      } else {
        if (delta > 0) { // falling, landed on top
          player.y = plat.y - player.height;
          player.vy = 0;
          player.onGround = true;
        } else if (delta < 0) { // jumping, hit head on underside
          player.y = plat.y + plat.h;
          player.vy = 0;
        }
      }
    }
  }

  _resolveOverlaps(scene) {
    const pb = playerBounds(this.state.player);

    for (const ob of scene.obstacles) {
      if (aabbOverlap(pb, ob)) {
        const def = this.assetLoader.getDef(ob.tileType);
        this._respawn(scene, def?.damage ?? 20);
        return; // respawn already resets bounds; stop checking this frame
      }
    }

    for (const c of scene.collectibles) {
      if (c.collected) continue;
      if (aabbOverlap(pb, c)) {
        c.collected = true;
        const def = this.assetLoader.getDef(c.tileType);
        if (def?.value) this.state.addScore(def.value);
        if (def?.heal) this.state.healPlayer(def.heal);
        this.state.collectItem(c.tileType);
        this.bus.emit('collectible:collected', { entity: c, def });
      }
    }

    for (const t of scene.triggers) {
      if (aabbOverlap(pb, t) && t.meta?.nextScene) {
        this.sceneManager.switchTo(t.meta.nextScene);
        return;
      }
    }
  }

  _respawn(scene, damage) {
    this.state.damagePlayer(damage);
    this.state.resetPlayerToSpawn(scene.spawn);
  }
}

function playerBounds(player) {
  return { left: player.x, right: player.x + player.width, top: player.y, bottom: player.y + player.height };
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
