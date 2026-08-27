// ===========================================================
// PhysicsEngine — gravity, movement, collision resolution and
// gameplay reactions (pickups, damage, scene-exit triggers).
// Reads tunable values straight from GameState.physics every
// frame, so inspector sliders / console commands apply live
// with zero extra plumbing. Also the integration point for
// ingested-plugin gameplay: per-frame actor behaviours and
// scene-wide global hooks registered via BehaviorRegistry.
// ===========================================================

import { aabbOverlap, effectiveBounds } from '../entities/entity.js';
import { behaviorRegistry } from '../ingestion/behaviorRegistry.js';

const DT_BASELINE = 1000 / 60; // physics constants are tuned assuming 60fps
const DIAGONAL = Math.SQRT1_2;

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

    if (scene.mode === 'topdown') this._computeTopDownVelocity(dtFactor);
    else this._computePlatformerVelocity(dtFactor);

    // --- integrate + resolve collisions axis by axis (shared by both modes) ---
    const player = this.state.player;
    player.onGround = false;
    this._moveAxis(player, 'x', player.vx * dtFactor, scene);
    this._moveAxis(player, 'y', player.vy * dtFactor, scene);

    // --- world bounds ------------------------------------------------------
    player.x = clamp(player.x, 0, scene.width - player.width);
    if (scene.mode === 'topdown') {
      player.y = clamp(player.y, 0, scene.height - player.height);
    } else if (player.y > scene.height + 200) {
      this._respawn(scene, 15);
    }

    // --- obstacles / collectibles / triggers ---------------------------------
    this._resolveOverlaps(scene);

    // --- plugin-driven actors/components + scene-wide custom physics rules ---
    this._runComponents(scene, dtFactor);
    behaviorRegistry.runGlobalHooks({ state: this.state, scene, dtFactor, input: this.input.state, bus: this.bus });

    this.bus.emit('player:tick', player);
  }

  _computePlatformerVelocity(dtFactor) {
    const { physics } = this.state;
    const player = this.state.player;
    const inputState = this.input.state;

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

    if (inputState.jump && player.onGround) {
      player.vy = -physics.jumpVelocity;
      player.onGround = false;
    }
    player.vy += physics.gravity * dtFactor;
    player.vy = clamp(player.vy, -1000, 30); // terminal velocity guard
  }

  _computeTopDownVelocity(dtFactor) {
    const { physics } = this.state;
    const player = this.state.player;
    const inputState = this.input.state;

    const movingX = inputState.left !== inputState.right;
    const movingY = inputState.up !== inputState.down;
    const scale = movingX && movingY ? DIAGONAL : 1;

    if (movingX) {
      player.vx = (inputState.right ? 1 : -1) * physics.moveSpeed * scale;
      player.facing = inputState.right ? 1 : -1;
    } else {
      player.vx *= Math.pow(physics.friction, dtFactor);
      if (Math.abs(player.vx) < 0.02) player.vx = 0;
    }

    if (movingY) {
      player.vy = (inputState.down ? 1 : -1) * physics.moveSpeed * scale;
    } else {
      player.vy *= Math.pow(physics.friction, dtFactor);
      if (Math.abs(player.vy) < 0.02) player.vy = 0;
    }
  }

  _moveAxis(player, axis, delta, scene) {
    if (delta === 0) return;
    if (axis === 'x') player.x += delta; else player.y += delta;

    for (const plat of scene.platforms) {
      const def = this.assetLoader.getDef(plat.tileType);
      if (def && def.solid === false) continue;
      const rect = effectiveBounds(plat); // honors a Collision Box component, if the Outliner added one
      if (!aabbOverlap(playerBounds(player), rect)) continue;

      if (axis === 'x') {
        if (delta > 0) player.x = rect.left - player.width;
        else if (delta < 0) player.x = rect.right;
        player.vx = 0;
      } else {
        if (delta > 0) { // falling (or moving down in top-down), landed on top
          player.y = rect.top - player.height;
          player.vy = 0;
          player.onGround = true;
        } else if (delta < 0) { // jumping (or moving up in top-down), hit underside
          player.y = rect.bottom;
          player.vy = 0;
        }
      }
    }
  }

  _resolveOverlaps(scene) {
    const pb = playerBounds(this.state.player);

    for (const ob of scene.obstacles) {
      if (aabbOverlap(pb, effectiveBounds(ob))) {
        const def = this.assetLoader.getDef(ob.tileType);
        const damage = ob.meta?.damage ?? def?.damage ?? 20; // Property Inspector override, else the tile's default
        this._respawn(scene, damage);
        return; // respawn already resets bounds; stop checking this frame
      }
    }

    for (const c of scene.collectibles) {
      if (c.collected) continue;
      if (aabbOverlap(pb, effectiveBounds(c))) {
        c.collected = true;
        const def = this.assetLoader.getDef(c.tileType);
        const value = c.meta?.value ?? def?.value ?? 0;
        const heal = c.meta?.heal ?? def?.heal ?? 0;
        if (value) this.state.addScore(value);
        if (heal) this.state.healPlayer(heal);
        this.state.collectItem(c.tileType);
        this.bus.emit('collectible:collected', { entity: c, def });
      }
    }

    for (const t of scene.triggers) {
      if (aabbOverlap(pb, effectiveBounds(t)) && t.meta?.nextScene) {
        this.sceneManager.switchTo(t.meta.nextScene);
        return;
      }
    }
  }

  /**
   * Run every entity's plugin-supplied behaviour: 'actor' category entities
   * get theirs implicitly from `tileType` (the palette-driven flow), and ANY
   * entity additionally runs whatever 'script' components the Outliner
   * attached to it — that's what lets a script be bolted onto a plain
   * platform or obstacle, not just a purpose-built actor tile.
   */
  _runComponents(scene, dtFactor) {
    const ctx = { state: this.state, scene, input: this.input.state, bus: this.bus };
    const pb = playerBounds(this.state.player);
    const buckets = [scene.platforms, scene.obstacles, scene.collectibles, scene.triggers, scene.actors];

    for (const list of buckets) {
      for (const entity of list) {
        const names = entity.category === 'actor' ? [entity.tileType] : [];
        for (const comp of entity.components) {
          if (comp.type === 'script' && comp.behaviorName) names.push(comp.behaviorName);
        }
        if (!names.length) continue;

        for (const name of names) {
          const behavior = behaviorRegistry.getBehavior(name);
          if (!behavior) continue; // plugin not loaded this session — inert until its script is re-ingested
          try {
            if (!entity.meta.__spawned) behavior.onSpawn?.(entity);
            behavior.onUpdate?.(entity, dtFactor, ctx);
            if (behavior.onPlayerCollide && aabbOverlap(pb, effectiveBounds(entity))) behavior.onPlayerCollide(entity, ctx);
          } catch (err) {
            this.bus.emit('plugin:error', { source: `${entity.category}:${name}`, error: err });
          }
        }
        entity.meta.__spawned = true;
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
