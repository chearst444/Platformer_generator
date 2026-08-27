// ===========================================================
// Input — tracks keyboard state for player movement. Kept
// separate from PhysicsEngine so alternate input sources
// (on-screen buttons, gamepad, replay files) can drive the same
// {left,right,jump} shape later without touching physics code.
// ===========================================================

const KEY_MAP = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump',
};

export class Input {
  constructor(target = window) {
    this.state = { left: false, right: false, jump: false };
    this._enabled = true;
    this._onKeyDown = (e) => this._handle(e, true);
    this._onKeyUp = (e) => this._handle(e, false);
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
  }

  _handle(e, isDown) {
    const action = KEY_MAP[e.key];
    if (!action) return;
    if (!this._enabled) return;
    // avoid scrolling the page on space/arrows while the game has focus
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
    this.state[action] = isDown;
  }

  setEnabled(on) {
    this._enabled = on;
    if (!on) { this.state.left = this.state.right = this.state.jump = false; }
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

export const input = new Input();
