"""Generates the art of the Glowite update: Glowite ore, its materials, tools and armor; the
blocks of the Glowshroom Biome (maroon dirt, spore grass and its plants, spore mushrooms, the
striped Glowshroom logs and their planks, door and trapdoor, the Mushed Spore Cap), the spore
crop's four stages, spore seeds and Shroom Berries; and the Shroom Zombie and Shroom Skeleton
(their models and skins) and the glowing spore bullet.

Block textures are 16x16; the armor layers fill Minecraft's standard 64x32 armor layout. Mob
skins use entity_emissive_alpha: pixels with a low alpha glow.

    python3 tools/gen_glowite_art.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from geobuild import Geo, geometry_file  # noqa: E402
import gearart as G  # noqa: E402
from texlib import Canvas, Painter, box_faces, fbm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)

# glowite: deep sea blue to a bright cyan glow
GL_DEEP, GL_D, GL_M, GL_L, GL_GLINT = (8, 22, 52), (16, 56, 118), (30, 116, 200), (96, 200, 250), (214, 250, 255)
GL_OUT = (4, 12, 30)
# deepslate around the ore
DS_D, DS_M, DS_L = (34, 34, 40), (58, 58, 66), (84, 84, 94)
# maroon dirt
MA_D, MA_M, MA_L = (70, 20, 30), (102, 34, 44), (136, 56, 64)
# spore grass: blue, with a glow on its tips
SG_D, SG_M, SG_L, SG_GLOW = (18, 62, 132), (36, 112, 204), (104, 196, 255), (190, 244, 255)
# the striped Glowshroom trunk: white and dark white
LOG_W, LOG_DW, LOG_SH = (242, 242, 238), (186, 188, 200), (150, 152, 168)
# Mushed Spore Cap: deep blue-violet with glowing cyan spots
CAP_D, CAP_M, CAP_L, CAP_SPOT = (34, 28, 96), (56, 48, 138), (84, 76, 178), (150, 238, 255)
# Glowshroom planks: pale wood with a cool tint
PL_D, PL_M, PL_L = (150, 152, 170), (192, 194, 208), (222, 224, 234)
STICK_D, STICK_M, STICK_L = (62, 42, 22), (104, 72, 38), (142, 104, 58)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def tone(stops, n):
    """Map 0..1 onto a list of (t, color) stops."""
    n = min(1.0, max(0.0, float(n)))
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if n <= t1:
            k = (n - t0) / (t1 - t0) if t1 > t0 else 0
            return tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
    return tuple(stops[-1][1])


GLOWITE = [(0.0, GL_DEEP), (0.3, GL_D), (0.65, GL_M), (0.9, GL_L), (1.0, GL_GLINT)]
DEEPSLATE = [(0.0, DS_D), (0.55, DS_M), (1.0, DS_L)]
MAROON = [(0.0, MA_D), (0.55, MA_M), (1.0, MA_L)]
SPORE = [(0.0, SG_D), (0.55, SG_M), (0.92, SG_L), (1.0, SG_GLOW)]
CAP = [(0.0, CAP_D), (0.55, CAP_M), (1.0, CAP_L)]
PLANKS = [(0.0, PL_D), (0.55, PL_M), (1.0, PL_L)]


def noisy(stops, seed, cell=4, octaves=3, grain=0.12, n=16, w=None, h=None):
    """A canvas filled with noise mapped onto a palette."""
    w, h = w or n, h or n
    c = Canvas(w, h, (0, 0, 0, 255))
    f = fbm(w, h, seed, cell=cell, octaves=octaves)
    rng = np.random.default_rng(seed + 7)
    for y in range(h):
        for x in range(w):
            c.px(x, y, tone(stops, f[y, x] * 0.9 + (rng.random() - 0.5) * grain + 0.05))
    return c


def outline(c, color):
    """A dark outline round an icon's shape (transparent pixels next to it)."""
    a = c.a
    alpha = a[..., 3] > 0
    pad = np.pad(alpha, 1)
    edge = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~alpha
    a[edge] = np.array((*color, 255))
    return c


