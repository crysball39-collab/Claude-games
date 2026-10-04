"""Generates the Obsidian set and Growth Serum art: the Compact Obsidian block,
tool and armor icons, the worn armor layers, and the serum bottle.

All of it is drawn procedurally. The armor layers fill Minecraft's standard
64x32 armor layout (the boxes the vanilla armor models map onto).

    python3 tools/gen_items_art.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texlib import Canvas, box_faces, fbm  # noqa: E402

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
def finish_icon(c, shade=True):
    """Shade an icon's obsidian pixels by their position and give the whole shape a dark outline."""
    a = c.a
    alpha = a[..., 3] > 0
    if shade:
        for y in range(16):
            for x in range(16):
                if alpha[y, x] and tuple(int(v) for v in a[y, x, :3]) == OB_M:
                    k = (x - y) / 30.0          # lit from the top-right
                    a[y, x, :3] = np.clip(np.array(OB_M) * (1 + k), 0, 255)
    # outline: transparent pixels next to the shape (no wrap-around at the icon's edges)
    pad = np.pad(alpha, 1)
    edge = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    edge &= ~alpha
    a[edge] = np.array((*OUTLINE, 255))
    return c


def line(c, x0, y0, x1, y1, color):
    steps = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(steps + 1):
        t = i / steps if steps else 0
        c.px(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), color)


def handle(c, x0, y0, x1, y1):
    """A wooden handle running from (x0,y0) to (x1,y1)."""
    steps = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(steps + 1):
        t = i / steps if steps else 0
        x, y = round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)
        c.px(x, y, STICK_M if i % 3 else STICK_L)
        c.px(x + 1, y, STICK_D)


PALETTE = {"L": OB_L, "M": OB_M, "D": OB_D, "G": OB_GLINT, "H": STICK_M, "h": STICK_D, "W": STICK_L}


def from_map(rows):
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in PALETTE:
                c.px(x, y, PALETTE[ch])
    return c


def sword_icon():
    rows = [
        "..............LG",
        ".............LML",
        "............LMD.",
        "...........LMD..",
        "..........LMD...",
        ".........LMD....",
        "........LMD.....",
        ".......LMD......",
        "......LMD.......",
        "..D..LMD........",
        "...DLMD.........",
        "....DD..........",
        "...WHD..........",
        "..Wh..D.........",
        ".LM.............",
        "................",
    ]
    finish_icon(from_map(rows), shade=False).save(out("textures", "items", "zt_obsidian_sword.png"))


def pickaxe_icon():
    c = Canvas(16, 16, CLEAR)
    handle(c, 2, 14, 10, 6)
    head = [(3, 4), (4, 3), (5, 2), (6, 2), (7, 1), (8, 1), (9, 1), (10, 2), (11, 2), (12, 3), (13, 4), (13, 5), (13, 6)]
    for (x, y) in head:
        c.px(x, y, OB_M)
        c.px(x, y + 1, OB_D)
    for (x, y) in ((6, 2), (8, 1), (11, 2)):
        c.px(x, y, OB_L)
    c.px(9, 1, OB_GLINT)
    finish_icon(c).save(out("textures", "items", "zt_obsidian_pickaxe.png"))


def axe_icon():
    # a broad head on the far side of the handle, cutting edge (light) facing out
    rows = [
        "................",
        ".....LMMh.......",
        "....LMMMhh......",
        "...LMMMMhH......",
        "...LMMMMhW......",
        "...LMMMMhH......",
        "....LMMMhW......",
        ".....DDhH.......",
        "......hW........",
        ".....hH.........",
        "....hW..........",
        "...hH...........",
        "..hW............",
        ".hH.............",
        "................",
        "................",
    ]
    c = from_map(rows)
    c.px(4, 3, OB_GLINT)
    finish_icon(c, shade=False).save(out("textures", "items", "zt_obsidian_axe.png"))


def shovel_icon():
    c = Canvas(16, 16, CLEAR)
    handle(c, 2, 14, 9, 7)
    spade = [".##.", "####", "####", "####", ".##."]
    for yy, row in enumerate(spade):
        for xx, ch in enumerate(row):
            if ch == "#":
                c.px(10 + xx, 1 + yy, OB_M)
    c.px(11, 2, OB_L)
    c.px(12, 1, OB_GLINT)
    c.px(13, 4, OB_D)
    finish_icon(c).save(out("textures", "items", "zt_obsidian_shovel.png"))


def hoe_icon():
    c = Canvas(16, 16, CLEAR)
    handle(c, 3, 14, 10, 7)
    for (x, y) in ((6, 2), (7, 2), (8, 2), (9, 2), (10, 3), (11, 4)):
        c.px(x, y, OB_M)
        c.px(x, y + 1, OB_D)
    c.px(7, 2, OB_L)
    c.px(8, 2, OB_GLINT)
    finish_icon(c).save(out("textures", "items", "zt_obsidian_hoe.png"))


