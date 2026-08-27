#!/usr/bin/env python3
# ===========================================================
# Example: procedural level generator.
#
# Drag this file onto the Universal Drop Zone (requires the local
# bridge server — run `npm start`), then in the developer console:
#
#   /runscript generate_level.py --scene
#
# The script prints a scene as JSON on stdout; passing --scene
# tells the console to parse that JSON and load it as a brand
# new scene automatically.
# ===========================================================

import json
import random

WIDTH = 2000
HEIGHT = 540
GROUND_Y = 492

platforms = [{"tileType": "grass", "x": 0, "y": GROUND_Y, "w": WIDTH, "h": 48}]
collectibles = []
obstacles = []

x = 200
while x < WIDTH - 200:
    if random.random() < 0.55:
        plat_y = GROUND_Y - random.choice([80, 140, 200])
        platforms.append({"tileType": "stone", "x": x, "y": plat_y, "w": 128, "h": 24})
        collectibles.append({"tileType": "coin", "x": x + 48, "y": plat_y - 40})
    else:
        obstacles.append({"tileType": "spike", "x": x, "y": GROUND_Y - 32, "w": 32, "h": 32})
    x += random.randint(180, 280)

scene = {
    "name": "Procedurally Generated",
    "mode": "platformer",
    "width": WIDTH,
    "height": HEIGHT,
    "spawn": {"x": 64, "y": 400},
    "background": {"color": "#5c94fc", "tileTint": None, "groundColor": None},
    "platforms": platforms,
    "obstacles": obstacles,
    "collectibles": collectibles,
    "triggers": [],
    "actors": [],
}

print(json.dumps(scene))