# =============================================================================
# Glowite ore and blocks
# =============================================================================
def deepslate(seed):
    """Deepslate: dark grey with its fine horizontal grain."""
    c = Canvas(16, 16, (0, 0, 0, 255))
    f = fbm(16, 16, seed, cell=3, octaves=2)
    rng = np.random.default_rng(seed + 1)
    for y in range(16):
        row = rng.random() * 0.25
        for x in range(16):
            v = f[y, x] * 0.6 + row + (rng.random() - 0.5) * 0.15
            c.px(x, y, tone(DEEPSLATE, v))
        if y % 4 == 3:
            for x in range(16):
                if rng.random() < 0.55:
                    c.px(x, y, DS_D)
    return c


def crystal(c, cx, cy, shape):
    """A glowite crystal cluster: a dark rim, blue body, bright core and a white-cyan glint."""
    pts = [(cx + dx, cy + dy) for dy, row in enumerate(shape) for dx, ch in enumerate(row) if ch != "."]
    for (x, y) in pts:
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + ox, y + oy) not in pts and 0 <= x + ox < 16 and 0 <= y + oy < 16:
                c.px(x + ox, y + oy, GL_OUT)
    for dy, row in enumerate(shape):
        for dx, ch in enumerate(row):
            col = {"d": GL_D, "m": GL_M, "l": GL_L, "g": GL_GLINT}.get(ch)
            if col:
                c.px(cx + dx, cy + dy, col)


CRYSTALS = [
    (2, 2, ["dm.", "mlm", ".mg"]),
    (10, 1, [".m", "ml", "dm"]),
    (6, 7, [".dm.", "dmlm", "mlgm", ".mm."]),
    (1, 11, ["ml", "dm"]),
    (12, 10, ["m.", "lm", "gm", ".d"]),
]


def glowite_ore():
    c = deepslate(4101)
    for cx, cy, shape in CRYSTALS:
        crystal(c, cx, cy, shape)
    c.save(out("textures", "blocks", "zt_glowite_ore.png"))


def glowshroom_heart():
    """The hidden heart a Glowshroom cavern grows from looks like the deepslate around it."""
    deepslate(4111).save(out("textures", "blocks", "zt_glowshroom_heart.png"))


def raw_glowite_block():
    """Lumps of raw glowite pressed together, like the vanilla raw ore blocks."""
    c = noisy(GLOWITE, 4201, cell=3, grain=0.1)
    f = fbm(16, 16, 4202, cell=3, octaves=2)
    for y in range(16):
        for x in range(16):
            v = f[y, x]
            if v < 0.35:
                c.px(x, y, GL_DEEP)
            elif v < 0.45:
                c.px(x, y, GL_D)
            elif v > 0.72:
                c.px(x, y, GL_L)
    for (x, y) in ((3, 3), (11, 5), (6, 12), (13, 13), (8, 8)):
        c.px(x, y, GL_GLINT)
    c.save(out("textures", "blocks", "zt_raw_glowite_block.png"))


def glowite_block():
    """Polished glowite: a bevelled frame round four plates with glowing seams."""
    c = Canvas(16, 16, (0, 0, 0, 255))
    f = fbm(16, 16, 4301, cell=5, octaves=2)
    for y in range(16):
        for x in range(16):
            c.px(x, y, tone(GLOWITE, 0.45 + f[y, x] * 0.3))
    for i in range(16):
        c.px(i, 0, GL_L)
        c.px(0, i, GL_L)
        c.px(i, 15, GL_DEEP)
        c.px(15, i, GL_DEEP)
    for i in range(1, 15):
        c.px(i, 7, GL_D)
        c.px(7, i, GL_D)
        c.px(i, 8, GL_GLINT if i % 3 else GL_L)
        c.px(8, i, GL_GLINT if i % 3 else GL_L)
    for (x, y) in ((3, 3), (12, 3), (3, 12), (12, 12)):
        c.px(x, y, GL_GLINT)
        c.px(x + 1, y, GL_L)
    c.save(out("textures", "blocks", "zt_glowite_block.png"))


# =============================================================================
# Glowshroom Biome blocks
# =============================================================================
def maroon_dirt():
    c = noisy(MAROON, 4401, cell=3, grain=0.2)
    rng = np.random.default_rng(4402)
    for _ in range(9):
        x, y = rng.integers(0, 16, 2)
        c.px(x, y, MA_D if rng.random() < 0.6 else MA_L)
    c.save(out("textures", "blocks", "zt_maroon_dirt.png"))
    return c


def spore_grass_top():
    c = noisy(SPORE, 4501, cell=3, grain=0.22)
    rng = np.random.default_rng(4502)
    for _ in range(10):               # glowing spore tips
        x, y = rng.integers(0, 16, 2)
        c.px(x, y, SG_GLOW)
    c.save(out("textures", "blocks", "zt_spore_grass_top.png"))


