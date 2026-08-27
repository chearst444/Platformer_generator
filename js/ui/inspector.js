// ===========================================================
// Inspector — physics sliders (gravity, jump velocity, move
// speed, friction). Two-way bound to GameState.physics: dragging
// a slider updates state immediately (live preview), and changes
// made elsewhere (console commands) update the sliders in turn.
// ===========================================================

import { bus } from '../state/eventBus.js';

const FIELDS = ['gravity', 'jumpVelocity', 'moveSpeed', 'friction'];

export class Inspector {
  constructor({ state }) {
    this.state = state;
    this.sliders = {};
    this.badges = {};

    FIELDS.forEach((key) => {
      this.sliders[key] = document.getElementById(`slider-${key}`);
      this.badges[key] = document.getElementById(`val-${key}`);
    });

    this._syncFromState();
    this._bindInputs();
    bus.on('physics:changed', () => this._syncFromState());
  }

  _bindInputs() {
    FIELDS.forEach((key) => {
      const slider = this.sliders[key];
      if (!slider) return;
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        this.badges[key].textContent = formatVal(value);
        this.state.updatePhysics({ [key]: value }, { silent: true }); // silent: avoid re-syncing the slider we're actively dragging
      });
    });
  }

  _syncFromState() {
    FIELDS.forEach((key) => {
      const slider = this.sliders[key];
      if (!slider) return;
      const value = this.state.physics[key];
      if (document.activeElement !== slider) slider.value = value;
      this.badges[key].textContent = formatVal(value);
    });
  }
}

function formatVal(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
