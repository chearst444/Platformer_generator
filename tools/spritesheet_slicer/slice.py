#!/usr/bin/env python3
"""
slice.py — cut a sprite sheet into individual transparent-background PNGs.

Usage:
    python3 slice.py [input_path] [output_dir]

Defaults:
    input_path  = tools/spritesheet_slicer/input/spritesheet.png
    output_dir  = tools/spritesheet_slicer/output

What this fixes vs. the original snippet:
  - Several boxes in the coordinate table had swapped top/bottom (or
    left/right) values, e.g. (15, 703, 128, 122) — a "lower" of 122 that
    sits above the "upper" of 703. PIL.Image.crop() does not raise on
    this; it silently returns a degenerate/garbage crop. This script
    normalizes every box (min/max on each axis) and prints a warning
    for every box it had to fix, so those can be re-checked by eye
    against the source sheet.
  - Boxes that fall outside the image bounds, or that normalize to zero
    width/height, are skipped with a clear message instead of writing
    a broken/empty PNG.
  - Output directory is created if missing.
"""

import sys
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT = SCRIPT_DIR / "input" / "spritesheet.png"
DEFAULT_OUTPUT = SCRIPT_DIR / "output"

# Comprehensive bounding boxes (Left, Upper, Right, Lower) for the sprite
# sheet elements. NOTE: several of these were transcribed with the
# upper/lower (or left/right) pair reversed — see the normalization step
# in slice_and_save(). Once the real source image is available, re-check
# any box the script reports as "normalized" against the actual art.
SPRITE_COORDINATES = {
    # Trees (Top row)
    "tree_far_left": (0, 0, 110, 400),
    "tree_brown_1": (175, 0, 345, 400),
    "tree_brown_2": (375, 0, 545, 400),
    "tree_green": (595, 0, 745, 400),

    # Ladders (Top right)
    "ladder_1": (758, 0, 794, 125),
    "ladder_2": (798, 0, 834, 125),
    "ladder_3": (838, 0, 874, 125),
    "ladder_4": (878, 0, 914, 125),

    # Platforms (Middle sections)
    "platform_long_1": (0, 465, 255, 503),
    "platform_long_2": (312, 465, 502, 503),
    "platform_floating_1": (642, 420, 503, 755),
    "platform_floating_2": (750, 420, 864, 503),
    "platform_long_3": (0, 565, 255, 603),
    "platform_long_4": (312, 565, 502, 603),
    "platform_floating_3": (642, 538, 755, 755),
    "platform_floating_4": (750, 538, 864, 503),

    # Vines, Branches, and Bushes (Bottom section)
    "branch_curve_1": (15, 703, 128, 122),
    "branch_curve_2": (126, 703, 239, 122),
    "branch_curve_3": (280, 683, 735, 415),
    "branch_curve_4": (442, 700, 735, 600),
    "vine_hung_1": (0, 758, 124, 122),
    "vine_hung_2": (126, 750, 269, 125),
    "vine_hang_1": (325, 730, 988, 350),
    "vine_hang_2": (392, 755, 953, 415),
    "vine_hang_3": (455, 825, 925, 475),
    "bush_tall_dark": (504, 768, 815, 555),
    "bush_small_dark": (578, 775, 815, 608),
    "bush_round_dark": (632, 772, 804, 642),
    "hanging_moss": (695, 758, 898, 742),
    "bush_tall_light": (752, 752, 850, 809),
    "bush_small_light": (825, 778, 849, 810),

    # Mushrooms
    "mushroom_group_1": (872, 772, 935, 815),
    "mushroom_single_1": (955, 772, 982, 804),
    "mushroom_large": (885, 835, 878, 928),
    "mushroom_single_2": (958, 852, 980, 880),
}


def normalize_box(box):
    """Return (box, was_swapped) with left<=right and upper<=lower."""
    left, upper, right, lower = box
    swapped = right < left or lower < upper
    if right < left:
        left, right = right, left
    if lower < upper:
        upper, lower = lower, upper
    return (left, upper, right, lower), swapped


def slice_and_save(image, coordinates_dict, output_dir):
    """Crops each named box and saves it with a transparent background."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    img_w, img_h = image.size
    saved, skipped = [], []

    for name, raw_box in coordinates_dict.items():
        box, swapped = normalize_box(raw_box)
        left, upper, right, lower = box

        if swapped:
            print(f"[warn] {name}: box {raw_box} had reversed coordinates; "
                  f"normalized to {box} — verify against the source image.")

        # Clamp to image bounds instead of failing outright.
        left = max(0, min(left, img_w))
        right = max(0, min(right, img_w))
        upper = max(0, min(upper, img_h))
        lower = max(0, min(lower, img_h))

        if right <= left or lower <= upper:
            print(f"[skip] {name}: box {raw_box} is empty/out of bounds "
                  f"after clamping to image size {img_w}x{img_h}.")
            skipped.append(name)
            continue

        cropped = image.crop((left, upper, right, lower))

        # Make near-white backgrounds transparent.
        datas = cropped.getdata()
        new_data = [
            (255, 255, 255, 0)
            if item[0] > 240 and item[1] > 240 and item[2] > 240
            else item
            for item in datas
        ]
        cropped.putdata(new_data)

        out_path = output_dir / f"{name}.png"
        cropped.save(out_path)
        saved.append(name)

    print(f"\nSaved {len(saved)} sprite(s) to {output_dir}")
    if skipped:
        print(f"Skipped {len(skipped)} sprite(s): {', '.join(skipped)}")


def main():
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT

    if not input_path.exists():
        print(f"Input image not found: {input_path}\n"
              f"Place the sprite sheet there, or pass a path explicitly:\n"
              f"  python3 {Path(__file__).name} /path/to/image.png [output_dir]")
        sys.exit(1)

    img = Image.open(input_path).convert("RGBA")
    print(f"Loaded {input_path} ({img.size[0]}x{img.size[1]})")
    slice_and_save(img, SPRITE_COORDINATES, output_dir)


if __name__ == "__main__":
    main()
