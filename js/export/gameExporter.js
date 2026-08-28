// ===========================================================
// GameExporter — packages the current project into a single,
// standalone, offline-playable HTML file: the "Export Game
// Build" action. It does NOT reuse the editor's ES modules for
// the exported game itself — export/player-runtime.js is a
// separate, deliberately minimal, non-module port of just the
// physics/renderer/scene logic a running game needs, with zero
// editor UI (no sidebar, outliner, inspector, sliders, console).
//
// Assembly is plain string templating: fetch the static shell
// (player-template.html) and runtime (player-runtime.js), splice
// in this project's data + any enabled ingested scripts/styles/
// overlays, and hand the result back as a downloadable Blob.
// ===========================================================

import { serialize } from '../scene/sceneManager.js';

const INJECTION_MARKER = '/* ---- INJECTION_POINT: GameExporter splices enabled ingested <script>s here ---- */';

export class GameExporter {
  constructor({ state, sceneManager, assetLoader, ingestionManager, canvas }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.assetLoader = assetLoader;
    this.ingestionManager = ingestionManager;
    this.canvas = canvas;
  }

  async export() {
    const [template, runtime] = await Promise.all([
      fetchText('export/player-template.html'),
      fetchText('export/player-runtime.js'),
    ]);

    const splitAt = runtime.indexOf(INJECTION_MARKER);
    if (splitAt === -1) throw new Error('player-runtime.js is missing its injection marker — cannot build an export.');
    const runtimePart1 = runtime.slice(0, splitAt);
    const runtimePart2 = runtime.slice(splitAt + INJECTION_MARKER.length);

    const gameData = this._gatherGameData();
    const ingested = this._gatherIngestedContent();
    const activeScene = this.sceneManager.getActiveScene();
    const title = activeScene?.name || 'My Game';

    let html = template;
    html = html.replace('__GAME_TITLE__', escapeHtml(title));
    html = html.replace('__CANVAS_W__', String(this.canvas.width));
    html = html.replace('__CANVAS_H__', String(this.canvas.height));
    html = html.replace('/*__INGESTED_STYLES__*/', ingested.stylesCss);
    html = html.replace('<!--__INGESTED_OVERLAYS__-->', ingested.overlaysHtml);
    html = html.replace('__GAME_DATA_JSON__', jsonForScriptTag(gameData));
    html = html.replace('<!--__RUNTIME_PART_1__-->', `<script>${scriptSafe(runtimePart1)}</script>`);
    html = html.replace('<!--__INGESTED_SCRIPTS__-->', ingested.scriptsHtml);
    html = html.replace('<!--__RUNTIME_PART_2__-->', `<script>${scriptSafe(runtimePart2)}</script>`);

    const filename = `${slugify(title) || 'game-export'}.html`;
    downloadHtml(html, filename);
    return { filename, sceneCount: Object.keys(gameData.scenes).length };
  }

  _gatherGameData() {
    const scenes = {};
    for (const [id, scene] of this.sceneManager.scenes) {
      const clone = JSON.parse(JSON.stringify(serialize(scene))); // pure copy — never mutate the live project while exporting
      forEachEntity(clone, (e) => { if (e.meta) delete e.meta.__spawned; }); // internal runtime flag, not real content
      scenes[id] = clone;
    }

    const customDefs = this.assetLoader.getAllDefs()
      .filter((d) => !d.builtin)
      .map((d) => ({
        id: d.id, category: d.category, label: d.label, color: d.color, icon: d.icon,
        solid: d.solid, dataUrl: d.dataUrl || null,
      }));

    return {
      scenes,
      customDefs,
      physics: { ...this.state.physics },
      playerConfig: { maxHealth: this.state.player.maxHealth },
      startSceneId: this.state.currentSceneId,
    };
  }

  _gatherIngestedContent() {
    const enabled = this.ingestionManager.list().filter((a) => a.enabled);

    const scriptsHtml = enabled.filter((a) => a.category === 'scripts')
      .map((a) => `<script>${scriptSafe(a.content)}</script>`)
      .join('\n');

    const stylesCss = enabled.filter((a) => a.category === 'styles')
      .map((a) => styleSafe(a.content))
      .join('\n');

    const overlaysHtml = enabled.filter((a) => a.category === 'overlays')
      .map((a) => `<div class="user-overlay" data-asset="${escapeHtml(a.filename)}">${a.content}</div>`)
      .join('\n');

    // .py assets are intentionally excluded — they're an authoring-time tool
    // (procedural generation via the local bridge), not something a browser
    // can execute, and not part of the running game itself.
    return { scriptsHtml, stylesCss, overlaysHtml };
  }
}

function forEachEntity(scene, fn) {
  ['platforms', 'obstacles', 'collectibles', 'triggers', 'actors'].forEach((bucket) => (scene[bucket] || []).forEach(fn));
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}). Export must be run over http(s), not file://.`);
  return res.text();
}

// Embedding JSON inside a <script> tag: neutralize every '<' so a value that
// happens to contain "</script>" (e.g. a pasted scene name) can never
// prematurely close the tag. Safe everywhere because '<' is never a
// structural JSON character — it can only occur inside string content.
function jsonForScriptTag(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Same idea for raw script/style text we splice in verbatim (ingested files,
// the runtime itself): a literal "</script"/"</style" in someone's source
// would otherwise end the tag early.
function scriptSafe(code) { return code.replace(/<\/script/gi, '<\\/script'); }
function styleSafe(css) { return css.replace(/<\/style/gi, '<\\/style'); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
