// ===========================================================
// Entity — lightweight base shape shared by every placeable
// world object (platforms, obstacles, collectibles, triggers,
// actors). Data-driven on purpose: category + tileType look up
// their visuals/behaviour in the AssetLoader defs, so adding a
// brand new tile type never requires touching physics/render code.
//
// Entities can carry child "components" (see the Outliner) —
// small typed data bags attached in the hierarchy tree:
//   { id, type: 'collision', offsetX, offsetY, w, h }  — custom hit-box
//   { id, type: 'script', behaviorName }                — attaches a
//     BehaviorRegistry-registered update/collide hook to ANY entity,
//     not just ones placed from the Actors palette tray.
// ===========================================================

import { nextEntityId } from '../assets/assetLoader.js';

export class Entity {
  /**
   * @param {object} opts
   * @param {'platform'|'obstacle'|'collectible'|'trigger'|'actor'} opts.category
   * @param {string} opts.tileType  id into AssetLoader defs
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} [opts.w]
   * @param {number} [opts.h]
   * @param {string} [opts.tint]  optional per-instance color override
   * @param {string} [opts.id]
   * @param {object} [opts.meta]
   * @param {object[]} [opts.components]
   */
  constructor({ category, tileType, x, y, w = 32, h = 32, tint = null, id = null, meta = {}, components = [] }) {
    this.id = id || nextEntityId(category[0]);
    this.category = category;
    this.tileType = tileType;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.tint = tint;
    this.meta = meta;             // e.g. { nextScene: 'scene_2' } for triggers, or value/damage overrides
    this.components = components; // child nodes in the hierarchy tree (see Outliner)
    this.collected = false;       // used by collectibles
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
      components: this.components,
    };
  }

  static fromJSON(obj) {
    return new Entity(obj);
  }
}

export function aabbOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * An entity's collision-relevant rect: its own bounds, unless it carries a
 * 'collision' component (added via the Outliner), in which case that
 * component's offset box is authoritative. Used for solid pushback,
 * hazard/pickup/trigger overlap, and the dashed edit-mode overlay alike.
 */
export function effectiveBounds(entity) {
  const comp = entity.components?.find((c) => c.type === 'collision');
  if (!comp) return entity.bounds;
  const x = entity.x + (comp.offsetX || 0);
  const y = entity.y + (comp.offsetY || 0);
  const w = comp.w ?? entity.w;
  const h = comp.h ?? entity.h;
  return { left: x, right: x + w, top: y, bottom: y + h };
}
