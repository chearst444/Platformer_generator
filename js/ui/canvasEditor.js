// ===========================================================
// CanvasEditor — Direct Canvas Manipulation. Owns every pointer
// interaction the viewport supports in Edit Mode:
//   - a tile dragged out of the Asset Palette and dropped here
//   - clicking with a palette brush armed places that tile
//     (snapped to the grid); the eraser brush removes on click
//   - with NO brush armed, clicking selects whatever's under the
//     cursor (same target the Outliner drives) and, if you keep
//     the mouse down, drags it FREELY (no snapping) to a new
//     position — X/Y update live every frame since the renderer
//     always reads the entity's current position.
// A drag is committed to history/persistence once, on release —
// not on every mousemove tick — same debounced-on-settle pattern
// used elsewhere (sliders, color pickers).
// ===========================================================

import { worldToScene, snapToGrid } from '../engine/renderer.js';
import { bus } from '../state/eventBus.js';

export class CanvasEditor {
  constructor({ state, sceneManager, renderer, canvas }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.renderer = renderer;
    this.canvas = canvas;
    this.drag = null; // { kind:'entity'|'player', category, id, offsetX, offsetY, moved }

    this._bindDropFromPalette();
    this._bindPlaceAndErase();
    this._bindSelectAndDrag();

    bus.on('mode:changed', () => this._updateCursor());
    bus.on('brush:changed', () => this._updateCursor());
    this._updateCursor();
  }

  _worldPoint(clientX, clientY) {
    return worldToScene(this.canvas, this.renderer.camera, clientX, clientY);
  }

  // ---------------------------------------------------------------
  // Drop a tile dragged out of the Asset Palette.
  // ---------------------------------------------------------------
  _bindDropFromPalette() {
    this.canvas.addEventListener('dragover', (e) => e.preventDefault());
    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const { category, tileType } = JSON.parse(raw);
      this.state.setActiveBrush({ category, tileType });
      this._placeAt(e.clientX, e.clientY);
    });
  }

  // ---------------------------------------------------------------
  // Placement Tool + Eraser: only when a brush is armed.
  // ---------------------------------------------------------------
  _bindPlaceAndErase() {
    this.canvas.addEventListener('click', (e) => {
      if (!this.state.editMode || !this.state.activeBrush) return;
      if (this.state.activeBrush.category === 'eraser') {
        const { x, y } = this._worldPoint(e.clientX, e.clientY);
        this.sceneManager.eraseAt(x, y);
      } else {
        this._placeAt(e.clientX, e.clientY);
      }
    });
  }

  _placeAt(clientX, clientY) {
    const brush = this.state.activeBrush;
    if (!brush || brush.category === 'eraser') return;
    const { x, y } = this._worldPoint(clientX, clientY);
    this.sceneManager.addEntity(brush.category, brush.tileType, snapToGrid(x), snapToGrid(y));
  }

  // ---------------------------------------------------------------
  // Select & Drag: only when NO brush is armed (the implicit
  // "select" tool). mousedown picks a target and starts tracking;
  // mousemove (bound to window, so a fast drag past the canvas
  // edge doesn't drop it) repositions it live; mouseup commits.
  // ---------------------------------------------------------------
  _bindSelectAndDrag() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.state.editMode || this.state.activeBrush) return;
      const { x, y } = this._worldPoint(e.clientX, e.clientY);
      const p = this.state.player;

      if (x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height) {
        this.state.select({ category: 'player', id: 'player' });
        this.drag = { kind: 'player', offsetX: x - p.x, offsetY: y - p.y, moved: false };
        this._updateCursor();
        return;
      }

      const hit = this.sceneManager.findEntityAt(x, y);
      if (hit) {
        this.state.select({ category: hit.category, id: hit.entity.id });
        this.drag = {
          kind: 'entity', category: hit.category, id: hit.entity.id,
          offsetX: x - hit.entity.x, offsetY: y - hit.entity.y, moved: false,
        };
      } else {
        this.state.select(null);
        this.drag = null;
      }
      this._updateCursor();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.drag) return;
      const { x, y } = this._worldPoint(e.clientX, e.clientY);

      if (this.drag.kind === 'player') {
        this.state.player.x = x - this.drag.offsetX;
        this.state.player.y = y - this.drag.offsetY;
      } else {
        const entity = this.sceneManager.findEntity(this.drag.category, this.drag.id);
        if (!entity) { this.drag = null; return; }
        entity.x = x - this.drag.offsetX;
        entity.y = y - this.drag.offsetY;
      }
      this.drag.moved = true;
    });

    window.addEventListener('mouseup', () => {
      if (!this.drag) return;
      if (this.drag.kind === 'entity' && this.drag.moved) this.sceneManager.notifyEntityEdited();
      this.drag = null;
      this._updateCursor();
    });
  }

  _updateCursor() {
    if (!this.state.editMode) { this.canvas.style.cursor = 'crosshair'; return; }
    if (this.drag) { this.canvas.style.cursor = 'grabbing'; return; }
    const brush = this.state.activeBrush;
    if (!brush) this.canvas.style.cursor = 'grab';
    else if (brush.category === 'eraser') this.canvas.style.cursor = 'crosshair';
    else this.canvas.style.cursor = 'copy';
  }
}
