// ===========================================================
// AssetPalette — drag-and-drop / click-to-select tray for
// platforms, obstacles, collectibles and triggers, plus the
// custom-sprite uploader. Selecting (or dragging) a tile and
// then clicking/dropping on the canvas places it into the
// active scene through SceneManager. Only active in Edit Mode.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { assetLoader } from '../assets/assetLoader.js';
import { worldToScene, snapToGrid } from '../engine/renderer.js';

const TRAYS = {
  platform: 'palette-platforms',
  obstacle: 'palette-obstacles',
  collectible: 'palette-collectibles',
  trigger: 'palette-triggers',
};

export class AssetPalette {
  constructor({ state, sceneManager, renderer, canvas }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.renderer = renderer;
    this.canvas = canvas;
    this.eraseBtn = document.getElementById('palette-erase-btn');

    this._renderTrays();
    this._bindUpload();
    this._bindCanvasPlacement();
    this._bindEraser();
    bus.on('assets:changed', () => this._renderTrays());
    bus.on('brush:changed', () => this._syncSelection());
  }

  _renderTrays() {
    Object.entries(TRAYS).forEach(([category, elId]) => {
      const tray = document.getElementById(elId);
      if (!tray) return;
      tray.innerHTML = '';
      assetLoader.getByCategory(category).forEach((def) => {
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

  _bindCanvasPlacement() {
    this.canvas.addEventListener('dragover', (e) => e.preventDefault());
    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const { category, tileType } = JSON.parse(raw);
      this.state.setActiveBrush({ category, tileType });
      this._placeAt(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('click', (e) => {
      if (!this.state.editMode || !this.state.activeBrush) return;
      if (this.state.activeBrush.category === 'eraser') {
        const { x, y } = worldToScene(this.canvas, this.renderer.camera, e.clientX, e.clientY);
        this.sceneManager.eraseAt(x, y);
      } else {
        this._placeAt(e.clientX, e.clientY);
      }
    });
  }

  _placeAt(clientX, clientY) {
    const brush = this.state.activeBrush;
    if (!brush || brush.category === 'eraser') return;
    const { x, y } = worldToScene(this.canvas, this.renderer.camera, clientX, clientY);
    this.sceneManager.addEntity(brush.category, brush.tileType, snapToGrid(x), snapToGrid(y));
  }
}
