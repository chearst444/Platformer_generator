// ===========================================================
// Platform — solid, walkable/collidable tile. Thin factory over
// Entity; kept as its own module so the entity subsystem stays
// organized as the engine grows (e.g. moving platforms later).
// ===========================================================

import { Entity } from './entity.js';

export function createPlatform({ tileType = 'grass', x, y, w = 32, h = 32, tint = null, id = null, meta = {}, components = [] }) {
  return new Entity({ category: 'platform', tileType, x, y, w, h, tint, id, meta, components });
}
