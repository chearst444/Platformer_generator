// ===========================================================
// AssetLoader — owns the catalogue of placeable tile/item
// "definitions" (built-in + user-uploaded custom sprites) and
// the actual loaded Image objects used by the renderer.
// ===========================================================

import { bus } from '../state/eventBus.js';

// Built-in definitions need no image — the renderer draws them as
// tinted vector shapes — but they can be overridden with a custom
// sprite uploaded through the palette's "Upload custom sprite" slot.
const BUILT_IN_DEFS = [
  { id: 'grass', category: 'platform', label: 'Grass', color: '#4caf50', icon: '▒', solid: true },
  { id: 'stone', category: 'platform', label: 'Stone', color: '#8d8d8d', icon: '■', solid: true },
  { id: 'brick', category: 'platform', label: 'Brick', color: '#b5651d', icon: '▦', solid: true },
  { id: 'ice', category: 'platform', label: 'Ice', color: '#a9e6ff', icon: '❄', solid: true },

  { id: 'spike', category: 'obstacle', label: 'Spike', color: '#e53935', icon: '▲', solid: false, damage: 25 },
  { id: 'saw', category: 'obstacle', label: 'Saw', color: '#cfd8dc', icon: '⚙', solid: false, damage: 40 },

  { id: 'coin', category: 'collectible', label: 'Coin', color: '#ffd54f', icon: '●', value: 10 },
  { id: 'gem', category: 'collectible', label: 'Gem', color: '#40c4ff', icon: '◆', value: 25 },
  { id: 'heart', category: 'collectible', label: 'Heart', color: '#ff6b81', icon: '♥', value: 0, heal: 20 },

  { id: 'exit', category: 'trigger', label: 'Exit', color: '#b39ddb', icon: '→', solid: false },
];

let idCounter = 1;
export function nextEntityId(prefix = 'e') {
  return `${prefix}_${Date.now().toString(36)}_${idCounter++}`;
}

export class AssetLoader {
  constructor() {
    /** @type {Map<string, object>} tileType id -> definition (may include custom img) */
    this.defs = new Map();
    // `builtin: true` lets GameExporter tell these apart from custom/dynamic
    // defs — the exported player runtime already has BUILT_IN_DEFS baked in,
    // so only non-builtin defs need to travel with the export.
    BUILT_IN_DEFS.forEach((d) => this.defs.set(d.id, { ...d, builtin: true }));
  }

  getDef(tileTypeId) {
    return this.defs.get(tileTypeId) || null;
  }

  getByCategory(category) {
    return [...this.defs.values()].filter((d) => d.category === category);
  }

  getAllDefs() {
    return [...this.defs.values()];
  }

  /**
   * Load a user-selected file (from the Asset Palette's upload input) and
   * register it as a new placeable definition in the given category.
   * Returns a Promise resolving to the new definition.
   */
  loadCustomSprite(file, category = 'platform') {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('Please choose an image file.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const id = nextEntityId('custom');
          const def = {
            id,
            category,
            label: file.name.replace(/\.[^.]+$/, '').slice(0, 16) || 'Custom',
            color: '#999999',
            icon: '',
            solid: category === 'platform',
            image: img,
            dataUrl: reader.result,
          };
          this.defs.set(id, def);
          bus.emit('assets:changed', this.getAllDefs());
          resolve(def);
        };
        img.onerror = () => reject(new Error('Could not decode image.'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Register a definition with no image (used by BehaviorRegistry when a
   * dropped .js plugin calls registerBehavior — it becomes a placeable
   * "actor" tile drawn as a tinted icon box, same as the built-ins).
   */
  registerDynamicDef({ id, category, label, color = '#9b59b6', icon = '★' }) {
    const def = { id, category, label, color, icon, solid: false, dynamic: true };
    this.defs.set(id, def);
    bus.emit('assets:changed', this.getAllDefs());
    return def;
  }

  /** Rehydrate a custom def previously serialized into a scene JSON (dataUrl only). */
  registerFromDataUrl(id, category, label, dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const def = { id, category, label, color: '#999999', icon: '', solid: category === 'platform', image: img, dataUrl };
        this.defs.set(id, def);
        resolve(def);
      };
      img.src = dataUrl;
    });
  }
}

export const assetLoader = new AssetLoader();
