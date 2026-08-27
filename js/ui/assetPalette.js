// ===========================================================
// AssetPalette — the sidebar tray of placeable platforms,
// obstacles, collectibles, triggers and plugin-registered
// actors, plus the custom-sprite uploader and eraser toggle.
// Selecting (click) or dragging a tile out of here arms the
// "brush" that CanvasEditor reads when the canvas is clicked or
// dropped onto — this module only owns the tray UI itself.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { assetLoader } from '../assets/assetLoader.js';

const TRAYS = {
  platform: 'palette-platforms',
  obstacle: 'palette-obstacles',
  collectible: 'palette-collectibles',
  trigger: 'palette-triggers',
  actor: 'palette-actors',
};

export class AssetPalette {
  constructor({ state }) {
    this.state = state;
    this.eraseBtn = document.getElementById('palette-erase-btn');

    this._renderTrays();
    this._bindUpload();
    this._bindEraser();
    bus.on('assets:changed', () => this._renderTrays());
    bus.on('brush:changed', () => this._syncSelection());
  }

  _renderTrays() {
    Object.entries(TRAYS).forEach(([category, elId]) => {
      const tray = document.getElementById(elId);
      if (!tray) return;
      tray.innerHTML = '';
      const defs = assetLoader.getByCategory(category);
      if (category === 'actor' && defs.length === 0) {
        tray.innerHTML = '<span class="tray-empty">Drop a .js file that calls registerBehavior() to add one.</span>';
        return;
      }
      defs.forEach((def) => {
        tray.appendChild(this._buildItem(def));
      });
    });
  }

  _buildItem(def) {
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.title = def.label;
    el.draggable = true;
    if (def.image) {
      el.style.backgroundImage = `url(${def.dataUrl})`;
    } else {
      el.style.background = def.color;
      el.textContent = def.icon || '';
    }
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = def.label;
    el.appendChild(tag);

    el.addEventListener('click', () => {
      this.eraseBtn.classList.remove('active');
      this.state.setActiveBrush({ category: def.category, tileType: def.id });
    });
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ category: def.category, tileType: def.id }));
    });
    return el;
  }

  _syncSelection() {
    document.querySelectorAll('.palette-item').forEach((el) => el.classList.remove('selected'));
    const brush = this.state.activeBrush;
    if (!brush) return;
    const tray = document.getElementById(TRAYS[brush.category]);
    if (!tray) return;
    [...tray.children].forEach((el) => {
      if (el.title === assetLoader.getDef(brush.tileType)?.label) el.classList.add('selected');
    });
  }

  _bindUpload() {
    const input = document.getElementById('sprite-upload');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const def = await assetLoader.loadCustomSprite(file, 'platform');
        this.state.setActiveBrush({ category: def.category, tileType: def.id });
      } catch (err) {
        alert(err.message);
      } finally {
        input.value = '';
      }
    });
  }

  _bindEraser() {
    this.eraseBtn.addEventListener('click', () => {
      const active = this.eraseBtn.classList.toggle('active');
      this.state.setActiveBrush(active ? { category: 'eraser' } : null);
      document.querySelectorAll('.palette-item').forEach((el) => el.classList.remove('selected'));
    });
  }
}
