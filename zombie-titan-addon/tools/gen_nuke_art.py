"""Generates the art of the nukes: the Nuke Silo and the Missile Silo (a concrete silo with two
hatch doors that swing open, and its payload standing inside), Little Boy, Fat Man and the
Doomsday Missile (in the silo, flying, and as items), the mushroom cloud, the ash that's left,
and the particle textures for the smoke.

    python3 tools/gen_nuke_art.py
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from geobuild import Geo, geometry_file  # noqa: E402
from texlib import Canvas, Painter, fbm, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
S = 2          # texels per model pixel

CON_D, CON_M, CON_L = (118, 120, 124), (158, 160, 164), (190, 192, 196)
STEEL_D, STEEL_M, STEEL_L = (70, 76, 84), (110, 118, 128), (150, 158, 168)
HAZ_Y, HAZ_K = (236, 196, 36), (24, 24, 26)
RED, WHITE = (196, 36, 36), (236, 236, 232)
OLIVE_D, OLIVE_M, OLIVE_L = (58, 66, 50), (86, 96, 74), (116, 126, 100)
MUSTARD_D, MUSTARD_M, MUSTARD_L = (150, 122, 40), (196, 168, 64), (222, 198, 104)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================
# The payloads: Little Boy, Fat Man and the Doomsday Missile, standing nose up. The silo and the
# flying rocket declare them first, so they sit at the same place in both their textures.
# =============================================================================
PAYLOADS = ("little_boy", "fat_man", "doomsday")


def payload_parts(g):
    g.part("lb_body", 8, 22, 8)
    g.part("lb_tail", 10, 5, 10)
    g.part("lb_nose", 6, 3, 6)
    g.part("lb_tip", 4, 1, 4)
    g.part("fm_body", 16, 16, 16)
    g.part("fm_core", 12, 20, 12)
    g.part("fm_tail", 14, 8, 14)
    g.part("fm_cap", 10, 3, 10)
    g.part("dm_body", 6, 24, 6)
    g.part("dm_nose", 4, 3, 4)
    g.part("dm_tip", 2, 2, 2)
    g.part("dm_fin", 3, 8, 1)
    g.part("dm_fin_z", 1, 8, 3)


def payload_bones(g, parent, y=0):
    """The three payloads as bones under `parent` (only the loaded one is shown)."""
    g.bone("little_boy", parent, (0, 4 + y, 0), cubes=[
        g.cube("lb_tail", (-5, 4 + y, -5)), g.cube("lb_body", (-4, 8 + y, -4)),
        g.cube("lb_nose", (-3, 30 + y, -3)), g.cube("lb_tip", (-2, 33 + y, -2))])
    g.bone("fat_man", parent, (0, 4 + y, 0), cubes=[
        g.cube("fm_tail", (-7, 4 + y, -7)), g.cube("fm_core", (-6, 10 + y, -6)),
        g.cube("fm_body", (-8, 12 + y, -8)),
        g.cube("fm_body", (-8, 12 + y, -8), rotation=(0, 45, 0), pivot=(0, 20 + y, 0)),
        g.cube("fm_cap", (-5, 28 + y, -5))])
    g.bone("doomsday", parent, (0, 4 + y, 0), cubes=[
        g.cube("dm_body", (-3, 6 + y, -3)), g.cube("dm_nose", (-2, 30 + y, -2)), g.cube("dm_tip", (-1, 33 + y, -1)),
        g.cube("dm_fin", (-6, 4 + y, -0.5)), g.cube("dm_fin", (3, 4 + y, -0.5)),
        g.cube("dm_fin_z", (-0.5, 4 + y, -6)), g.cube("dm_fin_z", (-0.5, 4 + y, 3))])


def paint_payloads(c, g, p):
    def mat(part, d, m, l, contrast=0.8):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w >= 1 and h >= 1:
                p.material(x, y, w, h, d, m, l, contrast=contrast)
                p.shade_edges(x, y, w, h, 0.2)
    # Little Boy: gunmetal olive, a band round its middle, rivets, a dark tail
    mat("lb_body", OLIVE_D, OLIVE_M, OLIVE_L)
    for side, (x, y, w, h) in g.faces("lb_body", S).items():
        if side in ("top", "bottom"):
            continue
        c.rect(x, y + h * 0.45, w, S, (40, 46, 36))
        for k in range(int(y) + S, int(y + h), 4 * S):
            c.px(x + S, k, (150, 156, 140))
            c.px(x + w - S - 1, k, (150, 156, 140))
    mat("lb_tail", (36, 40, 34), (56, 62, 50), (76, 84, 68))
    mat("lb_nose", OLIVE_D, OLIVE_M, OLIVE_L)
    mat("lb_tip", (40, 44, 38), (60, 66, 56), (80, 88, 74))
    # Fat Man: mustard yellow, black tar along its seams, a dark box tail
    for part in ("fm_body", "fm_core", "fm_cap"):
        mat(part, MUSTARD_D, MUSTARD_M, MUSTARD_L, 0.7)
        for side, (x, y, w, h) in g.faces(part, S).items():
            if side in ("top", "bottom") or w < 2:
                continue
            c.rect(x + w / 2, y, S // 2 or 1, h, (30, 26, 18))
            c.rect(x, y + h / 2, w, S // 2 or 1, (30, 26, 18))
    mat("fm_tail", (40, 38, 30), (64, 60, 46), (86, 80, 62))
    for side, (x, y, w, h) in g.faces("fm_tail", S).items():
        if side not in ("top", "bottom"):
            c.rect(x + w * 0.3, y, S, h, (24, 22, 18))
            c.rect(x + w * 0.7, y, S, h, (24, 22, 18))
    # the Doomsday Missile: white with red bands, a black nose, red fins
    for side, (x, y, w, h) in g.faces("dm_body", S).items():
        p.material(x, y, w, h, (200, 200, 196), WHITE, (252, 252, 250), contrast=0.4)
        if side not in ("top", "bottom"):
            for band in (0.15, 0.55):
                c.rect(x, y + h * band, w, 2 * S, RED)
            c.rect(x + w * 0.3, y + h * 0.25, w * 0.4, h * 0.2, (30, 30, 34))   # a black stencil
    for part, col in (("dm_nose", (28, 28, 32)), ("dm_tip", (16, 16, 18)), ("dm_fin", RED), ("dm_fin_z", RED)):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w >= 1 and h >= 1:
                p.material(x, y, w, h, tuple(int(v * 0.7) for v in col), col, tuple(min(255, int(v * 1.25 + 10)) for v in col), contrast=0.5)


# =============================================================================
# The silo: a concrete well with a rim, two hatch doors, a control panel; its payload inside
# =============================================================================
def silo_geometry(ident):
    g = Geo(ident, 256, None, 5, 6, (0, 2, 0))
    payload_parts(g)
    g.part("floor", 48, 4, 48)
    g.part("wall_x", 48, 32, 4)
    g.part("wall_z", 4, 32, 40)
    g.part("rim_x", 52, 3, 6)
    g.part("rim_z", 6, 3, 40)
    g.part("door", 20, 3, 40)
    g.part("panel", 12, 10, 2)
    g.part("light", 2, 2, 2)
    g.bone("silo", pivot=(0, 0, 0), cubes=[
        g.cube("floor", (-24, 0, -24)),
        g.cube("wall_x", (-24, 4, -24)), g.cube("wall_x", (-24, 4, 20)),
        g.cube("wall_z", (20, 4, -20)), g.cube("wall_z", (-24, 4, -20)),
        g.cube("rim_x", (-26, 36, -26)), g.cube("rim_x", (-26, 36, 20)),
        g.cube("rim_z", (20, 36, -20)), g.cube("rim_z", (-26, 36, -20)),
        g.cube("panel", (-6, 10, -26)),
    ])
    # a warning light on each corner of the rim (they flash while it counts down)
    g.bone("lights", "silo", (0, 39, 0), cubes=[g.cube("light", (x - 1, 39, z - 1)) for x in (-23, 23) for z in (-23, 23)])
    # the doors, hinged at the rim's sides
    g.bone("door_r", "silo", (-20, 39, 0), cubes=[g.cube("door", (-20, 36, -20))])
    g.bone("door_l", "silo", (20, 39, 0), cubes=[g.cube("door", (0, 36, -20), mirror=True)], mirror=True)
    g.bone("payload", "silo", (0, 4, 0))
    payload_bones(g, "payload")
    return g


def trefoil(c, cx, cy, r, bg, fg):
    """The radiation sign: three blades round a dot, in a disc."""
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d > r:
                continue
            a = (math.degrees(math.atan2(dy, dx)) + 90) % 120
            blade = r * 0.32 < d < r * 0.88 and a < 60
            c.px(x, y, fg if (d < r * 0.18 or blade) else bg)


def stripes(c, x, y, w, h, a, b, step):
    for yy in range(int(y), int(y + h)):
        for xx in range(int(x), int(x + w)):
            c.px(xx, yy, a if ((xx + yy) // step) % 2 == 0 else b)


def stencil(c, x, y, w, h, text, col):
    img = Image.new("L", (int(w) * 4, int(h) * 4), 0)
    font = ImageFont.truetype(FONT, int(h * 4 * 0.8), index=0)
    d = ImageDraw.Draw(img)
    bb = d.textbbox((0, 0), text, font=font)
    tw = bb[2] - bb[0]
    scale = min(1.0, (w * 4 - 4) / max(1, tw))
    if scale < 1:
        font = ImageFont.truetype(FONT, max(6, int(h * 4 * 0.8 * scale)), index=0)
        bb = d.textbbox((0, 0), text, font=font)
    d.text(((w * 4 - (bb[2] - bb[0])) / 2 - bb[0], (h * 4 - (bb[3] - bb[1])) / 2 - bb[1]), text, fill=255, font=font)
    small = np.array(img.resize((int(w), int(h)), Image.LANCZOS)) / 255.0
    for yy in range(int(h)):
        for xx in range(int(w)):
            if small[yy, xx] > 0.45:
                c.px(x + xx, y + yy, col)


def silo_texture(g, kind):
    """kind: "nuke" (yellow and black, the radiation sign) or "missile" (red and white)."""
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, 7301 if kind == "nuke" else 7302)
    paint_payloads(c, g, p)
    a, b = (HAZ_Y, HAZ_K) if kind == "nuke" else (RED, WHITE)
    outward = {"wall_x": ("front", "back"), "wall_z": ("left", "right")}
    for part in ("floor", "wall_x", "wall_z"):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w < 1 or h < 1:
                continue
            p.material(x, y, w, h, CON_D, CON_M, CON_L, contrast=0.7)
            p.blotches(x, y, w, h, (100, 102, 104), threshold=0.66, alpha=0.5)          # weathering
            if part == "floor":
                continue
            if side in outward[part]:
                # a band of warning stripes along the top, and the sign in the middle
                stripes(c, x, y + 2 * S, w, 3 * S, a, b, 3 * S)
                # (above the control panel, which covers the front wall's lower middle)
                if kind == "nuke":
                    trefoil(c, x + w / 2, y + h * 0.36, min(w, h) * 0.2, HAZ_Y, HAZ_K)
                else:
                    c.rect(x + w * 0.1, y + h * 0.22, w * 0.8, h * 0.22, RED)
                    stencil(c, x + w * 0.12, y + h * 0.24, w * 0.76, h * 0.18, "DOOMSDAY", WHITE)
                p.shade_edges(x, y, w, h, 0.18)
            elif side in ("front", "back", "left", "right"):
                c.rect(x, y, w, h, (70, 72, 76))                                           # the shaft inside
                p.shade_edges(x, y, w, h, 0.3)
    for part in ("rim_x", "rim_z"):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w >= 1 and h >= 1:
                stripes(c, x, y, w, h, a, b, 3 * S)
    for side, (x, y, w, h) in g.faces("door", S).items():
        if w < 1 or h < 1:
            continue
        p.material(x, y, w, h, STEEL_D, STEEL_M, STEEL_L, contrast=0.8)
        if side == "top":
            # riveted plates, and stripes along the edge where the doors meet
            for k in range(int(x) + 4 * S, int(x + w), 8 * S):
                c.rect(k, y, S // 2 or 1, h, STEEL_D)
            stripes(c, x + w - 3 * S, y, 3 * S, h, a, b, 3 * S)
            if kind == "nuke":
                trefoil(c, x + w * 0.45, y + h / 2, min(w, h) * 0.3, HAZ_Y, HAZ_K)
        p.shade_edges(x, y, w, h, 0.25)
    for side, (x, y, w, h) in g.faces("panel", S).items():
        if w < 1 or h < 1:
            continue
        c.rect(x, y, w, h, (44, 46, 52))
        if side == "front":
            c.rect(x + S, y + S, w - 2 * S, h * 0.45, (20, 80, 40))                     # the screen
            for k in range(3):
                c.rect(x + 2 * S, y + 2 * S + k * S, (w - 4 * S) * (0.4 + 0.2 * k), S // 2 or 1, (90, 230, 120))
            for i, col in enumerate(((220, 40, 40), (240, 200, 40), (60, 200, 80))):     # buttons
                c.rect(x + 2 * S + i * 3 * S, y + h * 0.65, 2 * S, 2 * S, col)
    for side, (x, y, w, h) in g.faces("light", S).items():
        if w >= 1 and h >= 1:
            c.rect(x, y, w, h, (255, 70, 40, 20) if kind == "nuke" else (255, 40, 40, 20))
    return c


# =============================================================================
# The rocket in flight: a payload with a flame under it
# =============================================================================
def rocket_geometry():
    g = Geo("geometry.zt.nuke_rocket", 128, None, 3, 6, (0, 1, 0))
    payload_parts(g)
    g.part("flame", 6, 16, 6)
    g.part("flame_core", 3, 10, 3)
    g.bone("rocket", pivot=(0, 18, 0))
    payload_bones(g, "rocket")
    flame = g.bone("flame", "rocket", (0, 4, 0), cubes=[g.cube("flame", (-3, -12, -3)), g.cube("flame_core", (-1.5, -7, -1.5))])
    flame["locators"] = {"nozzle": [0, 2, 0]}          # where the exhaust's particles come out
    return g


def rocket_texture(g):
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, 7401)
    paint_payloads(c, g, p)
    for part, hot in (("flame", False), ("flame_core", True)):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w < 1 or h < 1:
                continue
            for yy in range(int(y), int(y + h)):
                t = (yy - y) / max(1, h - 1)          # 0 at the nozzle, 1 at the tail
                col = (255, int(240 - 140 * t), int(120 - 110 * t)) if not hot else (255, 255, int(220 - 80 * t))
                fade = 1 - t * 0.85
                c.rect(x, yy, w, 1, tuple(int(v * fade) for v in col))
    return c


# =============================================================================
# The mushroom cloud: a fireball, a rising stem, a cap rolling over at its top, a ring of
# condensation round the stem and a skirt of dust round its foot. Modelled four blocks tall;
# its animation grows it (the script sets how big through zt:size).
# =============================================================================
def cloud_geometry():
    g = Geo("geometry.zt.mushroom_cloud", 256, None, 512, 512, (0, 128, 0))
    g.part("fire", 16, 16, 16)
    g.part("stem_a", 12, 12, 12)
    g.part("stem_b", 9, 12, 9)
    g.part("stem_c", 11, 12, 11)
    g.part("cap", 40, 14, 40)
    g.part("cap_top", 28, 8, 28)
    g.part("roll", 14, 10, 14)
    g.part("skirt", 56, 5, 56)
    g.part("ring", 44, 1, 44)
    # (the script lifts the entity out of the ground when it stands in a block, where it would be
    # lit black; "base" sinks the model back down)
    g.bone("base", pivot=(0, 0, 0))
    g.bone("cloud", "base", (0, 0, 0))
    g.bone("fireball", "cloud", (0, 8, 0), cubes=[
        g.cube("fire", (-8, 0, -8)), g.cube("fire", (-8, 0, -8), rotation=(45, 45, 0), pivot=(0, 8, 0)),
        g.cube("fire", (-8, 0, -8), rotation=(0, 45, 45), pivot=(0, 8, 0))])
    stem = []
    for i, (part, w) in enumerate((("stem_a", 12), ("stem_b", 9), ("stem_c", 11))):
        y = i * 12
        stem.append(g.cube(part, (-w / 2, y, -w / 2)))
        stem.append(g.cube(part, (-w / 2, y, -w / 2), rotation=(0, 45, 0), pivot=(0, y, 0)))
    g.bone("stem", "cloud", (0, 0, 0), cubes=stem)
    cap = [g.cube("cap", (-20, 36, -20)), g.cube("cap", (-20, 36, -20), rotation=(0, 45, 0), pivot=(0, 36, 0)),
           g.cube("cap_top", (-14, 50, -14)), g.cube("cap_top", (-14, 50, -14), rotation=(0, 45, 0), pivot=(0, 50, 0))]
    for k in range(8):
        a = k / 8 * math.tau
        x, z = math.cos(a) * 20, math.sin(a) * 20
        cap.append(g.cube("roll", (x - 7, 32, z - 7), rotation=(0, -math.degrees(a), 0), pivot=(x, 36, z)))
    g.bone("cap", "cloud", (0, 36, 0), cubes=cap)
    g.bone("skirt", "cloud", (0, 0, 0), cubes=[
        g.cube("skirt", (-28, 0, -28)), g.cube("skirt", (-28, 0, -28), rotation=(0, 45, 0), pivot=(0, 0, 0))])
    g.bone("ring", "cloud", (0, 20, 0), cubes=[
        g.cube("ring", (-22, 20, -22)), g.cube("ring", (-22, 20, -22), rotation=(0, 45, 0), pivot=(0, 20, 0))])
    return g


def cloud_texture(g):
    """Billowing smoke: browns and greys, lit from above; the cap's underside and the fireball glow."""
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    big = fbm(c.w, c.h, 7501, cell=10, octaves=4)
    small = fbm(c.w, c.h, 7502, cell=3, octaves=2)
    smoke = [(58, 50, 46), (96, 86, 78), (138, 128, 118), (182, 174, 164)]

    def billow(x, y, w, h, side, warm=0.0, top_light=1.0):
        x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                v = big[yy, xx] * 0.7 + small[yy, xx] * 0.3
                if side not in ("top", "bottom"):
                    v += (1 - (yy - y0) / max(1, h)) * 0.25 * top_light - 0.1      # lighter toward the top
                elif side == "top":
                    v += 0.15
                else:
                    v -= 0.2
                i = int(np.clip(v, 0, 0.999) * len(smoke))
                col = smoke[i]
                if warm:
                    col = tuple(int(col[k] * (1 - warm) + (255, 120, 40)[k] * warm) for k in range(3))
                c.px(xx, yy, col)
    for part in ("stem_a", "stem_b", "stem_c", "cap", "cap_top", "roll", "skirt"):
        for side, (x, y, w, h) in g.faces(part, S).items():
            if w < 1 or h < 1:
                continue
            warm = 0.0
            if part in ("cap", "roll") and side == "bottom":
                warm = 0.55                       # the fire still glowing under the cap
            elif part.startswith("stem"):
                warm = 0.12
            billow(x, y, w, h, side, warm)
            if warm > 0.4:
                # (part of it glows: low alpha)
                c.a[int(y):int(y + h), int(x):int(x + w), 3] = 60
    for side, (x, y, w, h) in g.faces("ring", S).items():
        if w >= 1 and h >= 1:
            c.rect(x, y, w, h, (226, 230, 236))
    for side, (x, y, w, h) in g.faces("fire", S).items():
        if w < 1 or h < 1:
            continue
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                e = min(xx - x, yy - y, x + w - 1 - xx, y + h - 1 - yy) / (min(w, h) / 2)
                v = 0.4 + 0.6 * e + small[yy, xx] * 0.2
                c.px(xx, yy, (255, int(min(255, 120 + 135 * v)), int(min(255, 30 + 170 * v * v))))
    return c


