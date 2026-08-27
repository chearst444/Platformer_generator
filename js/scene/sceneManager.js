// ===========================================================
// SceneManager — owns the collection of levels (scenes), scene
// switching, and the create/edit/link/persist workflow for the
// Scene Manager panel + console. Each scene is modular data
// (mirrors js/data/scene_*.json) hydrated into Entity instances
// for the physics/renderer subsystems to consume.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { createPlatform } from '../entities/platform.js';
import { createCollectible } from '../entities/collectible.js';
import { createObstacle, createTrigger } from '../entities/obstacle.js';
import { createActor } from '../entities/actor.js';
import { nextEntityId } from '../assets/assetLoader.js';
import { DEFAULT_MANIFEST, DEFAULT_SCENES, blankScene } from '../data/defaultScenes.js';
import { aabbOverlap, effectiveBounds } from '../entities/entity.js';

const STORAGE_KEY = 'platformer_sandbox_scenes_v1';

const CATEGORY_TO_BUCKET = {
  platform: 'platforms', obstacle: 'obstacles', collectible: 'collectibles', trigger: 'triggers', actor: 'actors',
};
const BUCKET_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_TO_BUCKET).map(([k, v]) => [v, k]));
const HIT_TEST_ORDER = ['collectibles', 'obstacles', 'triggers', 'actors', 'platforms'];

export class SceneManager {
  constructor({ state }) {
    this.state = state;
    this.scenes = new Map();  // id -> hydrated scene object
    this.order = [];          // display order of scene ids
  }

  // ---------------------------------------------------------------
  // Boot: try the real JSON files (works when served over http),
  // fall back to the embedded defaults (works from file://), then
  // apply any localStorage overrides the user made in a prior visit.
  // ---------------------------------------------------------------
  async init() {
    let manifest = DEFAULT_MANIFEST;
    let rawScenes = DEFAULT_SCENES;

    try {
      const res = await fetch('js/data/manifest.json');
      if (res.ok) {
        manifest = await res.json();
        const fetched = {};
        for (const id of manifest.scenes) {
          const r = await fetch(`js/data/${id}.json`);
          if (r.ok) fetched[id] = await r.json();
        }
        if (Object.keys(fetched).length) rawScenes = fetched;
      }
    } catch {
      // file:// or offline — silently use embedded defaults
    }

    this.order = [...manifest.scenes];
    for (const id of this.order) {
      const raw = rawScenes[id] || blankScene(id, id);
      this.scenes.set(id, hydrate(raw));
    }

    this._applyLocalStorageOverrides();

    this.state.currentSceneId = manifest.startScene && this.scenes.has(manifest.startScene)
      ? manifest.startScene
      : this.order[0];
    const active = this.getActiveScene();
    if (active) this.state.resetPlayerToSpawn(active.spawn);

    bus.emit('scenes:list-changed', this.getAllScenes());
    bus.emit('scene:changed', active);
  }

