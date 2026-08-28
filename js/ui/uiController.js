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
import { DropZone } from './dropZone.js';
import { AssetScriptManager } from './assetScriptManager.js';
import { Outliner } from './outliner.js';
import { PropertyInspector } from './propertyInspector.js';
import { CanvasEditor } from './canvasEditor.js';
import { GameExporter } from '../export/gameExporter.js';

export class UIController {
  constructor({ state, sceneManager, renderer, canvas, ingestionManager, historyStack, assetLoader }) {
    this.state = state;
    this.canvas = canvas;
    this.historyStack = historyStack;

    this.inspector = new Inspector({ state });
    this.assetPalette = new AssetPalette({ state });
    this.canvasEditor = new CanvasEditor({ state, sceneManager, renderer, canvas });
    this.environmentStyler = new EnvironmentStyler({ state, sceneManager });
    this.sceneManagerUI = new SceneManagerUI({ state, sceneManager });
    this.outliner = new Outliner({ state, sceneManager });
    this.propertyInspector = new PropertyInspector({ state, sceneManager });
    this.gameExporter = new GameExporter({ state, sceneManager, assetLoader, ingestionManager, canvas });
    this.devConsole = new DevConsole({ state, sceneManager, ingestionManager, gameExporter: this.gameExporter });
    this.dropZone = new DropZone({ ingestionManager });
    this.assetScriptManager = new AssetScriptManager({ ingestionManager });

    this._bindTopbar();
    this._bindHistory();
    this._bindExport();
    bus.on('player:died', () => this.devConsole._log('info', 'Player defeated — respawning at scene spawn.'));
  }

  _bindExport() {
    const exportBtn = document.getElementById('export-btn');
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      const original = exportBtn.textContent;
      exportBtn.textContent = '⏳ Exporting…';
      try {
        const { filename, sceneCount } = await this.gameExporter.export();
        bus.emit('console:log', { kind: 'ok', text: `exported "${filename}" (${sceneCount} scene${sceneCount === 1 ? '' : 's'}) — open it directly in any browser, no server needed.` });
      } catch (err) {
        bus.emit('console:log', { kind: 'err', text: `export failed: ${err.message}` });
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = original;
      }
    });
  }

  _bindHistory() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    undoBtn.addEventListener('click', () => this.historyStack.undo());
    redoBtn.addEventListener('click', () => this.historyStack.redo());

    bus.on('history:changed', ({ canUndo, canRedo }) => {
      undoBtn.disabled = !canUndo;
      redoBtn.disabled = !canRedo;
    });

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // don't hijack native text-field undo
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.historyStack.undo(); }
      else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); this.historyStack.redo(); }
    });
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
      // cursor itself is owned by CanvasEditor (it varies by armed tool, not just mode)
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