# =============================================================================
# Ash, and the textures of the smoke particles
# =============================================================================
def ash_texture():
    c = Canvas(16, 16, CLEAR)
    rng = np.random.default_rng(7601)
    n = fbm(16, 16, 7602, cell=4, octaves=3)
    for y in range(16):
        for x in range(16):
            v = n[y, x] * 0.8 + rng.random() * 0.2
            col = (52, 50, 50) if v < 0.35 else ((76, 74, 72) if v < 0.6 else ((102, 100, 98) if v < 0.82 else (128, 126, 124)))
            c.px(x, y, col)
    for _ in range(3):
        c.px(rng.integers(0, 16), rng.integers(0, 16), (150, 70, 30))      # a last ember or two
    for _ in range(6):
        c.px(rng.integers(0, 16), rng.integers(0, 16), (150, 148, 146))
    c.save(out("textures", "blocks", "zt_ash.png"))


def smoke_puff():
    """A soft round puff (white: the particle tints it), 32 x 32, for the smoke particles."""
    yy, xx = np.mgrid[0:32, 0:32]
    n = fbm(32, 32, 7701, cell=6, octaves=3)
    d = np.hypot(xx + 0.5 - 16, yy + 0.5 - 16) / 15.5
    a = np.clip((1 - d) * 1.6, 0, 1) * (0.6 + 0.4 * n)
    arr = np.zeros((32, 32, 4))
    arr[..., :3] = 200 + 55 * n[..., None]
    arr[..., 3] = a * 255
    to_image(arr).save(out("textures", "particle", "zt_nuke_smoke.png"))


