"""Generates the Doors entities' geometry and textures: the Figure, Seek, Seek's
wall eyes and grabbing hands, the hotel door (with a number plate per door),
the falling chandelier, and the Library's glowing book, solution paper and
floor lamp.

Shapes follow the creatures' descriptions in DOORS (Roblox): the Figure is a
skinny, eyeless, red-fleshed giant (about 2.4 m) whose round head is one big
circular mouth ringed with teeth, with a ribcage, long clawed arms that drag
on the floor and glowing blisters; Seek is a humanoid of black slime with one
huge eye. Everything is drawn procedurally.

    python3 tools/gen_doors_art.py
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from geobuild import Geo, geometry_file  # noqa: E402
from texlib import Canvas, Painter, fbm, radial, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def write_json(rel, data):
    with open(out(*rel.split("/")), "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def wiggle(c, rng, x, y, steps, dx, dy, color, wobble=0.6, width=1, alpha=None):
    for _ in range(int(steps)):
        for k in range(width):
            if alpha is None:
                c.px(x + k * abs(dy), y + k * abs(dx), color)
            else:
                c.blend_px(x + k * abs(dy), y + k * abs(dx), color, alpha)
        x += dx + rng.uniform(-wobble, wobble)
        y += dy + rng.uniform(-wobble, wobble)


def region(c, rect):
    """The canvas slice under a (possibly fractional) rect, with its integer size."""
    x, y, w, h = rect
    x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
    return c.a[y0:y1, x0:x1], x1 - x0, y1 - y0


def ellipse_mask(w, h, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1.0


# =============================================================================================
# The Figure
# =============================================================================================
FS = 4  # texture pixels per unit
FLESH = ((70, 12, 12), (132, 32, 24), (188, 70, 50))
FLESH_DEEP = (48, 6, 10)
VEIN = (66, 6, 30)
BLISTER = (255, 186, 80, 16)       # low alpha: glows with entity_emissive_alpha
BLISTER_RIM = (210, 120, 60)
BONE = ((150, 128, 92), (204, 186, 146), (238, 228, 198))
MOUTH = (16, 2, 4)
GUM = (112, 26, 34)
TOOTH = (236, 226, 190)
GLOW = (255, 140, 40, 8)


def figure_geo():
    g = Geo("geometry.zt.figure", 128, 64, 3, 4, (0, 1.5, 0))
    for name, size in [
        ("head", (9, 9, 9)), ("head_x", (10, 7, 7)), ("head_y", (7, 10, 7)), ("head_z", (7, 7, 10)),
        ("chest", (9, 9, 5.5)), ("pelvis", (7, 4, 4)), ("belly", (5, 6, 3.5)), ("neck", (2.5, 4, 2.5)),
        ("thigh", (3, 11, 3)), ("shin", (2.5, 9, 2.5)), ("foot", (3, 1.5, 5)),
        ("uarm", (2.2, 14, 2.2)), ("farm", (2, 13, 2)), ("hand", (3, 3, 1.6)),
        ("rib", (9.6, 0.8, 0.6)), ("rib_side", (0.6, 0.8, 5.0)), ("sternum", (1, 7.5, 0.7)),
        ("claw", (0.7, 5, 0.7)), ("vert", (1.5, 1.5, 1)), ("tooth", (0.8, 1.8, 0.8)),
        ("glow", (5.4, 5.4, 0.2)), ("toe", (0.6, 0.6, 1.6)),
    ]:
        g.part(name, *size)

    g.bone("root")
    # legs: long and skinny, slightly bent
    for side, x in (("right", -2.5), ("left", 2.5)):
        m = side == "left"
        g.bone(side + "Thigh", "root", (x, 21, 0), cubes=[g.cube("thigh", (x - 1.5, 10, -1.5), mirror=m)])
        g.bone(side + "Shin", side + "Thigh", (x, 10.5, 0),
               cubes=[g.cube("shin", (x - 1.25, 1.5, -1.25), mirror=m)])
        g.bone(side + "Foot", side + "Shin", (x, 1.5, 0), cubes=[
            g.cube("foot", (x - 1.5, 0, -3.5), mirror=m),
            g.cube("toe", (x - 1.3, 0, -5.0), mirror=m),
            g.cube("toe", (x - 0.3, 0, -5.0), mirror=m),
            g.cube("toe", (x + 0.7, 0, -5.0), mirror=m),
        ])
    g.bone("pelvis", "root", (0, 21, 0), cubes=[g.cube("pelvis", (-3.5, 19, -2))])
    g.bone("belly", "pelvis", (0, 23, 0.5), rotation=(10, 0, 0), cubes=[
        g.cube("belly", (-2.5, 23, -1.25)),
        g.cube("vert", (-0.75, 24.0, 2.0)),
        g.cube("vert", (-0.75, 26.6, 2.0)),
    ])
    # the ribcage: a bony cage over the skinny chest
    ribs = [g.cube("chest", (-4.5, 29, -2.25))]
    for y in (30.3, 32.3, 34.3, 36.3):
        ribs.append(g.cube("rib", (-4.8, y, -2.9)))
        ribs.append(g.cube("rib_side", (-5.1, y, -2.6)))
        ribs.append(g.cube("rib_side", (4.5, y, -2.6), mirror=True))
    ribs.append(g.cube("sternum", (-0.5, 29.8, -3.2)))
    for y in (30.0, 32.6, 35.2):
        ribs.append(g.cube("vert", (-0.75, y, 3.0)))
    g.bone("chest", "belly", (0, 29, 0.5), rotation=(18, 0, 0), cubes=ribs)
    g.bone("neck", "chest", (0, 37.5, 0), rotation=(20, 0, 0), cubes=[g.cube("neck", (-1.25, 37, -1.25))])
    # a round head that is all mouth: a cube with its faces pushed out into a ball
    g.bone("head", "neck", (0, 40.5, 0), rotation=(-42, 0, 0), cubes=[
        g.cube("head", (-4.5, 40.5, -5.5)),
        g.cube("head_x", (-5, 41.5, -4.5)),
        g.cube("head_y", (-3.5, 40, -4.5)),
        g.cube("head_z", (-3.5, 41.5, -6)),
    ])
    # the mouth: a ring of crooked teeth around a dark hole that glows when it hollers
    teeth = []
    rng = np.random.default_rng(5)
    cx, cy, z = 0.0, 45.0, -6.15
    for k in range(13):
        a = k * (360 / 13) + rng.uniform(-9, 9)
        rad = 2.55 + rng.uniform(-0.25, 0.25)
        px, py = cx + math.cos(math.radians(a)) * rad, cy + math.sin(math.radians(a)) * rad
        # point each tooth at the middle of the mouth, a little crooked
        tilt = (a - 90) + rng.uniform(-20, 20)
        teeth.append(g.cube("tooth", (px - 0.4, py - 0.9, z - 0.45), rotation=(rng.uniform(-25, 25), 0, tilt),
                            pivot=(px, py, z)))
    for k in range(7):  # a second, inner ring
        a = k * (360 / 7) + 20 + rng.uniform(-12, 12)
        rad = 1.35
        px, py = cx + math.cos(math.radians(a)) * rad, cy + math.sin(math.radians(a)) * rad
        teeth.append(g.cube("tooth", (px - 0.4, py - 0.9, z + 0.05), rotation=(rng.uniform(-30, 30), 0, a - 90),
                            pivot=(px, py, z + 0.5)))
    g.bone("mouth", "head", (0, 45, -6), cubes=teeth)
    g.bone("glow", "mouth", (0, 45, -6), cubes=[g.cube("glow", (-2.7, 42.3, -6.1))])
    # long arms that drag on the floor, ending in three claws
    for side, x, sgn in (("right", -5.1, -1), ("left", 5.1, 1)):
        m = side == "left"
        g.bone(side + "Arm", "chest", (x, 36.5, 0), rotation=(-20, 0, 6 * sgn),
               cubes=[g.cube("uarm", (x - 1.1, 22.5, -1.1), mirror=m)])
        g.bone(side + "Forearm", side + "Arm", (x, 23, 0), rotation=(-12, 0, 0),
               cubes=[g.cube("farm", (x - 1.0, 10, -1.0), mirror=m)])
        claws = [g.cube("hand", (x - 1.5, 7.5, -0.8), mirror=m)]
        for k, dx in enumerate((-1.1, 0.0, 1.1)):
            claws.append(g.cube("claw", (x + dx - 0.35, 2.6, -0.6), rotation=(-18 + k * 6, 0, dx * 6 * sgn),
                                pivot=(x + dx, 7.6, -0.3), mirror=m))
        g.bone(side + "Hand", side + "Forearm", (x, 10.5, 0), cubes=claws)
    return g


def flesh_rect(c, p, rect, rng, shade=1.0, striate=True, veins=2, blisters=1):
    x, y, w, h = rect
    if w < 1 or h < 1:
        return
    p.material(x, y, w, h, *FLESH, contrast=1.3, grain=0.2)
    p.blotches(x, y, w, h, FLESH_DEEP, threshold=0.6, soft=0.08, alpha=0.55)
    if striate and w >= 4:
        # muscle striations running along the limb
        for sx in range(int(x), int(x + w), 3):
            col = (100, 18, 18) if rng.random() < 0.5 else (166, 52, 38)
            for sy in range(int(y), int(y + h)):
                if rng.random() < 0.85:
                    c.blend_px(sx + rng.integers(0, 2), sy, col, 0.35)
    for _ in range(veins):
        wiggle(c, rng, x + rng.uniform(0.1, 0.9) * w, y + rng.uniform(0.0, 0.2) * h, h * 0.8,
               rng.uniform(-0.3, 0.3), 1.0, VEIN, wobble=0.7, alpha=0.8)
    for _ in range(blisters):
        if w < 6 or h < 6:
            break
        bx, by = x + rng.uniform(0.2, 0.8) * w, y + rng.uniform(0.2, 0.8) * h
        r = rng.uniform(1.6, 2.6)
        for yy in range(int(by - r - 1), int(by + r + 2)):
            for xx in range(int(bx - r - 1), int(bx + r + 2)):
                d = math.hypot(xx + 0.5 - bx, yy + 0.5 - by)
                if x <= xx < x + w and y <= yy < y + h:
                    if d <= r * 0.7:
                        c.px(xx, yy, BLISTER)
                    elif d <= r + 0.6:
                        c.blend_px(xx, yy, BLISTER_RIM, 0.7)
    p.shade_edges(x, y, w, h, amount=0.25)
    if shade != 1.0:
        c.a[int(y):int(y + h), int(x):int(x + w), :3] *= shade


def bone_rect(c, p, rect, rng, tip=False):
    x, y, w, h = rect
    if w < 1 or h < 1:
        return
    p.material(x, y, w, h, *BONE, contrast=1.0, grain=0.15)
    p.shade_edges(x, y, w, h, amount=0.2)
    if tip:
        # dark, bloodied claw tips
        reg, W, H = region(c, rect)
        yy = np.arange(H)[:, None]
        t = np.clip((yy - H * 0.55) / (H * 0.45), 0, 1)[..., None] * 0.8
        reg[..., :3] = reg[..., :3] * (1 - t) + np.array((60, 30, 26)) * t


def figure_texture(g):
    c = Canvas(g.tw * FS, g.th * FS, CLEAR)
    p = Painter(c, seed=501)
    rng = np.random.default_rng(503)
    for part in g.parts:
        f = g.faces(part, FS)
        if part in ("rib", "rib_side", "sternum", "vert"):
            for rect in f.values():
                bone_rect(c, p, rect, rng)
        elif part == "claw":
            for rect in f.values():
                bone_rect(c, p, rect, rng, tip=True)
        elif part == "toe":
            for rect in f.values():
                bone_rect(c, p, rect, rng, tip=True)
        elif part == "tooth":
            for rect in f.values():
                x, y, w, h = rect
                p.material(x, y, w, h, (190, 176, 130), TOOTH, (250, 246, 228), contrast=0.8)
                c.rect(x, y + h - max(1, h // 4), w, max(1, h // 4), (150, 120, 90))
        elif part == "glow":
            for rect in f.values():
                x, y, w, h = rect
                c.rect(x, y, w, h, GLOW)
        elif part == "chest":
            for side, rect in f.items():
                flesh_rect(c, p, rect, rng, shade=0.8, veins=1, blisters=0)
                if side in ("front", "right", "left", "back"):
                    x, y, w, h = rect
                    # rib shadows between the bars
                    for k in range(4):
                        yy = y + h - (k * 2 + 1.3) * FS
                        c.rect(x, yy, w, 0.6 * FS, (38, 4, 6))
        elif part.startswith("head"):
            for side, rect in f.items():
                flesh_rect(c, p, rect, rng, veins=2, blisters=1 if side != "bottom" else 0)
        else:
            for side, rect in f.items():
                flesh_rect(c, p, rect, rng, shade=0.9 if part in ("foot", "hand") else 1.0)

    # the mouth: a huge circular hole on the front of the head, gums and tooth sockets around it
    x, y, w, h = g.faces("head_z", FS)["front"]
    cxp, cyp = x + w / 2, y + h / 2 + 0.0
    for yy in range(int(y), int(y + h)):
        for xx in range(int(x), int(x + w)):
            d = math.hypot(xx + 0.5 - cxp, yy + 0.5 - cyp) / FS
            if d < 2.2:
                k = d / 2.2
                c.px(xx, yy, tuple(int(v) for v in np.array(MOUTH) * (1 - k) + np.array((60, 8, 12)) * k))
            elif d < 3.1:
                c.blend_px(xx, yy, GUM, 0.85)
            elif d < 3.4:
                c.blend_px(xx, yy, (80, 14, 18), 0.6)
    # a vein over the crown and a scar on top
    tx, ty, tw_, th_ = g.faces("head_y", FS)["top"]
    wiggle(c, rng, tx + tw_ * 0.5, ty + 1, th_ - 2, 0.0, 1.0, VEIN, wobble=0.9, width=2)
    for k in range(int(tw_ * 0.6)):
        c.px(tx + tw_ * 0.2 + k, ty + th_ * 0.35 + k * 0.15, (220, 150, 120))
    # cysts on the back of the head
    bx, by, bw, bh = g.faces("head_z", FS)["back"]
    for _ in range(4):
        cx2, cy2, r = bx + rng.uniform(0.2, 0.8) * bw, by + rng.uniform(0.2, 0.8) * bh, rng.uniform(1.5, 3)
        for yy in range(int(cy2 - r), int(cy2 + r + 1)):
            for xx in range(int(cx2 - r), int(cx2 + r + 1)):
                if math.hypot(xx - cx2, yy - cy2) <= r:
                    c.blend_px(xx, yy, (210, 120, 90), 0.6)
    c.save(out("textures", "entity", "doors", "figure.png"))


# =============================================================================================
# Seek
# =============================================================================================
SS = 4
GOO = ((6, 6, 9), (18, 18, 26), (44, 46, 62))
GOO_SHINE = (96, 100, 128)
EYE_WHITE = (238, 236, 230, 150)   # a little emissive so the eye catches the light
VEIN_RED = (170, 30, 30, 150)
PUPIL = (6, 4, 6)


def seek_geo():
    g = Geo("geometry.zt.seek", 128, 64, 3, 3.5, (0, 1.2, 0))
    for name, size in [
        ("puddle", (24, 0.2, 24)), ("torso", (6, 11, 3.6)), ("hips", (5.4, 3, 3.2)), ("head", (7, 7, 6.5)),
        ("head_round", (5.6, 8.2, 5.2)), ("eye", (5, 4.4, 1)), ("pupil", (2, 2, 0.4)),
        ("thigh", (2.6, 8, 2.6)), ("shin", (2.2, 7.5, 2.2)), ("foot", (3.2, 1, 4)),
        ("uarm", (1.6, 12, 1.6)), ("farm", (1.4, 11, 1.4)), ("hand", (2.4, 3, 1.4)), ("finger", (0.5, 3.5, 0.5)),
        ("drip", (0.8, 2, 0.8)), ("drip_long", (0.6, 3.5, 0.6)),
    ]:
        g.part(name, *size)
    g.bone("root")
    g.bone("puddle", "root", (0, 0, 0), cubes=[g.cube("puddle", (-12, 0.02, -12))])
    g.bone("body", "root", (0, 15, 0))
    g.bone("hips", "body", (0, 15, 0), cubes=[g.cube("hips", (-2.7, 14, -1.6))])
    g.bone("torso", "hips", (0, 17, 0), rotation=(8, 0, 0), cubes=[
        g.cube("torso", (-3, 17, -1.8)),
        g.cube("drip", (-2.4, 15.6, -2.1)),
        g.cube("drip_long", (1.2, 14.2, -2.0)),
        g.cube("drip", (1.8, 16.0, 1.2)),
    ])
    g.bone("head", "torso", (0, 28, 0), cubes=[
        g.cube("head", (-3.5, 28, -3.5)),
        g.cube("head_round", (-2.8, 27.4, -2.9)),
        g.cube("eye", (-2.5, 29.6, -4.3)),
        g.cube("drip", (-2.9, 26.4, -3.2)),
        g.cube("drip_long", (2.0, 25.2, -3.0)),
    ])
    g.bone("pupil", "head", (0, 31.8, -4.3), cubes=[g.cube("pupil", (-1, 30.8, -4.65))])
    for side, x in (("right", -1.8), ("left", 1.8)):
        m = side == "left"
        g.bone(side + "Thigh", "body", (x, 15, 0), cubes=[g.cube("thigh", (x - 1.3, 7, -1.3), mirror=m)])
        g.bone(side + "Shin", side + "Thigh", (x, 7.5, 0), cubes=[
            g.cube("shin", (x - 1.1, 0, -1.1), mirror=m),
            g.cube("foot", (x - 1.6, 0, -2.6), mirror=m),
        ])
    for side, x, sgn in (("right", -4.2, -1), ("left", 4.2, 1)):
        m = side == "left"
        # long, thin arms held a little away from the body
        g.bone(side + "Arm", "torso", (x, 27, 0), rotation=(0, 0, 9 * sgn), cubes=[
            g.cube("uarm", (x - 0.8, 15, -0.8), mirror=m),
            g.cube("drip", (x - 0.4, 14.0, 0.3), mirror=m),
        ])
        g.bone(side + "Forearm", side + "Arm", (x, 15.5, 0), rotation=(-8, 0, -3 * sgn), cubes=[
            g.cube("farm", (x - 0.7, 4.5, -0.7), mirror=m),
        ])
        fingers = [g.cube("hand", (x - 1.2, 2, -0.7), mirror=m)]
        for k, dx in enumerate((-0.8, 0.0, 0.8)):
            fingers.append(g.cube("finger", (x + dx - 0.25, -1.4, -0.25), rotation=(-10, 0, dx * 10 * sgn),
                                  pivot=(x + dx, 2.1, 0), mirror=m))
        g.bone(side + "Hand", side + "Forearm", (x, 5, 0), cubes=fingers)
    return g


def goo_rect(c, p, rect, rng, eyes=0, shine=2):
    x, y, w, h = rect
    if w < 1 or h < 1:
        return
    p.material(x, y, w, h, *GOO, contrast=1.4, grain=0.1)
    # glossy streaks running down
    for _ in range(shine):
        if w < 3:
            break
        wiggle(c, rng, x + rng.uniform(0.15, 0.85) * w, y + rng.uniform(0, 0.3) * h, h * rng.uniform(0.3, 0.7),
               rng.uniform(-0.15, 0.15), 1.0, GOO_SHINE, wobble=0.3, alpha=0.55)
    # small staring eyes in the slime
    for _ in range(eyes):
        if w < 8 or h < 8:
            break
        ex, ey = x + rng.uniform(0.2, 0.8) * w, y + rng.uniform(0.2, 0.8) * h
        r = rng.uniform(1.4, 2.4)
        for yy in range(int(ey - r - 1), int(ey + r + 2)):
            for xx in range(int(ex - r * 1.4 - 1), int(ex + r * 1.4 + 2)):
                d = math.hypot((xx + 0.5 - ex) / 1.4, yy + 0.5 - ey)
                if d <= r and x <= xx < x + w and y <= yy < y + h:
                    c.px(xx, yy, (200, 198, 190) if d > r * 0.45 else PUPIL)
    p.shade_edges(x, y, w, h, amount=0.3)


def seek_texture(g):
    c = Canvas(g.tw * SS, g.th * SS, CLEAR)
    p = Painter(c, seed=601)
    rng = np.random.default_rng(603)
    for part in g.parts:
        f = g.faces(part, SS)
        for side, rect in f.items():
            if part == "eye":
                x, y, w, h = rect
                if side == "front":
                    # a huge bloodshot eye
                    c.rect(x, y, w, h, EYE_WHITE)
                    for _ in range(9):
                        sx, sy = (x, y + rng.uniform(0, h)) if rng.random() < 0.5 else (x + w - 1, y + rng.uniform(0, h))
                        wiggle(c, rng, sx, sy, w * 0.35, 1.0 if sx == x else -1.0, rng.uniform(-0.4, 0.4), VEIN_RED,
                               wobble=0.5)
                    p.shade_edges(x, y, w, h, amount=0.25)
                else:
                    goo_rect(c, p, rect, rng, shine=0)
            elif part == "pupil":
                x, y, w, h = rect
                c.rect(x, y, w, h, PUPIL)
                if side == "front":
                    # a dark red iris ring and a glint
                    reg, W, H = region(c, rect)
                    yy, xx = np.mgrid[0:H, 0:W]
                    d = np.hypot(xx + 0.5 - W / 2, yy + 0.5 - H / 2) / (W / 2)
                    reg[(d > 0.55) & (d <= 1.0)] = (70, 10, 14, 255)
                    c.px(x + w * 0.3, y + h * 0.28, (240, 240, 240, 120))
            elif part == "puddle":
                x, y, w, h = rect
                if side in ("top", "bottom"):
                    # an irregular pool of slime (cut out with alpha test)
                    reg, W, H = region(c, rect)
                    n = fbm(W, H, 611, cell=10, octaves=3)
                    yy, xx = np.mgrid[0:H, 0:W]
                    d = np.hypot(xx + 0.5 - W / 2, yy + 0.5 - H / 2) / (W / 2)
                    inside = d + (n - 0.5) * 0.5 < 0.86
                    g0, g1 = np.array(GOO[0]), np.array(GOO[2])
                    col = g0 + (g1 - g0) * (n[..., None] * 0.5)
                    reg[..., :3] = col
                    reg[..., 3] = np.where(inside, 255, 0)
                    # wet highlights
                    for _ in range(14):
                        hx, hy = rng.uniform(0.25, 0.75) * W, rng.uniform(0.25, 0.75) * H
                        if inside[int(hy), int(hx)]:
                            c.rect(x + hx, y + hy, rng.integers(2, 5), 1, GOO_SHINE)
            else:
                eyes = 1 if part in ("torso", "uarm", "head", "thigh") and side in ("front", "left", "right") else 0
                goo_rect(c, p, rect, rng, eyes=eyes)
    c.save(out("textures", "entity", "doors", "seek.png"))


# =============================================================================================
# Seek's eyes on the walls
# =============================================================================================
def eye_geo():
    g = Geo("geometry.zt.seek_eye", 32, 32, 1.5, 1.5, (0, 0, 0))
    g.part("blob", 9, 7, 0.4)
    g.part("sclera", 4.6, 3.4, 0.8)
    g.part("iris", 2.2, 2.2, 0.3)
    g.part("blob_small", 6, 5, 0.4)
    g.part("sclera_small", 3.2, 2.4, 0.6)
    g.part("iris_small", 1.6, 1.6, 0.3)
    g.bone("root")
    g.bone("eye", "root", (0, 0, 0), cubes=[g.cube("blob", (-4.5, -3.5, -0.2)), g.cube("sclera", (-2.3, -1.7, -1.0))])
    g.bone("pupil", "eye", (0, 0, -1.0), cubes=[g.cube("iris", (-1.1, -1.1, -1.25))])
    # a second, smaller eye that some of them have
    g.bone("eye2", "root", (3.5, 3.0, 0), cubes=[g.cube("blob_small", (0.5, 0.5, -0.15)),
                                                  g.cube("sclera_small", (1.9, 1.8, -0.75))])
    g.bone("pupil2", "eye2", (3.5, 3.0, -0.75), cubes=[g.cube("iris_small", (2.7, 2.2, -0.98))])
    return g


def eye_texture(g):
    S = 8
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=701)
    rng = np.random.default_rng(703)
    for part in g.parts:
        for side, rect in g.faces(part, S).items():
            x, y, w, h = rect
            if w < 1 or h < 1:
                continue
            if part.startswith("blob"):
                if side != "front":
                    continue    # left transparent: the splat is cut out of a thin plate
                p.material(x, y, w, h, *GOO, contrast=1.3)
                if side == "front":
                    # ragged slime splat: cut out the corners
                    reg, W, H = region(c, rect)
                    n = fbm(W, H, 705 + int(x), cell=6, octaves=2)
                    yy, xx = np.mgrid[0:H, 0:W]
                    d = np.hypot((xx + 0.5 - W / 2) / (W / 2), (yy + 0.5 - H / 2) / (H / 2))
                    reg[..., 3] = np.where(d + (n - 0.5) * 0.6 < 0.95, 255, 0)
                    for _ in range(4):
                        c.rect(x + rng.uniform(0.3, 0.7) * w, y + rng.uniform(0.2, 0.8) * h, 3, 1, GOO_SHINE)
            elif part.startswith("sclera"):
                c.rect(x, y, w, h, (226, 224, 216, 255))
                if side == "front":
                    reg, W, H = region(c, rect)
                    yy, xx = np.mgrid[0:H, 0:W]
                    d = np.hypot((xx + 0.5 - W / 2) / (W / 2), (yy + 0.5 - H / 2) / (H / 2))
                    reg[d > 1.0] = (12, 12, 16, 255)
                    for _ in range(4):
                        wiggle(c, rng, x + (0 if rng.random() < 0.5 else w - 1), y + rng.uniform(0.3, 0.7) * h,
                               w * 0.25, 1.0 if rng.random() < 0.5 else -1.0, rng.uniform(-0.3, 0.3), (160, 40, 40))
            else:
                if side != "front":
                    c.rect(x, y, w, h, PUPIL)
                    continue
                # a round black pupil with a glint
                reg, W, H = region(c, rect)
                yy, xx = np.mgrid[0:H, 0:W]
                d = np.hypot(xx + 0.5 - W / 2, yy + 0.5 - H / 2) / (W / 2)
                reg[d <= 1.0] = PUPIL + (255,)
                reg[(d > 0.62) & (d <= 1.0)] = (40, 8, 10, 255)
                c.px(x + w * 0.32, y + h * 0.3, (220, 220, 220))
    c.save(out("textures", "entity", "doors", "seek_eye.png"))


# =============================================================================================
# Seek's hands (they burst through the windows of the last hall)
# =============================================================================================
def hand_geo():
    g = Geo("geometry.zt.seek_hand", 128, 64, 2, 5, (0, 0, 0))
    for name, size in [("uarm", (3.2, 3.2, 14)), ("farm", (2.8, 2.8, 13)), ("palm", (5, 1.6, 4.5)),
                       ("fing", (1, 1, 4)), ("fing2", (0.9, 0.9, 3.5)), ("thumb", (1, 1, 3.5)),
                       ("drip", (0.8, 2, 0.8))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("arm", "root", (0, 0, 0), cubes=[
        g.cube("uarm", (-1.6, -1.6, -14)),
        g.cube("drip", (-0.4, -3.4, -8)),
        g.cube("drip", (0.6, -3.2, -12.5)),
    ])
    g.bone("forearm", "arm", (0, 0, -13.5), cubes=[g.cube("farm", (-1.4, -1.4, -26.5)), g.cube("drip", (-0.4, -3.0, -21))])
    g.bone("palm", "forearm", (0, 0, -26), cubes=[g.cube("palm", (-2.5, -0.8, -30.5))])
    for k, x in enumerate((-1.9, -0.65, 0.65, 1.9)):
        g.bone("finger%d" % k, "palm", (x, 0, -30.2), cubes=[g.cube("fing", (x - 0.5, -0.5, -34.2))])
        g.bone("finger%db" % k, "finger%d" % k, (x, 0, -34), cubes=[g.cube("fing2", (x - 0.45, -0.45, -37.5))])
    g.bone("thumb", "palm", (2.4, 0, -27.5), rotation=(0, 40, 0), cubes=[g.cube("thumb", (1.9, -0.5, -31))])
    return g


def hand_texture(g):
    S = 4
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=801)
    rng = np.random.default_rng(803)
    for part in g.parts:
        for side, rect in g.faces(part, S).items():
            goo_rect(c, p, rect, rng, eyes=1 if part in ("uarm", "farm") and side in ("top", "left", "right") else 0,
                     shine=3)
    c.save(out("textures", "entity", "doors", "seek_hand.png"))


# =============================================================================================
# Hotel door: a dark wooden door, brass knob, padlock, and a number plate drawn per door
# =============================================================================================
WOOD = ((44, 20, 12), (74, 36, 20), (104, 56, 32))
BRASS = ((120, 84, 24), (196, 150, 56), (246, 214, 120))
DIGITS = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "011", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
}
# the plates the add-on needs: the Seek chase (doors 30-40), the Library (50 and 51) and a blank one
PLATES = [None] + list(range(30, 41)) + [50, 51]


def door_geo():
    g = Geo("geometry.zt.hotel_door", 128, 64, 4, 4, (0, 1.5, 0))
    for name, size in [("leaf", (32, 48, 2)), ("knob", (1.5, 1.5, 1.5)), ("rose", (1.4, 4, 0.4)),
                       ("hasp", (1, 3.5, 0.5)), ("lock", (3.2, 3.2, 1.4)), ("shackle", (2.2, 2.2, 0.5))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("hinge", "root", (16, 0, 0), cubes=[
        g.cube("leaf", (-16, 0, -1)),
        g.cube("rose", (-14.2, 20.5, -1.35)),
        g.cube("rose", (-14.2, 20.5, 0.95)),
        g.cube("knob", (-14.25, 22, -2.6)),
        g.cube("knob", (-14.25, 22, 1.1)),
    ])
    g.bone("padlock", "hinge", (-13.5, 27, -2), cubes=[
        g.cube("hasp", (-14.0, 25.0, -1.5)),
        g.cube("lock", (-15.1, 24.2, -3.0)),
        g.cube("shackle", (-14.6, 27.4, -2.55)),
    ])
    return g


def door_plate_geo():
    g = Geo("geometry.zt.hotel_door_plate", 32, 16, 4, 4, (0, 1.5, 0))
    g.part("plate", 10, 3.5, 0.3)
    g.bone("root")
    g.bone("hinge", "root", (16, 0, 0), cubes=[g.cube("plate", (-5, 34, -1.3))])
    return g


def door_texture(g):
    S = 4
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=901)
    rng = np.random.default_rng(903)
    for part in g.parts:
        for side, rect in g.faces(part, S).items():
            x, y, w, h = rect
            if w < 1 or h < 1:
                continue
            if part == "leaf":
                p.material(x, y, w, h, *WOOD, contrast=1.1, grain=0.12)
                # vertical wood grain
                for gx in range(int(x), int(x + w)):
                    if rng.random() < 0.3:
                        col = (36, 16, 10) if rng.random() < 0.6 else (112, 62, 36)
                        for gy in range(int(y), int(y + h)):
                            if rng.random() < 0.7:
                                c.blend_px(gx, gy, col, 0.25)
                if side in ("front", "back"):
                    # raised panels: two tall ones below, two short ones above, with bevels
                    U = S
                    for (px0, py0, pw, ph) in ((3, 4, 11, 9), (18, 4, 11, 9), (3, 16, 11, 26), (18, 16, 11, 26)):
                        if side == "back":
                            px0 = 32 - px0 - pw
                        X0, Y0, W0, H0 = x + px0 * U, y + py0 * U, pw * U, ph * U
                        c.rect(X0, Y0, W0, U, (118, 66, 40))          # lit top bevel
                        c.rect(X0, Y0, U, H0, (100, 54, 32))          # lit left bevel
                        c.rect(X0, Y0 + H0 - U, W0, U, (26, 10, 6))   # shadowed bottom bevel
                        c.rect(X0 + W0 - U, Y0, U, H0, (32, 14, 8))   # shadowed right bevel
                        c.a[int(Y0 + U):int(Y0 + H0 - U), int(X0 + U):int(X0 + W0 - U), :3] *= 0.86
                    p.shade_edges(x, y, w, h, amount=0.3, width=S * 1.5)
            elif part in ("knob", "rose", "hasp"):
                p.material(x, y, w, h, *BRASS, contrast=1.0)
            elif part == "lock":
                p.material(x, y, w, h, (60, 62, 70), (110, 114, 124), (170, 176, 188), contrast=1.0)
                if side == "front":
                    c.rect(x + w / 2 - 1, y + h * 0.45, 2, h * 0.35, (20, 20, 24))   # keyhole
                p.shade_edges(x, y, w, h, amount=0.3)
            elif part == "shackle":
                p.material(x, y, w, h, (120, 124, 134), (176, 180, 190), (220, 224, 232), contrast=0.8)
    c.save(out("textures", "entity", "doors", "hotel_door.png"))


def plate_textures(g):
    S = 8
    for i, number in enumerate(PLATES):
        c = Canvas(g.tw * S, g.th * S, CLEAR)
        p = Painter(c, seed=950 + i)
        for side, rect in g.faces("plate", S).items():
            x, y, w, h = rect
            if w < 1 or h < 1:
                continue
            p.material(x, y, w, h, *BRASS, contrast=0.9, grain=0.08)
            if side == "front":
                p.shade_edges(x, y, w, h, amount=0.35, width=3)
                c.rect(x + 2, y + 2, w - 4, 1, (250, 224, 140))
                if number is not None:
                    # four engraved digits: "0030"
                    text = "%04d" % number
                    k = 4  # pixels per font cell
                    tw_ = len(text) * 3 * k + (len(text) - 1) * k
                    tx = x + (w - tw_) / 2
                    ty = y + (h - 5 * k) / 2
                    for ch in text:
                        for gy, row in enumerate(DIGITS[ch]):
                            for gx, bit in enumerate(row):
                                if bit == "1":
                                    c.rect(tx + gx * k, ty + gy * k, k, k, (30, 18, 8))
                        tx += 4 * k
        c.save(out("textures", "entity", "doors", "plates", "plate_%s.png" % ("blank" if number is None else number)))


# =============================================================================================
# Chandelier (falls and burns in the last hall)
# =============================================================================================
def chandelier_geo():
    g = Geo("geometry.zt.chandelier", 64, 64, 3, 3, (0, 0.8, 0))
    for name, size in [("chain", (1, 18, 1)), ("hub", (4, 3, 4)), ("stem", (2, 5, 2)), ("finial", (1.5, 2, 1.5)),
                       ("ring", (8, 1, 8)), ("arm", (0.8, 0.8, 7)), ("up", (0.8, 2.5, 0.8)), ("cup", (2.4, 0.8, 2.4)),
                       ("candle", (0.9, 3, 0.9)), ("flame", (0.7, 1.3, 0.7)), ("crystal", (0.6, 2, 0.6))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("chain", "root", (0, 10, 0), cubes=[g.cube("chain", (-0.5, 10, -0.5))])
    g.bone("body", "root", (0, 7.5, 0), cubes=[
        g.cube("hub", (-2, 7, -2)),
        g.cube("stem", (-1, 2, -1)),
        g.cube("finial", (-0.75, 0, -0.75)),
        g.cube("ring", (-4, 6.5, -4)),
    ])
    for k in range(6):
        g.bone("arm%d" % k, "body", (0, 7.5, 0), rotation=(0, k * 60 + 30, 0), cubes=[
            g.cube("arm", (-0.4, 7.1, -9)),
            g.cube("up", (-0.4, 7.1, -9.4)),
            g.cube("cup", (-1.2, 9.6, -10.2)),
            g.cube("candle", (-0.45, 10.4, -9.45)),
            g.cube("flame", (-0.35, 13.4, -9.35)),
            g.cube("crystal", (-0.3, 4.6, -6.3)),
        ])
    return g


def chandelier_texture(g):
    S = 4
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=1001)
    for part in g.parts:
        for side, rect in g.faces(part, S).items():
            x, y, w, h = rect
            if w < 1 or h < 1:
                continue
            if part == "chain":
                p.material(x, y, w, h, (30, 26, 22), (70, 62, 50), (120, 108, 86))
                for yy in range(int(y), int(y + h), 6):
                    c.rect(x, yy, w, 2, (24, 20, 16))
            elif part == "candle":
                p.material(x, y, w, h, (196, 188, 166), (232, 226, 206), (250, 248, 238), contrast=0.6)
            elif part == "flame":
                c.rect(x, y, w, h, (255, 196, 80, 10))
                c.rect(x, y, w, h * 0.4, (255, 240, 170, 6))
            elif part == "crystal":
                p.material(x, y, w, h, (150, 190, 210), (200, 230, 240), (245, 252, 255), contrast=0.8)
            else:
                p.material(x, y, w, h, *BRASS, contrast=1.1)
                p.shade_edges(x, y, w, h, amount=0.25)
    c.save(out("textures", "entity", "doors", "chandelier.png"))


# =============================================================================================
# The Library's props: a glowing book, the solution paper, the floor lamp
# =============================================================================================
def book_geo():
    g = Geo("geometry.zt.library_book", 32, 32, 1, 1, (0, 0.3, 0))
    g.part("book", 2.5, 9, 7)
    g.bone("root")
    g.bone("book", "root", (0, 0, 0), cubes=[g.cube("book", (-1.25, 0, -2.5))])
    return g


MOON = ["..111.", ".11...", "11....", "11....", "11....", ".11...", "..111."]


def book_texture(g):
    S = 8
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=1101)
    for side, rect in g.faces("book", S).items():
        x, y, w, h = rect
        if side in ("top", "bottom", "back"):
            # page edges
            p.material(x, y, w, h, (200, 186, 150), (226, 214, 180), (244, 236, 210), contrast=0.6)
            for yy in range(int(y), int(y + h), 2):
                c.rect(x, yy, w, 1, (190, 176, 140))
            continue
        p.material(x, y, w, h, (14, 26, 70), (28, 50, 120), (52, 84, 170), contrast=0.9)
        if side == "front":
            # the spine: glowing gold bands and the moon symbol
            c.rect(x, y + 6, w, 3, (255, 214, 110, 30))
            c.rect(x, y + h - 9, w, 3, (255, 214, 110, 30))
            mx, my = x + (w - 6 * 2) / 2, y + h / 2 - 7
            for gy, row in enumerate(MOON):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        c.rect(mx + gx * 2, my + gy * 2, 2, 2, (190, 230, 255, 12))
        else:
            p.shade_edges(x, y, w, h, amount=0.3)
            c.rect(x, y, w, 2, (120, 170, 255, 60))
    c.save(out("textures", "entity", "doors", "library_book.png"))


def paper_geo():
    g = Geo("geometry.zt.library_paper", 64, 32, 1, 1, (0, 0, 0))
    g.part("paper", 9, 0.2, 12)
    g.bone("root")
    g.bone("paper", "root", (0, 0, 0), cubes=[g.cube("paper", (-4.5, 0, -6), rotation=(0, 14, 0), pivot=(0, 0, 0))])
    return g


SHAPE_DOODLES = ["triangle", "star", "circle", "square", "heart"]


def draw_shape(c, name, cx, cy, r, color, width=1):
    """Outline (or filled) shapes for paper doodles and icons."""
    pts = []
    if name == "circle":
        for k in range(48):
            a = k / 48 * 2 * math.pi
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    else:
        n = {"triangle": 3, "square": 4, "pentagon": 5, "hexagon": 6, "diamond": 4}.get(name)
        if n:
            rot = {"triangle": -90, "square": 45, "pentagon": -90, "hexagon": 0, "diamond": -90}[name]
            for k in range(n + 1):
                a = math.radians(rot + k * 360 / n)
                rr = r * (0.62 if name == "diamond" and k % 2 == 1 else 1.0)
                pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        elif name == "star":
            for k in range(11):
                a = math.radians(-90 + k * 36)
                rr = r if k % 2 == 0 else r * 0.45
                pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        elif name == "heart":
            for k in range(49):
                t = k / 48 * 2 * math.pi
                hx = 16 * math.sin(t) ** 3
                hy = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
                pts.append((cx + hx / 17 * r, cy + hy / 17 * r))
        elif name == "cross":
            q = r * 0.38
            pts = [(cx - q, cy - r), (cx + q, cy - r), (cx + q, cy - q), (cx + r, cy - q), (cx + r, cy + q), (cx + q, cy + q),
                   (cx + q, cy + r), (cx - q, cy + r), (cx - q, cy + q), (cx - r, cy + q), (cx - r, cy - q), (cx - q, cy - q),
                   (cx - q, cy - r)]
        elif name == "crescent":
            for k in range(25):
                a = math.radians(40 + k * 280 / 24)
                pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
            for k in range(25):
                a = math.radians(320 - k * 280 / 24)
                pts.append((cx + r * 0.42 + math.cos(a) * r * 0.78, cy + math.sin(a) * r * 0.78))
            pts.append(pts[0])
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for s in range(steps + 1):
            t = s / steps
            for wx in range(width):
                for wy in range(width):
                    c.px(x0 + (x1 - x0) * t + wx - width // 2, y0 + (y1 - y0) * t + wy - width // 2, color)
    return pts


def paper_texture(g):
    S = 8
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=1201)
    rng = np.random.default_rng(1203)
    for side, rect in g.faces("paper", S).items():
        x, y, w, h = rect
        if w < 1 or h < 1:
            continue
        p.material(x, y, w, h, (196, 178, 136, 120), (226, 212, 172, 120), (244, 234, 204, 120), contrast=0.7)
        if side == "top":
            # a scrawled heading, a row of five shapes and some notes
            for k in range(int(w * 0.5)):
                c.px(x + w * 0.25 + k, y + 8 + rng.integers(0, 2), (60, 40, 30, 200))
            for i, shape in enumerate(SHAPE_DOODLES):
                draw_shape(c, shape, x + w * (0.13 + i * 0.185), y + h * 0.36, 4.5, (40, 30, 26, 230))
            for line in range(5):
                ly = y + h * 0.55 + line * 7
                for k in range(int(w * rng.uniform(0.4, 0.8))):
                    if rng.random() < 0.8:
                        c.px(x + 6 + k, ly + rng.integers(0, 2), (70, 54, 44, 200))
            p.shade_edges(x, y, w, h, amount=0.25, width=3)
    c.save(out("textures", "entity", "doors", "library_paper.png"))


def lamp_geo():
    g = Geo("geometry.zt.library_lamp", 64, 64, 2, 2.5, (0, 1, 0))
    for name, size in [("base", (5, 1, 5)), ("pole", (1, 22, 1)), ("shade", (8, 4, 8)), ("shade_top", (6, 2, 6)),
                       ("bulb", (2, 2, 2)), ("fringe", (8.4, 0.8, 8.4))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("lamp", "root", (0, 0, 0), cubes=[
        g.cube("base", (-2.5, 0, -2.5)),
        g.cube("pole", (-0.5, 1, -0.5)),
        g.cube("bulb", (-1, 21.5, -1)),
        g.cube("shade", (-4, 21, -4)),
        g.cube("shade_top", (-3, 25, -3)),
        g.cube("fringe", (-4.2, 20.4, -4.2)),
    ])
    return g


def lamp_texture(g):
    S = 4
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=1301)
    for part in g.parts:
        for side, rect in g.faces(part, S).items():
            x, y, w, h = rect
            if w < 1 or h < 1:
                continue
            if part in ("base", "pole"):
                p.material(x, y, w, h, *BRASS, contrast=1.0)
            elif part == "bulb":
                c.rect(x, y, w, h, (255, 236, 170, 6))
            elif part == "fringe":
                p.material(x, y, w, h, (120, 80, 40), (160, 110, 60), (200, 150, 90), contrast=1.2)
            else:
                # a cream fabric shade lit from inside
                p.material(x, y, w, h, (196, 170, 120, 90), (232, 210, 160, 90), (250, 236, 196, 90), contrast=0.7)
                for xx in range(int(x), int(x + w), 4):
                    c.rect(xx, y, 1, h, (200, 176, 130, 90))
    c.save(out("textures", "entity", "doors", "library_lamp.png"))


def invisible_geo():
    g = Geo("geometry.zt.invisible", 16, 16, 1, 1, (0, 0, 0))
    g.part("dot", 0.01, 0.01, 0.01)
    g.bone("root", cubes=[g.cube("dot", (0, 0, 0))])
    return g


def main():
    fig = figure_geo()
    write_json("models/entity/figure.geo.json", geometry_file(fig))
    figure_texture(fig)
    sk = seek_geo()
    write_json("models/entity/seek.geo.json", geometry_file(sk))
    seek_texture(sk)
    ey = eye_geo()
    write_json("models/entity/seek_eye.geo.json", geometry_file(ey))
    eye_texture(ey)
    hd = hand_geo()
    write_json("models/entity/seek_hand.geo.json", geometry_file(hd))
    hand_texture(hd)
    dr, pl = door_geo(), door_plate_geo()
    write_json("models/entity/hotel_door.geo.json", geometry_file(dr, pl))
    door_texture(dr)
    plate_textures(pl)
    ch = chandelier_geo()
    write_json("models/entity/chandelier.geo.json", geometry_file(ch))
    chandelier_texture(ch)
    bk, pp, lp = book_geo(), paper_geo(), lamp_geo()
    write_json("models/entity/library_props.geo.json", geometry_file(bk, pp, lp))
    book_texture(bk)
    paper_texture(pp)
    lamp_texture(lp)
    inv = invisible_geo()
    write_json("models/entity/invisible.geo.json", geometry_file(inv))
    c = Canvas(16, 16, CLEAR)
    c.save(out("textures", "entity", "doors", "invisible.png"))
    print("doors art written")


if __name__ == "__main__":
    main()