def spore_grass_side(dirt):
    c = Canvas(16, 16, (0, 0, 0, 255))
    c.a[:] = dirt.a
    rng = np.random.default_rng(4601)
    f = fbm(16, 16, 4602, cell=3, octaves=2)
    for x in range(16):
        depth = 3 + int(rng.random() * 2.6)
        for y in range(depth):
            c.px(x, y, tone(SPORE, 0.35 + f[y, x] * 0.55))
        if rng.random() < 0.5:
            c.px(x, depth, tone(SPORE, 0.3))
    for x in (2, 6, 9, 13):
        c.px(x, 0, SG_GLOW)
    c.save(out("textures", "blocks", "zt_spore_grass_side.png"))


def spore_grass_plant():
    """Tufts of blue blades with glowing tips (drawn on the crossed planes of a plant)."""
    c = Canvas(16, 16, CLEAR)
    rng = np.random.default_rng(4701)
    for bx in (1, 3, 5, 7, 8, 10, 12, 14):
        h = 5 + int(rng.random() * 9)
        lean = rng.choice([-1, 0, 1])
        for i in range(h):
            y = 15 - i
            x = bx + (lean if i > h * 0.6 else 0)
            col = tone(SPORE, 0.2 + 0.7 * i / h)
            c.px(x, y, col)
        c.px(bx + lean, 16 - h, SG_GLOW)
    c.save(out("textures", "blocks", "zt_spore_grass_plant.png"))


def spore_mushroom():
    """A little mushroom: pale stem, blue-violet cap with glowing spots."""
    c = Canvas(16, 16, CLEAR)
    cap = [
        "....######....",
        "..##########..",
        ".############.",
        "##############",
        "##############",
        ".############.",
    ]
    for y, row in enumerate(cap):
        for x, ch in enumerate(row):
            if ch == "#":
                v = 0.35 + 0.4 * (1 - y / 6) + (0.15 if x < 7 else 0)
                c.px(x + 1, y + 4, tone(CAP, v))
    for (x, y) in ((4, 6), (8, 5), (11, 7), (6, 8), (10, 9)):
        c.px(x, y, CAP_SPOT)
    for y in range(10, 16):
        for x in (6, 7, 8, 9):
            c.px(x, y, LOG_W if x < 8 else LOG_DW)
    c.px(7, 10, LOG_SH)
    c.px(8, 10, LOG_SH)
    c.save(out("textures", "blocks", "zt_spore_mushroom.png"))


def glowshroom_log():
    """The trunk's side: white and dark white stripes with a faint blue vein."""
    c = Canvas(16, 16, (0, 0, 0, 255))
    rng = np.random.default_rng(4801)
    f = fbm(16, 16, 4802, cell=4, octaves=2)
    stripes = [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1]
    for x in range(16):
        base = LOG_W if stripes[x] == 0 else LOG_DW
        for y in range(16):
            k = 0.94 + f[y, x] * 0.1 + (rng.random() - 0.5) * 0.04
            c.px(x, y, tuple(int(min(255, v * k)) for v in base))
    for y in range(16):                 # bark seams
        if rng.random() < 0.2:
            c.px(int(rng.integers(0, 16)), y, LOG_SH)
    for y in range(3, 11):              # a glowing vein
        c.px(11 + (1 if y > 7 else 0), y, (176, 232, 255))
    c.save(out("textures", "blocks", "zt_glowshroom_log.png"))


def glowshroom_log_top():
    """The cut end: rings of white and grey round a glowing blue core."""
    c = Canvas(16, 16, (0, 0, 0, 255))
    for y in range(16):
        for x in range(16):
            d = max(abs(x - 7.5), abs(y - 7.5)) + 0.35 * min(abs(x - 7.5), abs(y - 7.5)) / 2
            ring = int(d)
            col = LOG_W if ring % 2 == 0 else LOG_DW
            if ring >= 7:
                col = LOG_SH if (x + y) % 3 else LOG_DW
            c.px(x, y, col)
    for (x, y) in ((7, 7), (8, 7), (7, 8), (8, 8)):
        c.px(x, y, (150, 226, 255))
    c.save(out("textures", "blocks", "zt_glowshroom_log_top.png"))


