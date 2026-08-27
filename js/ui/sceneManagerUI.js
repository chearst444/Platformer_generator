// ===========================================================
// SceneManagerUI — the sidebar panel for creating, switching
// between and linking scenes together (level -> level flow).
// ===========================================================

import { bus } from '../state/eventBus.js';

export class SceneManagerUI {
  constructor({ state, sceneManager }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.listEl = document.getElementById('scene-list');
    this.newBtn = document.getElementById('scene-new-btn');
    this.nextSelect = document.getElementById('scene-next-select');
    this.modeSelect = document.getElementById('scene-mode-select');

    this._render();
    this._bind();
    bus.on('scenes:list-changed', () => this._render());
    bus.on('scene:changed', () => this._render());
    bus.on('scene:edited', () => this._render());
  }

  _bind() {
    this.newBtn.addEventListener('click', () => {
      const name = prompt('Name for the new scene:', `Level ${this.sceneManager.order.length + 1}`);
      if (name === null) return;
      const id = this.sceneManager.createScene(name.trim() || undefined);
      this.sceneManager.switchTo(id);
    });

    this.nextSelect.addEventListener('change', () => {
      const activeId = this.state.currentSceneId;
      this.sceneManager.setNextScene(activeId, this.nextSelect.value || null);
    });

    this.modeSelect.addEventListener('change', () => {
      this.sceneManager.setMode(this.state.currentSceneId, this.modeSelect.value);
    });
  }

  _render() {
    const scenes = this.sceneManager.getAllScenes();
    const activeId = this.state.currentSceneId;

    this.listEl.innerHTML = '';
    scenes.forEach(({ id, name }) => {
      const row = document.createElement('div');
      row.className = 'scene-row' + (id === activeId ? ' active' : '');

      const label = document.createElement('span');
      label.className = 'scene-name';
      label.textContent = name;
      label.title = 'Click to switch • double-click to rename';
      label.addEventListener('click', () => this.sceneManager.switchTo(id));
      label.addEventListener('dblclick', () => {
        const next = prompt('Rename scene:', name);
        if (next && next.trim()) this.sceneManager.renameScene(id, next.trim());
      });

      const del = document.createElement('button');
      del.className = 'scene-del';
      del.textContent = '✕';
      del.title = 'Delete scene';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (scenes.length <= 1) { alert('At least one scene must exist.'); return; }
        if (confirm(`Delete "${name}"?`)) this.sceneManager.deleteScene(id);
      });

      row.appendChild(label);
      row.appendChild(del);
      this.listEl.appendChild(row);
    });

    // next-scene link dropdown for the active scene
    const activeScene = this.sceneManager.getActiveScene();
    this.nextSelect.innerHTML = '<option value="">(none)</option>';
    scenes.forEach(({ id, name }) => {
      if (id === activeId) return;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      this.nextSelect.appendChild(opt);
    });
    const currentLink = activeScene?.triggers?.[0]?.meta?.nextScene || '';
    this.nextSelect.value = currentLink;

    if (activeScene) this.modeSelect.value = activeScene.mode;
  }
}
