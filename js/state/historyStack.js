// ===========================================================
// HistoryStack — undo/redo for design-time edits (tile
// placement/erasure, component add/remove, physics slider
// tweaks, environment styling, scene structure). Deliberately
// does NOT track live gameplay state (health/score/inventory
// ticking during play) — only edits a person makes on purpose.
//
// Implementation: rather than threading snapshot calls through
// every mutation site, this listens to the handful of bus events
// every such mutation already emits (scene:edited, scene:styled,
// scenes:list-changed, physics:touched) and captures a
// "before this burst of changes" snapshot, debounced so a slider
// drag or a rapid string of edits collapses into one undo step.
// ===========================================================

import { bus } from './eventBus.js';
import { hydrate, serialize } from '../scene/sceneManager.js';

const TRACKED_EVENTS = ['scene:edited', 'scene:styled', 'scenes:list-changed', 'physics:touched', 'physics:changed', 'design:edited'];
const SETTLE_MS = 400;
const LIMIT = 60;

export class HistoryStack {
  constructor({ state, sceneManager }) {
    this.state = state;
    this.sceneManager = sceneManager;
    this.undoStack = [];
    this.redoStack = [];
    this._restoring = false;
    this._pendingBefore = null;
    this._timer = null;
  }

  /** Call once, after SceneManager has finished its initial scene load. */
  arm() {
    this._baseline = this._capture();
    TRACKED_EVENTS.forEach((evt) => bus.on(evt, () => this._onChange()));
  }

  _onChange() {
    if (this._restoring) return;
    if (!this._pendingBefore) this._pendingBefore = this._baseline;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._commit(), SETTLE_MS);
  }

  _commit() {
    this.undoStack.push(this._pendingBefore);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this._pendingBefore = null;
    this._baseline = this._capture();
    this._emitStatus();
  }

  /** Force any still-debouncing change into the stack right now (used before undo/redo). */
  _flush() {
    if (this._pendingBefore) { clearTimeout(this._timer); this._commit(); }
  }

  undo() {
    this._flush();
    if (!this.undoStack.length) return false;
    const current = this._capture();
    const prev = this.undoStack.pop();
    this.redoStack.push(current);
    this._restore(prev);
    this._emitStatus();
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    const current = this._capture();
    const next = this.redoStack.pop();
    this.undoStack.push(current);
    this._restore(next);
    this._emitStatus();
    return true;
  }

  status() { return { canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 }; }
  _emitStatus() { bus.emit('history:changed', this.status()); }

  _capture() {
    return {
      physics: { ...this.state.physics },
      playerConfig: { maxHealth: this.state.player.maxHealth },
      currentSceneId: this.state.currentSceneId,
      order: [...this.sceneManager.order],
      scenes: Object.fromEntries([...this.sceneManager.scenes].map(([id, scene]) => [id, serialize(scene)])),
    };
  }

  _restore(snap) {
    this._restoring = true;
    Object.assign(this.state.physics, snap.physics);
    this.state.player.maxHealth = snap.playerConfig.maxHealth;
    this.sceneManager.order = [...snap.order];
    this.sceneManager.scenes = new Map(snap.order.map((id) => [id, hydrate(snap.scenes[id])]));
    this.state.currentSceneId = this.sceneManager.scenes.has(snap.currentSceneId) ? snap.currentSceneId : snap.order[0];
    this.state.clearSelection();
    this.sceneManager.persist();

    const active = this.sceneManager.getActiveScene();
    bus.emit('physics:changed', this.state.physics);
    bus.emit('scenes:list-changed', this.sceneManager.getAllScenes());
    bus.emit('scene:edited', active);
    bus.emit('scene:styled', active); // refreshes the Environment Styler's color pickers too
    this._baseline = this._capture();
    this._restoring = false;
  }
}
