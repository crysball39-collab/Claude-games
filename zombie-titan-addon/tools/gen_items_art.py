"""Generates the Obsidian set and Growth Serum art: the Compact Obsidian block,
tool and armor icons, the worn armor layers (gearart.py draws those, in the
classic shapes), and the serum bottle.

    python3 tools/gen_items_art.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import gearart as G  # noqa: E402
from texlib import Canvas, fbm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)

# obsidian: purple-black glass with violet glints
OB_DEEP, OB_D, OB_M, OB_L, OB_GLINT = (10, 6, 16), (24, 14, 36), (44, 26, 66), (84, 52, 124), (168, 120, 232)
OUTLINE = (6, 3, 10)
STICK_D, STICK_M, STICK_L = (62, 42, 22), (104, 72, 38), (142, 104, 58)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def obsidian_tone(n):
    """Map noise 0..1 to the obsidian palette."""
    stops = [(0.0, OB_DEEP), (0.35, OB_D), (0.7, OB_M), (0.92, OB_L), (1.0, OB_GLINT)]
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if n <= t1:
            k = (n - t0) / (t1 - t0)
            return tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
    return OB_GLINT


# =============================================================================
# Compact Obsidian block (16 x 16): obsidian pressed so hard it shows a bevelled frame
# =============================================================================
def compact_obsidian_block():
    n = 16
    c = Canvas(n, n, (0, 0, 0, 255))
    noise = fbm(n, n, 501, cell=4, octaves=3)
    rng = np.random.default_rng(502)
    for y in range(n):
        for x in range(n):
            v = noise[y, x] * 0.75 + rng.random() * 0.12
            c.px(x, y, obsidian_tone(min(0.9, v)))
    # bevelled outer frame: lit top/left, dark bottom/right
    for i in range(n):
        c.px(i, 0, OB_L)
        c.px(0, i, OB_L)
        c.px(i, n - 1, OB_DEEP)
        c.px(n - 1, i, OB_DEEP)
    # the four pressed-together obsidian blocks inside
    for i in range(1, n - 1):
        c.px(i, 7, OB_DEEP)
        c.px(7, i, OB_DEEP)
        c.px(i, 8, OB_M)
        c.px(8, i, OB_M)
    # violet glints
    for (x, y) in ((3, 3), (12, 4), (4, 12), (11, 11), (13, 13)):
        c.px(x, y, OB_GLINT)
    c.save(out("textures", "blocks", "zt_compact_obsidian.png"))


# =============================================================================
# Item icons (16 x 16)
# =============================================================================
# =============================================================================
# Tools and armor: the classic shapes (gearart.py) in obsidian's purple-black
# =============================================================================
OBSIDIAN = {"outline": (8, 4, 14), "deep": (18, 10, 28), "dark": (34, 20, 52), "mid": (62, 38, 94), "light": (110, 74, 158),
            "glint": (180, 136, 240)}
TOOLS = ("sword", "pickaxe", "axe", "shovel", "hoe")
ARMOR = ("helmet", "chestplate", "leggings", "boots")


def finish_icon(c, shade=True):
    """A dark outline round an icon's shape (the Growth Serum's)."""
    a = c.a
    alpha = a[..., 3] > 0
    pad = np.pad(alpha, 1)
    edge = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    edge &= ~alpha
    a[edge] = np.array((*OUTLINE, 255))
    return c


def gear():
    for name in TOOLS:
        G.tool_icon(name, OBSIDIAN).save(out("textures", "items", "zt_obsidian_%s.png" % name))
    for name in ARMOR:
        G.armor_icon(name, OBSIDIAN).save(out("textures", "items", "zt_obsidian_%s.png" % name))
    for layer in (1, 2):
        G.armor_layer(layer, OBSIDIAN, 700 + layer, accent=(150, 96, 226)).save(out("textures", "models", "armor", "zt_obsidian_%d.png" % layer))


# =============================================================================
# Growth Serum (16 x 16 icon, also the thrown bottle's sprite)
# =============================================================================
def growth_serum_icon():
    bottle = [
        "................",
        "......####......",
        "......#cc#......",
        ".......gg.......",
        "......g..g......",
        ".....g....g.....",
        "....g......g....",
        "...g........g...",
        "...g........g...",
        "...g........g...",
        "...g........g...",
        "....g......g....",
        ".....gggggg.....",
        "................",
        "................",
        "................",
    ]
    c = Canvas(16, 16, CLEAR)
    cork_d, cork_l = (92, 60, 34), (140, 98, 58)
    glass = (186, 210, 222, 255)
    for y, row in enumerate(bottle):
        for x, ch in enumerate(row):
            if ch == "#":
                c.px(x, y, cork_d)
            elif ch == "c":
                c.px(x, y, cork_l)
            elif ch == "g":
                c.px(x, y, glass)
    # glowing liquid: lime green at the bottom fading to violet at the surface
    for y in range(6, 12):
        row = bottle[y]
        xs = [i for i, ch in enumerate(row) if ch == "g"]
        if len(xs) < 2:
            continue
        for x in range(xs[0] + 1, xs[-1]):
            k = (y - 6) / 5
            col = (int(150 + (120 - 150) * k), int(60 + (240 - 60) * k), int(220 + (80 - 220) * k))
            c.px(x, y, col)
    c.px(5, 8, (255, 255, 255))                 # glass highlight
    c.px(5, 9, (230, 245, 255))
    c.px(9, 8, (255, 240, 120))                 # bubbles
    c.px(7, 10, (220, 255, 160))
    finish_icon(c, shade=False).save(out("textures", "items", "zt_growth_serum.png"))


def main():
    compact_obsidian_block()
    gear()
    growth_serum_icon()
    print("item art written")


if __name__ == "__main__":
    main()
