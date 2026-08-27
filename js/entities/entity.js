// ===========================================================
// Entity — lightweight base shape shared by every placeable
// world object (platforms, obstacles, collectibles, triggers).
// Data-driven on purpose: category + tileType look up their
// visuals/behaviour in the AssetLoader definitions, so adding a
// brand new tile type never requires touching physics/render code.
// ===========================================================

import { nextEntityId } from '../assets/assetLoader.js';

export class Entity {
  /**
   * @param {object} opts
   * @param {'platform'|'obstacle'|'collectible'|'trigger'} opts.category
   * @param {string} opts.tileType  id into AssetLoader defs
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} [opts.w]
   * @param {number} [opts.h]
   * @param {string} [opts.tint]  optional per-instance color override
   * @param {string} [opts.id]
   */
  constructor({ category, tileType, x, y, w = 32, h = 32, tint = null, id = null, meta = {} }) {
    this.id = id || nextEntityId(category[0]);
    this.category = category;
    this.tileType = tileType;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.tint = tint;
    this.meta = meta;       // e.g. { nextScene: 'scene_2' } for triggers
    this.collected = false;  // used by collectibles
    this.phase = Math.random() * Math.PI * 2; // for idle bob animation
  }

  get bounds() {
    return { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h };
  }

  toJSON() {
    return {
      id: this.id,
      category: this.category,
      tileType: this.tileType,
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h,
      tint: this.tint,
      meta: this.meta,
    };
  }

  static fromJSON(obj) {
    return new Entity(obj);
  }
}

export function aabbOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
