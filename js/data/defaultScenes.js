// ===========================================================
// defaultScenes — embedded fallback copies of js/data/scene_*.json
// so the sandbox still boots when opened straight from disk
// (file://) where fetch() of local JSON is blocked by the
// browser's CORS policy. When served over http(s), SceneManager
// prefers the real JSON files (via manifest.json) and only falls
// back to these if the fetch fails. Keep these in sync with the
// .json files when hand-editing the default levels.
// ===========================================================

export const DEFAULT_MANIFEST = { scenes: ['scene_1', 'scene_2', 'scene_3'], startScene: 'scene_1' };

export const DEFAULT_SCENES = {
  scene_1: {
    id: 'scene_1',
    name: 'Grasslands',
    mode: 'platformer',
    width: 3200,
    height: 540,
    spawn: { x: 64, y: 400 },
    background: { color: '#5c94fc', tileTint: null, groundColor: null },
    platforms: [
      { tileType: 'grass', x: 0, y: 492, w: 640, h: 48 },
      { tileType: 'grass', x: 800, y: 492, w: 700, h: 48 },
      { tileType: 'grass', x: 1620, y: 492, w: 1580, h: 48 },
      { tileType: 'stone', x: 680, y: 420, w: 96, h: 24 },
      { tileType: 'stone', x: 300, y: 380, w: 128, h: 24 },
      { tileType: 'brick', x: 980, y: 340, w: 128, h: 24 },
      { tileType: 'ice', x: 1750, y: 380, w: 160, h: 24 },
      { tileType: 'stone', x: 2100, y: 300, w: 128, h: 24 },
      { tileType: 'brick', x: 2500, y: 380, w: 160, h: 24 },
    ],
    obstacles: [
      { tileType: 'spike', x: 1000, y: 460, w: 32, h: 32 },
      { tileType: 'saw', x: 1850, y: 340, w: 32, h: 32 },
      { tileType: 'spike', x: 2700, y: 460, w: 64, h: 32 },
    ],
    collectibles: [
      { tileType: 'coin', x: 150, y: 440 },
      { tileType: 'coin', x: 350, y: 340 },
      { tileType: 'coin', x: 700, y: 380 },
      { tileType: 'coin', x: 1000, y: 300 },
      { tileType: 'heart', x: 1300, y: 440 },
      { tileType: 'coin', x: 1780, y: 340 },
      { tileType: 'gem', x: 2100, y: 250 },
      { tileType: 'coin', x: 2550, y: 340 },
      { tileType: 'coin', x: 2900, y: 440 },
    ],
    triggers: [
      { tileType: 'exit', x: 3140, y: 396, w: 32, h: 96, meta: { nextScene: 'scene_2' } },
    ],
    actors: [],
  },

  scene_2: {
    id: 'scene_2',
    name: 'Ice Caverns',
    mode: 'platformer',
    width: 2400,
    height: 540,
    spawn: { x: 64, y: 400 },
    background: { color: '#274472', tileTint: null, groundColor: '#1c2f52' },
    platforms: [
      { tileType: 'ice', x: 0, y: 492, w: 520, h: 48 },
      { tileType: 'ice', x: 680, y: 492, w: 480, h: 48 },
      { tileType: 'stone', x: 1300, y: 492, w: 1100, h: 48 },
      { tileType: 'ice', x: 260, y: 380, w: 128, h: 24 },
      { tileType: 'stone', x: 560, y: 340, w: 96, h: 24 },
      { tileType: 'ice', x: 900, y: 360, w: 160, h: 24 },
      { tileType: 'brick', x: 1400, y: 320, w: 128, h: 24 },
      { tileType: 'ice', x: 1750, y: 360, w: 160, h: 24 },
      { tileType: 'stone', x: 2050, y: 300, w: 128, h: 24 },
    ],
    obstacles: [
      { tileType: 'saw', x: 640, y: 460, w: 32, h: 32 },
      { tileType: 'spike', x: 1250, y: 460, w: 48, h: 32 },
      { tileType: 'saw', x: 1980, y: 460, w: 32, h: 32 },
    ],
    collectibles: [
      { tileType: 'coin', x: 120, y: 440 },
      { tileType: 'coin', x: 300, y: 320 },
      { tileType: 'gem', x: 590, y: 280 },
      { tileType: 'coin', x: 940, y: 300 },
      { tileType: 'heart', x: 1420, y: 260 },
      { tileType: 'coin', x: 1790, y: 300 },
      { tileType: 'coin', x: 2090, y: 240 },
      { tileType: 'coin', x: 2250, y: 440 },
    ],
    triggers: [
      { tileType: 'exit', x: 2340, y: 396, w: 32, h: 96, meta: { nextScene: 'scene_3' } },
    ],
    actors: [],
  },

  scene_3: {
    id: 'scene_3',
    name: 'Overworld (Top-Down)',
    mode: 'topdown',
    width: 1600,
    height: 1200,
    spawn: { x: 100, y: 100 },
    background: { color: '#2e7d32', tileTint: '#5d4037', groundColor: null },
    platforms: [
      { tileType: 'stone', x: 0, y: 0, w: 1600, h: 32 },
      { tileType: 'stone', x: 0, y: 1168, w: 1600, h: 32 },
      { tileType: 'stone', x: 0, y: 0, w: 32, h: 1200 },
      { tileType: 'stone', x: 1568, y: 0, w: 32, h: 1200 },
      { tileType: 'brick', x: 300, y: 200, w: 32, h: 400 },
      { tileType: 'brick', x: 700, y: 500, w: 500, h: 32 },
      { tileType: 'brick', x: 1100, y: 200, w: 32, h: 500 },
      { tileType: 'brick', x: 500, y: 800, w: 400, h: 32 },
    ],
    obstacles: [
      { tileType: 'spike', x: 650, y: 650, w: 32, h: 32 },
    ],
    collectibles: [
      { tileType: 'coin', x: 150, y: 600 },
      { tileType: 'coin', x: 500, y: 150 },
      { tileType: 'gem', x: 900, y: 300 },
      { tileType: 'coin', x: 1300, y: 400 },
      { tileType: 'heart', x: 800, y: 1000 },
      { tileType: 'coin', x: 1450, y: 1100 },
      { tileType: 'coin', x: 200, y: 1000 },
      { tileType: 'coin', x: 1200, y: 900 },
    ],
    triggers: [
      { tileType: 'exit', x: 1500, y: 1100, w: 48, h: 48, meta: { nextScene: 'scene_1' } },
    ],
    actors: [],
  },
};

export function blankScene(id, name) {
  return {
    id,
    name,
    mode: 'platformer',
    width: 1920,
    height: 540,
    spawn: { x: 64, y: 400 },
    background: { color: '#5c94fc', tileTint: null, groundColor: null },
    platforms: [{ tileType: 'grass', x: 0, y: 492, w: 1920, h: 48 }],
    obstacles: [],
    collectibles: [],
    triggers: [],
    actors: [],
  };
}
