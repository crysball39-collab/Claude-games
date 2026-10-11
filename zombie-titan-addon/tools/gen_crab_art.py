"""Generates the art of the Crabulon update: the Shroomy Crab (its model and skin) and the items it
drops, the Shroom Patch and the Shroomy Crab Claw; the Shroom Fortress's blocks (Shroomed Brick,
its wall, the Shroomed Altar and the Shroomy Crab spawner).

The crab is blue with white spots and glowing spore mushrooms growing on its back: a wide shell
over a white belly, eyes on stalks, two big claws in front and four legs a side. Its bones are
named so the animations (gen_crab_anims.py) can scuttle its legs, snap its pincers and turn its
body sideways as it walks. Mob skins use entity_emissive_alpha: pixels with a low alpha glow.

    python3 tools/gen_crab_art.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_hotel_art import BAR_H, BAR_W, FRAME_H, FRAME_W, HX0, HY0, K, bar_back  # noqa: E402
from geobuild import Geo, geometry_file  # noqa: E402
from texlib import Canvas, Painter, fbm, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)

# the crab's blue shell and its white spots, belly and joints
SHELL_D, SHELL_M, SHELL_L = (14, 44, 112), (32, 90, 186), (82, 152, 232)
SPOT, SPOT_SOFT = (226, 236, 252), (176, 200, 236)
BELLY_D, BELLY_M, BELLY_L = (176, 182, 198), (214, 220, 232), (240, 243, 250)
TIP = (236, 240, 248)
EYE = (8, 10, 18)
MOUTH = (96, 30, 44)
# the spore mushrooms on its back (as the Glowshroom Biome's caps), glowing spots on them
CAP_D, CAP_M, CAP_L = (34, 28, 96), (56, 48, 138), (84, 76, 178)
STEM, STEM_SH = (242, 242, 238), (186, 188, 200)
GLOW_SPOT = (110, 226, 255, 10)        # low alpha: glows with entity_emissive_alpha
GLOW_SOFT = (60, 160, 240, 60)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================
# The crab's geometry. Front is -Z, its right side -X (Bedrock's model space). Each leg hangs
# from a hip bone that fans it forward or back, swings out sideways from its hip, and bends
# down again at the knee (a child bone), so its foot reaches the ground.
# =============================================================================
LEG_Z = (-3.0, -1.0, 1.0, 3.0)        # front to back
LEG_FAN = (24, 8, -8, -24)            # front legs reach forward, back legs back
HIP = (6.5, 6.0)                       # the hips: out from the middle, up from the ground
THIGH, SHIN = 5, 7
SWING, KNEE = 100, 75                  # out and up to the knee, then down to the foot


def crab_geometry(ident, uv_w, bounds, big=False):
    g = Geo(ident, uv_w, None, bounds[0], bounds[1], (0, bounds[1] / 2 - 0.5, 0))
    g.part("shell", 14, 5, 11)
    g.part("dome", 10, 1, 7)
    g.part("belly", 12, 1, 9)
    g.part("thigh", 1, THIGH, 1)
    g.part("shin", 1, SHIN, 1)
    g.part("arm", 2, 2, 4)
    g.part("palm", 5, 4, 5)
    g.part("finger", 2, 1, 4)
    g.part("stalk", 1, 3, 1)
    g.part("eyeball", 2, 2, 2)
    g.part("stem_big", 2, 3, 2)
    g.part("cap_big", 5, 2, 5)
    g.part("stem_mid", 1, 2, 1)
    g.part("cap_mid", 3, 1, 3)
    g.part("stem_small", 1, 1, 1)
    g.part("cap_small", 2, 1, 2)
    if big:
        g.part("rim", 1, 1, 1)
        g.part("cap_huge", 7, 2, 7)
        g.part("stem_huge", 2, 4, 2)
    g.bone("root", pivot=(0, 0, 0))
    body = [g.cube("shell", (-7, 4, -5.5)), g.cube("dome", (-5, 9, -3.5)), g.cube("belly", (-6, 3, -4.5))]
    if big:
        # little spikes round the rim of the shell, a crown for the boss
        for x in (-6, -3, 0, 3, 6):
            body.append(g.cube("rim", (x - 0.5, 8.6, -6.0)))
        for z in (-3, 0, 3):
            body.append(g.cube("rim", (-7.4, 8.6, z - 0.5)))
            body.append(g.cube("rim", (6.4, 8.6, z - 0.5)))
    g.bone("body", "root", (0, 6, 0), cubes=body)
    # eyes on stalks, peering over the front of the shell
    g.bone("eyes", "body", (0, 9, -4), cubes=[
        g.cube("stalk", (-3, 9, -4.5)), g.cube("stalk", (2, 9, -4.5)),
        g.cube("eyeball", (-3.5, 12, -5)), g.cube("eyeball", (1.5, 12, -5)),
    ])
    # spore mushrooms growing on its back
    shrooms = [
        g.cube("stem_big", (1.5, 10, -0.5)), g.cube("cap_big", (0, 13, -2)),
        g.cube("stem_mid", (-4, 10, 1.5)), g.cube("cap_mid", (-5, 12, 0.5)),
        g.cube("stem_small", (-1.5, 10, -2.5)), g.cube("cap_small", (-2, 11, -3)),
        g.cube("stem_small", (4.5, 9, 3.5)), g.cube("cap_small", (4, 10, 3)),
    ]
    if big:
        shrooms += [g.cube("stem_huge", (-2.5, 10, 0.5)), g.cube("cap_huge", (-5, 14, -2))]
    g.bone("shrooms", "body", (0, 10, 0), cubes=shrooms)
    # the claws: an arm reaching forward and out, the claw turned back in, a pincer that opens
    for side, sgn in (("right", -1), ("left", 1)):
        ax = sgn * 5
        g.bone(side + "Arm", "body", (ax, 6, -5), rotation=(0, -sgn * 30, 0), cubes=[
            g.cube("arm", (ax - 1, 5, -9))])
        g.bone(side + "Claw", side + "Arm", (ax, 6, -9), rotation=(0, sgn * 45, 0), cubes=[
            g.cube("palm", (ax - 2.5, 4, -14)),
            g.cube("finger", (ax - 1, 4, -18))])
        g.bone(side + "Pincer", side + "Claw", (ax, 8, -14), rotation=(-12, 0, 0), cubes=[
            g.cube("finger", (ax - 1, 7, -18))])
    # four legs a side
    for side, sgn in (("r", -1), ("l", 1)):
        hx = sgn * HIP[0]
        for i, (z, fan) in enumerate(zip(LEG_Z, LEG_FAN)):
            g.bone("hip_%s%d" % (side, i), "body", (hx, HIP[1], z), rotation=(0, sgn * fan, 0))
            g.bone("leg_%s%d" % (side, i), "hip_%s%d" % (side, i), (hx, HIP[1], z), rotation=(0, 0, -sgn * SWING), cubes=[
                g.cube("thigh", (hx - 0.5, HIP[1] - THIGH, z - 0.5))])
            g.bone("shin_%s%d" % (side, i), "leg_%s%d" % (side, i), (hx, HIP[1] - THIGH, z), rotation=(0, 0, sgn * KNEE), cubes=[
                g.cube("shin", (hx - 0.5, HIP[1] - THIGH - SHIN, z - 0.5))])
    return g


# =============================================================================
# The crab's skin
# =============================================================================
def paint(g, s, painters, seed):
    c = Canvas(g.tw * s, g.th * s, CLEAR)
    p = Painter(c, seed=seed)
    rng = np.random.default_rng(seed)
    for part in g.parts:
        fn = painters.get(part)
        if fn is None:
            continue
        for side, rect in g.faces(part, s).items():
            if rect[2] < 1 or rect[3] < 1:
                continue
            fn(c, p, rect, side, rng, s)
    return c


def spots(c, rng, rect, n, s, size=1.0):
    """White spots on a face: round, a soft rim round each."""
    x, y, w, h = (int(v) for v in rect)
    if w < 2 or h < 2:
        return
    for _ in range(n):
        r = max(0.6, s * size * (0.5 + rng.random() * 0.6))
        cx = x + rng.random() * w
        cy = y + rng.random() * h
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                if not (x <= xx < x + w and y <= yy < y + h):
                    continue
                d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
                if d <= r:
                    c.px(xx, yy, SPOT)
                elif d <= r + 0.8:
                    c.blend_px(xx, yy, SPOT_SOFT, 0.6)


def shell(c, p, rect, side, rng, s):
    x, y, w, h = rect
    if side == "bottom":
        p.material(x, y, w, h, BELLY_D, BELLY_M, BELLY_L, contrast=0.6)
        p.shade_edges(x, y, w, h, 0.2)
        return
    p.material(x, y, w, h, SHELL_D, SHELL_M, SHELL_L, contrast=1.0)
    if side in ("front", "back", "left", "right"):
        # the white belly shows under the shell's lower edge
        p.material(x, y + h - s, w, s, BELLY_D, BELLY_M, BELLY_L, contrast=0.5)
        p.vertical_gradient(x, y, w, h - s, 1.15, 0.8)
        if side == "front":
            # a little mouth under the eyes
            c.rect(x + w * 0.38, y + h * 0.45, w * 0.24, max(1, s * 0.8), MOUTH)
            c.rect(x + w * 0.42, y + h * 0.45 + s * 0.8, w * 0.16, max(1, s * 0.6), (60, 18, 30))
    spots(c, rng, (x, y, w, h - (s if side != "top" else 0)), 5 if side == "top" else 3, s)
    p.shade_edges(x, y, w, h, 0.25)


def dome(c, p, rect, side, rng, s):
    x, y, w, h = rect
    p.material(x, y, w, h, SHELL_M, SHELL_L, (130, 190, 246), contrast=0.9)
    spots(c, rng, rect, 4 if side == "top" else 1, s)
    p.shade_edges(x, y, w, h, 0.2)


def belly(c, p, rect, side, rng, s):
    x, y, w, h = rect
    p.material(x, y, w, h, BELLY_D, BELLY_M, BELLY_L, contrast=0.7)
    if side == "bottom":
        # the segments of a crab's underside
        for k in range(1, 4):
            c.rect(x + w * k / 4, y, max(1, s // 2), h, BELLY_D)
    p.shade_edges(x, y, w, h, 0.2)


def limb(c, p, rect, side, rng, s):
    x, y, w, h = rect
    p.material(x, y, w, h, SHELL_D, SHELL_M, SHELL_L, contrast=0.8)
    if h >= 3 * s and side not in ("top", "bottom"):
        c.rect(x, y, w, max(1, s // 2), SPOT_SOFT)        # a pale joint at the top
    p.shade_edges(x, y, w, h, 0.3)


def shin(c, p, rect, side, rng, s):
    limb(c, p, rect, side, rng, s)
    x, y, w, h = rect
    if side not in ("top", "bottom"):
        c.rect(x, y + h - s, w, s, TIP)                     # a pale foot
    elif side == "bottom":
        c.rect(x, y, w, h, TIP)


def palm(c, p, rect, side, rng, s):
    x, y, w, h = rect
    p.material(x, y, w, h, SHELL_D, SHELL_M, SHELL_L, contrast=0.9)
    spots(c, rng, rect, 2, s, 0.8)
    p.shade_edges(x, y, w, h, 0.28)


def finger(c, p, rect, side, rng, s):
    x, y, w, h = rect
    p.material(x, y, w, h, SHELL_M, SHELL_L, (150, 200, 246), contrast=0.7)
    if side in ("left", "right", "top", "bottom"):
        c.rect(x, y, max(1, w * 0.3), h, TIP) if side in ("left", "right") else c.rect(x, y, w, max(1, h * 0.3), TIP)
    if side == "front":
        c.rect(x, y, w, h, TIP)
    p.shade_edges(x, y, w, h, 0.2)


def stalk(c, p, rect, side, rng, s):
    x, y, w, h = rect
    p.material(x, y, w, h, SHELL_M, SHELL_L, (140, 196, 244), contrast=0.6)


def eyeball(c, p, rect, side, rng, s):
    x, y, w, h = rect
    c.rect(x, y, w, h, EYE)
    if side in ("front", "left", "right"):
        c.rect(x + w * 0.15, y + h * 0.15, max(1, w * 0.35), max(1, h * 0.35), (230, 240, 255))   # a glint


def glowing_eye(c, p, rect, side, rng, s):
    """Crabulon's eyes: black, with a pupil glowing spore-blue (and a white glint)."""
    x, y, w, h = rect
    c.rect(x, y, w, h, EYE)
    if side not in ("top", "bottom"):
        c.rect(x + w * 0.25, y + h * 0.25, max(1, w * 0.5), max(1, h * 0.5), (120, 236, 255, 8))
        c.rect(x + w * 0.25, y + h * 0.25, max(1, w * 0.18), max(1, h * 0.18), (255, 255, 255, 4))


