// ===========================================================
// DropZone — the sidebar's "Universal Drop Zone". Accepts
// dragged (or browsed) local files and hands each one to
// IngestionManager, which routes it by extension. Also surfaces
// whether the local bridge server (server/server.js) is running,
// since that gates persistence + Python execution.
// ===========================================================

import { bus } from '../state/eventBus.js';
import { backendBridge } from '../ingestion/backendBridge.js';

export class DropZone {
  constructor({ ingestionManager }) {
    this.ingestionManager = ingestionManager;
    this.zone = document.getElementById('drop-zone');
    this.input = document.getElementById('drop-zone-input');
    this.statusEl = document.getElementById('bridge-status');

    this._bind();
    this._updateBridgeStatus();
  }

  _bind() {
    ['dragenter', 'dragover'].forEach((evt) => this.zone.addEventListener(evt, (e) => {
      e.preventDefault();
      this.zone.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach((evt) => this.zone.addEventListener(evt, (e) => {
      e.preventDefault();
      this.zone.classList.remove('drag-over');
    }));
    this.zone.addEventListener('drop', (e) => this._handleFiles(e.dataTransfer.files));
    this.input.addEventListener('change', () => {
      this._handleFiles(this.input.files);
      this.input.value = '';
    });
  }

  async _handleFiles(fileList) {
    for (const file of fileList) {
      try {
        await this.ingestionManager.ingestFile(file);
      } catch (err) {
        bus.emit('console:log', { kind: 'err', text: err.message });
      }
    }
    this._updateBridgeStatus();
  }

  async _updateBridgeStatus() {
    const ok = await backendBridge.probe();
    this.statusEl.textContent = ok
      ? '● local bridge connected — persistence + Python enabled'
      : '○ no bridge server — run "npm start" to persist assets & run Python';
    this.statusEl.classList.toggle('online', ok);
    this.statusEl.classList.toggle('offline', !ok);
  }
}
