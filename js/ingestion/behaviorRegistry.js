// ===========================================================
// BehaviorRegistry — the plugin contract exposed to dropped .js
// files. A dropped script runs directly in the page and calls
// window.PlatformSandbox.registerBehavior(...) to add a brand
// new placeable "actor" tile (with its own per-frame update
// logic) to the Asset Palette, or registerGlobalHook(...) to add
// a scene-wide custom physics rule (wind, custom gravity zones,
// timers, ...) that runs every frame regardless of any one
// entity. This is intentionally simple/global (not a module
// sandbox) — it's the same trust model as pasting a <script> tag
// into a page you control, which is exactly what dropping a .js
// file here does.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { assetLoader } from '../assets/assetLoader.js';

class BehaviorRegistry {
  constructor() {
    this.behaviors = new Map();   // name -> { label, color, icon, onSpawn, onUpdate, onPlayerCollide }
    this.globalHooks = new Map(); // name -> fn(ctx)
  }

  registerBehavior(name, spec) {
    if (!name || typeof name !== 'string') throw new Error('registerBehavior(name, spec): name is required');
    const normalized = typeof spec === 'function' ? { onUpdate: spec } : (spec || {});
    const entry = {
      label: normalized.label || name,
      color: normalized.color || '#9b59b6',
      icon: normalized.icon || '★',
      onSpawn: normalized.onSpawn || null,
      onUpdate: normalized.onUpdate || null,
      onPlayerCollide: normalized.onPlayerCollide || null,
    };
    this.behaviors.set(name, entry);
    assetLoader.registerDynamicDef({ id: name, category: 'actor', label: entry.label, color: entry.color, icon: entry.icon });
    bus.emit('behavior:registered', { name, ...entry });
    return entry;
  }

  registerGlobalHook(name, fn) {
    if (typeof fn !== 'function') throw new Error('registerGlobalHook(name, fn): fn must be a function');
    this.globalHooks.set(name || `hook_${this.globalHooks.size + 1}`, fn);
    bus.emit('hook:registered', { name });
  }

  unregisterGlobalHook(name) {
    this.globalHooks.delete(name);
  }

  getBehavior(name) { return this.behaviors.get(name) || null; }

  /** Names of every registered behavior — used by the Outliner's "attach script" picker. */
  listNames() { return [...this.behaviors.keys()]; }

  runGlobalHooks(ctx) {
    this.globalHooks.forEach((fn, name) => {
      try { fn(ctx); } catch (err) { bus.emit('plugin:error', { source: `hook:${name}`, error: err }); }
    });
  }
}

export const behaviorRegistry = new BehaviorRegistry();

// Public API surface for dropped scripts.
window.PlatformSandbox = window.PlatformSandbox || {};
Object.assign(window.PlatformSandbox, {
  registerBehavior: (name, spec) => behaviorRegistry.registerBehavior(name, spec),
  registerGlobalHook: (name, fn) => behaviorRegistry.registerGlobalHook(name, fn),
  log: (msg) => bus.emit('console:log', { kind: 'info', text: String(msg) }),
});
