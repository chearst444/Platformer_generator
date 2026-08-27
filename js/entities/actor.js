// ===========================================================
// Actor — an entity whose per-frame behaviour is supplied by a
// dropped .js plugin (see BehaviorRegistry) rather than built-in
// physics rules. `tileType` doubles as the registered behaviour
// name so PhysicsEngine can look up its onUpdate/onPlayerCollide
// hooks each frame. Additional behaviours can also be attached to
// ANY entity (not just actors) as a 'script' component — see the
// Outliner.
// ===========================================================

import { Entity } from './entity.js';

export function createActor({ tileType, x, y, w = 32, h = 32, tint = null, id = null, meta = {}, components = [] }) {
  return new Entity({ category: 'actor', tileType, x, y, w, h, tint, id, meta, components });
}
