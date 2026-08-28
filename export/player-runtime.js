/* ===========================================================
 * Platformer Sandbox — standalone player runtime.
 *
 * This is NOT the editor engine — it's a deliberately separate,
 * self-contained, non-module port of just what a running game
 * needs (physics, renderer, scene switching), so an exported
 * build has zero dependency on the editor's ES modules, EventBus,
 * SceneManager CRUD, undo history, or any UI. GameExporter
 * (js/export/gameExporter.js) fetches this file, splits it at the
 * INJECTION_POINT marker below, and splices in whatever the
 * project ingested as enabled .js plugins between the two halves
 * — so a plugin's top-level `registerBehavior()` call runs after
 * `window.PlatformSandbox` exists (part 1) but before the game
 * loop starts reading scenes/actors (part 2).
 *
 * Reads its data from `window.__GAME_DATA__`, which GameExporter
 * embeds as a plain object literal directly above this script.
 * =========================================================== */

/* ---- PART 1: plugin registry (must exist before ingested scripts run) ---- */
(function () {
  'use strict';

  var DATA = window.__GAME_DATA__;

  // Mirrors js/assets/assetLoader.js BUILT_IN_DEFS — the ~10 tile/item types
  // every project can use without shipping any extra data for them.
  var BUILT_IN_DEFS = [
    { id: 'grass', category: 'platform', label: 'Grass', color: '#4caf50', icon: '▒', solid: true },
    { id: 'stone', category: 'platform', label: 'Stone', color: '#8d8d8d', icon: '■', solid: true },
    { id: 'brick', category: 'platform', label: 'Brick', color: '#b5651d', icon: '▦', solid: true },
    { id: 'ice', category: 'platform', label: 'Ice', color: '#a9e6ff', icon: '❄', solid: true },
    { id: 'spike', category: 'obstacle', label: 'Spike', color: '#e53935', icon: '▲', solid: false, damage: 25 },
    { id: 'saw', category: 'obstacle', label: 'Saw', color: '#cfd8dc', icon: '⚙', solid: false, damage: 40 },
    { id: 'coin', category: 'collectible', label: 'Coin', color: '#ffd54f', icon: '●', value: 10 },
    { id: 'gem', category: 'collectible', label: 'Gem', color: '#40c4ff', icon: '◆', value: 25 },
    { id: 'heart', category: 'collectible', label: 'Heart', color: '#ff6b81', icon: '♥', value: 0, heal: 20 },
    { id: 'exit', category: 'trigger', label: 'Exit', color: '#b39ddb', icon: '→', solid: false },
  ];

  var defs = {};
  BUILT_IN_DEFS.forEach(function (d) { defs[d.id] = d; });
  (DATA.customDefs || []).forEach(function (d) {
    if (d.dataUrl) { var img = new Image(); img.src = d.dataUrl; d.image = img; }
    defs[d.id] = d;
  });

  var behaviors = {};
  var globalHooks = {};

  // Public plugin API — same contract as the editor's BehaviorRegistry, so a
  // script ingested during editing works unmodified in the exported build.
  window.PlatformSandbox = {
    registerBehavior: function (name, spec) {
      var entry = typeof spec === 'function' ? { onUpdate: spec } : (spec || {});
      behaviors[name] = {
        label: entry.label || name,
        color: entry.color || '#9b59b6',
        icon: entry.icon || '★',
        onSpawn: entry.onSpawn || null,
        onUpdate: entry.onUpdate || null,
        onPlayerCollide: entry.onPlayerCollide || null,
      };
      if (!defs[name]) {
        defs[name] = { id: name, category: 'actor', label: behaviors[name].label, color: behaviors[name].color, icon: behaviors[name].icon, solid: false };
      }
    },
    registerGlobalHook: function (name, fn) {
      if (typeof fn === 'function') globalHooks[name || ('hook_' + Object.keys(globalHooks).length)] = fn;
    },
    log: function (msg) { console.log('[PlatformSandbox]', msg); },
  };

  // Handoff to part 2 (a separate script, so it can't see these closures directly).
  window.__gameDefs = defs;
  window.__gameBehaviors = behaviors;
  window.__gameGlobalHooks = globalHooks;
})();