# =============================================================================
# Item icons (16 x 16)
# =============================================================================
def icon(rows, colors, name):
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                c.px(x, y, colors[ch])
    c.save(out("textures", "items", name + ".png"))


LITTLE_BOY = [
    "................",
    "................",
    "................",
    "............kk..",
    "..kkkkkkkkkkfk..",
    ".kmllllllllldfk.",
    "kmlLlllllllldfk.",
    "kmllllllllllddkk",
    "kmmmmmmmmmmmddkk",
    "kddmdddddddddfk.",
    ".kddddddddddkfk.",
    "..kkkkkkkkkkkk..",
    "................",
    "................",
    "................",
    "................",
]
FAT_MAN = [
    "................",
    "................",
    "......kkkkk.....",
    "....kklllllkk.kk",
    "...klLlllllllkfk",
    "..klLllllllllkfk",
    "..klllllkllllfkk",
    "..kllllkkklllfkk",
    "..kmllllkllllfkk",
    "..kmmmlllllmmkfk",
    "...kmmmmmmmmmkfk",
    "....kkmmmmmkk.kk",
    "......kkkkk.....",
    "................",
    "................",
    "................",
]
DOOMSDAY = [
    "...........kk...",
    "..........kssk..",
    ".........kwwk...",
    "........kwrrk...",
    ".......kwwwk....",
    "......kwwwk.....",
    ".....kwrrk......",
    "....kwwwk.......",
    "...kwwwk........",
    "..kRwwk.........",
    ".kRRwkR.........",
    "kRRkkRR.........",
    ".kk.kRk.........",
    ".....k..........",
    "................",
    "................",
]


