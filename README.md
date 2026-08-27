# Platformer Sandbox

A local, browser-based 2D game development sandbox and live-preview editor — **platformer and top-down**, built with HTML5, CSS and vanilla JavaScript (ES modules) on the frontend, backed by a small dependency-free Node.js bridge server for multi-language file ingestion (`.js` / `.html` / `.css` / `.py`) and real Python execution.

Play the built-in demo levels, or flip into **Edit Mode** and reshape everything live: drag tiles from the palette, tweak physics sliders, recolor the environment, build a node/component hierarchy, drop in your own scripts and styles, and drive it all from the developer command console — with full undo/redo.

## Running it

```bash
npm start
```

This runs `server/server.js` — a zero-dependency Node bridge that serves the app **and** powers file persistence + Python execution. Open the printed URL (`http://127.0.0.1:8080`).

Without it, the app still runs as a static page (`npm run static`, or any static server) — everything works except: ingested files persisting across a reload, and `/runscript` (Python needs the real bridge). The Universal Drop Zone shows a live "bridge connected / not connected" status so it's always clear which mode you're in.

> Opening `index.html` directly via `file://` also boots (falls back to an embedded copy of the default levels), but ES module `fetch` is blocked from disk in most browsers — use a server for anything beyond a quick look.

## Controls

| Action | Keys |
|---|---|
| Move | `←`/`→` or `A`/`D` |
| Jump (platformer scenes) | `↑`, `W`, or `Space` |
| Move up/down (top-down scenes) | `↑`/`↓` or `W`/`S` |
| Toggle Edit Mode | **✎ Edit Mode** button (top right) |
| Pause simulation | **❙❙ Pause** button |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` (or the topbar buttons) |

## Core UI

- **Canvas Viewport** — gravity/jump **or** 4-directional top-down movement (per-scene), collision, a 2D scrolling camera, parallax, collectibles and hazards. HTML overlays you drop in mount right over it.
- **Universal Drop Zone** — drag local `.js` / `.html` / `.css` / `.py` files here (or click to browse); each is routed by extension — see [File Ingestion](#multi-language-file-ingestion) below.
- **Asset & Script Manager** — a file tree of everything you've ingested: toggle, inline-edit, re-run (Python) or delete each one.
- **Node & Component Hierarchy** — an outliner tree listing the Player and every placed entity, grouped by type. Attach a **Collision Box** (a custom hit-box) or a **Script** component (any registered plugin behavior) to *any* node — not just purpose-built actors.
- **Property Inspector** — a dynamic property grid for whatever's selected (canvas click in Edit Mode, or the tree): the Player shows Max Health / Move Speed; a coin shows Value / Heal Amount / Rotation Speed; an obstacle shows Damage; a trigger shows its linked scene; a component shows its own fields.
- **Scene Manager** — create, rename, delete, switch between and link scenes, and set each scene's **mode** (Platformer or Top-Down) independently.
- **Physics panel** — real-time sliders for gravity, jump velocity, move speed and friction.
- **Asset Palette** — click-to-select or drag-and-drop platforms, obstacles, collectibles, triggers, and any custom **Actor** tiles registered by a dropped script. Upload a custom sprite image. Eraser tool included.
- **Environment Styler** — color pickers + hex inputs for sky, tile tint, and ground color, scoped per-scene.
- **Developer Console / Error Log** — a collapsible bottom drawer. Runs slash commands and doubles as an error console: any exception thrown by a dropped script (sync or async) is caught and printed here — a broken plugin can't silently crash the live preview. Collapsed, it shows an unread-error badge.

Player health, score and inventory persist across scene transitions; only position resets to the new scene's spawn point. All design-time edits (placements, styling, physics, scene structure, components) are undoable and auto-saved (via the bridge server if running, else `localStorage`).

## Multi-language file ingestion

Drop a file on the Universal Drop Zone and it's routed by extension:

| Extension | What happens |
|---|---|
| `.js` | Injected into the page and run immediately. Call `window.PlatformSandbox.registerBehavior(name, spec)` to add a new **Actor** tile to the palette (with `onSpawn`/`onUpdate`/`onPlayerCollide` hooks), or `registerGlobalHook(name, fn)` for a scene-wide custom physics rule that runs every frame. |
| `.html` | Mounted into `#overlay-root`, positioned over the canvas — build a HUD, menu, or inventory screen. Toggle visibility from the Asset Manager or `/overlay show\|hide <file>`. |
| `.css` | Applied instantly as a live `<style>` tag — restyle the editor chrome (or add your own canvas-adjacent UI) with no reload. |
| `.py` | Persisted via the bridge server; run it with `/runscript <file>.py`. Add `--scene` and its stdout (as JSON) is loaded as a brand-new scene — perfect for a procedural level generator. |

