// ===========================================================
// Collectible — coins/gems/hearts the player can pick up.
// Score/heal/inventory effects are resolved by PhysicsEngine
// using the AssetLoader definition (value/heal) at pickup time.
// ===========================================================

import { Entity } from './entity.js';

export function createCollectible({ tileType = 'coin', x, y, w = 24, h = 24, tint = null, id = null }) {
  return new Entity({ category: 'collectible', tileType, x, y, w, h, tint, id });
}
