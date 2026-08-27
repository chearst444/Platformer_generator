// ===========================================================
// Outliner — the sidebar's node & component hierarchy tree.
// Lists the Player plus every placed entity in the active scene,
// grouped by category; each entity can carry child "components"
// (a Collision Box or a Script, see entities/entity.js /
// BehaviorRegistry) shown nested underneath it. Selecting any row
// (or clicking its shape on the canvas) drives the Property
// Inspector.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { behaviorRegistry } from '../ingestion/behaviorRegistry.js';

const GROUPS = [
  { category: 'platform', label: 'Platforms' },
  { category: 'obstacle', label: 'Obstacles' },
  { category: 'collectible', label: 'Collectibles' },
  { category: 'trigger', label: 'Triggers' },
  { category: 'actor', label: 'Actors' },
];

export class Outliner {
  constructor({ state, sceneManager }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.root = document.getElementById('outliner-tree');

    this._render();
    bus.on('scene:edited', () => this._render());
    bus.on('scene:changed', () => this._render());
    bus.on('selection:changed', () => this._syncSelectionClasses());
  }

  _render() {
    const scene = this.sceneManager.getActiveScene();
    this.root.innerHTML = '';
    if (!scene) return;

    this.root.appendChild(this._playerRow());

    GROUPS.forEach(({ category, label }) => {
      const bucket = scene[bucketFor(category)] || [];
      if (!bucket.length) return;
      const header = document.createElement('div');
      header.className = 'outliner-group-label';
      header.textContent = `${label} (${bucket.length})`;
      this.root.appendChild(header);
      bucket.forEach((entity) => this.root.appendChild(this._entityNode(category, entity)));
    });

    this._syncSelectionClasses();
  }

  _playerRow() {
    const row = this._row({
      icon: '\u{1F9CD}', label: 'Player', depth: 0,
      onClick: () => this.state.select({ category: 'player', id: 'player' }),
    });
    row.dataset.selKey = 'player:player';
    return row;
  }

  _entityNode(category, entity) {
    const wrap = document.createElement('div');
    const row = this._row({
      icon: iconFor(category), label: `${entity.tileType}`, sub: entity.id.split('_').pop(), depth: 0,
      onClick: () => this.state.select({ category, id: entity.id }),
      onAddCollision: () => {
        const comp = this.sceneManager.addComponent(category, entity.id, { type: 'collision', offsetX: 0, offsetY: 0, w: entity.w, h: entity.h });
        if (comp) this.state.select({ category: 'component', parentCategory: category, parentId: entity.id, componentId: comp.id });
      },
      onAddScript: () => {
        const comp = this.sceneManager.addComponent(category, entity.id, { type: 'script', behaviorName: behaviorRegistry.listNames()[0] || '' });
        if (comp) this.state.select({ category: 'component', parentCategory: category, parentId: entity.id, componentId: comp.id });
      },
      onDelete: () => {
        if (confirm(`Delete this ${category}?`)) this.sceneManager.removeEntity(category, entity.id);
      },
    });
    row.dataset.selKey = `${category}:${entity.id}`;
    wrap.appendChild(row);

    (entity.components || []).forEach((comp) => {
      const compRow = this._row({
        icon: comp.type === 'collision' ? '\u{25AD}' : '\u{0192}',
        label: comp.type === 'collision' ? 'Collision Box' : `Script: ${comp.behaviorName || '(none)'}`,
        depth: 1,
        onClick: () => this.state.select({ category: 'component', parentCategory: category, parentId: entity.id, componentId: comp.id }),
        onDelete: () => this.sceneManager.removeComponent(category, entity.id, comp.id),
      });
      compRow.dataset.selKey = `component:${comp.id}`;
      wrap.appendChild(compRow);
    });

    return wrap;
  }

  _row({ icon, label, sub, depth, onClick, onAddCollision, onAddScript, onDelete }) {
    const row = document.createElement('div');
    row.className = 'outliner-row';
    row.style.paddingLeft = `${8 + depth * 16}px`;

    const iconEl = document.createElement('span');
    iconEl.className = 'outliner-icon';
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'outliner-label';
    labelEl.textContent = sub ? `${label} ${sub}` : label;

    row.append(iconEl, labelEl);
    row.addEventListener('click', onClick);

    if (onAddCollision) row.appendChild(smallBtn('▭', 'Add Collision Box component', onAddCollision));
    if (onAddScript) row.appendChild(smallBtn('ƒ', 'Add Script component', onAddScript));
    if (onDelete) row.appendChild(smallBtn('✕', 'Delete', onDelete, true));

    return row;
  }

  _syncSelectionClasses() {
    const sel = this.state.selection;
    const key = !sel ? null
      : sel.category === 'component' ? `component:${sel.componentId}`
      : `${sel.category}:${sel.id}`;
    this.root.querySelectorAll('.outliner-row').forEach((row) => {
      row.classList.toggle('selected', !!key && row.dataset.selKey === key);
    });
  }
}

function smallBtn(icon, title, onClick, danger) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = icon;
  btn.title = title;
  if (danger) btn.classList.add('danger');
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

function bucketFor(category) {
  return { platform: 'platforms', obstacle: 'obstacles', collectible: 'collectibles', trigger: 'triggers', actor: 'actors' }[category];
}

function iconFor(category) {
  return { platform: '▤', obstacle: '☠', collectible: '✦', trigger: '→', actor: '★' }[category] || '□';
}
