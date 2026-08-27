// ===========================================================
// DevConsole — text-command box for live edits without touching
// the sliders/palette, e.g. /jump 16, /gravity 0.5, /spawn coin,
// /load scene_2. Mirrors the same GameState/SceneManager calls
// the UI panels use, so behaviour always stays in sync.
// ===========================================================

import { assetLoader } from '../assets/assetLoader.js';
import { bus } from '../state/eventBus.js';
import { attachLogSink } from './consoleLogBuffer.js';

const PHYSICS_RANGES = {
  gravity: [0.1, 2],
  jumpVelocity: [4, 30],
  moveSpeed: [1, 12],
  friction: [0.5, 0.99],
};

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export class DevConsole {
  constructor({ state, sceneManager, ingestionManager }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.ingestionManager = ingestionManager;
    this.logEl = document.getElementById('console-log');
    this.form = document.getElementById('console-form');
    this.input = document.getElementById('console-input');
    this.panel = document.getElementById('console-panel');
    this.header = document.getElementById('console-header');
    this.titleEl = document.getElementById('console-title');
    this.badge = document.getElementById('console-error-badge');
    this.history = [];
    this.historyIndex = -1;
    this.errorCount = 0;

    this._bind();
    this._bindCollapse();
    attachLogSink((kind, text) => this._log(kind, text)); // replays anything buffered before this panel existed
    this._log('info', 'Developer console ready. Type /help for a list of commands.');
  }

  /** Collapsible bottom drawer: click the header to fold it away without losing history. */
  _bindCollapse() {
    this.header.addEventListener('click', () => {
      const collapsed = this.panel.classList.toggle('collapsed');
      this.titleEl.textContent = collapsed ? '▸ Developer Console' : '▾ Developer Console';
      if (!collapsed) this._clearErrorBadge();
    });
  }

  _bumpErrorBadge() {
    this.errorCount += 1;
    if (!this.panel.classList.contains('collapsed')) return; // visible already — no need to flag it
    this.badge.textContent = String(this.errorCount);
    this.badge.classList.remove('hidden');
  }

  _clearErrorBadge() {
    this.errorCount = 0;
    this.badge.classList.add('hidden');
  }

  _bind() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = this.input.value.trim();
      if (!raw) return;
      this.history.push(raw);
      this.historyIndex = this.history.length;
      this._log('cmd', `> ${raw}`);
      this.input.value = '';
      this._run(raw);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        if (this.historyIndex > 0) this.historyIndex--;
        this.input.value = this.history[this.historyIndex] || '';
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (this.historyIndex < this.history.length) this.historyIndex++;
        this.input.value = this.history[this.historyIndex] || '';
        e.preventDefault();
      }
    });
  }

  _run(raw) {
    const tokens = raw.split(/\s+/);
    let cmd = tokens[0];
    if (!cmd.startsWith('/')) { this._log('err', 'Commands must start with "/". Try /help.'); return; }
    cmd = cmd.slice(1).toLowerCase();
    const args = tokens.slice(1);

    try {
      const handler = COMMANDS[cmd];
      if (!handler) { this._log('err', `Unknown command "/${cmd}". Type /help.`); return; }
      const result = handler(this, args);
      if (result && typeof result.then === 'function') {
        result.catch((err) => this._log('err', err.message || String(err)));
      }
    } catch (err) {
      this._log('err', err.message || String(err));
    }
  }

  _log(kind, text) {
    const line = document.createElement('div');
    line.className = `log-${kind}`;
    line.textContent = text;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    if (kind === 'err') this._bumpErrorBadge();
  }

  _setPhysics(key, valueStr) {
    const [min, max] = PHYSICS_RANGES[key];
    const value = parseFloat(valueStr);
    if (Number.isNaN(value)) throw new Error(`Expected a number, got "${valueStr}".`);
    const clamped = Math.max(min, Math.min(max, value));
    this.state.updatePhysics({ [key]: clamped });
    this._log('ok', `${key} = ${clamped}${clamped !== value ? ` (clamped to [${min}, ${max}])` : ''}`);
  }

  _styleScene(field, hexArg) {
    const scene = this.sceneManager.getActiveScene();
    if (!scene) throw new Error('No active scene.');
    const m = HEX_RE.exec(hexArg || '');
    if (!m) throw new Error(`"${hexArg}" is not a valid hex color, e.g. #5c94fc.`);
    const hex = `#${m[1]}`;
    scene.background[field] = hex;
    this.sceneManager.persist();
    bus.emit('scene:styled', scene);
    this._log('ok', `${field} set to ${hex}`);
  }

  _reactivate(category, filename) {
    if (!filename) throw new Error(`Usage: /load${category === 'scripts' ? 'script' : category === 'styles' ? 'css' : 'overlay'} <filename>`);
    const asset = this.ingestionManager.findByFilename(category, filename);
    if (!asset) throw new Error(`"${filename}" has not been ingested. Drag it onto the drop zone first.`);
    if (!asset.enabled) this.ingestionManager.toggle(asset.id);
    this.ingestionManager.updateContent(asset.id, asset.content); // re-activates with current content
    this._log('ok', `reloaded ${category}/${filename}`);
  }
}

