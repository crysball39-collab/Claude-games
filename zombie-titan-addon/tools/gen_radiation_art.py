"""Generates the art of radiation: the Hazmat Suit (worn, and its icons), the Radiation Detector,
the Radiation Zombie (its model and glowing skin) and the radioactive spit it throws.

The hazmat suit covers all of you: a yellow hood with a dark visor and a filter, a suit with a
zip down its front and the radiation sign on its chest, black gloves and boots. It's drawn at
twice the vanilla armor's resolution (128 x 64). Mob skins use entity_emissive_alpha: pixels
with a low alpha glow.

    python3 tools/gen_radiation_art.py
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from geobuild import Geo, geometry_file  # noqa: E402
from gen_nuke_art import trefoil  # noqa: E402
from texlib import Canvas, Painter, box_faces, fbm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)

HZ_D, HZ_M, HZ_L = (176, 136, 20), (226, 184, 36), (246, 214, 84)
RUBBER_D, RUBBER_M, RUBBER_L = (18, 18, 20), (36, 36, 40), (62, 62, 68)
GLASS_D, GLASS_L = (20, 34, 40), (120, 170, 180)
GLOW = (120, 255, 90, 10)            # radioactive green, glowing (low alpha)
GLOW_SOFT = (70, 200, 60, 70)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================
# The hazmat suit, worn: the standard armor layout (64 x 32 units), drawn at 2x
# =============================================================================
K = 2
HEAD = (0, 0, 8, 8, 8)
BODY = (16, 16, 8, 12, 4)
ARM = (40, 16, 4, 12, 4)
LEG = (0, 16, 4, 12, 4)


def faces(box):
    return {k: tuple(int(v * K) for v in r) for k, r in box_faces(*box).items()}


def suit(c, p, rect, dark=False):
    x, y, w, h = rect
    if dark:
        p.material(x, y, w, h, RUBBER_D, RUBBER_M, RUBBER_L, contrast=0.6)
    else:
        p.material(x, y, w, h, HZ_D, HZ_M, HZ_L, contrast=0.7)
        # folds in the rubberised cloth
        for yy in range(y + 3 * K, y + h, 5 * K):
            c.rect(x, yy, w, 1, HZ_D)
    p.shade_edges(x, y, w, h, 0.18)


def hazmat_layer(layer):
    c = Canvas(64 * K, 32 * K, CLEAR)
    p = Painter(c, 8101 + layer)
    if layer == 1:
        # the hood: yellow all round, a dark visor and a filter on the front
        for side, r in faces(HEAD).items():
            suit(c, p, r)
            if side in ("right", "left"):
                c.rect(r[0], r[1] + 4 * K, r[2], K, RUBBER_M)            # the mask's strap
        fx, fy, fw, fh = faces(HEAD)["front"]
        c.rect(fx + 1 * K, fy + 2 * K, 6 * K, 3 * K, RUBBER_D)          # the visor's frame
        c.rect(fx + 1 * K + 1, fy + 2 * K + 1, 6 * K - 2, 3 * K - 2, GLASS_D)
        for i in range(3):
            c.px(fx + 2 * K + i, fy + 2 * K + 1 + i, GLASS_L)            # a glint on the glass
        cx, cy = fx + 4 * K, fy + 6.5 * K
        for yy in range(int(cy - 1.6 * K), int(cy + 1.6 * K)):
            for xx in range(int(cx - 1.6 * K), int(cx + 1.6 * K)):
                d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / (1.6 * K)
                if d <= 1:
                    c.px(xx, yy, RUBBER_L if d > 0.75 else (RUBBER_M if (xx + yy) % 2 else RUBBER_D))   # the filter
        # the suit: a zip down the front, the radiation sign on the chest
        for side, r in faces(BODY).items():
            suit(c, p, r)
        bx, by, bw, bh = faces(BODY)["front"]
        c.rect(bx + bw // 2 - 1, by, 2, bh, RUBBER_D)
        trefoil(c, bx + 2.2 * K, by + 3 * K, 1.6 * K, HZ_L, RUBBER_D)
        # the sleeves, black gloves at their ends
        for side, (x, y, w, h) in faces(ARM).items():
            if side == "bottom":
                suit(c, p, (x, y, w, h), dark=True)
                continue
            suit(c, p, (x, y, w, h))
            if side != "top":
                suit(c, p, (x, y + h - 3 * K, w, 3 * K), dark=True)
        # the boots: black rubber up the shins
        for side, (x, y, w, h) in faces(LEG).items():
            if side == "top":
                continue
            if side == "bottom":
                suit(c, p, (x, y, w, h), dark=True)
            else:
                suit(c, p, (x, y + 7 * K, w, h - 7 * K), dark=True)
                c.rect(x, y + 7 * K, w, 1, RUBBER_L)
    else:
        # the trousers: the hips and the legs, all the way down
        for side, (x, y, w, h) in faces(BODY).items():
            if side in ("top",):
                continue
            if side == "bottom":
                suit(c, p, (x, y, w, h))
            else:
                suit(c, p, (x, y + 8 * K, w, h - 8 * K))
                c.rect(x, y + 8 * K, w, K, RUBBER_M)                    # a belt
        for side, r in faces(LEG).items():
            suit(c, p, r)
    return c


ICONS = {
    "helmet": [
        "................",
        "................",
        "....kkkkkkk.....",
        "...kyyyyyyyk....",
        "..kyYyyyyyyyk...",
        "..kyyggggggyk...",
        "..kyggGgggggk...",
        "..kyyggggggyk...",
        "..kyyyyyyyyyk...",
        "..kyyyyfffyyk...",
        "...kyyfFFfyk....",
        "....kkfffkk.....",
        "......kkk.......",
        "................",
        "................",
        "................",
    ],
    "chestplate": [
        "................",
        "..kkkk....kkkk..",
        ".kyYyyk..kyyyyk.",
        ".kyyyyykkyyyyyk.",
        ".kyyyyyyzyyyyyk.",
        "..kkkyyyzyyykkk.",
        "....kyttzyyyk...",
        "....kytTzyyyk...",
        "....kyyyzyyyk...",
        "....kyyyzyyyk...",
        "....kyyyzyyyk...",
        "....kkkkkkkkk...",
        "................",
        "................",
        "................",
        "................",
    ],
    "leggings": [
        "................",
        "...kkkkkkkkk....",
        "...kbbbbbbbbk...",
        "...kyYyyyyyyk...",
        "...kyyyyyyyyk...",
        "...kyyykkyyyk...",
        "...kyyk..kyyk...",
        "...kyyk..kyyk...",
        "...kyyk..kyyk...",
        "...kyyk..kyyk...",
        "...kyyk..kyyk...",
        "...kkkk..kkkk...",
        "................",
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
        "...kkkk..kkkk...",
        "...krRk..krrk...",
        "...krrk..krrk...",
        "...krrk..krrk...",
        "..krrrrk.krrrrk.",
        ".krrrrrk.krrrrrk",
        ".kkkkkkk.kkkkkkk",
        "................",
        "................",
        "................",
        "................",
    ],
}


def hazmat_icons():
    colors = {"k": (30, 24, 8), "y": HZ_M, "Y": HZ_L, "g": GLASS_D, "G": GLASS_L, "f": RUBBER_M, "F": RUBBER_L,
              "z": RUBBER_D, "t": HZ_L, "T": RUBBER_D, "b": RUBBER_M, "r": RUBBER_M, "R": RUBBER_L}
    for name, rows in ICONS.items():
        c = Canvas(16, 16, CLEAR)
        for y, row in enumerate(rows):
            for x, ch in enumerate(row[:16]):
                if ch in colors:
                    c.px(x, y, colors[ch])
        c.save(out("textures", "items", "zt_hazmat_%s.png" % name))


DETECTOR = [
    "................",
    "................",
    "..kkkkkkkkk.....",
    ".kyyyyyyyyyk....",
    ".kywwwwwwwyk....",
    ".kywwwnwwwyk....",
    ".kywwnwwwwyk....",
    ".kyyynyyyyyk.kk.",
    ".kyrryyyggyk.kpk",
    ".kyyyyyyyyykkpk.",
    ".kyyyyyyyyycck..",
    ".kkkkkkkkkkk....",
    "................",
    "................",
    "................",
    "................",
]


def detector_icon():
    """A Geiger counter: a yellow box with a dial and its needle, lights, and its probe on a cable."""
    colors = {"k": (30, 26, 10), "y": HZ_M, "w": (236, 236, 228), "n": (200, 30, 30), "r": (220, 40, 40), "g": (60, 220, 80),
              "c": RUBBER_M, "p": (150, 156, 164)}
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(DETECTOR):
        for x, ch in enumerate(row[:16]):
            if ch in colors:
                c.px(x, y, colors[ch])
    c.save(out("textures", "items", "zt_radiation_detector.png"))


# =============================================================================
# The Radiation Zombie: a zombie (bones named as vanilla's, so its animations drive it) with
# glowing green growths swelling out of it
# =============================================================================
def zombie_geometry():
    g = Geo("geometry.zt.radiation_zombie", 64, None, 2, 2.5, (0, 1.2, 0))
    g.part("head", 8, 8, 8)
    g.part("hat", 8, 8, 8)
    g.part("body", 8, 12, 4)
    g.part("jacket", 8, 12, 4)
    g.part("arm", 4, 12, 4)
    g.part("leg", 4, 12, 4)
    g.part("boil", 3, 3, 3)
    g.part("boil_s", 2, 2, 2)
    g.bone("waist", pivot=(0, 12, 0))
    g.bone("body", "waist", (0, 24, 0), cubes=[g.cube("body", (-4, 12, -2)), g.cube("jacket", (-4, 12, -2), inflate=0.25),
                                                g.cube("boil", (1, 18, -3)), g.cube("boil_s", (-3, 14, 1.5))])
    g.bone("head", "body", (0, 24, 0), cubes=[g.cube("head", (-4, 24, -4)), g.cube("hat", (-4, 24, -4), inflate=0.5),
                                               g.cube("boil", (2, 31, -1)), g.cube("boil_s", (-5, 28, 0))])
    g.bone("rightArm", "body", (-5, 22, 0), cubes=[g.cube("arm", (-8, 12, -2)), g.cube("boil_s", (-9, 19, -1))])
    g.bone("rightItem", "rightArm", (-6, 15, 1))
    g.bone("leftArm", "body", (5, 22, 0), cubes=[g.cube("arm", (4, 12, -2), mirror=True), g.cube("boil", (6, 21, -1.5))], mirror=True)
    g.bone("leftItem", "leftArm", (6, 15, 1))
    g.bone("rightLeg", "body", (-1.9, 12, 0), cubes=[g.cube("leg", (-3.9, 0, -2))])
    g.bone("leftLeg", "body", (1.9, 12, 0), cubes=[g.cube("leg", (-0.1, 0, -2), mirror=True)])
    return g


def zombie_texture(g):
    S = 2
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, 8301)
    rng = np.random.default_rng(8302)
    skin = ((92, 120, 52), (124, 156, 70), (160, 188, 92))        # sickly yellow-green
    rags = ((40, 44, 36), (62, 66, 54), (86, 90, 74))
    trousers = ((34, 40, 52), (50, 58, 74), (70, 80, 100))
    for part, mat in (("head", skin), ("body", rags), ("arm", skin), ("leg", trousers)):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w < 1 or h < 1:
                continue
            p.material(x, y, w, h, *mat, contrast=0.9)
            p.shade_edges(x, y, w, h, 0.18)
            # glowing green veins
            for _ in range(int(w * h / 60) + 1):
                vx, vy = x + rng.integers(0, max(1, int(w))), y + rng.integers(0, max(1, int(h)))
                for k in range(int(rng.integers(2, 6))):
                    c.px(vx + k * (1 if rng.random() < 0.5 else -1) // 1, vy + k, GLOW_SOFT)
    # torn rags: skin showing through, bare legs at the ankle
    for side, (x, y, w, h) in g.faces("arm", S).items():
        if side not in ("top", "bottom"):
            p.material(x, y, w, min(h, 4 * S), *rags)
    # its face: glowing eyes, a burnt mouth
    fx, fy, fw, fh = g.faces("head", S)["front"]
    for ex in (1, 5):
        c.rect(fx + ex * S, fy + 3 * S, 2 * S, S, GLOW)
        c.px(fx + ex * S, fy + 2 * S + 1, (30, 40, 20))
    c.rect(fx + 2 * S, fy + 6 * S, 4 * S, S, (40, 20, 16))
    c.px(fx + 3 * S, fy + 6 * S, GLOW_SOFT)
    # the hat and jacket layers: mostly see-through, burns and glowing sores
    field = fbm(c.w, c.h, 8303, cell=3, octaves=2)
    for part, cover in (("hat", 0.68), ("jacket", 0.66)):
        for side, (x, y, w, h) in g.faces(part, S).items():
            for yy in range(int(y), int(y + h)):
                for xx in range(int(x), int(x + w)):
                    if part == "hat" and side == "front" and yy - y >= 2 * S:
                        continue
                    v = field[yy, xx]
                    if v > cover:
                        c.px(xx, yy, GLOW if v > cover + 0.12 else (46, 70, 30))
    # the growths: swollen, glowing green
    for part in ("boil", "boil_s"):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w >= 1 and h >= 1:
                c.rect(x, y, w, h, (90, 200, 60, 30))
                c.rect(x + w / 4, y + h / 4, max(1, w / 2), max(1, h / 2), GLOW)
    return c


def spit_geometry():
    g = Geo("geometry.zt.radiation_spit", 16, 16, 1, 1, (0, 0.2, 0))
    g.part("core", 3, 3, 3)
    g.part("halo", 3, 3, 3)
    g.bone("orb", pivot=(0, 1.5, 0), cubes=[g.cube("core", (-1.5, 0, -1.5)), g.cube("halo", (-1.5, 0, -1.5), inflate=0.7)])
    return g


def spit_texture(g):
    c = Canvas(16, g.th, CLEAR)
    for k, (x, y, w, h) in g.faces("core").items():
        c.rect(x, y, w, h, (200, 255, 150, 4))
    for k, (x, y, w, h) in g.faces("halo").items():
        c.rect(x, y, w, h, (60, 220, 40, 50))
    return c


def main():
    for layer in (1, 2):
        hazmat_layer(layer).save(out("textures", "models", "armor", "zt_hazmat_%d.png" % layer))
    hazmat_icons()
    detector_icon()
    zg = zombie_geometry()
    zombie_texture(zg).save(out("textures", "entity", "zt_radiation_zombie.png"))
    sg = spit_geometry()
    spit_texture(sg).save(out("textures", "entity", "zt_radiation_spit.png"))
    with open(out("models", "entity", "radiation.geo.json"), "w") as f:
        json.dump(geometry_file(zg, sg), f, indent="\t")
        f.write("\n")
    print("radiation art written")


if __name__ == "__main__":
    main()