def silo_icon(name, a, b, sign):
    """A little silo: a concrete well, its hatch doors half open, stripes round its rim."""
    c = Canvas(16, 16, CLEAR)
    for y in range(7, 15):
        for x in range(2, 14):
            c.px(x, y, CON_M if x < 11 else CON_D)
    for x in range(1, 15):
        c.px(x, 6, a if x % 2 else b)
        c.px(x, 15, (60, 62, 66))
    # the doors, swung up and open
    for k in range(5):
        c.px(2 + k // 2, 5 - k, STEEL_L)
        c.px(3 + k // 2, 5 - k, STEEL_M)
        c.px(13 - k // 2, 5 - k, STEEL_M)
        c.px(12 - k // 2, 5 - k, STEEL_L)
    # the payload's nose showing between them
    c.px(7, 4, (60, 66, 56) if sign == "nuke" else WHITE)
    c.px(8, 4, (60, 66, 56) if sign == "nuke" else WHITE)
    c.px(7, 5, (90, 96, 80) if sign == "nuke" else RED)
    c.px(8, 5, (90, 96, 80) if sign == "nuke" else RED)
    if sign == "nuke":
        trefoil(c, 7.5, 10.5, 3.2, HAZ_Y, HAZ_K)
    else:
        c.rect(3, 9, 10, 3, RED)
        c.rect(4, 10, 8, 1, WHITE)
    mask = c.a[..., 3] > 0
    pad = np.pad(mask, 1)
    edge = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~mask
    for y, x in zip(*np.nonzero(edge)):
        c.px(x, y, (30, 30, 34))
    c.save(out("textures", "items", name + ".png"))


def icons():
    icon(LITTLE_BOY, {"k": (24, 28, 22), "l": OLIVE_L, "L": (156, 166, 140), "m": OLIVE_M, "d": OLIVE_D, "f": (40, 44, 36)}, "zt_little_boy")
    icon(FAT_MAN, {"k": (30, 26, 16), "l": MUSTARD_L, "L": (240, 226, 160), "m": MUSTARD_M, "d": MUSTARD_D, "f": (60, 56, 44)}, "zt_fat_man")
    icon(DOOMSDAY, {"k": (26, 26, 30), "s": (60, 60, 66), "w": WHITE, "r": RED, "R": (160, 24, 24)}, "zt_doomsday_missile")
    silo_icon("zt_nuke_silo", HAZ_Y, HAZ_K, "nuke")
    silo_icon("zt_missile_silo", RED, WHITE, "missile")


def main():
    geos = []
    for ident, kind in (("geometry.zt.nuke_silo", "nuke"), ("geometry.zt.missile_silo", "missile")):
        g = silo_geometry(ident)
        silo_texture(g, kind).save(out("textures", "entity", "zt_%s_silo.png" % kind))
        geos.append(g)
    rg = rocket_geometry()
    rocket_texture(rg).save(out("textures", "entity", "zt_nuke_rocket.png"))
    cg = cloud_geometry()
    cloud_texture(cg).save(out("textures", "entity", "zt_mushroom_cloud.png"))
    with open(out("models", "entity", "nukes.geo.json"), "w") as f:
        json.dump(geometry_file(*geos, rg, cg), f, indent="\t")
        f.write("\n")
    ash_texture()
    smoke_puff()
    icons()
    print("nuke art written")


if __name__ == "__main__":
    main()