  _applyLocalStorageOverrides() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || !Array.isArray(saved.order)) return;
      this.order = saved.order;
      this.scenes = new Map(saved.order.map((id) => [id, hydrate(saved.scenes[id])]));
    } catch {
      // corrupt/absent storage — ignore, keep defaults
    }
  }

  persist() {
    try {
      const scenes = {};
      for (const [id, scene] of this.scenes) scenes[id] = serialize(scene);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: this.order, scenes }));
    } catch {
      // storage unavailable (private mode / quota) — non-fatal
    }
  }

  // ---------------------------------------------------------------
  getActiveScene() { return this.scenes.get(this.state.currentSceneId) || null; }
  getScene(id) { return this.scenes.get(id) || null; }
  getAllScenes() { return this.order.map((id) => ({ id, name: this.scenes.get(id).name })); }

  switchTo(id) {
    const scene = this.scenes.get(id);
    if (!scene) return false;
    this.state.currentSceneId = id;
    this.state.resetPlayerToSpawn(scene.spawn);
    bus.emit('scene:changed', scene);
    return true;
  }

  createScene(name) {
    const id = nextEntityId('scene');
    const scene = hydrate(blankScene(id, name || `Level ${this.order.length + 1}`));
    this.scenes.set(id, scene);
    this.order.push(id);
    this.persist();
    bus.emit('scenes:list-changed', this.getAllScenes());
    return id;
  }

  deleteScene(id) {
    if (this.order.length <= 1) return false;
    if (!this.scenes.has(id)) return false;
    const wasActive = this.state.currentSceneId === id;
    this.scenes.delete(id);
    this.order = this.order.filter((sid) => sid !== id);
    if (wasActive) this.switchTo(this.order[0]);
    this.persist();
    bus.emit('scenes:list-changed', this.getAllScenes());
    return true;
  }

  renameScene(id, name) {
    const scene = this.scenes.get(id);
    if (!scene) return false;
    scene.name = name;
    this.persist();
    bus.emit('scenes:list-changed', this.getAllScenes());
    return true;
  }

  setMode(id, mode) {
    const scene = this.scenes.get(id);
    if (!scene || (mode !== 'platformer' && mode !== 'topdown')) return false;
    scene.mode = mode;
    this.persist();
    bus.emit('scene:edited', scene);
    return true;
  }

  /**
   * Add an externally-produced scene (e.g. a procedural level generator's
   * .py stdout, run through the console's /runscript --scene) to the
   * scene list. Missing fields fall back to a blank scene's defaults.
   */
  importScene(rawScene) {
    const base = blankScene(nextEntityId('scene'), rawScene?.name || 'Generated Scene');
    const merged = { ...base, ...rawScene, id: rawScene?.id && !this.scenes.has(rawScene.id) ? rawScene.id : base.id };
    const scene = hydrate(merged);
    this.scenes.set(scene.id, scene);
    this.order.push(scene.id);
    this.persist();
    bus.emit('scenes:list-changed', this.getAllScenes());
    return scene.id;
  }

  /** Point (or create) this scene's single exit trigger at another scene. */
  setNextScene(id, nextId) {
    const scene = this.scenes.get(id);
    if (!scene) return false;
    let trigger = scene.triggers[0];
    if (!trigger) {
      trigger = createTrigger({
        x: Math.max(0, scene.width - 60), y: scene.spawn.y - 4, w: 32, h: 96, nextScene: nextId,
      });
      scene.triggers.push(trigger);
    } else {
      trigger.meta.nextScene = nextId || null;
    }
    this.persist();
    bus.emit('scene:edited', scene);
    return true;
  }

  // ---------------------------------------------------------------
  // Editing helpers used by the Asset Palette (drag/drop + click)
  // and the developer console's /spawn command.
  // ---------------------------------------------------------------
  addEntity(category, tileType, x, y) {
    const scene = this.getActiveScene();
    if (!scene) return null;
    let entity;
    if (category === 'platform') entity = createPlatform({ tileType, x, y });
    else if (category === 'obstacle') entity = createObstacle({ tileType, x, y });
    else if (category === 'collectible') entity = createCollectible({ tileType, x, y });
    else if (category === 'trigger') entity = createTrigger({ tileType, x, y, nextScene: this._defaultNextScene(scene.id) });
    else if (category === 'actor') entity = createActor({ tileType, x, y });
    else return null;

    scene[bucketFor(category)].push(entity);
    this.persist();
    bus.emit('scene:edited', scene);
    return entity;
  }

  _defaultNextScene(currentId) {
    return this.order.find((id) => id !== currentId) || null;
  }

  /** Remove whatever entity's bounds contain the given world point (topmost wins). Used by the eraser tool. */
  eraseAt(x, y) {
    const scene = this.getActiveScene();
    if (!scene) return false;
    const point = { left: x, right: x + 1, top: y, bottom: y + 1 };
    for (const category of ['collectibles', 'obstacles', 'triggers', 'actors', 'platforms']) {
      const list = scene[category];
      for (let i = list.length - 1; i >= 0; i--) {
        if (aabbOverlap(point, list[i].bounds)) {
          list.splice(i, 1);
          this.persist();
          bus.emit('scene:edited', scene);
          return true;
        }
      }
    }
    return false;
  }

  exportSceneJSON(id = this.state.currentSceneId) {
    const scene = this.scenes.get(id);
    if (!scene) return null;
    return JSON.stringify(serialize(scene), null, 2);
  }

  // ---------------------------------------------------------------
  // Outliner / Property Inspector support: lookup, removal-by-id, and
  // the hierarchy tree's child "components" (collision box / script).
  // ---------------------------------------------------------------
  findEntity(category, id) {
    const scene = this.getActiveScene();
    if (!scene) return null;
    return (scene[bucketFor(category)] || []).find((e) => e.id === id) || null;
  }

  /** Topmost entity whose (component-aware) bounds contain a world point. Used for click-to-select. */
  findEntityAt(x, y) {
    const scene = this.getActiveScene();
    if (!scene) return null;
    const point = { left: x, right: x + 1, top: y, bottom: y + 1 };
    for (const bucket of HIT_TEST_ORDER) {
      const list = scene[bucket];
      for (let i = list.length - 1; i >= 0; i--) {
        if (aabbOverlap(point, effectiveBounds(list[i]))) return { category: BUCKET_TO_CATEGORY[bucket], entity: list[i] };
      }
    }
    return null;
  }

  removeEntity(category, id) {
    const scene = this.getActiveScene();
    if (!scene) return false;
    const list = scene[bucketFor(category)];
    if (!list) return false;
    const idx = list.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.persist();
    bus.emit('scene:edited', scene);
    return true;
  }

  addComponent(category, entityId, component) {
    const entity = this.findEntity(category, entityId);
    if (!entity) return null;
    const comp = { id: nextEntityId('comp'), ...component };
    entity.components.push(comp);
    this.persist();
    bus.emit('scene:edited', this.getActiveScene());
    return comp;
  }

  removeComponent(category, entityId, componentId) {
    const entity = this.findEntity(category, entityId);
    if (!entity) return false;
    const before = entity.components.length;
    entity.components = entity.components.filter((c) => c.id !== componentId);
    if (entity.components.length === before) return false;
    this.persist();
    bus.emit('scene:edited', this.getActiveScene());
    return true;
  }

  /** Called after any direct field mutation (e.g. from the Property Inspector) to persist + notify. */
  notifyEntityEdited() {
    this.persist();
    bus.emit('scene:edited', this.getActiveScene());
  }
}

