// ===========================================================
// IngestionManager — the file-ingestion parser + activation
// router. Owns the in-memory list backing the Asset & Script
// Manager sidebar, routes each dropped file by extension, and
// persists everything through BackendBridge so ingested assets
// survive a reload (replayed in dependency-safe order at boot:
// styles -> overlays -> scripts -> [python stays inert]).
// ===========================================================

import { bus } from '../state/eventBus.js';
import { backendBridge } from './backendBridge.js';
import '../ingestion/behaviorRegistry.js'; // ensures window.PlatformSandbox exists before any script runs

const EXT_TO_CATEGORY = { js: 'scripts', html: 'overlays', htm: 'overlays', css: 'styles', py: 'python' };
const REPLAY_ORDER = ['styles', 'overlays', 'scripts', 'python'];

export class IngestionManager {
  constructor({ sceneManager }) {
    this.sceneManager = sceneManager;
    this.assets = new Map(); // id ("category:filename") -> { id, category, filename, content, enabled }
  }

  async init() {
    const available = await backendBridge.probe();
    if (!available) {
      bus.emit('console:log', { kind: 'info', text: 'Bridge server not detected — ingested files stay in-memory for this session only (run `npm start` to persist + enable Python).' });
      return;
    }
    const listing = await backendBridge.listAssets();
    if (!listing) return;

    for (const category of REPLAY_ORDER) {
      for (const meta of listing[category] || []) {
        const res = await fetch(`/api/assets/${category}/${encodeURIComponent(meta.filename)}`);
        if (!res.ok) continue;
        const { content } = await res.json();
        this._register(category, meta.filename, content, { persist: false, activate: category !== 'python' });
      }
    }
    bus.emit('assets:list-changed', this.list());
  }

  categoryFor(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return EXT_TO_CATEGORY[ext] || null;
  }

  async ingestFile(file) {
    const category = this.categoryFor(file.name);
    if (!category) throw new Error(`Unsupported file type: "${file.name}" (expected .js, .html, .css or .py)`);
    const content = await file.text();
    const asset = this._register(category, file.name, content, { persist: true, activate: category !== 'python' });
    bus.emit('assets:list-changed', this.list());
    bus.emit('console:log', { kind: 'ok', text: `ingested ${category}/${file.name}` });
    return asset;
  }

  _register(category, filename, content, { persist, activate }) {
    const id = `${category}:${filename}`;
    const asset = { id, category, filename, content, enabled: true };
    this.assets.set(id, asset);
    if (activate) this._activate(asset);
    if (persist) backendBridge.saveAsset(category, filename, content).then((r) => {
      if (r && r.ok === false) bus.emit('console:log', { kind: 'err', text: `could not persist ${filename}: ${r.error}` });
    });
    return asset;
  }

  _activate(asset) {
    const { category, filename, content } = asset;
    try {
      if (category === 'scripts') {
        document.getElementById(scriptElId(filename))?.remove();
        const el = document.createElement('script');
        el.id = scriptElId(filename);
        el.dataset.asset = filename;
        el.textContent = content;
        document.body.appendChild(el); // classic script: runs immediately in global scope
      } else if (category === 'styles') {
        let el = document.getElementById(styleElId(filename));
        if (!el) { el = document.createElement('style'); el.id = styleElId(filename); document.head.appendChild(el); }
        el.textContent = content;
        el.disabled = false;
      } else if (category === 'overlays') {
        const root = document.getElementById('overlay-root');
        if (!root) { bus.emit('console:log', { kind: 'err', text: 'No #overlay-root in the page — cannot mount overlay.' }); return; }
        let el = document.getElementById(overlayElId(filename));
        if (!el) { el = document.createElement('div'); el.id = overlayElId(filename); el.className = 'user-overlay'; root.appendChild(el); }
        el.innerHTML = content;
        el.style.display = '';
      }
    } catch (err) {
      bus.emit('plugin:error', { source: filename, error: err });
      bus.emit('console:log', { kind: 'err', text: `error activating ${filename}: ${err.message}` });
    }
  }

  toggle(id) {
    const asset = this.assets.get(id);
    if (!asset) return;
    asset.enabled = !asset.enabled;
    if (asset.category === 'styles') {
      const el = document.getElementById(styleElId(asset.filename));
      if (el) el.disabled = !asset.enabled;
    } else if (asset.category === 'overlays') {
      const el = document.getElementById(overlayElId(asset.filename));
      if (el) el.style.display = asset.enabled ? '' : 'none';
    } else if (asset.category === 'scripts') {
      // Scripts can't be "un-executed" — disabling just prevents replay on next
      // boot and removes the tag; anything it already registered (behaviors,
      // hooks) lingers for this session, same as removing a <script> tag by hand.
      const el = document.getElementById(scriptElId(asset.filename));
      if (!asset.enabled) el?.remove(); else this._activate(asset);
    }
    bus.emit('assets:list-changed', this.list());
  }

  async remove(id) {
    const asset = this.assets.get(id);
    if (!asset) return false;
    document.getElementById(scriptElId(asset.filename))?.remove();
    document.getElementById(styleElId(asset.filename))?.remove();
    document.getElementById(overlayElId(asset.filename))?.remove();
    this.assets.delete(id);
    await backendBridge.deleteAsset(asset.category, asset.filename);
    bus.emit('assets:list-changed', this.list());
    return true;
  }

  updateContent(id, content) {
    const asset = this.assets.get(id);
    if (!asset) return false;
    asset.content = content;
    if (asset.category !== 'python') this._activate(asset);
    backendBridge.saveAsset(asset.category, asset.filename, content);
    bus.emit('assets:list-changed', this.list());
    return true;
  }

  findByFilename(category, filename) {
    return this.assets.get(`${category}:${filename}`) || null;
  }

  list() { return [...this.assets.values()]; }

  /** Run an ingested Python script through the backend bridge. */
  async runPython(filename, { asScene = false } = {}) {
    const asset = this.findByFilename('python', filename);
    if (!asset) throw new Error(`"${filename}" has not been ingested. Drag it onto the drop zone first.`);
    const result = await backendBridge.runPython(filename);

    let sceneId = null;
    if (asScene && result.ok && result.stdout?.trim()) {
      try {
        const parsed = JSON.parse(result.stdout.trim());
        sceneId = this.sceneManager.importScene(parsed);
      } catch (err) {
        result.stderr = `${result.stderr || ''}\n[--scene] stdout was not valid scene JSON: ${err.message}`.trim();
      }
    }
    const finalResult = { ...result, sceneId };
    bus.emit('python:result', { filename, ...finalResult });
    return finalResult;
  }
}

function scriptElId(filename) { return `ingested-script-${cssSafe(filename)}`; }
function styleElId(filename) { return `ingested-style-${cssSafe(filename)}`; }
function overlayElId(filename) { return `ingested-overlay-${cssSafe(filename)}`; }
function cssSafe(s) { return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }
