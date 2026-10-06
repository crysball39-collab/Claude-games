"""Generates the Hotel's (Floor 1) block textures and block models, the Floor 1 item icons and
the breaker switches' boss bar.

Blocks: blue and torn wallpaper, windows onto the stormy night, wooden crates, the Infirmary's
tiled walls and floor, the elevator's panelling, hazard stripes, the elevator shaft's walls
(flipbooks that slide upward while the car goes down), ceiling lamps and wall sconces (lit, out
and smashed), paintings and signs, door 100's metal shelves, hospital curtains and EXIT signs.
The wall-mounted models sit against the back (+z) face of their block and face -z; the block's
minecraft:cardinal_direction turns them to face into the room.

Icons: the Lobby item (an elevator), room key, electrical key, lighter, flashlight, skeleton key,
crucifix, the Herb of Viridis, a breaker switch.

    python3 tools/gen_floor1_blocks.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_art import DIGITS  # noqa: E402
from gen_hotel_art import BAR_H, BAR_W, FRAME_H, FRAME_W, HX0, HY0, K, bar_back, damask  # noqa: E402
from texlib import Canvas, Painter, fbm, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)

FONT = dict(DIGITS)
FONT.update({
    "A": ["010", "101", "111", "101", "101"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
    "H": ["101", "101", "111", "101", "101"], "I": ["1", "1", "1", "1", "1"], "J": ["001", "001", "001", "101", "010"],
    "L": ["100", "100", "100", "100", "111"],
    "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"], "S": ["011", "100", "010", "001", "110"],
    "T": ["111", "010", "010", "010", "010"], "X": ["101", "101", "010", "101", "101"],
})


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def block_tex(c, name):
    c.save(out("textures", "blocks", name + ".png"))


def text(c, x, y, s, color, k=1):
    for ch in s:
        rows = FONT[ch]
        for gy, row in enumerate(rows):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.rect(x + gx * k, y + gy * k, k, k, color)
        x += (len(rows[0]) + 1) * k


def width(s, k=1):
    return (sum(len(FONT[ch][0]) + 1 for ch in s) - 1) * k


def shade(col, k):
    return tuple(int(max(0, min(255, v * k))) for v in col[:3])


# =============================================================================================
# full blocks
# =============================================================================================
def wallpapers():
    block_tex(damask((28, 40, 72), (48, 66, 108), (168, 148, 92), 3401), "zt_hotel_wallpaper_blue")
    # the abandoned hotel: faded, peeling red wallpaper, slashed by claws
    c = damask((70, 30, 30), (96, 46, 42), (130, 104, 70), 3403)
    p = Painter(c, seed=3405)
    p.blotches(0, 0, 16, 16, (128, 112, 92), threshold=0.7, alpha=0.85)     # torn patches: the plaster beneath
    p.blotches(0, 0, 16, 16, (40, 26, 20), threshold=0.74, field=p.n1, alpha=0.5)   # damp stains
    for k in range(3):                       # three parallel claw scratches
        for t in range(9):
            x, y = 5 + k * 2 + t // 4, 3 + t
            c.px(x, y, (30, 16, 12))
            c.blend_px(x + 1, y, (150, 120, 100), 0.5)
    block_tex(c, "zt_hotel_wallpaper_torn")


def window():
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3411)
    p.material(0, 0, 16, 16, (36, 18, 10), (58, 30, 16), (80, 44, 26), contrast=1.0)
    # four panes of night: a dark sky with storm clouds and rain streaks
    n = fbm(16, 16, 3413, cell=6, octaves=3)
    rng = np.random.default_rng(3415)
    for x0, y0 in ((2, 2), (9, 2), (2, 9), (9, 9)):
        for y in range(y0, y0 + 5):
            for x in range(x0, x0 + 5):
                k = n[y, x]
                c.px(x, y, (int(10 + 26 * k), int(14 + 30 * k), int(30 + 46 * k)))
        for _ in range(3):
            rx, ry = x0 + int(rng.integers(0, 5)), y0 + int(rng.integers(0, 3))
            c.blend_px(rx, ry, (150, 170, 200), 0.45)
            c.blend_px(rx, ry + 1, (150, 170, 200), 0.3)
        c.px(x0, y0, (70, 84, 110))              # a glint in the corner
    c.rect(0, 0, 16, 1, (96, 58, 34))
    c.rect(0, 15, 16, 1, (24, 12, 6))
    block_tex(c, "zt_hotel_window")


def crate():
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3421)
    p.material(0, 0, 16, 16, (90, 62, 32), (124, 90, 50), (156, 118, 70), contrast=1.0, grain=0.15)
    for y in (5, 10):
        c.rect(0, y, 16, 1, (70, 46, 22))                       # gaps between the planks
    for k in range(16):                                         # the diagonal brace
        c.rect(k, 15 - k, 2, 1, (104, 72, 38))
        c.px(k, 16 - k, (66, 42, 20))
    c.rect(0, 0, 16, 2, (98, 68, 34))                            # the frame
    c.rect(0, 14, 16, 2, (98, 68, 34))
    c.rect(0, 0, 2, 16, (98, 68, 34))
    c.rect(14, 0, 2, 16, (98, 68, 34))
    for x, y in ((0, 0), (14, 0), (0, 14), (14, 14)):
        c.px(x + 1, y + 1, (40, 40, 44))                          # nails
    block_tex(c, "zt_wooden_crate")
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3423)
    p.material(0, 0, 16, 16, (90, 62, 32), (124, 90, 50), (156, 118, 70), contrast=1.0, grain=0.15)
    for x in (4, 8, 12):
        c.rect(x, 0, 1, 16, (66, 42, 20))
    c.rect(0, 0, 16, 1, (98, 68, 34))
    c.rect(0, 15, 16, 1, (66, 42, 20))
    block_tex(c, "zt_wooden_crate_top")


def infirmary():
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3431)
    p.material(0, 0, 16, 16, (176, 192, 178), (196, 210, 196), (214, 226, 212), contrast=0.5, grain=0.08)
    for k in range(0, 16, 4):
        c.rect(k, 0, 1, 16, (150, 160, 150))
        c.rect(0, k, 16, 1, (150, 160, 150))
    p.blotches(0, 0, 16, 16, (150, 150, 120), threshold=0.7, alpha=0.4)       # old grime
    block_tex(c, "zt_hospital_wall")
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3433)
    for y in range(2):
        for x in range(2):
            col = ((196, 196, 192), (226, 226, 220), (232, 232, 226)) if (x + y) % 2 == 0 else \
                ((120, 122, 124), (142, 144, 146), (160, 162, 164))
            p.material(x * 8, y * 8, 8, 8, *col, contrast=0.5, grain=0.06)
    p.blotches(0, 0, 16, 16, (110, 100, 80), threshold=0.72, alpha=0.4)
    block_tex(c, "zt_hospital_floor")


def elevator_panel():
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3441)
    p.material(0, 0, 16, 16, (40, 22, 12), (62, 34, 18), (84, 48, 28), contrast=1.0, grain=0.1)
    gold = (196, 156, 72)
    c.rect(0, 0, 16, 1, gold)
    c.rect(1, 2, 14, 1, (150, 116, 54))
    c.rect(1, 2, 1, 12, (150, 116, 54))
    c.rect(14, 2, 1, 12, (90, 66, 30))
    c.rect(1, 13, 14, 1, (90, 66, 30))
    for k in range(4):                        # an art deco diamond in the middle of the panel
        for x, y in ((7 - k, 4 + k), (8 + k, 4 + k), (7 - k, 11 - k), (8 + k, 11 - k)):
            c.px(x, y, gold)
    c.rect(7, 7, 2, 2, (150, 116, 54))
    c.rect(0, 15, 16, 1, (24, 12, 6))
    block_tex(c, "zt_elevator_panel")


def hazard():
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3451)
    p.material(0, 0, 16, 16, (180, 140, 20), (214, 172, 34), (236, 200, 60), contrast=0.6, grain=0.1)
    for y in range(16):
        for x in range(16):
            if (x + y) % 8 < 4:
                c.px(x, y, (26, 24, 22))
    p.blotches(0, 0, 16, 16, (90, 80, 60), threshold=0.68, alpha=0.5)          # scuffs
    block_tex(c, "zt_hazard_stripes")


def shaft():
    """The elevator shaft: concrete with a steel beam and cables; frames slide the wall upward."""
    base = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(base, seed=3461)
    p.material(0, 0, 16, 16, (40, 40, 42), (58, 58, 60), (76, 76, 78), contrast=1.0, grain=0.15)
    base.rect(0, 6, 16, 3, (30, 32, 36))
    base.rect(0, 6, 16, 1, (70, 72, 78))
    for x in (1, 6, 11):
        base.px(x, 7, (110, 112, 118))
    base.rect(3, 0, 1, 16, (22, 22, 24))
    base.rect(12, 0, 1, 16, (22, 22, 24))
    for frames, step, name in ((16, 1, "zt_shaft_wall"), (8, 2, "zt_shaft_wall_fast")):
        strip = Canvas(16, 16 * frames, (0, 0, 0, 255))
        for f in range(frames):
            strip.a[f * 16:(f + 1) * 16] = np.roll(base.a, -f * step, axis=0)
        block_tex(strip, name)


def invisible():
    block_tex(Canvas(16, 16, CLEAR), "zt_invisible")


# =============================================================================================
# block models (16 x 16 textures, per-face uv)
# =============================================================================================
def face(u, v, w, h):
    return {"uv": [u, v], "uv_size": [w, h]}


def bcube(origin, size, faces):
    return {"origin": list(origin), "size": list(size), "uv": {k: face(*v) for k, v in faces.items()}}


def sides(u, v, w, h):
    return {k: (u, v, w, h) for k in ("north", "east", "south", "west")}


def block_geo(ident, cubes, tw=16, th=16):
    return {"format_version": "1.21.0", "minecraft:geometry": [{
        "description": {"identifier": ident, "texture_width": tw, "texture_height": th},
        "bones": [{"name": "block", "pivot": [0, 0, 0], "cubes": cubes}]}]}


def write_model(name, data):
    with open(out("models", "blocks", name + ".geo.json"), "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def models():
    # a lamp hanging from the ceiling: rod, canopy, shade, bulb
    write_model("ceiling_lamp", block_geo("geometry.zt.ceiling_lamp", [
        bcube((-0.5, 11, -0.5), (1, 5, 1), sides(0, 0, 1, 5)),
        bcube((-2, 15, -2), (4, 1, 4), dict(sides(1, 4, 4, 1), down=(1, 0, 4, 4))),
        bcube((-4, 8, -4), (8, 3, 8), dict(sides(5, 0, 8, 3), up=(5, 4, 8, 8), down=(5, 4, 8, 8))),
        bcube((-1.5, 7, -1.5), (3, 2, 3), dict(sides(0, 12, 3, 2), down=(0, 12, 3, 3))),
    ]))
    # a sconce on the wall behind it: back plate, arm, shade, bulb
    write_model("wall_lamp", block_geo("geometry.zt.wall_lamp", [
        bcube((-1.5, 5, 7), (3, 6, 1), dict(north=(0, 0, 3, 6), east=(3, 0, 1, 6), west=(3, 0, 1, 6), up=(0, 0, 3, 1), down=(0, 5, 3, 1))),
        bcube((-0.5, 7, 4), (1, 1, 3), dict(sides(4, 0, 1, 1), up=(4, 0, 1, 3), down=(4, 0, 1, 3))),
        bcube((-2.5, 9, 2.5), (5, 4, 5), dict(sides(5, 0, 5, 4), up=(10, 0, 5, 5), down=(5, 4, 5, 5))),
        bcube((-1, 8, 4), (2, 2, 2), dict(sides(0, 8, 2, 2), down=(0, 8, 2, 2))),
    ]))
    # a framed picture on the wall behind it
    write_model("painting", block_geo("geometry.zt.painting", [
        bcube((-7, 1, 7), (14, 14, 1), dict(north=(1, 1, 14, 14), east=(0, 1, 1, 14), west=(15, 1, 1, 14), up=(1, 0, 14, 1),
                                            down=(1, 15, 14, 1))),
    ]))
    # door 100's grey metal shelving: four posts and three shelves (and the one on top)
    posts = [bcube((x, 0, z), (1, 16, 1), dict(sides(0, 0, 1, 16), up=(0, 0, 1, 1), down=(0, 0, 1, 1)))
             for x in (-8, 7) for z in (-8, 7)]
    shelves = [bcube((-8, y, -8), (16, 1, 16), dict(sides(0, 15, 16, 1), up=(0, 0, 16, 16), down=(0, 0, 16, 16)))
               for y in (0, 5, 10, 15)]
    write_model("metal_shelf", block_geo("geometry.zt.metal_shelf", posts + shelves))
    # a hospital curtain: a cloth panel across the middle of the block
    write_model("curtain", block_geo("geometry.zt.curtain", [
        bcube((-8, 0, -0.5), (16, 16, 1), dict(north=(0, 0, 16, 16), south=(0, 0, 16, 16), east=(0, 0, 1, 16), west=(15, 0, 1, 16),
                                               up=(0, 0, 16, 1), down=(0, 15, 16, 1))),
    ]))
    # an EXIT sign on the wall behind it
    write_model("exit_sign", block_geo("geometry.zt.exit_sign", [
        bcube((-7, 5, 6), (14, 6, 2), dict(north=(1, 1, 14, 6), east=(0, 9, 2, 6), west=(0, 9, 2, 6), up=(1, 9, 14, 2),
                                           down=(1, 9, 14, 2))),
    ]))


def lamps():
    def ceiling(state):
        c = Canvas(16, 16, CLEAR)
        p = Painter(c, seed=3471)
        brass = ((90, 64, 24), (150, 112, 46), (200, 160, 80))
        p.material(0, 0, 1, 5, *brass)                       # rod
        p.material(1, 0, 4, 5, *brass)                       # canopy
        # the shade: cream glass, glowing when lit
        glass = {"on": ((220, 190, 120), (246, 222, 160), (255, 244, 210)), "off": ((92, 84, 70), (120, 110, 92), (142, 132, 112)),
                 "broken": ((70, 62, 52), (96, 86, 72), (118, 106, 90))}[state]
        p.material(5, 0, 8, 3, *glass, contrast=0.6)
        c.rect(5, 2, 8, 1, brass[1])
        # the underside: the bulb's glow through the opening
        p.material(5, 4, 8, 8, *glass, contrast=0.6)
        yy, xx = np.mgrid[0:8, 0:8]
        d = np.hypot(xx + 0.5 - 4, yy + 0.5 - 4)
        reg = c.a[4:12, 5:13]
        if state == "on":
            reg[d < 2.6, :3] = (255, 250, 228)
        elif state == "off":
            reg[d < 2.6, :3] = (60, 56, 50)
        else:
            reg[d < 2.6, :3] = (34, 30, 28)
            for x, y in ((1, 2), (5, 1), (6, 5), (2, 6), (4, 3)):
                c.px(5 + x, 4 + y, (24, 22, 20))              # cracks and holes
        c.rect(5, 4, 8, 1, brass[0])
        bulb = {"on": (255, 248, 220), "off": (120, 116, 104), "broken": (40, 36, 34)}[state]
        c.rect(0, 12, 3, 3, bulb)
        if state == "broken":
            c.px(1, 13, (90, 84, 76))                          # the jagged stump of the bulb
        block_tex(c, "zt_lamp_" + state)

    def sconce(state):
        c = Canvas(16, 16, CLEAR)
        p = Painter(c, seed=3473)
        brass = ((90, 64, 24), (150, 112, 46), (200, 160, 80))
        p.material(0, 0, 4, 6, *brass)                       # back plate and its sides
        c.rect(1, 1, 1, 4, brass[2])
        p.material(4, 0, 1, 3, *brass)                       # arm
        shade = {"on": ((200, 120, 60), (236, 170, 96), (255, 214, 150)), "off": ((70, 40, 24), (98, 58, 34), (120, 76, 46)),
                 "broken": ((50, 30, 20), (72, 44, 28), (90, 58, 38))}[state]
        p.material(5, 0, 5, 4, *shade, contrast=0.7)            # fabric shade (glows warm when lit)
        p.material(10, 0, 5, 5, *shade, contrast=0.7)
        p.material(5, 4, 5, 5, *shade, contrast=0.7)
        glow = {"on": (255, 244, 210), "off": (70, 64, 56), "broken": (30, 26, 24)}[state]
        c.rect(6, 5, 3, 3, glow)
        if state == "broken":
            c.px(5, 1, (30, 20, 14))                            # torn shade
            c.px(8, 2, (30, 20, 14))
        c.rect(0, 8, 2, 2, glow)
        block_tex(c, "zt_sconce_" + state)

    for s in ("on", "off", "broken"):
        ceiling(s)
        sconce(s)


def shelf_and_curtain():
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3481)
    p.material(0, 0, 16, 16, (92, 96, 100), (124, 128, 134), (156, 160, 166), contrast=0.6, grain=0.08)
    for y in range(2, 14, 3):                 # perforations
        for x in range(2, 14, 3):
            c.px(x, y, (60, 62, 66))
    c.rect(0, 0, 1, 16, (84, 88, 92))         # the posts' column (and the shelves' lip)
    c.rect(0, 15, 16, 1, (70, 74, 80))
    p.blotches(0, 0, 16, 16, (110, 80, 50), threshold=0.72, alpha=0.5)        # rust
    block_tex(c, "zt_metal_shelf")

    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=3483)
    p.material(0, 0, 16, 16, (150, 178, 176), (176, 202, 198), (198, 220, 216), contrast=0.5, grain=0.06)
    for x in range(16):                        # folds
        k = 0.82 + 0.18 * np.cos(x * np.pi / 2.5)
        c.a[:, x, :3] *= k
    c.rect(0, 0, 16, 1, (120, 140, 140))
    p.blotches(0, 0, 16, 16, (150, 140, 110), threshold=0.72, alpha=0.4)     # stains
    block_tex(c, "zt_curtain")

    c = Canvas(32, 32, CLEAR)          # 32 x 32: the model's face spans (1, 1)-(15, 7) of its 16 x 16 uv space
    c.rect(2, 2, 28, 12, (16, 8, 8))
    c.rect(2, 2, 28, 1, (110, 24, 24))
    c.rect(2, 13, 28, 1, (110, 24, 24))
    text(c, 16 - width("EXIT", 2) // 2, 3, "EXIT", (255, 60, 50), 2)
    c.rect(0, 18, 32, 4, (52, 54, 58))
    c.rect(0, 18, 4, 14, (52, 54, 58))
    block_tex(c, "zt_exit_sign")


def paintings():
    def framed(name, paint, frame=((120, 86, 30), (186, 146, 62), (226, 192, 104)), k=1):
        """A picture in a frame. k = 2 draws it at 32 x 32 (the model's uvs are the same; signs need the detail)."""
        n = 16 * k
        c = Canvas(n, n, CLEAR)
        p = Painter(c, seed=3491 + len(name))
        p.material(0, 0, n, n, *frame, contrast=0.8)
        paint(c, p)
        # the frame's bevel round the picture (rows/columns 1 and 14 of the face)
        c.rect(k, k, 14 * k, k, frame[2])
        c.rect(k, k, k, 14 * k, frame[2])
        c.rect(k, 14 * k, 14 * k, k, frame[0])
        c.rect(14 * k, k, k, 14 * k, frame[0])
        block_tex(c, name)

    def landscape(c, p):
        for y in range(2, 14):
            t = (y - 2) / 11
            c.rect(2, y, 12, 1, (int(40 + 60 * t), int(50 + 50 * t), int(90 + 30 * t)))       # dusk sky
        for x in range(2, 14):
            h = int(8 + 2 * np.sin(x * 0.9) + (x % 3 == 0))
            c.rect(x, h, 1, 14 - h, (40, 56, 40))                                              # hills
        c.rect(2, 12, 12, 2, (30, 42, 30))
        c.px(10, 4, (230, 220, 170))                                                            # the moon

    def portrait(c, p):
        p.material(2, 2, 12, 12, (30, 20, 16), (44, 30, 22), (58, 40, 30), contrast=0.6)
        c.rect(5, 10, 6, 4, (24, 24, 30))          # dark coat
        c.rect(6, 4, 4, 5, (170, 130, 110))        # face
        c.rect(6, 3, 4, 2, (40, 28, 20))           # hair
        c.px(7, 6, (20, 14, 12))
        c.px(9, 6, (20, 14, 12))
        c.rect(7, 8, 2, 1, (110, 60, 50))
        c.rect(7, 9, 2, 1, (180, 180, 176))        # collar

    def flowers(c, p):
        p.material(2, 2, 12, 12, (40, 36, 30), (56, 50, 42), (70, 64, 54), contrast=0.5)
        c.rect(6, 10, 4, 4, (90, 110, 140))        # vase
        c.rect(7, 9, 2, 1, (90, 110, 140))
        for x, y, col in ((5, 5, (190, 40, 50)), (8, 4, (230, 200, 70)), (10, 6, (200, 90, 140)), (7, 6, (240, 240, 230))):
            c.rect(x, y, 2, 2, col)
            c.px(x + 1, y + 2, (50, 100, 50))
            c.px(x + 1, y + 3, (50, 100, 50))

    def key_rack(c, p):
        p.material(2, 2, 12, 12, (44, 22, 12), (66, 34, 20), (88, 48, 28), contrast=1.0)
        for y in (4, 9):
            for x in range(3, 13, 3):
                c.px(x + 1, y, (200, 160, 80))                 # brass hooks
                c.px(x + 1, y + 1, (150, 112, 46))
                if (x + y) % 2:
                    c.rect(x + 1, y + 2, 1, 2, (190, 150, 60))  # a key on most hooks
                    c.px(x, y + 2, (226, 214, 180))             # its tag

    def torn(c, p):
        landscape(c, p)
        for k in range(3):                                     # slashed canvas hanging off the frame
            for t in range(11):
                c.px(4 + k * 3 + t // 4, 2 + t, (20, 14, 12))
        p.blotches(2, 2, 12, 12, (50, 40, 30), threshold=0.6, alpha=0.7)

    def jeff(c, p):
        # 32 x 32: a dark blue board, JEFF in glowing blue over SHOP in gold, a gold coin between
        c.rect(4, 4, 24, 24, (14, 18, 46))
        p.blotches(4, 4, 24, 24, (24, 30, 70), threshold=0.6, alpha=0.6)
        text(c, 16 - width("JEFF") // 2, 7, "JEFF", (120, 200, 255))
        text(c, 16 - width("SHOP") // 2, 20, "SHOP", (250, 214, 110))
        for x in range(13, 19):
            for y in range(13, 18):
                if (x - 15.5) ** 2 / 9 + (y - 15) ** 2 / 6.25 <= 1:
                    c.px(x, y, (236, 190, 60))
        c.px(15, 15, (150, 100, 20))

    def hotel(c, p):
        # 32 x 32: the hotel's crest, HOTEL under an H in a laurel
        c.rect(4, 4, 24, 24, (60, 16, 20))
        c.rect(6, 6, 20, 20, (90, 24, 28))
        text(c, 16 - width("H", 2) // 2, 7, "H", (230, 196, 110), 2)
        for t in range(6):
            c.px(9 + (t < 2), 16 - t, (110, 150, 80))
            c.px(22 - (t < 2), 16 - t, (110, 150, 80))
        text(c, 16 - width("HOTEL") // 2, 20, "HOTEL", (230, 196, 110))

    framed("zt_painting_0", landscape)
    framed("zt_painting_1", portrait)
    framed("zt_painting_2", flowers)
    framed("zt_key_rack", key_rack, frame=((40, 20, 10), (62, 32, 18), (86, 46, 26)))
    framed("zt_painting_torn", torn, frame=((70, 52, 24), (110, 86, 40), (140, 112, 60)))
    framed("zt_sign_jeff", jeff, frame=((10, 14, 30), (24, 34, 70), (60, 80, 140)), k=2)
    framed("zt_sign_hotel", hotel, k=2)


# =============================================================================================
# item icons (16 x 16)
# =============================================================================================
def icon(name, rows, palette):
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                c.px(x, y, palette[ch])
    c.save(out("textures", "items", name + ".png"))


ICONS = {
    # the Lobby: an elevator, doors shut, its floor lamp lit
    "zt_doors_floor1": ([
        "................",
        "....oooooooo....",
        "...oyyyyyyyyo...",
        "...o..o1o...o...",
        "...oyyyyyyyyo...",
        "...obbbbBbbbo...",
        "...obddbBbddo...",
        "...obdbbBbbdo...",
        "...obbbbBbbbo...",
        "...obbbbBbbbo...",
        "...obdbbBbbdo...",
        "...obddbBbddo...",
        "...obbbbBbbbo...",
        "...oyyyyyyyyo...",
        "....oooooooo....",
        "................",
    ], {"o": (40, 24, 10), "y": (210, 170, 80), "1": (255, 230, 140), "b": (150, 112, 50), "B": (60, 40, 16), "d": (196, 156, 72)}),
    "zt_room_key": ([
        "................",
        "...ooo..........",
        "..oyyyo.........",
        ".oyo.oyo........",
        ".oy...yo........",
        ".oyo.oyo........",
        "..oyyyyo........",
        "...oooyyo.......",
        "......oyyo......",
        ".......oyyo.....",
        "........oyyo.o..",
        ".........oyyoyo.",
        "..ttt.....oyyyo.",
        "..tTt......oyo..",
        "..ttt...........",
        "................",
    ], {"o": (90, 60, 10), "y": (236, 196, 70), "t": (226, 214, 180), "T": (160, 40, 30)}),
    "zt_electrical_key": ([
        "................",
        "...ooo..........",
        "..oggo o........",
        ".ogo.ogo........",
        ".og...go........",
        ".ogo.ogo........",
        "..ogggoo........",
        "...ooogg........",
        "......oggo......",
        ".......oggo.....",
        "........oggo.o..",
        ".........oggogo.",
        "..yyy.....ogggo.",
        "..yEy......ogo..",
        "..yyy...........",
        "................",
    ], {"o": (40, 42, 46), "g": (160, 164, 170), "y": (230, 190, 40), "E": (20, 20, 20), " ": (40, 42, 46)}),
    "zt_lighter": ([
        "................",
        ".......Y........",
        "......YyY.......",
        "......yOy.......",
        ".......y........",
        ".....ssss.......",
        ".....sSss.......",
        ".....rrrr.......",
        ".....rRrr.......",
        ".....rRrr.......",
        ".....rRrr.......",
        ".....rRrr.......",
        ".....rrrr.......",
        ".....dddd.......",
        "................",
        "................",
    ], {"Y": (255, 236, 120), "y": (255, 170, 40), "O": (255, 250, 220), "s": (170, 174, 180), "S": (230, 232, 236),
        "r": (170, 26, 22), "R": (220, 70, 60), "d": (90, 14, 12)}),
    "zt_flashlight": ([
        "................",
        "...........yy...",
        "..........yYYy..",
        ".........ooYYy..",
        "........oGGoy...",
        ".......oGgGo....",
        "......oGgGo.....",
        ".....oGgGo......",
        "....oGgGo.......",
        "...oGgGo........",
        "..oGgGo.........",
        "..ogGo..........",
        "..ooo...........",
        "................",
        "................",
        "................",
    ], {"y": (255, 230, 120), "Y": (255, 252, 220), "o": (20, 20, 22), "G": (70, 72, 78), "g": (120, 124, 130)}),
    "zt_skeleton_key": ([
        "................",
        "..ooooo.........",
        ".obbbbbo........",
        ".obkbkbo........",
        ".obbbbbo........",
        "..obkbo.........",
        "...obbo.........",
        "....obbo........",
        ".....obbo.......",
        "......obbo......",
        ".......obbo.o...",
        "........obbobo..",
        ".........obbbo..",
        "..........obo...",
        "...........o....",
        "................",
    ], {"o": (60, 52, 40), "b": (226, 218, 190), "k": (30, 24, 20)}),
    "zt_crucifix": ([
        "................",
        ".......oo.......",
        "......oyyo......",
        "......oyYo......",
        "...ooooyYoooo...",
        "..oyyyyyYyyyyo..",
        "..oYYYYYYYYYYo..",
        "...ooooyYoooo...",
        "......oyYo......",
        "......oyYo......",
        "......oyYo......",
        "......oyYo......",
        "......oyYo......",
        "......oyYo......",
        ".......oo.......",
        "................",
    ], {"o": (90, 56, 14), "y": (220, 176, 60), "Y": (255, 230, 130)}),
    "zt_herb_of_viridis": ([
        "................",
        ".......L........",
        "......LgL.......",
        "...L..LgL..L....",
        "..LgL..g..LgL...",
        "..LggL.g.LggL...",
        "...LggLgLggL....",
        "....LLggLL......",
        ".......g........",
        "..L....g....L...",
        ".LgL...g...LgL..",
        ".LggL..g..LggL..",
        "..LLgg.g.ggLL...",
        "......ggg.......",
        ".......s........",
        "................",
    ], {"L": (120, 240, 140), "g": (40, 150, 60), "s": (90, 60, 30)}),
    "zt_breaker_switch": ([
        "................",
        "................",
        "........RR......",
        ".......RrrR.....",
        ".......RrrR.....",
        "........RRs.....",
        ".........ss.....",
        "....ppppppsp....",
        "....pPPPPssp....",
        "....pPPPPPPp....",
        "....pPPkkPPp....",
        "....pPPkkPPp....",
        "....pPPPPPPp....",
        "....pppppppp....",
        "................",
        "................",
    ], {"R": (150, 16, 14), "r": (230, 70, 60), "s": (150, 154, 160), "p": (24, 24, 28), "P": (58, 60, 66), "k": (14, 14, 16)}),
}


def icons():
    for name, (rows, pal) in ICONS.items():
        assert len(rows) == 16 and all(len(r) == 16 for r in rows), name
        icon(name, rows, pal)


# =============================================================================================
# the breaker switches' boss bar: hazard stripes round an electric-yellow meter
# =============================================================================================
def switch_bar():
    bar_back("switch", (16, 14, 6))
    w, h = BAR_W * K, BAR_H * K
    n = fbm(w, h, 3501, cell=5, octaves=3)
    arr = np.zeros((h, w, 4))
    c0, c1 = np.array((220, 170, 20)), np.array((255, 240, 120))
    arr[..., :3] = c0 + (c1 - c0) * (0.3 + 0.6 * n[..., None])
    arr[:K, :, :3] = arr[:K, :, :3] * 0.4 + 255 * 0.6
    arr[-K:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "switch_bar_fill.png"))

    W, H = FRAME_W * K, FRAME_H * K
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = HX0 * K, HY0 * K, (HX0 + BAR_W) * K, (HY0 + BAR_H) * K
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 3 * K) & (xx < hx1 + 3 * K) & (yy >= hy0 - 3 * K) & (yy < hy1 + 3 * K)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    stripe = ((xx + yy) // (3 * K)) % 2 == 0
    fr[frame & stripe, :3] = (226, 182, 30)
    fr[frame & ~stripe, :3] = (24, 22, 20)
    fr[frame, 3] = 255
    inner = frame & (xx >= hx0 - K) & (xx < hx1 + K) & (yy >= hy0 - K) & (yy < hy1 + K)
    fr[inner, :3] = (8, 8, 8)
    edge = band & ~((xx >= hx0 - 2 * K) & (xx < hx1 + 2 * K) & (yy >= hy0 - 2 * K) & (yy < hy1 + 2 * K))
    fr[edge, :3] *= 0.55
    # a lightning bolt on a black plate at each end
    bolt = ["..##", ".##.", "####", ".##.", "##..", "#..."]
    for cx in (hx0 - 4 * K, hx1 + 4 * K):
        cy = (hy0 + hy1) // 2
        plate = (np.abs(xx + 0.5 - cx) <= 4 * K) & (np.abs(yy + 0.5 - cy) <= 5 * K)
        fr[plate, :3] = (20, 20, 22)
        fr[plate, 3] = 255
        fr[plate & ~((np.abs(xx + 0.5 - cx) <= 3 * K) & (np.abs(yy + 0.5 - cy) <= 4 * K)), :3] = (226, 182, 30)
        for by, row in enumerate(bolt):
            for bx, ch in enumerate(row):
                if ch == "#":
                    x0 = int(cx - 2 * K + bx * K)
                    y0 = int(cy - 3 * K + by * K)
                    fr[y0:y0 + K, x0:x0 + K, :3] = (255, 230, 80)
    to_image(fr).save(out("textures", "ui", "zt", "switch_bar_frame.png"))


# =============================================================================================
# particle textures: Hide's eyes, a link of the Guiding Light's chains
# =============================================================================================
def particle_textures():
    c = Canvas(32, 16, CLEAR)
    for cx in (8, 24):                     # two pale, staring eyes
        for y in range(16):
            for x in range(cx - 7, cx + 8):
                d = ((x + 0.5 - cx) / 7.0) ** 2 + ((y + 0.5 - 8) / 3.6) ** 2
                if d <= 1.0:
                    c.px(x, y, (230, 226, 214) if d < 0.75 else (120, 20, 20))
        c.rect(cx - 1, 6, 2, 4, (10, 6, 6))                  # pupils
        c.px(cx - 1, 6, (255, 255, 255))
    c.save(out("textures", "particle", "zt_eyes.png"))
    c = Canvas(16, 16, CLEAR)
    for y in range(16):                     # a chain link, standing up
        for x in range(16):
            d = ((x + 0.5 - 8) / 5.5) ** 2 + ((y + 0.5 - 8) / 7.5) ** 2
            if 0.45 <= d <= 1.0:
                c.px(x, y, (255, 255, 255) if d < 0.8 else (180, 210, 255))
    c.save(out("textures", "particle", "zt_chain.png"))


def main():
    particle_textures()
    wallpapers()
    window()
    crate()
    infirmary()
    elevator_panel()
    hazard()
    shaft()
    invisible()
    models()
    lamps()
    shelf_and_curtain()
    paintings()
    icons()
    switch_bar()
    print("floor 1 blocks, icons and bar written")


if __name__ == "__main__":
    main()
