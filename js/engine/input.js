// ===========================================================
// Input — tracks keyboard state for player movement. Kept
// separate from PhysicsEngine so alternate input sources
// (on-screen buttons, gamepad, replay files) can drive the same
// {left,right,jump} shape later without touching physics code.
// ===========================================================

// Each key can map to multiple simultaneous actions: ArrowUp/W means "jump"
// in platformer scenes and "up" in top-down scenes — PhysicsEngine picks
// whichever it needs based on the active scene's mode.
const KEY_MAP = {
  ArrowLeft: ['left'], a: ['left'], A: ['left'],
  ArrowRight: ['right'], d: ['right'], D: ['right'],
  ArrowUp: ['jump', 'up'], w: ['jump', 'up'], W: ['jump', 'up'],
  ArrowDown: ['down'], s: ['down'], S: ['down'],
  ' ': ['jump'],
};

const PREVENT_DEFAULT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);

export class Input {
  constructor(target = window) {
    this.state = { left: false, right: false, up: false, down: false, jump: false };
    this._enabled = true;
    this._onKeyDown = (e) => this._handle(e, true);
    this._onKeyUp = (e) => this._handle(e, false);
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
  }

  _handle(e, isDown) {
    const actions = KEY_MAP[e.key];
    if (!actions) return;
    if (!this._enabled) return;
    if (PREVENT_DEFAULT_KEYS.has(e.key)) e.preventDefault();
    actions.forEach((action) => { this.state[action] = isDown; });
  }

  setEnabled(on) {
    this._enabled = on;
    if (!on) { this.state.left = this.state.right = this.state.up = this.state.down = this.state.jump = false; }
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

export const input = new Input();
