// ===========================================================
// PropertyInspector — a dynamic property grid that changes to
// match whatever is selected (via the Outliner or a canvas
// click in Edit Mode): the Player, a placed entity, or a
// component attached to one. Edits write straight back onto the
// live scene/player objects, so they apply immediately — the
// same live-preview contract as every other panel.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { assetLoader } from '../assets/assetLoader.js';
import { behaviorRegistry } from '../ingestion/behaviorRegistry.js';

const HEX_RE = /^#?([0-9a-f]{6})$/i;
const SWAPPABLE_GROUPS = [
  { category: 'platform', label: 'Platforms' },
  { category: 'obstacle', label: 'Obstacles' },
  { category: 'collectible', label: 'Collectibles' },
  { category: 'trigger', label: 'Triggers' },
  { category: 'actor', label: 'Actors' },
];

export class PropertyInspector {
  constructor({ state, sceneManager }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.root = document.getElementById('property-inspector');

    this._render();
    bus.on('selection:changed', () => this._render());
    bus.on('scene:edited', () => this._render()); // e.g. an entity got deleted elsewhere while selected
    bus.on('player:tick', () => this._refreshLiveReadouts());
  }

  _render() {
    this.root.innerHTML = '';
    const sel = this.state.selection;
    if (!sel) {
      this.root.innerHTML = '<p class="prop-empty">Nothing selected. Click an object on the canvas (Edit Mode) or in the Outliner tree above.</p>';
      return;
    }

    if (sel.category === 'player') return this._renderPlayer();
    if (sel.category === 'component') return this._renderComponent(sel);
    return this._renderEntity(sel);
  }

  _renderPlayer() {
    const p = this.state.player;
    this._heading('Player');
    this._numberField('Max Health', p.maxHealth, (v) => {
      p.maxHealth = v;
      bus.emit('design:edited');
      bus.emit('player:changed', p);
    });
    this._numberField('Move Speed', this.state.physics.moveSpeed, (v) => this.state.updatePhysics({ moveSpeed: v }));
    this._readonly('Health (live)', 'ro-health', Math.round(p.health));
    this._readonly('Score (live)', 'ro-score', p.score);
    this._readonly('Position (live)', 'ro-pos', `${Math.round(p.x)}, ${Math.round(p.y)}`);
  }

  _renderEntity(sel) {
    const entity = this.sceneManager.findEntity(sel.category, sel.id);
    if (!entity) { this.root.innerHTML = '<p class="prop-empty">That object no longer exists.</p>'; return; }
    const def = assetLoader.getDef(entity.tileType);

    this._heading(`${capitalize(sel.category)} — ${def?.label || entity.tileType}`);
    this._typeSwapField(sel, entity);
    this._numberField('X', Math.round(entity.x), (v) => this._commitEntity(entity, { x: v }));
    this._numberField('Y', Math.round(entity.y), (v) => this._commitEntity(entity, { y: v }));
    this._numberField('Width', entity.w, (v) => this._commitEntity(entity, { w: Math.max(4, v) }));
    this._numberField('Height', entity.h, (v) => this._commitEntity(entity, { h: Math.max(4, v) }));
    this._colorField('Tint', entity.tint || def?.color || '#888888', (v) => this._commitEntity(entity, { tint: v }));

    if (sel.category === 'collectible') {
      this._numberField('Value', entity.meta.value ?? def?.value ?? 0, (v) => this._commitMeta(entity, { value: v }));
      this._numberField('Heal Amount', entity.meta.heal ?? def?.heal ?? 0, (v) => this._commitMeta(entity, { heal: v }));
      this._numberField('Rotation Speed', entity.meta.rotationSpeed ?? 1, (v) => this._commitMeta(entity, { rotationSpeed: v }), { step: 0.1 });
    } else if (sel.category === 'obstacle') {
      this._numberField('Damage', entity.meta.damage ?? def?.damage ?? 0, (v) => this._commitMeta(entity, { damage: v }));
    } else if (sel.category === 'trigger') {
      this._selectField('Next Scene', entity.meta.nextScene || '', this.sceneManager.getAllScenes().map((s) => [s.id, s.name]), (v) => this._commitMeta(entity, { nextScene: v || null }));
    } else if (sel.category === 'actor') {
      this._readonly('Behavior', 'ro-behavior', entity.tileType);
    }
  }