Four ready-to-drop examples live in `examples/`:

- `patrol-enemy.js` — registers a "Patrol Enemy" actor that walks back and forth and damages the player on contact.
- `theme-dark.css` — re-skins the editor chrome live.
- `status-overlay.html` — a minimal HUD overlay.
- `generate_level.py` — a procedural platformer generator; try `/runscript generate_level.py --scene`.

A script's registered behavior can also be attached to *any* placed entity (not just actors) as a Script component from the Outliner — e.g. bolt `patrol` onto a platform to make it move.

## Developer console

Type `/help` for the full list. Highlights:

```
/gravity 0.5              /jump 16               /spawn coin
/mode topdown              /load scene_2           /scene new "Boss Arena"
/tint #445566               /save                    /loadscript custom.js
/runscript gen.py --scene    /assets                  /unload custom.js
```

## Architecture

```
index.html            shell + all panel markup
css/styles.css         all styling
server/server.js        Node bridge: static hosting + asset persistence + Python execution
examples/                drag-and-drop demo files (.js/.css/.html/.py)
data/ingested/            where the bridge persists dropped files (gitignored, dirs kept)

js/
  main.js              composition root — wires subsystems, starts the loop

  state/
    eventBus.js          tiny pub/sub used to decouple UI <-> engine
    gameState.js         shared store: physics tunables, player data, mode flags, selection
    historyStack.js       debounced undo/redo over scene + physics + player-config state

  assets/
    assetLoader.js        built-in tile/item defs + custom sprite uploads + dynamic actor defs

  entities/
    entity.js             base entity shape, AABB overlap, component-aware effectiveBounds()
    player.js              player wrapper over GameState.player
    platform.js / collectible.js / obstacle.js / actor.js   entity factories

  engine/
    input.js               keyboard -> {left,right,up,down,jump} state
    physics.js              gravity/topdown movement, collision, pickups, hazards, plugin hooks
    renderer.js              2D camera, parallax, HUD, edit-mode grid/selection/component overlays
    loop.js                  requestAnimationFrame driver + FPS counter

  scene/
    sceneManager.js          load/create/switch/link/persist scenes; entity + component CRUD

  data/
    manifest.json, scene_1..3.json   modular per-level JSON (scene_3 is a top-down demo)
    defaultScenes.js                  embedded fallback copy (for file:// use)

  ingestion/
    backendBridge.js         fetch wrapper for the server's /api/* routes
    behaviorRegistry.js       window.PlatformSandbox plugin API (registerBehavior/registerGlobalHook)
    ingestionManager.js        file-ingestion router + activation + persistence

  ui/
    inspector.js, assetPalette.js, environmentStyler.js, sceneManagerUI.js   original panels
    outliner.js                node & component hierarchy tree
    propertyInspector.js        dynamic per-selection property grid
    dropZone.js                 Universal Drop Zone
    assetScriptManager.js        ingested-file tree (toggle/edit/run/delete)
    console.js, consoleLogBuffer.js   developer console + collapsible error drawer
    uiController.js               bootstraps + wires every panel above, undo/redo shortcuts
```

**Why this shape scales:** every subsystem reads/writes through the single `GameState` instance and announces changes via `EventBus`, so a new panel, tile type, or gameplay system can be added as its own module without touching physics or rendering code. Scenes are plain JSON hydrated into lightweight `Entity` instances (with a `components` array for the Outliner), so level storage, undo snapshots, and the Python-generator import path all reuse the exact same `hydrate`/`serialize` functions.

## Extending it

- **New tile type:** add a definition to `BUILT_IN_DEFS` in `js/assets/assetLoader.js`, or register one at runtime from a dropped script.
- **New scene:** add a `scene_N.json` (copy an existing one), list its id in `js/data/manifest.json` — or use "+ New Scene" / `/scene new` at runtime. Set `"mode": "topdown"` for 4-directional movement.
- **New console command:** add an entry to the `COMMANDS` map in `js/ui/console.js`.
- **New physics behaviour:** `PhysicsEngine.update()` in `js/engine/physics.js`; or ship it as a dropped-in plugin via `registerGlobalHook`/`registerBehavior` — no engine changes needed at all.
- **New API route (server-side logic):** add a handler in `server/server.js`.
