// ===========================================================
// Collectible — coins/gems/hearts the player can pick up.
// Score/heal/inventory effects come from the AssetLoader
// definition by default, but `meta.value` / `meta.heal` /
// `meta.rotationSpeed` (set via the Property Inspector) override
// them per-instance — that's the "click a coin, tweak its value"
// workflow.
// ===========================================================

import { Entity } from './entity.js';

export function createCollectible({ tileType = 'coin', x, y, w = 24, h = 24, tint = null, id = null, meta = {}, components = [] }) {
  return new Entity({ category: 'collectible', tileType, x, y, w, h, tint, id, meta, components });
}