/* ---- INJECTION_POINT: GameExporter splices enabled ingested <script>s here ---- */

/* ---- PART 2: entities, scenes, physics, renderer, game loop ---- */
(function () {
  'use strict';

  var DATA = window.__GAME_DATA__;
  var defs = window.__gameDefs;
  var behaviors = window.__gameBehaviors;
  var globalHooks = window.__gameGlobalHooks;

  function getDef(id) { return defs[id] || null; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function overlap(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }

  function effectiveBounds(e) {
    var comp = null;
    for (var i = 0; i < (e.components || []).length; i++) { if (e.components[i].type === 'collision') { comp = e.components[i]; break; } }
    if (!comp) return { left: e.x, right: e.x + e.w, top: e.y, bottom: e.y + e.h };
    var x = e.x + (comp.offsetX || 0), y = e.y + (comp.offsetY || 0);
    var w = comp.w != null ? comp.w : e.w, h = comp.h != null ? comp.h : e.h;
    return { left: x, right: x + w, top: y, bottom: y + h };
  }

  function makeEntity(raw, category) {
    return {
      id: raw.id, category: category, tileType: raw.tileType,
      x: raw.x, y: raw.y, w: raw.w, h: raw.h, tint: raw.tint || null,
      meta: raw.meta || {}, components: raw.components || [],
      collected: false, phase: Math.random() * Math.PI * 2,
    };
  }

  var scenes = {};
  Object.keys(DATA.scenes).forEach(function (id) {
    var raw = DATA.scenes[id];
    scenes[id] = {
      id: raw.id, name: raw.name, mode: raw.mode === 'topdown' ? 'topdown' : 'platformer',
      width: raw.width, height: raw.height, spawn: raw.spawn,
      background: Object.assign({ color: '#5c94fc', tileTint: null, groundColor: null }, raw.background),
      platforms: (raw.platforms || []).map(function (p) { return makeEntity(p, 'platform'); }),
      obstacles: (raw.obstacles || []).map(function (o) { return makeEntity(o, 'obstacle'); }),
      collectibles: (raw.collectibles || []).map(function (c) { return makeEntity(c, 'collectible'); }),
      triggers: (raw.triggers || []).map(function (t) { return makeEntity(t, 'trigger'); }),
      actors: (raw.actors || []).map(function (a) { return makeEntity(a, 'actor'); }),
    };
  });

  var physics = Object.assign({ gravity: 0.6, jumpVelocity: 14, moveSpeed: 5, friction: 0.85 }, DATA.physics || {});
  var player = {
    width: 32, height: 48, x: 64, y: 0, vx: 0, vy: 0, onGround: false, facing: 1,
    health: 100, maxHealth: (DATA.playerConfig && DATA.playerConfig.maxHealth) || 100, score: 0, inventory: [],
  };
  var currentSceneId = DATA.startSceneId;

  function activeScene() { return scenes[currentSceneId]; }
  function resetToSpawn(spawn) {
    player.x = spawn.x; player.y = spawn.y; player.vx = 0; player.vy = 0; player.onGround = false;
  }
  function switchScene(id) { if (!scenes[id]) return; currentSceneId = id; resetToSpawn(scenes[id].spawn); }
  resetToSpawn(activeScene().spawn);

  // ---- input --------------------------------------------------------
  var input = { left: false, right: false, up: false, down: false, jump: false };
  var KEY_MAP = {
    ArrowLeft: ['left'], a: ['left'], A: ['left'],
    ArrowRight: ['right'], d: ['right'], D: ['right'],
    ArrowUp: ['jump', 'up'], w: ['jump', 'up'], W: ['jump', 'up'],
    ArrowDown: ['down'], s: ['down'], S: ['down'],
    ' ': ['jump'],
  };
  var PREVENT_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1 };
  window.addEventListener('keydown', function (e) {
    var actions = KEY_MAP[e.key];
    if (!actions) return;
    if (PREVENT_KEYS[e.key]) e.preventDefault();
    actions.forEach(function (a) { input[a] = true; });
  });
  window.addEventListener('keyup', function (e) {
    var actions = KEY_MAP[e.key];
    if (!actions) return;
    actions.forEach(function (a) { input[a] = false; });
  });

  // ---- physics --------------------------------------------------------
  var DT_BASELINE = 1000 / 60;
  var DIAGONAL = Math.SQRT1_2;

  function playerBounds() { return { left: player.x, right: player.x + player.width, top: player.y, bottom: player.y + player.height }; }

  function computePlatformerVelocity(dt) {
    if (input.left && !input.right) { player.vx = -physics.moveSpeed; player.facing = -1; }
    else if (input.right && !input.left) { player.vx = physics.moveSpeed; player.facing = 1; }
    else { player.vx *= Math.pow(physics.friction, dt); if (Math.abs(player.vx) < 0.02) player.vx = 0; }

    if (input.jump && player.onGround) { player.vy = -physics.jumpVelocity; player.onGround = false; }
    player.vy += physics.gravity * dt;
    player.vy = clamp(player.vy, -1000, 30);
  }

  function computeTopDownVelocity(dt) {
    var movingX = input.left !== input.right, movingY = input.up !== input.down;
    var scale = (movingX && movingY) ? DIAGONAL : 1;
    if (movingX) { player.vx = (input.right ? 1 : -1) * physics.moveSpeed * scale; player.facing = input.right ? 1 : -1; }
    else { player.vx *= Math.pow(physics.friction, dt); if (Math.abs(player.vx) < 0.02) player.vx = 0; }
    if (movingY) { player.vy = (input.down ? 1 : -1) * physics.moveSpeed * scale; }
    else { player.vy *= Math.pow(physics.friction, dt); if (Math.abs(player.vy) < 0.02) player.vy = 0; }
  }

  function moveAxis(axis, delta, scene) {
    if (delta === 0) return;
    if (axis === 'x') player.x += delta; else player.y += delta;

    scene.platforms.forEach(function (plat) {
      var def = getDef(plat.tileType);
      if (def && def.solid === false) return;
      var rect = effectiveBounds(plat);
      if (!overlap(playerBounds(), rect)) return;

      if (axis === 'x') {
        if (delta > 0) player.x = rect.left - player.width; else if (delta < 0) player.x = rect.right;
        player.vx = 0;
      } else {
        if (delta > 0) { player.y = rect.top - player.height; player.vy = 0; player.onGround = true; }
        else if (delta < 0) { player.y = rect.bottom; player.vy = 0; }
      }
    });
  }

  function respawn(scene, damage) {
    player.health = Math.max(0, player.health - damage);
    resetToSpawn(scene.spawn);
  }

  function resolveOverlaps(scene) {
    var pb = playerBounds();

    for (var i = 0; i < scene.obstacles.length; i++) {
      var ob = scene.obstacles[i];
      if (overlap(pb, effectiveBounds(ob))) {
        var obDef = getDef(ob.tileType);
        var damage = (ob.meta && ob.meta.damage != null) ? ob.meta.damage : ((obDef && obDef.damage != null) ? obDef.damage : 20);
        respawn(scene, damage);
        return;
      }
    }

    scene.collectibles.forEach(function (c) {
      if (c.collected) return;
      if (!overlap(pb, effectiveBounds(c))) return;
      c.collected = true;
      var def = getDef(c.tileType);
      var value = (c.meta && c.meta.value != null) ? c.meta.value : ((def && def.value) || 0);
      var heal = (c.meta && c.meta.heal != null) ? c.meta.heal : ((def && def.heal) || 0);
      if (value) player.score += value;
      if (heal) player.health = Math.min(player.maxHealth, player.health + heal);
      player.inventory.push(c.tileType);
    });

    for (var j = 0; j < scene.triggers.length; j++) {
      var t = scene.triggers[j];
      if (overlap(pb, effectiveBounds(t)) && t.meta && t.meta.nextScene) { switchScene(t.meta.nextScene); return; }
    }
  }

  function runComponents(scene, dt) {
    var ctx = { state: { player: player, physics: physics }, scene: scene, input: input };
    var pb = playerBounds();
    [scene.platforms, scene.obstacles, scene.collectibles, scene.triggers, scene.actors].forEach(function (list) {
      list.forEach(function (entity) {
        var names = entity.category === 'actor' ? [entity.tileType] : [];
        (entity.components || []).forEach(function (c) { if (c.type === 'script' && c.behaviorName) names.push(c.behaviorName); });
        if (!names.length) return;
        names.forEach(function (name) {
          var behavior = behaviors[name];
          if (!behavior) return;
          try {
            if (!entity.meta.__spawned && behavior.onSpawn) behavior.onSpawn(entity);
            if (behavior.onUpdate) behavior.onUpdate(entity, dt, ctx);
            if (behavior.onPlayerCollide && overlap(pb, effectiveBounds(entity))) behavior.onPlayerCollide(entity, ctx);
          } catch (err) { console.error('[plugin error] ' + name + ':', err); }
        });
        entity.meta.__spawned = true;
      });
    });
  }

  function updatePhysics(dtMs) {
    var scene = activeScene();
    if (!scene) return;
    var dt = clamp(dtMs / DT_BASELINE, 0, 3);

    if (scene.mode === 'topdown') computeTopDownVelocity(dt); else computePlatformerVelocity(dt);

    player.onGround = false;
    moveAxis('x', player.vx * dt, scene);
    moveAxis('y', player.vy * dt, scene);

    player.x = clamp(player.x, 0, scene.width - player.width);
    if (scene.mode === 'topdown') player.y = clamp(player.y, 0, scene.height - player.height);
    else if (player.y > scene.height + 200) respawn(scene, 15);

    resolveOverlaps(scene);
    runComponents(scene, dt);
    Object.keys(globalHooks).forEach(function (name) {
      try { globalHooks[name]({ state: { player: player, physics: physics }, scene: scene, dtFactor: dt, input: input }); }
      catch (err) { console.error('[hook error] ' + name + ':', err); }
    });
  }

  // ---- renderer --------------------------------------------------------
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var camera = { x: 0, y: 0 };

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function shade(hex, percent) {
    var n = hexToRgb(hex);
    if (!n) return hex || '#888';
    function f(c) { return clamp(Math.round(c + (percent / 100) * 255), 0, 255); }
    return 'rgb(' + f(n.r) + ',' + f(n.g) + ',' + f(n.b) + ')';
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function updateCamera(scene) {
    var tx = clamp(player.x + player.width / 2 - canvas.width / 2, 0, Math.max(0, scene.width - canvas.width));
    var ty = clamp(player.y + player.height / 2 - canvas.height / 2, 0, Math.max(0, scene.height - canvas.height));
    camera.x += (tx - camera.x) * 0.18;
    camera.y += (ty - camera.y) * 0.18;
    if (Math.abs(tx - camera.x) < 0.5) camera.x = tx;
    if (Math.abs(ty - camera.y) < 0.5) camera.y = ty;
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.ellipse(x, y, 26, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 20, y + 4, 20, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 20, y + 4, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParallax(scene) {
    var layerX = -(camera.x * 0.3) % 240;
    ctx.fillStyle = shade(scene.background.color, -18);
    for (var x = layerX - 240; x < canvas.width + 240; x += 240) {
      ctx.beginPath();
      ctx.ellipse(x + 60, canvas.height - 40, 110, 46, 0, Math.PI, 0, true);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    var cloudX = -(camera.x * 0.15) % 320;
    for (var cx = cloudX - 320; cx < canvas.width + 320; cx += 320) {
      drawCloud(cx + 90, 70);
      drawCloud(cx + 220, 120);
    }
  }

  function drawTile(entity, scene) {
    var def = getDef(entity.tileType);
    var envColor = entity.category === 'platform' ? scene.background.groundColor : scene.background.tileTint;
    var tint = entity.tint || envColor || (def && def.color) || '#888';

    if (def && def.image) { ctx.drawImage(def.image, entity.x, entity.y, entity.w, entity.h); return; }

    ctx.fillStyle = tint;
    if (entity.category === 'obstacle' && def && def.id === 'spike' && scene.mode !== 'topdown') {
      ctx.beginPath();
      var n = Math.max(1, Math.round(entity.w / 16));
      var step = entity.w / n;
      for (var i = 0; i < n; i++) {
        ctx.moveTo(entity.x + i * step, entity.y + entity.h);
        ctx.lineTo(entity.x + i * step + step / 2, entity.y);
        ctx.lineTo(entity.x + i * step + step, entity.y + entity.h);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      roundRect(entity.x, entity.y, entity.w, entity.h, 3);
      ctx.fill();
      ctx.strokeStyle = shade(tint, -25);
      ctx.lineWidth = 2;
      roundRect(entity.x + 1, entity.y + 1, entity.w - 2, entity.h - 2, 3);
      ctx.stroke();
    }
  }

  function drawTrigger(t) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#b39ddb';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#b39ddb';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(t.x, t.y, t.w, t.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('→', t.x + t.w / 2, t.y + t.h / 2 + 6);
    ctx.restore();
  }

  function drawCollectible(c) {
    if (c.collected) return;
    var def = getDef(c.tileType);
    var rotationSpeed = (c.meta && c.meta.rotationSpeed != null) ? c.meta.rotationSpeed : 1;
    var bob = Math.sin((performance.now() / 260) * rotationSpeed + c.phase) * 4;
    var tint = c.tint || (def && def.color) || '#ffd54f';

    if (def && def.image) { ctx.drawImage(def.image, c.x, c.y + bob, c.w, c.h); return; }

    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bob);
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(0, 0, c.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(tint, -30);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawActor(entity) {
    var def = getDef(entity.tileType) || { color: '#666', icon: '?' };
    var tint = entity.tint || def.color;
    roundRect(entity.x, entity.y, entity.w, entity.h, 6);
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.strokeStyle = shade(tint, -25);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (def.icon) {
      ctx.fillStyle = '#fff';
      ctx.font = Math.round(entity.h * 0.55) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, entity.x + entity.w / 2, entity.y + entity.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#ff5252';
    roundRect(0, 0, player.width, player.height, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    var eyeX = player.facing === 1 ? player.width - 12 : 4;
    ctx.beginPath();
    ctx.arc(eyeX + 4, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(eyeX + 4 + player.facing * 1.5, 14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHUD(scene) {
    var setText = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setText('hud-health-val', Math.round(player.health));
    setText('hud-score-val', player.score);
    setText('hud-inventory-val', player.inventory.length);
    setText('hud-scene-val', scene.name);
  }

  function draw() {
    var scene = activeScene();
    if (!scene) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }

    updateCamera(scene);
    ctx.fillStyle = scene.background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (scene.mode !== 'topdown') drawParallax(scene);

    ctx.save();
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
    scene.platforms.forEach(function (p) { drawTile(p, scene); });
    scene.triggers.forEach(drawTrigger);
    scene.obstacles.forEach(function (o) { drawTile(o, scene); });
    scene.actors.forEach(drawActor);
    scene.collectibles.forEach(drawCollectible);
    drawPlayer();
    ctx.restore();

    drawHUD(scene);
  }

  // ---- game loop --------------------------------------------------------
  var last = 0;
  function frame(now) {
    var dt = Math.min(now - last, 100);
    last = now;
    updatePhysics(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(function (now) { last = now; requestAnimationFrame(frame); });
})();
