// ===========================================================
// Obstacle — hazard tile (spikes, saws, ...) that damages the
// player on contact and knocks them back to the scene spawn.
// ===========================================================

import { Entity } from './entity.js';

export function createObstacle({ tileType = 'spike', x, y, w = 32, h = 32, tint = null, id = null }) {
  return new Entity({ category: 'obstacle', tileType, x, y, w, h, tint, id });
}

/** Exit/trigger tiles link one scene to another when the player walks into them. */
export function createTrigger({ tileType = 'exit', x, y, w = 32, h = 48, tint = null, id = null, nextScene = null }) {
  return new Entity({ category: 'trigger', tileType, x, y, w, h, tint, id, meta: { nextScene } });
}