def big_shell(c, p, rect, side, rng, s):
    """Crabulon's shell: the crab's, with a wide white belly showing under it and bigger spots."""
    x, y, w, h = rect
    if side == "bottom":
        p.material(x, y, w, h, BELLY_D, BELLY_M, BELLY_L, contrast=0.6)
        for k in range(1, 5):
            c.rect(x + w * k / 5, y, max(1, s // 2), h, BELLY_D)
        p.shade_edges(x, y, w, h, 0.2)
        return
    p.material(x, y, w, h, SHELL_D, SHELL_M, SHELL_L, contrast=1.05)
    band = 2 * s if side != "top" else 0
    if band:
        p.material(x, y + h - band, w, band, BELLY_D, BELLY_M, BELLY_L, contrast=0.5)
        c.rect(x, y + h - band, w, max(1, s // 2), (150, 160, 190))
        p.vertical_gradient(x, y, w, h - band, 1.15, 0.8)
        if side == "front":
            c.rect(x + w * 0.36, y + h * 0.38, w * 0.28, s, MOUTH)
            for k in range(4):
                c.rect(x + w * (0.38 + k * 0.065), y + h * 0.38 + s, max(1, s // 2), s * 0.8, (236, 238, 244))   # teeth
    spots(c, rng, (x, y, w, h - band), 9 if side == "top" else 4, s, 1.3)
    p.shade_edges(x, y, w, h, 0.25)


def cap(c, p, rect, side, rng, s):
    x, y, w, h = rect
    if side == "bottom":
        c.rect(x, y, w, h, (196, 198, 214))
        return
    p.material(x, y, w, h, CAP_D, CAP_M, CAP_L, contrast=0.8)
    # glowing spots, more on top
    n = max(1, int(w * h / (s * s * (5 if side == "top" else 8))))
    for _ in range(n):
        sx, sy = x + rng.integers(0, max(1, int(w))), y + rng.integers(0, max(1, int(h)))
        c.rect(sx, sy, max(1, s // 2), max(1, s // 2), GLOW_SPOT)
        if s > 1:
            c.blend_px(sx + s // 2, sy, GLOW_SOFT, 0.7)


def stem(c, p, rect, side, rng, s):
    x, y, w, h = rect
    c.rect(x, y, w, h, STEM if side not in ("right", "back") else STEM_SH)


def rim(c, p, rect, side, rng, s):
    x, y, w, h = rect
    c.rect(x, y, w, h, SPOT)
    c.rect(x, y + h - max(1, s // 2), w, max(1, s // 2), SPOT_SOFT)


CRAB_PAINTERS = {
    "shell": shell, "dome": dome, "belly": belly, "thigh": limb, "shin": shin, "arm": limb, "palm": palm,
    "finger": finger, "stalk": stalk, "eyeball": eyeball, "cap_big": cap, "cap_mid": cap, "cap_small": cap,
    "cap_huge": cap, "stem_big": stem, "stem_mid": stem, "stem_small": stem, "stem_huge": stem, "rim": rim,
}


def shroomy_crab():
    g = crab_geometry("geometry.zt.shroomy_crab", 64, (2.5, 1.5))
    paint(g, 2, CRAB_PAINTERS, 6101).save(out("textures", "entity", "zt_shroomy_crab.png"))
    return g


def crabulon():
    """Crabulon: the crab grown ten blocks tall (rendered 10x), spikes round its shell, a great
    glowing mushroom on its back, its eyes glowing. Painted at four texels a pixel."""
    g = crab_geometry("geometry.zt.crabulon", 64, (32, 20), big=True)
    painters = dict(CRAB_PAINTERS, shell=big_shell, eyeball=glowing_eye)
    paint(g, 4, painters, 6501).save(out("textures", "entity", "zt_crabulon.png"))
    return g


# =============================================================================
# The Crab Totem standing on the altar, and the mushrooms of Crabulon's Shroom Rain
# =============================================================================
def totem_geometry():
    g = Geo("geometry.zt.crab_totem", 32, None, 2, 2, (0, 0.8, 0))
    g.part("base", 4, 2, 4)
    g.part("body", 6, 5, 4)
    g.part("arm", 1, 4, 1)
    g.part("claw", 2, 2, 1)
    g.part("stalk", 1, 2, 1)
    g.part("eye", 1, 1, 1)
    g.part("stem", 1, 2, 1)
    g.part("cap", 4, 1, 4)
    g.bone("totem", pivot=(0, 4, 0), cubes=[
        g.cube("base", (-2, 0, -2)), g.cube("body", (-3, 2, -2)),
        g.cube("arm", (-4.5, 5, -0.5), rotation=(0, 0, -20), pivot=(-3.5, 5, 0)),
        g.cube("arm", (3.5, 5, -0.5), rotation=(0, 0, 20), pivot=(3.5, 5, 0)),
        g.cube("claw", (-6.5, 8.5, -0.5)), g.cube("claw", (4.5, 8.5, -0.5)),
        g.cube("stalk", (-2, 7, -1.5)), g.cube("stalk", (1, 7, -1.5)),
        g.cube("eye", (-2, 9, -1.5)), g.cube("eye", (1, 9, -1.5)),
        g.cube("stem", (-0.5, 7, 0.5)), g.cube("cap", (-2, 9, -1)),
    ])
    return g


def totem_texture(g):
    painters = {
        "base": lambda c, p, r, side, rng, s: (p.material(*r, (40, 46, 74), (58, 66, 102), (82, 92, 138)), p.shade_edges(*r, 0.3)),
        "body": shell, "arm": limb, "claw": finger, "stalk": stalk, "eye": eyeball, "stem": stem, "cap": cap,
    }
    return paint(g, 2, painters, 6601)


def falling_shroom_geometry():
    g = Geo("geometry.zt.falling_shroom", 32, None, 1.5, 1.5, (0, 0.4, 0))
    g.part("stem", 2, 4, 2)
    g.part("cap", 6, 3, 6)
    g.bone("shroom", pivot=(0, 3, 0), cubes=[g.cube("stem", (-1, 0, -1)), g.cube("cap", (-3, 4, -3))])
    return g


def falling_shroom_texture(g):
    """A small blue mushroom, glowing all over its cap."""
    c = Canvas(g.tw * 2, g.th * 2, CLEAR)
    p = Painter(c, 6701)
    for side, (x, y, w, h) in g.faces("stem", 2).items():
        c.rect(x, y, w, h, STEM if side != "right" else STEM_SH)
    for side, (x, y, w, h) in g.faces("cap", 2).items():
        if side == "bottom":
            c.rect(x, y, w, h, (150, 200, 240, 40))
            continue
        p.material(x, y, w, h, (40, 110, 220), (70, 160, 250), (140, 220, 255), contrast=0.8)
        # (the whole cap glows: its alpha is low)
        c.a[int(y):int(y + h), int(x):int(x + w), 3] = 30
        rng = np.random.default_rng(6702)
        for _ in range(3):
            c.px(x + rng.integers(0, int(w)), y + rng.integers(0, int(h)), (230, 250, 255, 4))
    return c


# =============================================================================
# Items: the Shroom Patch and the Shroomy Crab Claw (16 x 16)
# =============================================================================
def pixel_map(rows, colors):
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                c.px(x, y, colors[ch])
    return c


def supersample(shape, n=16, k=6):
    """A 16 x 16 mask from a shape given as a function of (x, y) in pixel units."""
    m = np.zeros((n, n), dtype=bool)
    for y in range(n):
        for x in range(n):
            hits = sum(shape(x + (i + 0.5) / k, y + (j + 0.5) / k) for i in range(k) for j in range(k))
            m[y, x] = hits >= k * k * 0.45
    return m


def ellipse(px, py, cx, cy, rx, ry, ang):
    c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
    u, v = (px - cx) * c + (py - cy) * s, -(px - cx) * s + (py - cy) * c
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1


def outlined(c, mask, color):
    pad = np.pad(mask, 1)
    edge = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    for y, x in zip(*np.nonzero(edge & ~mask)):
        c.px(x, y, color)


def shade_mask(c, mask, dark, mid, light, seed, lit=(-1, -1)):
    """Fills a mask lit from one side: light along the lit edge, dark along the other."""
    rng = np.random.default_rng(seed)
    pad = np.pad(mask, 1)
    for y, x in zip(*np.nonzero(mask)):
        toward = pad[y + 1 + lit[1], x + 1 + lit[0]]
        away = pad[y + 1 - lit[1], x + 1 - lit[0]]
        col = mid if toward and away else (light if not toward else dark)
        if toward and away and rng.random() < 0.18:
            col = tuple(int(v * 0.88) for v in mid)
        c.px(x, y, col)


CLAW = [
    "................",
    "..........ooo...",
    ".........otttoo.",
    "........olmmoo..",
    ".......olmmo....",
    "......olmmo..oo.",
    ".....olmmmo.otto",
    "....olmwmmooomto",
    "...olmmmmmmmmmo.",
    "..olmmmwmmmmmdo.",
    ".olmwmmmmmmddo..",
    ".odmmmmmmmddo...",
    ".oddmmwmmddo....",
    "..oddddddoo.....",
    "...ooooooo......",
    "................",
]


def claw_icon():
    """A crab's claw, its pincer open at the top right."""
    colors = {"o": (8, 20, 52), "d": SHELL_D, "m": SHELL_M, "l": SHELL_L, "w": SPOT, "t": TIP}
    pixel_map(CLAW, colors).save(out("textures", "items", "zt_shroomy_crab_claw.png"))


def patch_icon():
    """A clump of glowing blue spore moss off a crab's back, two little mushrooms growing in it."""
    def shape(x, y):
        return ellipse(x, y, 8.0, 11.0, 6.6, 3.4, 0) or ellipse(x, y, 5.5, 9.6, 3.0, 2.2, 0) or ellipse(x, y, 10.6, 9.8, 3.2, 2.0, 0)
    mask = supersample(shape)
    c = Canvas(16, 16, CLEAR)
    moss_d, moss_m, moss_l, glow = (18, 62, 132), (36, 112, 204), (104, 196, 255), (190, 244, 255, 255)
    shade_mask(c, mask, moss_d, moss_m, moss_l, 6301, lit=(0, -1))
    rng = np.random.default_rng(6302)
    ys, xs = np.nonzero(mask)
    for _ in range(6):
        i = rng.integers(0, len(xs))
        c.px(xs[i], ys[i], glow if rng.random() < 0.5 else moss_l)
    outlined(c, mask, (6, 20, 48))
    # two mushrooms: a white stem and a blue cap with a glowing spot
    for (sx, top, h, w) in ((5, 3, 4, 3), (11, 5, 3, 3)):
        for y in range(top + 1, top + 1 + h):
            c.px(sx, y, STEM)
        for k in range(-(w // 2) - 1, w // 2 + 2):
            c.px(sx + k, top, CAP_M if abs(k) <= w // 2 else CAP_D)
        for k in range(-(w // 2), w // 2 + 1):
            c.px(sx + k, top - 1, CAP_L if k else (150, 238, 255))
        c.px(sx - w // 2 - 1, top + 1, (24, 20, 70))
        c.px(sx + w // 2 + 1, top + 1, (24, 20, 70))
    c.save(out("textures", "items", "zt_shroom_patch.png"))


def totem_icon():
    """The Crab Totem: a little blue crab idol, its claws raised, a glowing mushroom on its head."""
    def shape(x, y):
        return (ellipse(x, y, 8.0, 10.6, 4.4, 3.3, 0)                       # its shell
                or ellipse(x, y, 3.2, 4.6, 1.6, 2.0, -20) or ellipse(x, y, 12.8, 4.6, 1.6, 2.0, 20)   # claws
                or (abs(x - 4.6) < 0.8 and 5.5 < y < 9.5) or (abs(x - 11.4) < 0.8 and 5.5 < y < 9.5)  # arms
                or ellipse(x, y, 8.0, 14.4, 2.6, 1.2, 0))                    # its stand
    mask = supersample(shape)
    c = Canvas(16, 16, CLEAR)
    shade_mask(c, mask, SHELL_D, SHELL_M, SHELL_L, 6801)
    for x, y in ((6, 10), (10, 11), (8, 12), (11, 9)):
        c.px(x, y, SPOT)
    for x, y in ((2, 3), (3, 2), (13, 2), (12, 3)):                          # the pincers' tips
        if mask[y, x]:
            c.px(x, y, TIP)
    c.px(3, 4, (8, 20, 52))                                                  # the pincers' gaps
    c.px(12, 4, (8, 20, 52))
    for y in (13, 14, 15):
        for x in range(16):
            if mask[y, x]:
                c.px(x, y, (52, 60, 96) if y < 15 else (34, 40, 68))         # a brick stand
    c.px(6, 9, EYE)
    c.px(10, 9, EYE)
    c.px(7, 11, MOUTH)
    c.px(8, 11, MOUTH)
    outlined(c, mask, (8, 20, 52))
    # the mushroom on its head
    for x in range(5, 11):
        c.px(x, 6, CAP_M if 5 < x < 10 else CAP_D)
    for x in range(6, 10):
        c.px(x, 5, CAP_L)
    c.px(7, 5, (150, 238, 255))
    c.px(9, 6, (150, 238, 255))
    c.px(8, 7, STEM)
    c.save(out("textures", "items", "zt_crab_totem.png"))


def scroll_icon():
    """The Spore Scroll: a scroll hanging open between two Glowshroom rollers, runes glowing on it."""
    c = Canvas(16, 16, CLEAR)
    paper_l, paper_d = (232, 238, 248), (196, 206, 226)
    roll_l, roll_d, knob = (242, 242, 238), (170, 172, 190), CAP_M
    for y in range(3, 13):
        for x in range(3, 13):
            c.px(x, y, paper_l if x < 11 else paper_d)
    for y in (2, 13):
        for x in range(2, 14):
            c.px(x, y, roll_l if (x % 3) else roll_d)
        c.px(1, y, knob)
        c.px(14, y, knob)
    for y in (1, 14):
        for x in range(2, 14):
            c.px(x, y, (40, 42, 70))
    for x in (1, 14):
        c.px(x, 1, (24, 20, 70))
        c.px(x, 14, (24, 20, 70))
    for y in range(3, 13):
        c.px(2, y, (90, 96, 130))
        c.px(13, y, (90, 96, 130))
    # runes in rows
    rng = np.random.default_rng(6901)
    for y in (4, 6, 8, 10):
        x = 4
        while x < 11:
            n = int(rng.integers(1, 3))
            for k in range(n):
                if x + k < 11:
                    c.px(x + k, y, VEIN if rng.random() < 0.7 else (54, 140, 200))
            if rng.random() < 0.5:
                c.px(x, y + 1, VEIN_SOFT)
            x += n + 1
    c.px(9, 11, (110, 226, 255))
    c.save(out("textures", "items", "zt_spore_scroll.png"))


def eye_icon():
    """The Shroomed Eye: an Eye of Ender from the Glowshroom Biome; deep blue, a glowing iris round
    a maroon slit, white spore spots."""
    c = Canvas(16, 16, CLEAR)
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx + 0.5 - 8, yy + 0.5 - 8)
    deep, mid, light = (14, 34, 96), (34, 84, 176), (96, 160, 236)
    for y in range(16):
        for x in range(16):
            if d[y, x] > 6.2:
                continue
            # lit from the top left
            lit = ((8 - x) + (8 - y)) / 12 + (6.2 - d[y, x]) / 10
            col = light if lit > 0.75 else (mid if lit > 0.1 else deep)
            c.px(x, y, col)
    for y in range(16):
        for x in range(16):
            e = np.hypot((x + 0.5 - 8) / 3.4, (y + 0.5 - 8) / 3.0)
            if e < 1:
                c.px(x, y, (120, 236, 255) if e > 0.55 else (60, 190, 240))
    for y in range(5, 11):
        c.px(8, y, (80, 18, 34))                       # the slit
        if 6 <= y <= 9:
            c.px(7, y, (110, 30, 46))
    c.px(5, 4, (240, 248, 255))                        # a glint
    for x, y in ((3, 9), (11, 4), (12, 10), (6, 13)):
        c.px(x, y, SPOT)
    mask = d <= 6.2
    outlined(c, mask, (6, 14, 40))
    c.save(out("textures", "items", "zt_shroomed_eye.png"))


def rings():
    """Particle textures: the red ring warning where a mushroom will land, the blue one of a
    shockwave (64 x 64)."""
    yy, xx = np.mgrid[0:64, 0:64]
    d = np.hypot(xx + 0.5 - 32, yy + 0.5 - 32)
    for name, rgb, width in (("zt_warning_ring", (255, 40, 30), 4.5), ("zt_shock_ring", (120, 220, 255), 3.0)):
        arr = np.zeros((64, 64, 4))
        arr[..., :3] = rgb
        a = np.clip(1 - np.abs(d - (31.5 - width)) / width, 0, 1)
        if name == "zt_warning_ring":
            a = np.maximum(a, (d < 27) * 0.22)          # a faint red fill inside the ring
            cross = ((np.abs(xx - 31.5) < 1.5) | (np.abs(yy - 31.5) < 1.5)) & (d < 8)
            a = np.maximum(a, cross * 0.9)
        arr[..., 3] = a * 255
        to_image(arr).save(out("textures", "particle", name + ".png"))


def crabulon_bar():
    """Crabulon's boss bar: a white-spotted blue fill in a shell-blue frame, a claw at each end."""
    bar_back("crabulon", (10, 16, 36))
    w, h = BAR_W * K, BAR_H * K
    n = fbm(w, h, 7101, cell=5, octaves=3)
    arr = np.zeros((h, w, 4))
    c0, c1 = np.array((30, 90, 200)), np.array((110, 190, 255))
    arr[..., :3] = c0 + (c1 - c0) * (0.25 + 0.6 * n[..., None])
    rng = np.random.default_rng(7102)
    for _ in range(40):
        x, y = int(rng.integers(0, w - 2)), int(rng.integers(0, h - 2))
        arr[y:y + 2, x:x + 2, :3] = (230, 240, 255)
    arr[:K, :, :3] = arr[:K, :, :3] * 0.4 + 255 * 0.6
    arr[-K:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "crabulon_bar_fill.png"))

    W, H = FRAME_W * K, FRAME_H * K
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = HX0 * K, HY0 * K, (HX0 + BAR_W) * K, (HY0 + BAR_H) * K
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 4 * K) & (xx < hx1 + 4 * K) & (yy >= hy0 - 4 * K) & (yy < hy1 + 4 * K)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    nn = fbm(W, H, 7103, cell=5, octaves=3)
    d0, d1 = np.array(SHELL_D), np.array(SHELL_L)
    col = d0 + (d1 - d0) * nn[..., None]
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    for _ in range(60):
        x, y = int(rng.integers(hx0 - 4 * K, hx1 + 4 * K)), int(rng.integers(hy0 - 4 * K, hy1 + 4 * K))
        if frame[y, x]:
            fr[y:y + K, x:x + K, :3] = SPOT
    outer = band & ~((xx >= hx0 - 3 * K) & (xx < hx1 + 3 * K) & (yy >= hy0 - 3 * K) & (yy < hy1 + 3 * K))
    fr[outer, :3] *= 0.5
    inner = frame & (xx >= hx0 - K) & (xx < hx1 + K) & (yy >= hy0 - K) & (yy < hy1 + K)
    fr[inner, :3] = (230, 236, 248)
    # a claw at each end, opening outward
    cy = (hy0 + hy1) / 2
    for cx, sgn in ((hx0 - 6 * K, -1), (hx1 + 6 * K, 1)):
        palm = np.hypot((xx + 0.5 - cx) / (3.2 * K), (yy + 0.5 - cy) / (4.6 * K)) <= 1
        upper = np.hypot((xx + 0.5 - (cx + sgn * 3 * K)) / (3 * K), (yy + 0.5 - (cy - 2.6 * K)) / (1.4 * K)) <= 1
        lower = np.hypot((xx + 0.5 - (cx + sgn * 3 * K)) / (3 * K), (yy + 0.5 - (cy + 2.6 * K)) / (1.2 * K)) <= 1
        m = palm | upper | lower
        fr[m, :3] = col[m] * 1.1
        fr[m, 3] = 255
        tips = (upper | lower) & (sgn * (xx - cx) > 4 * K)
        fr[tips, :3] = TIP
    to_image(fr).save(out("textures", "ui", "zt", "crabulon_bar_frame.png"))


# =============================================================================
# The Shroom Fortress's blocks (16 x 16)
# =============================================================================
BR_D, BR_M, BR_L = (34, 40, 68), (52, 60, 96), (76, 86, 132)
MORTAR = (16, 18, 34)
VEIN, VEIN_SOFT = (120, 230, 255), (54, 140, 200)
MOSS = (30, 96, 150)


def brick_course(c, rng, field, y0, h, offset, w=8):
    """One course of bricks: shaded faces, mortar under them and between them."""
    for x in range(16):
        for y in range(y0, y0 + h):
            joint = (x + offset) % w == w - 1
            if y == y0 + h - 1 or joint:
                c.px(x, y, MORTAR)
                continue
            v = field[y, x] * 0.7 + rng.random() * 0.3
            col = BR_L if v > 0.68 else (BR_M if v > 0.36 else BR_D)
            # each brick lit along its top and left, shadowed along its bottom
            if y == y0:
                col = tuple(min(255, int(q * 1.18)) for q in col)
            elif y == y0 + h - 2:
                col = tuple(int(q * 0.82) for q in col)
            c.px(x, y, col)


def shroomed_bricks(seed=6401, veins=4):
    c = Canvas(16, 16, CLEAR)
    rng = np.random.default_rng(seed)
    field = fbm(16, 16, seed, cell=4, octaves=2)
    for k in range(4):
        brick_course(c, rng, field, k * 4, 4, 4 if k % 2 else 0)
    # glowing spore threads creeping along the mortar, and a little blue moss on the bricks
    mortar = [(x, y) for y in range(16) for x in range(16) if tuple(c.a[y, x, :3].astype(int)) == MORTAR]
    for _ in range(veins):
        x, y = mortar[int(rng.integers(0, len(mortar)))]
        c.px(x, y, VEIN)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) in mortar and rng.random() < 0.6:
                c.px(x + dx, y + dy, VEIN_SOFT)
    for _ in range(3):
        x, y = int(rng.integers(0, 16)), int(rng.integers(0, 16))
        if (x, y) not in mortar:
            c.blend_px(x, y, MOSS, 0.7)
    return c


def altar_side():
    """The altar seen from the side, top to bottom: claw prongs at the corners, the top slab, a
    glowing rune on the column, the base."""
    c = shroomed_bricks(6411, veins=2)
    claw = (214, 224, 244)
    for x0 in (1, 13):
        c.rect(x0, 0, 2, 3, claw)
        c.px(x0, 0, (250, 252, 255))
    c.rect(3, 0, 10, 3, CLEAR)
    c.rect(0, 0, 1, 3, CLEAR)
    c.rect(15, 0, 1, 3, CLEAR)
    # the top slab: a pale rim with a glowing line under it
    c.rect(1, 3, 14, 1, (110, 122, 170))
    c.rect(1, 5, 14, 1, VEIN_SOFT)
    # the column: darker, a rune glowing on it
    for y in range(6, 13):
        for x in range(3, 13):
            col = c.a[y, x, :3] * 0.75
            c.px(x, y, tuple(int(q) for q in col))
    for x, y in ((7, 7), (8, 7), (6, 8), (9, 8), (6, 9), (9, 9), (7, 10), (8, 10), (7, 9), (8, 8)):
        c.px(x, y, VEIN)
    c.px(5, 7, VEIN_SOFT)
    c.px(10, 7, VEIN_SOFT)
    c.px(5, 11, VEIN_SOFT)
    c.px(10, 11, VEIN_SOFT)
    return c


def altar_top():
    """The altar's top: a ring of glowing runes round the hollow where the Crab Totem stands."""
    c = shroomed_bricks(6421, veins=1)
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx + 0.5 - 8, yy + 0.5 - 8)
    for y in range(16):
        for x in range(16):
            if d[y, x] < 3.2:
                c.px(x, y, (14, 18, 34))                       # the hollow
            elif d[y, x] < 4.2:
                c.px(x, y, VEIN if (x + y) % 3 else VEIN_SOFT)  # the glowing ring
            elif d[y, x] < 5.6:
                c.px(x, y, (30, 34, 58))
    for x, y in ((8, 1), (1, 8), (14, 8), (8, 14)):
        c.px(x, y, VEIN)
    claw = (214, 224, 244)
    for x0, y0 in ((1, 1), (13, 1), (1, 13), (13, 13)):
        c.rect(x0, y0, 2, 2, claw)
    return c


def spawner_cage():
    """A spawner's cage: a dark steel frame, bars across it, rivets glinting blue."""
    c = Canvas(16, 16, CLEAR)
    rng = np.random.default_rng(6431)
    steel = [(20, 24, 42), (36, 42, 70), (58, 68, 106)]
    for y in range(16):
        for x in range(16):
            frame = x in (0, 15) or y in (0, 15)
            bar = x in (5, 10) or y in (5, 10)
            if frame or bar:
                c.px(x, y, steel[int(rng.integers(0, 3))] if not frame else steel[1 if (x + y) % 2 else 2])
    for x in (0, 5, 10, 15):
        for y in (0, 5, 10, 15):
            c.px(x, y, (110, 200, 240))
    c.px(3, 0, VEIN_SOFT)
    c.px(15, 12, VEIN_SOFT)
    return c


def spawner_crab():
    """The little crab turning in its cage (painted onto its boxes as the block's texture)."""
    c = Canvas(16, 16, CLEAR)
    p = Painter(c, 6441)
    p.material(0, 0, 16, 16, SHELL_D, SHELL_M, SHELL_L, contrast=0.9)
    rng = np.random.default_rng(6442)
    spots(c, rng, (0, 0, 16, 16), 7, 1, 0.9)
    return c


def fortress_blocks():
    shroomed_bricks().save(out("textures", "blocks", "zt_shroomed_bricks.png"))
    altar_side().save(out("textures", "blocks", "zt_shroomed_altar_side.png"))
    altar_top().save(out("textures", "blocks", "zt_shroomed_altar_top.png"))
    spawner_cage().save(out("textures", "blocks", "zt_crab_spawner.png"))
    spawner_crab().save(out("textures", "blocks", "zt_crab_spawner_crab.png"))
    dark = Canvas(16, 16, (8, 10, 18, 255))
    dark.rect(5, 5, 3, 3, (230, 240, 255))
    dark.save(out("textures", "blocks", "zt_crab_spawner_eye.png"))


def main():
    fortress_blocks()
    geos = [shroomy_crab(), crabulon()]
    with open(out("models", "entity", "crabs.geo.json"), "w") as f:
        json.dump(geometry_file(*geos), f, indent="\t")
        f.write("\n")
    tg = totem_geometry()
    totem_texture(tg).save(out("textures", "entity", "zt_crab_totem.png"))
    fg = falling_shroom_geometry()
    falling_shroom_texture(fg).save(out("textures", "entity", "zt_falling_shroom.png"))
    with open(out("models", "entity", "crabulon_props.geo.json"), "w") as f:
        json.dump(geometry_file(tg, fg), f, indent="\t")
        f.write("\n")
    claw_icon()
    patch_icon()
    totem_icon()
    scroll_icon()
    eye_icon()
    rings()
    crabulon_bar()
    print("crab art written")


if __name__ == "__main__":
    main()