ARMOR_ICONS = {
    "helmet": [
        "................",
        "................",
        "................",
        "....########....",
        "...##########...",
        "..############..",
        "..############..",
        "..###......###..",
        "..##........##..",
        "..##........##..",
        "..##........##..",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "chestplate": [
        "................",
        "..####....####..",
        ".#####....#####.",
        ".######..######.",
        ".##############.",
        ".##############.",
        "..############..",
        "...##########...",
        "...##########...",
        "...##########...",
        "...##########...",
        "...##########...",
        "...##########...",
        "....########....",
        "................",
        "................",
    ],
    "leggings": [
        "................",
        "...##########...",
        "...##########...",
        "...##########...",
        "...####..####...",
        "...####..####...",
        "...####..####...",
        "...###....###...",
        "...###....###...",
        "...###....###...",
        "...###....###...",
        "...###....###...",
        "...###....###...",
        "................",
        "................",
        "................",
    ],
    "boots": [
        "................",
        "................",
        "................",
        "................",
        "................",
        "...###....###...",
        "...###....###...",
        "...###....###...",
        "...###....###...",
        "..####....####..",
        ".#####....#####.",
        ".#####....#####.",
        "................",
        "................",
        "................",
        "................",
    ],
}


def armor_icon(name):
    c = Canvas(16, 16, CLEAR)
    rows = ARMOR_ICONS[name]
    noise = fbm(16, 16, 600 + len(name), cell=3, octaves=2)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != "#":
                continue
            top = y == 0 or rows[y - 1][x] != "#"
            left = x == 0 or row[x - 1] != "#"
            bottom = y == 15 or rows[y + 1][x] != "#"
            col = obsidian_tone(0.45 + noise[y, x] * 0.35)
            if top or left:
                col = OB_L
            if bottom:
                col = OB_DEEP
            c.px(x, y, col)
    for y, row in enumerate(rows):          # one violet glint per piece
        x = row.find("#")
        if x >= 0 and 2 < y < 12:
            c.px(x + 2, y, OB_GLINT)
            break
    finish_icon(c, shade=False).save(out("textures", "items", f"zt_obsidian_{name}.png"))


# =============================================================================
# Worn armor layers (64 x 32, standard armor UV layout)
# =============================================================================
ARMOR_BOXES = {
    # layer 1: helmet (head), chestplate (body + arms), boots (legs, lower part)
    1: [("head", 0, 0, 8, 8, 8), ("body", 16, 16, 8, 12, 4), ("arm", 40, 16, 4, 12, 4), ("leg", 0, 16, 4, 12, 4)],
    # layer 2: leggings (waist band on the body, legs)
    2: [("body", 16, 16, 8, 12, 4), ("leg", 0, 16, 4, 12, 4)],
}


def armor_mask(layer):
    """The pixels the standard armor boxes of this layer cover."""
    m = np.zeros((32, 64), dtype=bool)
    for _, u, v, w, h, d in ARMOR_BOXES[layer]:
        for k, (x, y, fw, fh) in box_faces(u, v, w, h, d).items():
            m[int(y):int(y + fh), int(x):int(x + fw)] = True
    return m


def armor_layer(layer):
    mask = armor_mask(layer)
    c = Canvas(64, 32, CLEAR)
    noise = fbm(64, 32, 700 + layer, cell=4, octaves=3)
    rng = np.random.default_rng(710 + layer)
    for y in range(32):
        for x in range(64):
            if not mask[y, x]:
                continue
            v = 0.32 + noise[y, x] * 0.5 + rng.random() * 0.06
            c.px(x, y, obsidian_tone(min(0.88, v)))
    # bevel each face of the standard boxes so the plates read as solid
    for _, u, v, w, h, d in ARMOR_BOXES[layer]:
        for k, (x, y, fw, fh) in box_faces(u, v, w, h, d).items():
            x, y, fw, fh = int(x), int(y), int(fw), int(fh)
            for i in range(fw):
                if mask[y, x + i]:
                    c.px(x + i, y, OB_L)
                if mask[y + fh - 1, x + i]:
                    c.px(x + i, y + fh - 1, OB_DEEP)
    # glints along the plates
    for _ in range(18):
        ys, xs = np.nonzero(mask)
        i = rng.integers(0, len(xs))
        c.px(xs[i], ys[i], OB_GLINT)
    if layer == 1:
        # purple-glowing visor slit on the helmet's front face (front of the head box at (8,8))
        for x in range(9, 15):
            if mask[11, x]:
                c.px(x, 11, (120, 60, 200))
    c.save(out("textures", "models", "armor", f"zt_obsidian_{layer}.png"))


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
    sword_icon()
    pickaxe_icon()
    axe_icon()
    shovel_icon()
    hoe_icon()
    for name in ARMOR_ICONS:
        armor_icon(name)
    for layer in (1, 2):
        armor_layer(layer)
    growth_serum_icon()
    print("item art written")


if __name__ == "__main__":
    main()
