# Platformer Sandbox

A local, browser-based 2D platformer development sandbox and live-preview editor — built with plain HTML5, CSS and vanilla JavaScript (ES modules), no build step, no framework, no dependencies.

Play the built-in demo levels with arrow keys / WASD + jump, or flip into **Edit Mode** and reshape the level live: drag tiles from the palette, tweak physics sliders, recolor the environment, or drive it all from the developer command console.

## Running it

Because the app is split into ES modules, it needs to be served over `http://`, not opened directly as a `file://` URL (browsers block ES module `fetch`/imports from disk).

Any static file server works:

```bash
# Node (no install required)
npx serve .

# or Python
python3 -m http.server 8080
```

Then open the printed URL (e.g. `http://localhost:8080`) in your browser.

> If you do open `index.html` directly from disk, the app still boots — it falls back to an embedded copy of the default levels (`js/data/defaultScenes.js`) instead of fetching the JSON files — but scene **file** editing/exporting is still just local JSON either way.

## Controls

| Action | Keys |
|---|---|
| Move | `←`/`→` or `A`/`D` |
| Jump | `↑`, `W`, or `Space` |
| Toggle Edit Mode | **✎ Edit Mode** button (top right) |
| Pause simulation | **❙❙ Pause** button |

## Core UI

- **Canvas Viewport** — the live game: gravity, collision, a scrolling camera, collectibles and hazards.
- **Physics panel** — real-time sliders for gravity, jump velocity, move speed and friction. Changes apply to the running game loop instantly, no reload.
- **Asset Palette** — click-to-select or drag-and-drop platforms, obstacles, collectibles and scene-exit triggers onto the canvas while in Edit Mode. Upload your own sprite (any image file) to add a custom tile. An eraser tool removes placed tiles.
- **Environment Styler** — color pickers + hex inputs for the sky/background, tile tint, and ground color, scoped per-scene.
- **Scene Manager** — create, rename, delete, switch between and link scenes (level exits teleport the player to the linked scene on contact).
- **Developer Console** — type `/help` for the full command list, e.g.:

  ```
  /gravity 0.5
  /jump 16
  /spawn coin
  /load scene_2
  /scene new "Boss Arena"
  /tint #445566
  /save
  ```

Player health, score and inventory persist across scene transitions; only position resets to the new scene's spawn point. Level edits (tiles, styling, scene list) are auto-saved to `localStorage` so a reload doesn't lose your work; `/save` (or editing a scene) can also export a scene as a standalone `.json` file.

## Architecture

The codebase is deliberately split into small, single-responsibility modules so the sandbox can grow into a full game creator without a rewrite:

```
index.html            shell + all panel markup
css/styles.css         all styling

js/
  main.js              composition root — wires subsystems, starts the loop

  state/
    eventBus.js         tiny pub/sub used to decouple UI <-> engine
    gameState.js        single shared store: physics tunables, player data, mode flags

  assets/
    assetLoader.js       built-in tile/item definitions + custom sprite uploads

  entities/
    entity.js            base entity shape + AABB overlap helper
    player.js            player wrapper over GameState.player
    platform.js           platform factory
    collectible.js         collectible factory
    obstacle.js            obstacle + scene-exit trigger factories

  engine/
    input.js              keyboard -> {left,right,jump} state
    physics.js             gravity / movement / collision / pickups / hazards
    renderer.js             canvas drawing, camera, parallax, HUD, edit-mode grid
    loop.js                 requestAnimationFrame driver + FPS counter

  scene/
    sceneManager.js         load/create/switch/link/persist scenes

  data/
    manifest.json            ordered list of scene ids + start scene
    scene_1.json, scene_2.json  modular per-level JSON layouts
    defaultScenes.js          embedded fallback copy of the above (for file:// use)

  ui/
    inspector.js             physics sliders panel
    assetPalette.js           tile tray, drag/drop + click placement, uploader, eraser
    environmentStyler.js      color pickers / hex fields
    sceneManagerUI.js         scene list, create/rename/delete/link
    console.js                developer command console + command registry
    uiController.js           bootstraps and wires all of the above panels
```

**Why this shape scales:** every subsystem reads/writes through the single `GameState` instance and announces changes via `EventBus`, so a new panel, a new tile type, or a whole new gameplay system (e.g. enemies, checkpoints, dialogue) can be added as its own module without touching physics or rendering code. Scenes are plain JSON data hydrated into lightweight `Entity` instances, so a future level-editor-to-file pipeline, multiplayer sync, or server-side level storage can consume the exact same format.

## Extending it

- **New tile type:** add a definition to `BUILT_IN_DEFS` in `js/assets/assetLoader.js` (or let a user upload one at runtime) — it immediately appears in the palette and is placeable/collidable.
- **New scene:** add a `scene_N.json` file (copy an existing one as a template), list its id in `js/data/manifest.json`, and it shows up in the Scene Manager — or just use the "+ New Scene" button / `/scene new` at runtime.
- **New console command:** add an entry to the `COMMANDS` map in `js/ui/console.js`.
- **New physics behaviour:** `PhysicsEngine.update()` in `js/engine/physics.js` is the single place gameplay rules live.
