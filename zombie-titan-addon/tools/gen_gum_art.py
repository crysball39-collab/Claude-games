"""Generates the Gum Gum Fruit art: the swirly purple fruit, the icons for its
five moves, Gear 2 and the five Jet moves, and the rubber fist sprite the
Gatling particles use.

Icons are 32 x 32 and drawn procedurally (a few shapes: fists, stretched arms,
a sandal, steam), nothing is copied from anywhere.

    python3 tools/gen_gum_art.py
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texlib import Canvas  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)
N = 32

SKIN = {"d": (170, 104, 70), "m": (224, 160, 116), "l": (248, 206, 164)}
JET = {"d": (184, 60, 88), "m": (238, 116, 138), "l": (255, 178, 190)}
OUT = (52, 26, 18)
SLEEVE = {"d": (128, 18, 22), "m": (196, 34, 38), "l": (232, 84, 80)}
WHITE = (250, 250, 250)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def disc(c, cx, cy, r, color):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                c.px(x, y, color)


def shaded_disc(c, cx, cy, r, pal):
    """A ball lit from the top left."""
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy <= r * r:
                k = (dx + dy) / (2 * r)
                c.px(x, y, pal["l"] if k < -0.35 else pal["m"] if k < 0.25 else pal["d"])


def thick_line(c, x0, y0, x1, y1, w, pal):
    """A rounded bar (a stretched arm), lit along one edge."""
    length = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = -(y1 - y0) / length, (x1 - x0) / length
    for y in range(N):
        for x in range(N):
            px, py = x + 0.5, y + 0.5
            t = max(0.0, min(1.0, ((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / (length * length)))
            qx, qy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            d = math.hypot(px - qx, py - qy)
            if d <= w / 2:
                side = ((px - qx) * nx + (py - qy) * ny) / (w / 2)
                c.px(x, y, pal["l"] if side < -0.4 else pal["m"] if side < 0.45 else pal["d"])


def fist(c, cx, cy, s, pal, facing=1):
    """A clenched fist: a rounded block with four finger rolls across the front and a thumb under them."""
    for y in range(int(cy - s), int(cy + s) + 1):
        for x in range(int(cx - s), int(cx + s) + 1):
            dx, dy = (x + 0.5 - cx) / s, (y + 0.5 - cy) / s
            if max(abs(dx), abs(dy)) <= 1.0 and dx * dx + dy * dy <= 1.55:
                k = dx * 0.5 + dy * 0.6
                c.px(x, y, pal["l"] if k < -0.3 else pal["m"] if k < 0.35 else pal["d"])
    # the folded fingers: dark grooves between four rolls on the punching side
    x0 = cx + facing * s * 0.05
    for i in range(1, 4):
        gy = cy - s + i * (2 * s * 0.75) / 3.0
        for x in range(int(min(x0, x0 + facing * s * 0.95)), int(max(x0, x0 + facing * s * 0.95)) + 1):
            c.px(x, gy, pal["d"])
    # the thumb wrapped across the bottom
    for x in range(int(cx - s * 0.7), int(cx + s * 0.5)):
        c.px(x, cy + s * 0.55, pal["d"])
        c.px(x, cy + s * 0.55 - 1, pal["l"])


def palm(c, cx, cy, s, pal):
    """An open hand, fingers up, palm toward the viewer."""
    for y in range(int(cy - s * 0.3), int(cy + s)):
        for x in range(int(cx - s * 0.8), int(cx + s * 0.8)):
            dx, dy = (x + 0.5 - cx) / (s * 0.8), (y + 0.5 - cy - s * 0.3) / (s * 0.75)
            if dx * dx + dy * dy <= 1.0:
                c.px(x, y, pal["m"] if dx < 0.3 else pal["d"])
    for f in range(4):
        fx = cx - s * 0.6 + f * s * 0.4
        top = cy - s * (0.95 if f in (1, 2) else 0.75)
        for y in range(int(top), int(cy)):
            c.px(fx, y, pal["l"] if f < 2 else pal["m"])
            c.px(fx + 1, y, pal["m"])
    for y in range(int(cy), int(cy + s * 0.5)):                       # thumb
        c.px(cx - s * 0.95, y, pal["m"])


def outline(c, color=OUT):
    a = c.a
    solid = a[..., 3] > 0
    pad = np.pad(solid, 1)
    near = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    edge = near & ~solid
    a[edge] = (*color, 255)


def speed_lines(c, lines, color=WHITE, alpha=200):
    for (x0, y0, x1, y1) in lines:
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(steps):
            t = i / max(1, steps - 1)
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if 0 <= int(x) < N and 0 <= int(y) < N and c.a[int(y), int(x), 3] == 0:
                c.a[int(y), int(x)] = (*color, alpha)


def steam(c, puffs):
    for (cx, cy, r) in puffs:
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if 0 <= x < N and 0 <= y < N and (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    if c.a[y, x, 3] == 0:
                        c.a[y, x] = (244, 236, 240, 190)


def burst(c, cx, cy, r, color=(255, 236, 140)):
    for k in range(8):
        a = k * math.pi / 4
        for t in range(int(r * 0.5), int(r)):
            x, y = cx + math.cos(a) * t, cy + math.sin(a) * t
            if 0 <= int(x) < N and 0 <= int(y) < N and c.a[int(y), int(x), 3] == 0:
                c.a[int(y), int(x)] = (*color, 255)


# =============================================================================
# the fruit
# =============================================================================
def fruit_icon():
    c = Canvas(N, N, CLEAR)
    base = {"d": (74, 34, 104), "m": (128, 70, 168), "l": (176, 122, 214)}
    shaded_disc(c, 16, 18.5, 11.5, base)
    # the swirls all over a Gum Gum Fruit
    swirl = (214, 176, 240)
    for (sx, sy, turn) in ((11, 14, 1), (20, 13, -1), (16, 21, 1), (9, 22, -1), (23, 21, 1), (15, 27, -1)):
        for i in range(60):
            t = i / 60
            ang = turn * t * math.pi * 3.2
            rr = 0.6 + t * 3.0
            x, y = sx + math.cos(ang) * rr, sy + math.sin(ang) * rr
            if 0 <= int(x) < N and 0 <= int(y) < N and c.a[int(y), int(x), 3] > 0:
                c.px(x, y, swirl)
    # a shine and the curly green stem
    c.px(9, 11, (240, 226, 250))
    c.px(10, 10, (240, 226, 250))
    stem = (62, 132, 44)
    for (x, y) in ((16, 7), (16, 6), (17, 5), (18, 4), (19, 4), (20, 5), (20, 6), (19, 7), (18, 7), (18, 6)):
        c.px(x, y, stem)
    for (x, y) in ((13, 6), (12, 5), (14, 6), (13, 5)):
        c.px(x, y, (88, 168, 64))                                     # a little leaf
    outline(c, (36, 14, 52))
    c.save(out("textures", "items", "zt_gum_gum_fruit.png"))


# =============================================================================
# the moves (normal: tan skin; Jet: Gear 2 pink with steam)
# =============================================================================
def pistol(c, pal, jet):
    thick_line(c, 3, 29, 19, 13, 5, pal)
    fist(c, 22, 10, 6.5, pal)
    speed_lines(c, [(2, 20, 9, 13), (8, 30, 15, 23), (1, 25, 6, 20)])


def bazooka(c, pal, jet):
    thick_line(c, 2, 30, 10, 18, 4, pal)
    thick_line(c, 12, 31, 20, 19, 4, pal)
    palm(c, 11, 13, 6, pal)
    palm(c, 21, 14, 6, pal)
    burst(c, 26, 6, 6)


def gatling(c, pal, jet):
    for (x, y, s) in ((9, 9, 4.5), (22, 8, 4.5), (15, 17, 5.0), (7, 23, 4.5), (24, 22, 4.5), (16, 27, 3.5)):
        fist(c, x, y, s, pal)
    speed_lines(c, [(1, 4, 4, 1), (28, 30, 31, 27), (1, 30, 3, 28)])


def stamp(c, pal, jet):
    # a leg slammed straight down, seen from the side, the sandal flat on cracked ground
    thick_line(c, 12, 0, 12, 17, 7, pal)
    for y in range(15, 24):
        for x in range(7, 28):
            dx, dy = (x + 0.5 - 15.5) / 12.0, (y + 0.5 - 20.0) / 4.2
            if dx * dx + dy * dy <= 1.0:
                c.px(x, y, pal["m"] if dy < 0.2 else pal["d"])
    for x in range(5, 29):                                         # the sandal's sole
        c.px(x, 24, (132, 90, 44))
        c.px(x, 25, (96, 62, 30))
    for y in range(18, 24):                                         # its strap
        c.px(17, y, (196, 150, 64))
    for x in range(9, 18):
        c.px(x, 19, (196, 150, 64))
    # cracks and rubble flying out from under it
    for (x, y) in ((3, 28), (4, 29), (6, 30), (25, 28), (27, 29), (29, 30), (15, 28), (16, 29), (16, 31)):
        c.px(x, y, (96, 76, 58))
    for (x, y) in ((2, 22), (30, 21), (1, 26), (31, 25), (4, 18), (29, 17)):
        c.px(x, y, (140, 118, 96))


def rocket(c, pal, jet):
    thick_line(c, 4, 30, 24, 8, 4, pal)
    thick_line(c, 9, 31, 28, 12, 4, pal)
    fist(c, 25, 7, 4.0, pal)
    fist(c, 29, 11, 3.6, pal)
    speed_lines(c, [(1, 22, 6, 17), (2, 27, 9, 20), (12, 31, 17, 26)])


def gear2(c, pal, jet):
    # a fist pressed to the ground, steam pouring off it
    thick_line(c, 16, 0, 16, 18, 6, JET)
    fist(c, 16, 21, 6.0, JET)
    for x in range(2, 30):
        c.px(x, 28, (90, 70, 50))
        c.px(x, 29, (70, 52, 36))
    steam(c, [(6, 10, 3.5), (25, 12, 3.8), (8, 3, 2.6), (24, 4, 2.8), (4, 19, 2.4), (28, 20, 2.4)])


MOVES = {"pistol": pistol, "bazooka": bazooka, "gatling": gatling, "stamp": stamp, "rocket": rocket}


def move_icon(name, draw, jet):
    c = Canvas(N, N, CLEAR)
    draw(c, JET if jet else SKIN, jet)
    outline(c)
    if jet:
        steam(c, [(4, 5, 2.5), (28, 4, 2.2), (3, 14, 1.8)])
    prefix = "zt_gum_jet_" if jet else "zt_gum_"
    c.save(out("textures", "items", prefix + name + ".png"))


def gear2_icon():
    c = Canvas(N, N, CLEAR)
    gear2(c, JET, True)
    outline(c)
    c.save(out("textures", "items", "zt_gum_gear2.png"))


def particle_fist():
    """The Gatling's blurred fists (16 x 16)."""
    global N
    keep, N = N, 16
    c = Canvas(16, 16, CLEAR)
    fist(c, 8, 8, 6.0, SKIN)
    outline(c)
    c.save(out("textures", "particle", "zt_gum_fist.png"))
    N = keep


def main():
    fruit_icon()
    for name, draw in MOVES.items():
        move_icon(name, draw, False)
        move_icon(name, draw, True)
    gear2_icon()
    particle_fist()
    print("gum gum art written")


if __name__ == "__main__":
    main()
