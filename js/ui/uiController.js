// ===========================================================
// UIController — bootstraps and wires together every sidebar
// panel + the top bar's Play/Edit and Pause controls. This is
// the only module that needs to know about *all* the UI pieces;
// each panel module stays independently testable/expandable.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { Inspector } from './inspector.js';
import { AssetPalette } from './assetPalette.js';
import { EnvironmentStyler } from './environmentStyler.js';
import { SceneManagerUI } from './sceneManagerUI.js';
import { DevConsole } from './console.js';

export class UIController {
  constructor({ state, sceneManager, renderer, canvas }) {
    this.state = state;
    this.canvas = canvas;

    this.inspector = new Inspector({ state });
    this.assetPalette = new AssetPalette({ state, sceneManager, renderer, canvas });
    this.environmentStyler = new EnvironmentStyler({ state, sceneManager });
    this.sceneManagerUI = new SceneManagerUI({ state, sceneManager });
    this.devConsole = new DevConsole({ state, sceneManager });

    this._bindTopbar();
    bus.on('player:died', () => this.devConsole._log('info', 'Player defeated — respawning at scene spawn.'));
  }

  _bindTopbar() {
    const modeBtn = document.getElementById('toggle-mode-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const banner = document.getElementById('edit-banner');

    modeBtn.addEventListener('click', () => {
      this.state.setEditMode(!this.state.editMode);
    });
    bus.on('mode:changed', ({ editMode }) => {
      modeBtn.classList.toggle('active', editMode);
      modeBtn.textContent = editMode ? '▶ Play Mode' : '✎ Edit Mode';
      banner.classList.toggle('hidden', !editMode);
      this.canvas.style.cursor = editMode ? 'copy' : 'crosshair';
    });

    pauseBtn.addEventListener('click', () => {
      this.state.setPaused(!this.state.paused);
    });
    bus.on('pause:changed', ({ paused }) => {
      pauseBtn.classList.toggle('active', paused);
      pauseBtn.textContent = paused ? '▶ Resume' : '❙❙ Pause';
    });

    this.canvas.addEventListener('click', () => this.canvas.focus());
  }
}