function bucketFor(category) {
  return CATEGORY_TO_BUCKET[category];
}

export function hydrate(raw) {
  return {
    id: raw.id,
    name: raw.name,
    mode: raw.mode === 'topdown' ? 'topdown' : 'platformer',
    width: raw.width,
    height: raw.height,
    spawn: { ...raw.spawn },
    background: { color: '#5c94fc', tileTint: null, groundColor: null, ...raw.background },
    platforms: (raw.platforms || []).map((p) => createPlatform(p)),
    obstacles: (raw.obstacles || []).map((o) => createObstacle(o)),
    collectibles: (raw.collectibles || []).map((c) => createCollectible(c)),
    triggers: (raw.triggers || []).map((t) => createTrigger({ ...t, nextScene: t.meta?.nextScene ?? null })),
    actors: (raw.actors || []).map((a) => createActor(a)),
  };
}

export function serialize(scene) {
  return {
    id: scene.id,
    name: scene.name,
    mode: scene.mode,
    width: scene.width,
    height: scene.height,
    spawn: scene.spawn,
    background: scene.background,
    platforms: scene.platforms.map((e) => e.toJSON()),
    obstacles: scene.obstacles.map((e) => e.toJSON()),
    collectibles: scene.collectibles.map((e) => e.toJSON()),
    triggers: scene.triggers.map((e) => e.toJSON()),
    actors: scene.actors.map((e) => e.toJSON()),
  };
}