def mushed_spore_cap():
    c = noisy(CAP, 4901, cell=4, grain=0.18)
    rng = np.random.default_rng(4902)
    spots = [(2, 2), (9, 1), (13, 6), (5, 8), (11, 12), (1, 13), (7, 14)]
    for (x, y) in spots:
        r = 1 + int(rng.random() * 1.5)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r + 0.5:
                    c.px((x + dx) % 16, (y + dy) % 16, CAP_SPOT if dx * dx + dy * dy < r * r else (96, 180, 236))
        c.px(x, y, (230, 255, 255))
    c.save(out("textures", "blocks", "zt_mushed_spore_cap.png"))


def planks():
    c = Canvas(16, 16, (0, 0, 0, 255))
    f = fbm(16, 16, 5001, cell=6, octaves=2)
    rng = np.random.default_rng(5002)
    for y in range(16):
        for x in range(16):
            grain = 0.08 * np.sin((x + (y // 4) * 5) * 1.3)
            c.px(x, y, tone(PLANKS, 0.35 + f[y, x] * 0.45 + grain + (rng.random() - 0.5) * 0.06))
    for y in (3, 7, 11, 15):
        for x in range(16):
            c.px(x, y, PL_D)
    # staggered plank ends and a few nails
    for y0, xe in ((0, 5), (4, 12), (8, 3), (12, 9)):
        for y in range(y0, y0 + 3):
            c.px(xe, y, PL_D)
    for (x, y) in ((1, 1), (14, 5), (7, 9), (11, 13)):
        c.px(x, y, (124, 200, 236))
    c.save(out("textures", "blocks", "zt_glowshroom_planks.png"))
    return c


def door_half(top):
    """A Glowshroom door half: a frame of planks; the top half has two glowing spore windows."""
    c = Canvas(16, 16, (0, 0, 0, 255))
    f = fbm(16, 16, 5101 + top, cell=5, octaves=2)
    for y in range(16):
        for x in range(16):
            c.px(x, y, tone(PLANKS, 0.4 + f[y, x] * 0.35 + 0.05 * np.sin(y * 1.7)))
    for i in range(16):
        c.px(0, i, PL_D)
        c.px(15, i, PL_D)
        c.px(i, 0 if top else 15, PL_D)
    if top:
        for (x0, y0) in ((3, 3), (9, 3)):
            for y in range(y0, y0 + 6):
                for x in range(x0, x0 + 4):
                    edge = x in (x0, x0 + 3) or y in (y0, y0 + 5)
                    c.px(x, y, LOG_SH if edge else ((150, 236, 255) if (x + y) % 3 else (90, 190, 246)))
    else:
        for (x0, y0) in ((3, 2), (9, 2), (3, 9), (9, 9)):
            for y in range(y0, y0 + 5):
                for x in range(x0, x0 + 4):
                    edge = x in (x0, x0 + 3) or y in (y0, y0 + 4)
                    c.px(x, y, PL_D if edge else PL_L)
        c.px(12, 1, (40, 40, 48))          # the handle
        c.px(12, 0, (70, 70, 80))
    if top:
        c.px(12, 14, (70, 70, 80))
        c.px(12, 15, (40, 40, 48))
    c.save(out("textures", "blocks", "zt_glowshroom_door_%s.png" % ("top" if top else "bottom")))


def trapdoor():
    """A frame with a lattice of square holes (render_method alpha_test)."""
    c = Canvas(16, 16, (0, 0, 0, 255))
    f = fbm(16, 16, 5201, cell=5, octaves=2)
    for y in range(16):
        for x in range(16):
            c.px(x, y, tone(PLANKS, 0.4 + f[y, x] * 0.35))
    for i in range(16):
        for k in (0, 15):
            c.px(i, k, PL_D)
            c.px(k, i, PL_D)
    for (x0, y0) in ((3, 3), (9, 3), (3, 9), (9, 9)):
        for y in range(y0, y0 + 4):
            for x in range(x0, x0 + 4):
                c.px(x, y, CLEAR)
    c.save(out("textures", "blocks", "zt_glowshroom_trapdoor.png"))


def spore_crop(stage):
    """Four stages: sprouts, blades, buds, and clusters of glowing blue Shroom Berries."""
    c = Canvas(16, 16, CLEAR)
    rng = np.random.default_rng(5300 + stage)
    heights = [4, 8, 11, 13][stage]
    for bx in (2, 5, 8, 11, 13):
        h = max(2, heights - int(rng.random() * 3))
        for i in range(h):
            x = bx + (1 if i > h * 0.7 and bx % 2 else 0)
            c.px(x, 15 - i, tone(SPORE, 0.15 + 0.55 * i / h))
        if stage >= 2:
            c.px(bx + 1, 16 - h, SG_L)
    if stage == 2:
        for (x, y) in ((3, 7), (9, 6), (12, 8)):
            c.px(x, y, (70, 150, 230))
    if stage == 3:
        for (x, y) in ((2, 4), (6, 3), (9, 5), (12, 3), (4, 8), (11, 8)):
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                c.px(x + dx, y + dy, (40, 130, 236))
            c.px(x, y, (200, 250, 255))
    c.save(out("textures", "blocks", "zt_spore_crop_%d.png" % stage))


# =============================================================================
# Item icons (16 x 16)
# =============================================================================
def glowing_particles():
    c = Canvas(16, 16, CLEAR)
    def star(x, y, big):
        c.px(x, y, (240, 255, 255))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            c.px(x + dx, y + dy, GL_L)
        if big:
            for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                c.px(x + dx, y + dy, GL_M)
            for dx, dy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
                c.px(x + dx, y + dy, GL_D)
    star(5, 5, True)
    star(11, 9, True)
    star(4, 12, False)
    star(12, 3, False)
    for (x, y) in ((8, 2), (2, 8), (14, 13), (8, 13)):
        c.px(x, y, GL_L)
    c.save(out("textures", "items", "zt_glowing_particles.png"))


def raw_glowite():
    rows = [
        "................",
        "................",
        "......mmm.......",
        "....mmlllm......",
        "...mllgllmm.....",
        "..mmllllmmmd....",
        "..mlllmmmmdd....",
        "..mmlmmmmmmdm...",
        "...mmmmdmmmmmd..",
        "...dmmmddmmmdd..",
        "....ddmdddmddd..",
        ".....dddddddd...",
        "......ddddd.....",
        "................",
        "................",
        "................",
    ]
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = {"d": GL_D, "m": GL_M, "l": GL_L, "g": GL_GLINT}.get(ch)
            if col:
                c.px(x, y, col)
    outline(c, GL_OUT).save(out("textures", "items", "zt_raw_glowite.png"))


def glowite_ingot():
    rows = [
        "................",
        "................",
        "................",
        "................",
        "......gllllll...",
        ".....lllllllm...",
        "....lllmmmmmmd..",
        "...lmmmmmmmmdd..",
        "..mmmmmmmmmddd..",
        "..ddddddddddd...",
        "..ddddddddddd...",
        "...dddddddddd...",
        "................",
        "................",
        "................",
        "................",
    ]
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = {"d": GL_D, "m": GL_M, "l": GL_L, "g": GL_GLINT}.get(ch)
            if col:
                c.px(x, y, col)
    c.px(7, 5, GL_GLINT)
    outline(c, GL_OUT).save(out("textures", "items", "zt_glowite_ingot.png"))


GLOWITE_GEAR = {"outline": GL_OUT, "deep": (10, 30, 70), "dark": GL_D, "mid": GL_M, "light": GL_L, "glint": GL_GLINT}
TOOLS = ("sword", "pickaxe", "axe", "shovel", "hoe")
ARMOR = ("helmet", "chestplate", "leggings", "boots")


def gear():
    """Glowite tools and armor in the classic shapes (gearart.py), with glowing cyan seams."""
    for name in TOOLS:
        G.tool_icon(name, GLOWITE_GEAR).save(out("textures", "items", "zt_glowite_%s.png" % name))
    for name in ARMOR:
        G.armor_icon(name, GLOWITE_GEAR).save(out("textures", "items", "zt_glowite_%s.png" % name))
    for layer in (1, 2):
        G.armor_layer(layer, GLOWITE_GEAR, 5700 + layer, accent=(150, 240, 255)).save(out("textures", "models", "armor", "zt_glowite_%d.png" % layer))


def spore_seeds():
    c = Canvas(16, 16, CLEAR)
    for (x, y) in ((4, 5), (9, 3), (7, 9), (11, 10), (3, 11)):
        for dx, dy, col in ((0, 0, SG_L), (1, 0, SG_M), (0, 1, SG_M), (1, 1, SG_D)):
            c.px(x + dx, y + dy, col)
        c.px(x, y, SG_GLOW)
    outline(c, (8, 26, 60)).save(out("textures", "items", "zt_spore_seeds.png"))


def shroom_berries():
    c = Canvas(16, 16, CLEAR)
    for i in range(4):                  # the little stalk
        c.px(8 + (i // 2), 1 + i, (60, 44, 86))
    for (x, y) in ((5, 5), (9, 5), (7, 8), (4, 9), (10, 9), (7, 12)):
        for dy in range(3):
            for dx in range(3):
                if (dx, dy) in ((0, 0), (2, 0), (0, 2), (2, 2)):
                    continue
                c.px(x + dx, y + dy, (34, 120, 228) if dy < 2 else (20, 70, 160))
        c.px(x + 1, y, (200, 250, 255))
    outline(c, (8, 22, 58)).save(out("textures", "items", "zt_shroom_berries.png"))


def door_icon():
    c = Canvas(16, 16, CLEAR)
    for y in range(1, 15):
        for x in range(4, 12):
            edge = x in (4, 11) or y in (1, 14, 8)
            col = PL_D if edge else PL_M
            if 2 <= y <= 6 and x in (6, 9):
                col = (150, 236, 255)
            c.px(x, y, col)
    c.px(10, 9, (40, 40, 48))
    outline(c, (60, 60, 74)).save(out("textures", "items", "zt_glowshroom_door.png"))


# =============================================================================
# The Shroom Zombie and Shroom Skeleton: humanoid models (bone names as vanilla's, so the
# vanilla humanoid animations drive them) with glowing spore mushrooms growing on them
# =============================================================================
def shroom_geometry(ident, skeleton):
    g = Geo(ident, 64, None, 2, 2.5, (0, 1.2, 0))
    limb = (2, 12, 2) if skeleton else (4, 12, 4)
    g.part("head", 8, 8, 8)
    g.part("moss", 8, 8, 8)
    g.part("body", 8, 12, 4)
    g.part("body_moss", 8, 12, 4)
    g.part("arm", *limb)
    g.part("leg", *limb)
    g.part("cap", 4, 2, 4)
    g.part("stem", 2, 2, 2)
    g.part("cap_small", 3, 1, 3)
    g.part("stem_small", 1, 1, 1)
    lw = limb[0]
    g.bone("waist", pivot=(0, 12, 0))
    g.bone("body", "waist", (0, 24, 0), cubes=[g.cube("body", (-4, 12, -2)),
                                                g.cube("body_moss", (-4, 12, -2), inflate=0.3)])
    g.bone("head", "body", (0, 24, 0), cubes=[
        g.cube("head", (-4, 24, -4)),
        g.cube("moss", (-4, 24, -4), inflate=0.5),
        # a spore mushroom on the crown, a small one over the right ear
        g.cube("stem", (0, 32, -1)),
        g.cube("cap", (-1, 34, -2)),
        g.cube("stem_small", (-4.5, 30, 0)),
        g.cube("cap_small", (-6, 31, -1)),
    ])
    arm_x = -6 if skeleton else -8
    g.bone("rightArm", "body", (-5, 22, 0), cubes=[g.cube("arm", (arm_x, 12, -lw / 2))])
    g.bone("rightItem", "rightArm", (-6, 15, 1))
    g.bone("leftArm", "body", (5, 22, 0), cubes=[
        g.cube("arm", (4, 12, -lw / 2), mirror=True),
        # a mushroom on the left shoulder
        g.cube("stem_small", (5, 24, -0.5)),
        g.cube("cap_small", (4, 25, -1.5)),
    ], mirror=True)
    g.bone("leftItem", "leftArm", (6, 15, 1))
    leg_x = -3 if skeleton else -3.9
    g.bone("rightLeg", "body", (-2 if skeleton else -1.9, 12, 0), cubes=[g.cube("leg", (leg_x, 0, -lw / 2))])
    g.bone("leftLeg", "body", (2 if skeleton else 1.9, 12, 0), cubes=[g.cube("leg", (1 if skeleton else -0.1, 0, -lw / 2), mirror=True)])
    return g


GLOW_SPOT = (110, 226, 255, 10)        # low alpha: glows with entity_emissive_alpha
GLOW_SOFT = (60, 160, 240, 60)
MOSS_D, MOSS_M, MOSS_L = (14, 52, 70), (24, 84, 104), (40, 120, 140)


def spots(c, rng, faces, n, big=False):
    """Glowing blue spots scattered over the given faces."""
    for _ in range(n):
        x, y, w, h = faces[int(rng.integers(0, len(faces)))]
        if w < 1 or h < 1:
            continue
        sx = int(x + rng.integers(0, max(1, int(w))))
        sy = int(y + rng.integers(0, max(1, int(h))))
        c.px(sx, sy, GLOW_SPOT)
        if big and w > 2 and h > 2:
            for dx, dy in ((1, 0), (0, 1)):
                if sx + dx < x + w and sy + dy < y + h:
                    c.px(sx + dx, sy + dy, GLOW_SOFT)


def paint_mushrooms(c, g, p):
    for part, face_col in (("cap", True), ("cap_small", True)):
        for k, (x, y, w, h) in g.faces(part).items():
            if w < 1 or h < 1:
                continue
            if k == "bottom":
                c.rect(x, y, w, h, (196, 198, 214))
            else:
                p.material(x, y, w, h, CAP_D, CAP_M, CAP_L, contrast=0.8)
        f = g.faces(part)["top"]
        c.px(f[0], f[1], GLOW_SPOT)
        c.px(f[0] + f[2] - 1, f[1] + f[3] - 1, GLOW_SPOT)
    for part in ("stem", "stem_small"):
        for k, (x, y, w, h) in g.faces(part).items():
            if w >= 1 and h >= 1:
                c.rect(x, y, w, h, LOG_W if k != "right" else LOG_DW)


def moss_layer(c, g, p, part, coverage, seed, face_clear=False):
    """Glowshroom moss: an overlay layer, mostly see-through, mossy blotches with glowing specks
    (face_clear keeps it off the eyes and mouth)."""
    rng = np.random.default_rng(seed)
    field = fbm(c.w, c.h, seed, cell=3, octaves=2)
    for k, (x, y, w, h) in g.faces(part).items():
        x, y, w, h = int(x), int(y), int(w), int(h)
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if face_clear and k == "front" and yy - y >= 2:
                    continue
                v = field[yy, xx]
                top = k == "top" or (yy - y) < h * 0.35
                if v > coverage - (0.12 if top else 0):
                    c.px(xx, yy, MOSS_L if v > coverage + 0.15 else (MOSS_M if v > coverage + 0.06 else MOSS_D))
                    if rng.random() < 0.12:
                        c.px(xx, yy, GLOW_SPOT)


def shroom_zombie():
    g = shroom_geometry("geometry.zt.shroom_zombie", False)
    c = Canvas(64, g.th, CLEAR)
    p = Painter(c, 5801)
    skin_d, skin_m, skin_l = (36, 70, 84), (58, 104, 118), (88, 140, 150)
    shirt_d, shirt_m, shirt_l = (18, 40, 66), (28, 62, 98), (44, 88, 130)
    pants_d, pants_m, pants_l = (22, 24, 52), (36, 38, 80), (52, 56, 108)
    rng = np.random.default_rng(5802)
    for k, (x, y, w, h) in g.faces("head").items():
        p.material(x, y, w, h, skin_d, skin_m, skin_l, contrast=0.9)
        p.shade_edges(x, y, w, h, 0.15)
    fx, fy, fw, fh = g.faces("head")["front"]
    # glowing eyes and a gaping mouth
    for ex in (1, 5):
        c.rect(fx + ex, fy + 3, 2, 1, (170, 248, 255, 6))
        c.px(fx + ex, fy + 2, (20, 34, 40))
    c.rect(fx + 2, fy + 6, 4, 1, (16, 22, 28))
    for k, (x, y, w, h) in g.faces("body").items():
        p.material(x, y, w, h, shirt_d, shirt_m, shirt_l, contrast=0.9)
        p.shade_edges(x, y, w, h, 0.15)
    for k, (x, y, w, h) in g.faces("arm").items():
        p.material(x, y, w, h, skin_d, skin_m, skin_l)
        if k not in ("top", "bottom"):
            p.material(x, y, w, min(h, 4), shirt_d, shirt_m, shirt_l)   # torn sleeves
    for k, (x, y, w, h) in g.faces("leg").items():
        p.material(x, y, w, h, pants_d, pants_m, pants_l)
        if k not in ("top", "bottom"):
            p.material(x, y + h - 2, w, 2, skin_d, skin_m, skin_l)      # bare ankles
    spots(c, rng, [r for k, r in g.faces("head").items() if k != "bottom"], 9, big=True)
    spots(c, rng, list(g.faces("body").values()), 10, big=True)
    spots(c, rng, list(g.faces("arm").values()), 6)
    spots(c, rng, list(g.faces("leg").values()), 5)
    moss_layer(c, g, p, "moss", 0.55, 5803, face_clear=True)
    moss_layer(c, g, p, "body_moss", 0.6, 5804)
    paint_mushrooms(c, g, p)
    c.save(out("textures", "entity", "zt_shroom_zombie.png"))
    return g


def shroom_skeleton():
    g = shroom_geometry("geometry.zt.shroom_skeleton", True)
    c = Canvas(64, g.th, CLEAR)
    p = Painter(c, 5901)
    bone_d, bone_m, bone_l = (150, 156, 168), (196, 200, 210), (226, 230, 238)
    rng = np.random.default_rng(5902)
    for part in ("head", "body", "arm", "leg"):
        for k, (x, y, w, h) in g.faces(part).items():
            p.material(x, y, w, h, bone_d, bone_m, bone_l, contrast=0.8)
            p.shade_edges(x, y, w, h, 0.12)
    fx, fy, fw, fh = g.faces("head")["front"]
    for ex in (1, 5):                    # sockets with a glow deep in them
        c.rect(fx + ex, fy + 3, 2, 2, (18, 20, 28))
        c.px(fx + ex + 1, fy + 4, (150, 240, 255, 8))
    c.rect(fx + 3, fy + 5, 2, 1, (30, 32, 40))
    c.rect(fx + 1, fy + 6, 6, 1, (60, 62, 72))
    # the ribcage: dark gaps between the ribs (front and back of the body)
    for face in ("front", "back"):
        x, y, w, h = g.faces("body")[face]
        for j in range(1, 8, 2):
            c.rect(x + 1, y + j, w - 2, 1, (40, 44, 56))
        c.rect(x + w / 2 - 0.5, y, 1, 8, bone_l)
    spots(c, rng, [r for k, r in g.faces("head").items() if k != "bottom"], 7, big=True)
    spots(c, rng, list(g.faces("body").values()), 6)
    spots(c, rng, list(g.faces("arm").values()) + list(g.faces("leg").values()), 6)
    moss_layer(c, g, p, "moss", 0.58, 5903, face_clear=True)
    moss_layer(c, g, p, "body_moss", 0.62, 5904)
    paint_mushrooms(c, g, p)
    c.save(out("textures", "entity", "zt_shroom_skeleton.png"))
    return g


def spore_bullet():
    """The glowing spore bullet: a small cube of blue light (all of it glows)."""
    g = Geo("geometry.zt.spore_bullet", 16, 16, 1, 1, (0, 0.2, 0))
    g.part("core", 3, 3, 3)
    g.part("halo", 3, 3, 3)
    g.bone("orb", pivot=(0, 1.5, 0), cubes=[g.cube("core", (-1.5, 0, -1.5)), g.cube("halo", (-1.5, 0, -1.5), inflate=0.75)])
    c = Canvas(16, g.th, CLEAR)
    for k, (x, y, w, h) in g.faces("core").items():
        c.rect(x, y, w, h, (220, 252, 255, 4))
        c.px(x + 1, y + 1, (255, 255, 255, 0))
    for k, (x, y, w, h) in g.faces("halo").items():
        c.rect(x, y, w, h, (60, 170, 255, 40))
    c.save(out("textures", "entity", "zt_spore_bullet.png"))
    return g


def main():
    glowite_ore()
    glowshroom_heart()
    raw_glowite_block()
    glowite_block()
    dirt = maroon_dirt()
    spore_grass_top()
    spore_grass_side(dirt)
    spore_grass_plant()
    spore_mushroom()
    glowshroom_log()
    glowshroom_log_top()
    mushed_spore_cap()
    planks()
    door_half(True)
    door_half(False)
    trapdoor()
    for s in range(4):
        spore_crop(s)
    glowing_particles()
    raw_glowite()
    glowite_ingot()
    gear()
    spore_seeds()
    shroom_berries()
    door_icon()
    geos = [shroom_zombie(), shroom_skeleton(), spore_bullet()]
    with open(out("models", "entity", "shroom_mobs.geo.json"), "w") as f:
        json.dump(geometry_file(*geos), f, indent="\t")
        f.write("\n")
    print("glowite art written")


if __name__ == "__main__":
    main()