const COMMANDS = {
  help(self) {
    [
      '/jump <n>            set jump velocity',
      '/gravity <n>         set gravity',
      '/speed <n>           set move speed',
      '/friction <n>        set friction (0.5-0.99)',
      '/spawn <type> [x y]  spawn a tile/item (coin, gem, heart, spike, saw, grass, stone, brick, ice, exit)',
      '/load <sceneId>      switch to another scene',
      '/scene new <name>    create + switch to a new scene',
      '/scene list          list all scenes',
      '/scene link <id>     link current scene\'s exit to <id>',
      '/scene del <id>      delete a scene',
      '/bg <hex>            set sky/background color',
      '/tint <hex>          set tile tint color',
      '/ground <hex>        set ground/floor color',
      '/heal <n> / /damage <n> / /score <n>',
      '/reset               respawn player at scene spawn, restore health',
      '/save                download the active scene as JSON',
      '/mode <platformer|topdown>   set current scene\'s movement mode',
      '/loadscript <file.js>        (re)inject an ingested script',
      '/loadcss <file.css>          (re)apply an ingested stylesheet',
      '/loadoverlay <file.html>     (re)mount an ingested HTML overlay',
      '/overlay <show|hide> <file>  toggle an ingested overlay',
      '/runscript <file.py> [--scene]  run an ingested Python script (via the local bridge)',
      '/unload <file>               disable an ingested asset',
      '/assets                      list all ingested files',
      '(Ctrl+Z / Ctrl+Y undo/redo placements, slider tweaks and styling — see the topbar)',
    ].forEach((l) => self._log('info', l));
  },

  jump(self, [v]) { self._setPhysics('jumpVelocity', v); },
  gravity(self, [v]) { self._setPhysics('gravity', v); },
  speed(self, [v]) { self._setPhysics('moveSpeed', v); },
  friction(self, [v]) { self._setPhysics('friction', v); },

  spawn(self, [type, xStr, yStr]) {
    if (!type) throw new Error('Usage: /spawn <type> [x] [y]');
    const def = assetLoader.getDef(type);
    if (!def) throw new Error(`Unknown asset type "${type}". Try coin, gem, heart, spike, saw, grass, stone, brick, ice, exit.`);
    const p = self.state.player;
    const x = xStr !== undefined ? parseFloat(xStr) : p.x + p.width + 48;
    const y = yStr !== undefined ? parseFloat(yStr) : p.y;
    const entity = self.sceneManager.addEntity(def.category, def.id, x, y);
    if (!entity) throw new Error('Could not spawn — no active scene?');
    self._log('ok', `spawned ${def.label} at (${Math.round(x)}, ${Math.round(y)})`);
  },

  load(self, [id]) {
    if (!id) throw new Error('Usage: /load <sceneId>');
    let target = id;
    if (!self.sceneManager.getScene(target)) {
      const match = self.sceneManager.getAllScenes().find((s) => s.name.toLowerCase() === id.toLowerCase());
      if (match) target = match.id;
    }
    if (!self.sceneManager.switchTo(target)) throw new Error(`No scene called "${id}".`);
    self._log('ok', `loaded scene "${target}"`);
  },

  scene(self, [sub, ...rest]) {
    if (sub === 'new') {
      const name = rest.join(' ') || undefined;
      const id = self.sceneManager.createScene(name);
      self.sceneManager.switchTo(id);
      self._log('ok', `created + switched to scene "${id}"`);
    } else if (sub === 'list') {
      self.sceneManager.getAllScenes().forEach((s) => self._log('info', `${s.id}  —  ${s.name}`));
    } else if (sub === 'link') {
      const nextId = rest[0];
      if (!nextId || !self.sceneManager.getScene(nextId)) throw new Error('Usage: /scene link <existingSceneId>');
      self.sceneManager.setNextScene(self.state.currentSceneId, nextId);
      self._log('ok', `current scene now links to "${nextId}"`);
    } else if (sub === 'del') {
      const id = rest[0];
      if (!id) throw new Error('Usage: /scene del <sceneId>');
      if (!self.sceneManager.deleteScene(id)) throw new Error('Could not delete (missing id, or only one scene left).');
      self._log('ok', `deleted scene "${id}"`);
    } else {
      throw new Error('Usage: /scene new|list|link|del ...');
    }
  },

  bg(self, [hex]) { self._styleScene('color', hex); },
  tint(self, [hex]) { self._styleScene('tileTint', hex); },
  ground(self, [hex]) { self._styleScene('groundColor', hex); },

  heal(self, [n]) { self.state.healPlayer(parseFloat(n) || 0); self._log('ok', `healed ${n}`); },
  damage(self, [n]) { self.state.damagePlayer(parseFloat(n) || 0); self._log('ok', `damaged ${n}`); },
  score(self, [n]) { self.state.addScore(parseFloat(n) || 0); self._log('ok', `score +${n}`); },

  reset(self) {
    const scene = self.sceneManager.getActiveScene();
    self.state.player.health = self.state.player.maxHealth;
    self.state.resetPlayerToSpawn(scene?.spawn);
    self._log('ok', 'player reset');
  },

  save(self) {
    const json = self.sceneManager.exportSceneJSON();
    if (!json) throw new Error('No active scene to save.');
    const scene = self.sceneManager.getActiveScene();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scene.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    self._log('ok', `downloaded ${scene.id}.json`);
  },

  mode(self, [m]) {
    const scene = self.sceneManager.getActiveScene();
    if (!scene) throw new Error('No active scene.');
    if (!self.sceneManager.setMode(scene.id, m)) throw new Error('Usage: /mode platformer|topdown');
    self._log('ok', `"${scene.name}" mode set to ${m}`);
  },

  loadscript(self, [filename]) { self._reactivate('scripts', filename); },
  loadcss(self, [filename]) { self._reactivate('styles', filename); },
  loadoverlay(self, [filename]) { self._reactivate('overlays', filename); },

  overlay(self, [sub, filename]) {
    if ((sub !== 'show' && sub !== 'hide') || !filename) throw new Error('Usage: /overlay show|hide <file.html>');
    const asset = self.ingestionManager.findByFilename('overlays', filename);
    if (!asset) throw new Error(`"${filename}" has not been ingested.`);
    if (asset.enabled !== (sub === 'show')) self.ingestionManager.toggle(asset.id);
    self._log('ok', `overlay "${filename}" ${sub === 'show' ? 'shown' : 'hidden'}`);
  },

  async runscript(self, args) {
    const filename = args[0];
    const asScene = args.includes('--scene');
    if (!filename) throw new Error('Usage: /runscript <file.py> [--scene]');
    self._log('info', `running ${filename}…`);
    await self.ingestionManager.runPython(filename, { asScene }); // logs its own result via the python:result event
  },

  unload(self, [filename]) {
    if (!filename) throw new Error('Usage: /unload <filename>');
    const asset = self.ingestionManager.list().find((a) => a.filename === filename);
    if (!asset) throw new Error(`"${filename}" has not been ingested.`);
    if (asset.enabled) self.ingestionManager.toggle(asset.id);
    self._log('ok', `unloaded "${filename}"`);
  },

  assets(self) {
    const list = self.ingestionManager.list();
    if (!list.length) { self._log('info', 'no assets ingested yet — drag files onto the Universal Drop Zone.'); return; }
    list.forEach((a) => self._log('info', `${a.category}/${a.filename}${a.enabled ? '' : ' (disabled)'}`));
  },
};
