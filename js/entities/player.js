// ===========================================================
// Player — the controllable character. Holds transient physics
// state (position/velocity) while persistent progress (health,
// score, inventory) lives on GameState.player and survives
// scene transitions.
// ===========================================================

export class Player {
  constructor(state) {
    this.state = state; // shared GameState instance
  }

  get p() { return this.state.player; }

  get bounds() {
    const p = this.p;
    return { left: p.x, right: p.x + p.width, top: p.y, bottom: p.y + p.height };
  }

  spawnAt(spawn) {
    this.state.resetPlayerToSpawn(spawn);
  }
}
