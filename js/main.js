// ===========================================================
// main — application entry point. Wires the modular subsystems
// together and starts the always-on game loop. Nothing here
// contains game logic itself; it only composes the other
// modules, which is what keeps the engine easy to extend later
// (new subsystems just get instantiated + wired in here).
// ===========================================================

import { state } from './state/gameState.js';
import { bus } from './state/eventBus.js';
import { assetLoader } from './assets/assetLoader.js';
import { input } from './engine/input.js';
import { PhysicsEngine } from './engine/physics.js';
import { Renderer } from './engine/renderer.js';
import { GameLoop } from './engine/loop.js';
import { SceneManager } from './scene/sceneManager.js';
import { UIController } from './ui/uiController.js';

async function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const sceneManager = new SceneManager({ state });
  const renderer = new Renderer({ ctx, canvas, state, assetLoader, sceneManager });
  const physics = new PhysicsEngine({ state, input, assetLoader, sceneManager, bus });

  await sceneManager.init(); // loads scene JSON (or embedded fallback) + applies any saved edits

  new UIController({ state, sceneManager, renderer, canvas });

  const loop = new GameLoop({ physics, renderer });
  loop.start();

  // Expose a light debug handle in the console for power users / future tooling.
  window.__sandbox = { state, bus, assetLoader, sceneManager, renderer, physics, loop };
}

bootstrap().catch((err) => {
  console.error('Failed to start Platformer Sandbox:', err);
  document.body.innerHTML = `<pre style="color:#ff6b6b;padding:24px;font-family:monospace;">Failed to start: ${err.message}</pre>`;
});