  _renderComponent(sel) {
    const parent = this.sceneManager.findEntity(sel.parentCategory, sel.parentId);
    const comp = parent?.components.find((c) => c.id === sel.componentId);
    if (!comp) { this.root.innerHTML = '<p class="prop-empty">That component no longer exists.</p>'; return; }

    if (comp.type === 'collision') {
      this._heading('Component — Collision Box');
      this._numberField('Offset X', comp.offsetX || 0, (v) => this._commitComponent(comp, { offsetX: v }));
      this._numberField('Offset Y', comp.offsetY || 0, (v) => this._commitComponent(comp, { offsetY: v }));
      this._numberField('Width', comp.w ?? parent.w, (v) => this._commitComponent(comp, { w: Math.max(2, v) }));
      this._numberField('Height', comp.h ?? parent.h, (v) => this._commitComponent(comp, { h: Math.max(2, v) }));
    } else if (comp.type === 'script') {
      this._heading('Component — Script');
      const names = behaviorRegistry.listNames();
      this._selectField('Behavior', comp.behaviorName || '', names.map((n) => [n, n]), (v) => this._commitComponent(comp, { behaviorName: v }), {
        emptyLabel: names.length ? 'choose one…' : 'no scripts registered — drop a .js plugin first',
      });
    }
  }

  /** Object Swapping: hot-swap what this placed entity IS, across any category, without delete+recreate. */
  _typeSwapField(sel, entity) {
    const row = document.createElement('div');
    row.className = 'prop-field';
    const lab = document.createElement('label');
    lab.textContent = 'Object Type';
    const select = document.createElement('select');

    SWAPPABLE_GROUPS.forEach(({ category, label }) => {
      const defs = assetLoader.getByCategory(category);
      if (!defs.length) return;
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      defs.forEach((def) => {
        const opt = document.createElement('option');
        opt.value = `${category}|${def.id}`;
        opt.textContent = def.label;
        if (category === sel.category && def.id === entity.tileType) opt.selected = true;
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    });

    select.addEventListener('change', () => {
      const [newCategory, newTileType] = select.value.split('|');
      const swapped = this.sceneManager.swapEntityType(sel.category, entity.id, newCategory, newTileType);
      if (swapped) this.state.select({ category: newCategory, id: swapped.id });
    });
    row.append(lab, select);
    this.root.appendChild(row);
  }

  _commitEntity(entity, patch) {
    Object.assign(entity, patch);
    this.sceneManager.notifyEntityEdited();
  }

  _commitMeta(entity, patch) {
    Object.assign(entity.meta, patch);
    this.sceneManager.notifyEntityEdited();
  }

  _commitComponent(comp, patch) {
    Object.assign(comp, patch);
    this.sceneManager.notifyEntityEdited();
  }

  _refreshLiveReadouts() {
    if (this.state.selection?.category !== 'player') return;
    const p = this.state.player;
    const health = this.root.querySelector('#ro-health');
    const score = this.root.querySelector('#ro-score');
    const pos = this.root.querySelector('#ro-pos');
    if (health) health.textContent = Math.round(p.health);
    if (score) score.textContent = p.score;
    if (pos) pos.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
  }

  // ---- field builders --------------------------------------------------
  _heading(text) {
    const h = document.createElement('div');
    h.className = 'prop-heading';
    h.textContent = text;
    this.root.appendChild(h);
  }

  _numberField(label, value, onCommit, { step = 1 } = {}) {
    const row = document.createElement('div');
    row.className = 'prop-field';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = step;
    input.value = round(value, step);
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!Number.isNaN(v)) onCommit(v);
    });
    row.append(lab, input);
    this.root.appendChild(row);
  }

  _colorField(label, value, onCommit) {
    const row = document.createElement('div');
    row.className = 'prop-field';
    const lab = document.createElement('label');
    lab.textContent = label;

    const wrap = document.createElement('span');
    wrap.className = 'prop-color-wrap';
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = value;
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'hex-input';
    hex.maxLength = 7;
    hex.value = value;

    swatch.addEventListener('input', () => { hex.value = swatch.value; onCommit(swatch.value); });
    hex.addEventListener('change', () => {
      const m = HEX_RE.exec(hex.value.trim());
      if (m) { const v = `#${m[1]}`; swatch.value = v; hex.value = v; onCommit(v); }
      else hex.value = swatch.value; // reject invalid input, restore last good value
    });

    wrap.append(swatch, hex);
    row.append(lab, wrap);
    this.root.appendChild(row);
  }

  _selectField(label, value, options, onCommit, { emptyLabel = '(none)' } = {}) {
    const row = document.createElement('div');
    row.className = 'prop-field';
    const lab = document.createElement('label');
    lab.textContent = label;
    const select = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.appendChild(empty);
    options.forEach(([val, text]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      select.appendChild(opt);
    });
    select.value = value;
    select.addEventListener('change', () => onCommit(select.value));
    row.append(lab, select);
    this.root.appendChild(row);
  }

  _readonly(label, id, value) {
    const row = document.createElement('div');
    row.className = 'prop-field';
    const lab = document.createElement('label');
    lab.textContent = label;
    const span = document.createElement('span');
    span.id = id;
    span.className = 'prop-readonly';
    span.textContent = value;
    row.append(lab, span);
    this.root.appendChild(row);
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function round(v, step) { return step < 1 ? Math.round(v * 100) / 100 : Math.round(v); }
