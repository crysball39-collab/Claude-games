"""Generates the Player's art: the player model (the standard 64 x 64 skin layout, with the bone
names armour and held items attach to), sixteen original skins, the Player spawn egg and the
Player API icon.

Every skin is drawn here from scratch: a skin tone, a face (eyes, brows, mouth), a hair style,
and clothes (shirts, hoodies, jackets, overalls, dresses, jeans, shoes), on the usual skin
layout, with the outer layer (hair volume, hoods, caps, jackets) on the second layer.

    python3 tools/gen_player_art.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texlib import Canvas, box_faces, fbm  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================================
# geometry: the standard player model (pivots and box UVs of the 64 x 64 skin layout)
# =============================================================================================
def cube(origin, size, uv, inflate=0.0):
    c = {"origin": list(origin), "size": list(size), "uv": list(uv)}
    if inflate:
        c["inflate"] = inflate
    return c


def player_geo():
    bones = [
        {"name": "root", "pivot": [0, 0, 0]},
        {"name": "waist", "parent": "root", "pivot": [0, 12, 0]},
        {"name": "body", "parent": "waist", "pivot": [0, 24, 0], "cubes": [cube((-4, 12, -2), (8, 12, 4), (16, 16))]},
        {"name": "jacket", "parent": "body", "pivot": [0, 24, 0], "cubes": [cube((-4, 12, -2), (8, 12, 4), (16, 32), 0.25)]},
        {"name": "head", "parent": "body", "pivot": [0, 24, 0], "cubes": [cube((-4, 24, -4), (8, 8, 8), (0, 0))]},
        {"name": "hat", "parent": "head", "pivot": [0, 24, 0], "cubes": [cube((-4, 24, -4), (8, 8, 8), (32, 0), 0.5)]},
        {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0], "cubes": [cube((-8, 12, -2), (4, 12, 4), (40, 16))]},
        {"name": "rightSleeve", "parent": "rightArm", "pivot": [-5, 22, 0],
         "cubes": [cube((-8, 12, -2), (4, 12, 4), (40, 32), 0.25)]},
        {"name": "rightItem", "parent": "rightArm", "pivot": [-6, 15, 1]},
        {"name": "leftArm", "parent": "body", "pivot": [5, 22, 0], "cubes": [cube((4, 12, -2), (4, 12, 4), (32, 48))]},
        {"name": "leftSleeve", "parent": "leftArm", "pivot": [5, 22, 0],
         "cubes": [cube((4, 12, -2), (4, 12, 4), (48, 48), 0.25)]},
        {"name": "leftItem", "parent": "leftArm", "pivot": [6, 15, 1]},
        {"name": "rightLeg", "parent": "root", "pivot": [-1.9, 12, 0], "cubes": [cube((-3.9, 0, -2), (4, 12, 4), (0, 16))]},
        {"name": "rightPants", "parent": "rightLeg", "pivot": [-1.9, 12, 0],
         "cubes": [cube((-3.9, 0, -2), (4, 12, 4), (0, 32), 0.25)]},
        {"name": "leftLeg", "parent": "root", "pivot": [1.9, 12, 0], "cubes": [cube((-0.1, 0, -2), (4, 12, 4), (16, 48))]},
        {"name": "leftPants", "parent": "leftLeg", "pivot": [1.9, 12, 0],
         "cubes": [cube((-0.1, 0, -2), (4, 12, 4), (0, 48), 0.25)]},
    ]
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.zt.player", "texture_width": 64, "texture_height": 64,
                        "visible_bounds_width": 2, "visible_bounds_height": 3, "visible_bounds_offset": [0, 1.5, 0]},
        "bones": bones,
    }]}


# =============================================================================================
# skins
# =============================================================================================
# box UV origins of each part: (u, v, w, h, d)
HEAD, HAT = (0, 0, 8, 8, 8), (32, 0, 8, 8, 8)
BODY, JACKET = (16, 16, 8, 12, 4), (16, 32, 8, 12, 4)
R_ARM, R_SLEEVE = (40, 16, 4, 12, 4), (40, 32, 4, 12, 4)
L_ARM, L_SLEEVE = (32, 48, 4, 12, 4), (48, 48, 4, 12, 4)
R_LEG, R_PANTS = (0, 16, 4, 12, 4), (0, 32, 4, 12, 4)
L_LEG, L_PANTS = (16, 48, 4, 12, 4), (0, 48, 4, 12, 4)

TONES = [(247, 216, 186), (234, 192, 151), (214, 165, 120), (187, 133, 92), (140, 94, 62), (98, 64, 44)]
HAIR = {"black": (28, 24, 24), "brown": (86, 56, 34), "chestnut": (118, 70, 40), "blonde": (222, 188, 112),
        "red": (168, 70, 36), "grey": (170, 168, 164), "blue": (58, 110, 200), "pink": (226, 120, 170),
        "green": (70, 160, 90), "white": (232, 230, 226)}
EYES = [(60, 110, 200), (96, 64, 40), (70, 140, 80), (110, 110, 120), (40, 30, 26)]


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3])


class Skin:
    def __init__(self, seed):
        self.c = Canvas(64, 64, CLEAR)
        self.seed = seed
        self.noise = fbm(64, 64, seed, cell=3, octaves=2)

    def face(self, part, side):
        u, v, w, h, d = part
        return box_faces(u, v, w, h, d)[side]

    def fill(self, part, color, sides=None, var=0.06, rows=None):
        """Fill faces of a part (optionally only rows y0..y1 of the side faces, counted from the top)."""
        u, v, w, h, d = part
        for side, (x, y, fw, fh) in box_faces(u, v, w, h, d).items():
            if sides and side not in sides:
                continue
            y0, y1 = (0, fh) if rows is None or side in ("top", "bottom") else rows
            if rows is not None and side in ("top", "bottom"):
                # the top belongs to the first rows, the bottom to the last
                if (side == "top" and rows[0] > 0) or (side == "bottom" and rows[1] < h):
                    continue
            for yy in range(y0, min(y1, fh)):
                for xx in range(fw):
                    n = self.noise[y + yy, x + xx] - 0.5
                    self.c.px(x + xx, y + yy, shade(color, 1 + n * var * 2))

    def px(self, part, side, x, y, color):
        fx, fy, fw, fh = self.face(part, side)
        if 0 <= x < fw and 0 <= y < fh:
            self.c.px(fx + x, fy + y, color)

    def row(self, part, side, y, x0, x1, color):
        for x in range(x0, x1):
            self.px(part, side, x, y, color)

    def ring(self, part, y, color, sides=("front", "back", "left", "right")):
        """A band all round a limb or the body at row y."""
        for side in sides:
            fx, fy, fw, fh = self.face(part, side)
            for x in range(fw):
                self.c.px(fx + x, fy + y, color)

    def save(self, path):
        self.c.save(path)


def draw_skin(i, spec):
    s = Skin(1000 + i * 17)
    tone = spec["tone"]
    hair = spec["hair"]
    # ---------------------------------------------------------------- skin everywhere first
    for part in (HEAD, BODY, R_ARM, L_ARM, R_LEG, L_LEG):
        s.fill(part, tone, var=0.03)
    # ---------------------------------------------------------------- face
    eye = spec["eyes"]
    white = (240, 240, 240)
    brow = shade(hair, 0.8) if spec["style"] != "bald" else shade(tone, 0.7)
    s.row(HEAD, "front", 3, 1, 3, brow)
    s.row(HEAD, "front", 3, 5, 7, brow)
    s.px(HEAD, "front", 1, 4, white)
    s.px(HEAD, "front", 2, 4, eye)
    s.px(HEAD, "front", 5, 4, eye)
    s.px(HEAD, "front", 6, 4, white)
    s.row(HEAD, "front", 5, 3, 5, shade(tone, 0.82))          # nose shadow
    mouth = shade(tone, 0.6) if not spec.get("smile") else (150, 70, 60)
    s.row(HEAD, "front", 6, 3, 5, mouth)
    if spec.get("smile"):
        s.px(HEAD, "front", 2, 6, shade(tone, 0.75))
        s.px(HEAD, "front", 5, 6, shade(tone, 0.75))
    if spec.get("beard"):
        s.row(HEAD, "front", 6, 1, 3, shade(hair, 0.9))
        s.row(HEAD, "front", 6, 5, 7, shade(hair, 0.9))
        s.row(HEAD, "front", 7, 1, 7, shade(hair, 0.9))
    if spec.get("glasses"):
        g = (30, 30, 34)
        s.row(HEAD, "front", 4, 0, 8, g)
        s.px(HEAD, "front", 1, 4, (180, 220, 240))
        s.px(HEAD, "front", 6, 4, (180, 220, 240))
        s.px(HEAD, "front", 2, 4, eye)
        s.px(HEAD, "front", 5, 4, eye)
    # ---------------------------------------------------------------- hair
    style = spec["style"]
    if style != "bald":
        s.fill(HEAD, hair, sides=("top",), var=0.1)
        for side in ("left", "right", "back"):
            depth = {"short": 2, "long": 7, "ponytail": 3, "mohawk": 1, "cap": 2, "bob": 5, "spiky": 2}[style]
            if side == "back":
                depth = {"short": 3, "long": 8, "ponytail": 5, "mohawk": 2, "cap": 3, "bob": 6, "spiky": 3}[style]
            for y in range(depth):
                s.row(HEAD, side, y, 0, 8, shade(hair, 1 + (s.noise[y, 5] - 0.5) * 0.2))
        # fringe
        fr = {"short": 1, "long": 2, "ponytail": 1, "mohawk": 0, "cap": 0, "bob": 2, "spiky": 2}[style]
        for y in range(fr):
            s.row(HEAD, "front", y, 0, 8, hair)
        if style in ("long", "bob"):
            for y in range(fr, 6 if style == "long" else 5):
                s.px(HEAD, "front", 0, y, hair)
                s.px(HEAD, "front", 7, y, hair)
        if style == "spiky":
            for x in range(0, 8, 2):
                s.px(HAT, "front", x, 0, hair)
                s.px(HAT, "top", x, 3, hair)
                s.px(HAT, "top", x + 1, 5, hair)
        if style == "mohawk":
            s.fill(HEAD, shade(tone, 0.95), sides=("top",), var=0.03)
            for y in range(8):
                s.px(HEAD, "top", 3, y, hair)
                s.px(HEAD, "top", 4, y, hair)
                s.px(HAT, "top", 3, y, hair)
                s.px(HAT, "top", 4, y, hair)
        if style == "long":
            for side in ("left", "right", "back"):
                for y in range(8):
                    s.row(HAT, side, y, 0, 8, shade(hair, 0.95))
        if style == "ponytail":
            for y in range(2, 8):
                s.row(HAT, "back", y, 3, 5, shade(hair, 0.9))
            band = spec.get("accent", (200, 60, 80))
            s.row(HAT, "back", 2, 3, 5, band)
    if style == "cap" or spec.get("cap"):
        cap = spec.get("cap_color", (200, 50, 40))
        s.fill(HAT, cap, sides=("top",), var=0.05)
        for side in ("front", "left", "right", "back"):
            for y in range(2):
                s.row(HAT, side, y, 0, 8, cap)
        s.row(HAT, "front", 2, 0, 8, shade(cap, 0.75))     # the brim
    if spec.get("headphones"):
        hp = (40, 40, 46)
        for side in ("left", "right"):
            for y in range(3, 6):
                s.row(HAT, side, y, 2, 6, hp)
        for x in range(8):
            s.px(HAT, "top", x, 3, hp)
    # ---------------------------------------------------------------- clothes
    shirt = spec["shirt"]
    kind = spec["top"]
    s.fill(BODY, shirt, var=0.05)
    sleeve_rows = {"tee": 4, "long": 12, "tank": 0, "hoodie": 12, "jacket": 12, "dress": 4, "overalls": 4}[kind]
    for arm in (R_ARM, L_ARM):
        if sleeve_rows:
            s.fill(arm, shirt, var=0.05, rows=(0, sleeve_rows))
        if kind in ("long", "hoodie", "jacket"):
            s.ring(arm, 11, shade(shirt, 0.8))
    if kind == "tank":
        for arm in (R_ARM, L_ARM):
            s.fill(arm, tone, var=0.03, rows=(0, 12))
        s.row(BODY, "front", 0, 0, 2, tone)
        s.row(BODY, "front", 0, 6, 8, tone)
    if kind == "tee" and spec.get("stripes"):
        for y in range(1, 12, 3):
            s.ring(BODY, y, spec["stripes"])
    if kind == "hoodie":
        s.row(BODY, "front", 0, 2, 6, shade(shirt, 0.7))       # neck opening
        for y in range(7, 10):
            s.row(BODY, "front", y, 1, 7, shade(shirt, 0.88))   # the pocket
        s.px(BODY, "front", 3, 1, (230, 230, 230))
        s.px(BODY, "front", 4, 2, (230, 230, 230))              # drawstrings
        for side in ("back",):
            for y in range(0, 3):
                s.row(JACKET, side, y, 1, 7, shade(shirt, 0.9))  # the hood hanging down
    if kind == "jacket":
        inner = spec.get("inner", (230, 230, 230))
        for y in range(12):
            s.row(BODY, "front", y, 3, 5, inner)
        for side in ("front", "back", "left", "right"):
            fx, fy, fw, fh = s.face(JACKET, side)
            for yy in range(12):
                for xx in range(fw):
                    if side == "front" and 2 < xx < 5:
                        continue
                    s.c.px(fx + xx, fy + yy, shade(shirt, 1 + (s.noise[yy, xx] - 0.5) * 0.1))
        for arm in (R_SLEEVE, L_SLEEVE):
            s.fill(arm, shirt, var=0.05, rows=(0, 11))
    if kind == "overalls":
        denim = spec.get("pants", (60, 90, 150))
        for y in range(5, 12):
            s.row(BODY, "front", y, 1, 7, denim)
            s.row(BODY, "back", y, 1, 7, denim)
        for y in range(0, 5):
            s.px(BODY, "front", 1, y, denim)
            s.px(BODY, "front", 6, y, denim)
        s.px(BODY, "front", 1, 4, (220, 200, 90))
        s.px(BODY, "front", 6, 4, (220, 200, 90))
    if spec.get("logo"):
        logo = spec["logo"]
        for (x, y) in ((3, 3), (4, 3), (3, 4), (4, 4), (2, 4), (5, 4), (3, 5), (4, 5)):
            s.px(BODY, "front", x, y, logo)
    if spec.get("belt"):
        s.ring(BODY, 11, (50, 36, 26))
    # ---------------------------------------------------------------- legs
    pants = spec["pants"]
    leg_rows = {"jeans": 12, "shorts": 5, "skirt": 4}[spec["bottom"]]
    if kind == "dress":
        for leg in (R_LEG, L_LEG):
            s.fill(leg, shirt, var=0.05, rows=(0, 5))
        s.ring(BODY, 11, shade(shirt, 0.85))
    else:
        for leg in (R_LEG, L_LEG):
            s.fill(leg, pants, var=0.08, rows=(0, leg_rows))
            if spec["bottom"] == "jeans":
                s.ring(leg, 11, shade(pants, 0.8))
    shoes = spec["shoes"]
    for leg in (R_LEG, L_LEG):
        for y in (10, 11):
            s.ring(leg, y, shoes if y == 11 else shade(shoes, 1.08))
        fx, fy, fw, fh = s.face(leg, "bottom")
        for yy in range(fh):
            for xx in range(fw):
                s.c.px(fx + xx, fy + yy, shade(shoes, 0.8))
        if spec.get("laces"):
            s.px(leg, "front", 1, 10, (240, 240, 240))
            s.px(leg, "front", 2, 10, (240, 240, 240))
    # outer-layer shading: shoe soles
    for leg in (R_PANTS, L_PANTS):
        if spec.get("soles"):
            s.ring(leg, 11, spec["soles"])
    return s


SPECS = [
    {"tone": TONES[1], "hair": HAIR["brown"], "style": "short", "eyes": EYES[0], "shirt": (40, 160, 170), "top": "tee",
     "pants": (60, 70, 160), "bottom": "jeans", "shoes": (70, 70, 74), "smile": True},
    {"tone": TONES[0], "hair": HAIR["blonde"], "style": "ponytail", "eyes": EYES[2], "shirt": (220, 90, 120), "top": "tee",
     "pants": (50, 60, 110), "bottom": "jeans", "shoes": (240, 240, 240), "accent": (90, 200, 220), "laces": True},
    {"tone": TONES[4], "hair": HAIR["black"], "style": "short", "eyes": EYES[1], "shirt": (60, 64, 72), "top": "hoodie",
     "pants": (40, 40, 46), "bottom": "jeans", "shoes": (200, 40, 40), "headphones": True},
    {"tone": TONES[2], "hair": HAIR["red"], "style": "long", "eyes": EYES[2], "shirt": (70, 140, 70), "top": "dress",
     "pants": (0, 0, 0), "bottom": "skirt", "shoes": (110, 70, 40)},
    {"tone": TONES[3], "hair": HAIR["black"], "style": "cap", "eyes": EYES[1], "shirt": (250, 250, 250), "top": "tee",
     "pants": (90, 120, 60), "bottom": "shorts", "shoes": (40, 40, 40), "cap_color": (40, 80, 200), "logo": (230, 60, 50)},
    {"tone": TONES[0], "hair": HAIR["grey"], "style": "short", "eyes": EYES[3], "shirt": (130, 60, 40), "top": "jacket",
     "inner": (220, 210, 190), "pants": (70, 60, 50), "bottom": "jeans", "shoes": (50, 36, 26), "beard": True, "glasses": True},
    {"tone": TONES[5], "hair": HAIR["black"], "style": "spiky", "eyes": EYES[1], "shirt": (250, 200, 40), "top": "tee",
     "pants": (40, 50, 80), "bottom": "jeans", "shoes": (240, 240, 240), "stripes": (40, 40, 40), "smile": True},
    {"tone": TONES[1], "hair": HAIR["pink"], "style": "bob", "eyes": EYES[0], "shirt": (150, 100, 200), "top": "hoodie",
     "pants": (40, 40, 50), "bottom": "jeans", "shoes": (240, 240, 240), "laces": True},
    {"tone": TONES[2], "hair": HAIR["chestnut"], "style": "short", "eyes": EYES[2], "shirt": (200, 60, 50), "top": "overalls",
     "pants": (60, 90, 150), "bottom": "jeans", "shoes": (90, 60, 40), "beard": True},
    {"tone": TONES[0], "hair": HAIR["blonde"], "style": "mohawk", "eyes": EYES[0], "shirt": (30, 30, 34), "top": "tank",
     "pants": (120, 40, 40), "bottom": "jeans", "shoes": (30, 30, 34), "belt": True},
    {"tone": TONES[4], "hair": HAIR["brown"], "style": "long", "eyes": EYES[1], "shirt": (240, 160, 60), "top": "long",
     "pants": (60, 60, 70), "bottom": "jeans", "shoes": (70, 50, 40), "smile": True},
    {"tone": TONES[3], "hair": HAIR["green"], "style": "spiky", "eyes": EYES[4], "shirt": (60, 120, 200), "top": "jacket",
     "inner": (30, 30, 34), "pants": (30, 30, 34), "bottom": "jeans", "shoes": (240, 240, 240), "glasses": True},
    {"tone": TONES[1], "hair": HAIR["black"], "style": "ponytail", "eyes": EYES[1], "shirt": (90, 180, 120), "top": "tee",
     "pants": (220, 200, 160), "bottom": "shorts", "shoes": (200, 120, 160), "accent": (240, 220, 60), "smile": True},
    {"tone": TONES[2], "hair": HAIR["white"], "style": "bob", "eyes": EYES[3], "shirt": (110, 40, 120), "top": "long",
     "pants": (40, 30, 60), "bottom": "jeans", "shoes": (20, 20, 20), "logo": (240, 200, 60)},
    {"tone": TONES[5], "hair": HAIR["brown"], "style": "cap", "eyes": EYES[1], "shirt": (220, 100, 40), "top": "hoodie",
     "pants": (50, 70, 120), "bottom": "jeans", "shoes": (240, 240, 240), "cap_color": (30, 30, 34)},
    {"tone": TONES[0], "hair": HAIR["blue"], "style": "short", "eyes": EYES[0], "shirt": (240, 240, 240), "top": "jacket",
     "inner": (60, 140, 220), "pants": (80, 80, 90), "bottom": "jeans", "shoes": (60, 140, 220), "smile": True},
]


# =============================================================================================
# icons
# =============================================================================================
def player_egg():
    c = Canvas(16, 16, CLEAR)
    yy, xx = np.mgrid[0:16, 0:16]
    d = ((xx + 0.5 - 8) / 5.6) ** 2 + ((yy + 0.5 - 8.6) / 7.0) ** 2
    for y in range(16):
        for x in range(16):
            if d[y, x] <= 1.0:
                # a shirt-teal top half and a jeans-blue bottom, with a little face
                base = (40, 170, 176) if y < 9 else (64, 76, 170)
                k = 0.8 + 0.3 * (1 - y / 16)
                c.px(x, y, shade(base, k))
            elif d[y, x] <= 1.18:
                c.px(x, y, (24, 24, 28))
    for (x, y, col) in ((6, 5, (240, 240, 240)), (7, 5, (40, 60, 160)), (9, 5, (40, 60, 160)), (10, 5, (240, 240, 240)),
                        (7, 7, (120, 60, 50)), (8, 7, (120, 60, 50))):
        c.px(x, y, col)
    c.save(out("textures", "items", "zt_player_egg.png"))


def player_api_icon():
    """A little handheld terminal with a speech bubble on its screen."""
    c = Canvas(16, 16, CLEAR)
    body, edge, screen = (70, 74, 84), (30, 32, 38), (20, 60, 40)
    for y in range(2, 15):
        for x in range(2, 14):
            c.px(x, y, body)
    for x in range(2, 14):
        c.px(x, 2, edge)
        c.px(x, 14, edge)
    for y in range(2, 15):
        c.px(2, y, edge)
        c.px(13, y, edge)
    for y in range(4, 10):
        for x in range(4, 12):
            c.px(x, y, screen)
    # the speech bubble with three dots
    for x in range(5, 11):
        c.px(x, 5, (230, 240, 230))
        c.px(x, 7, (230, 240, 230))
    for y in range(5, 8):
        c.px(5, y, (230, 240, 230))
        c.px(10, y, (230, 240, 230))
    c.px(6, 8, (230, 240, 230))
    for x in (6, 8):
        c.px(x + 1, 6, (40, 200, 120))
    c.px(9, 6, (40, 200, 120))
    # buttons and a redstone light
    c.px(5, 11, (200, 40, 30))
    c.px(5, 12, (150, 30, 20))
    for x in (8, 10):
        c.px(x, 11, (180, 184, 190))
        c.px(x, 12, (120, 124, 130))
    c.save(out("textures", "items", "zt_player_api.png"))


def main():
    with open(out("models", "entity", "zt_player.geo.json"), "w") as f:
        json.dump(player_geo(), f, indent="\t")
        f.write("\n")
    for i, spec in enumerate(SPECS):
        draw_skin(i, spec).save(out("textures", "entity", "zt_player", "skin_%d.png" % i))
    player_egg()
    player_api_icon()
    print("player art written")


if __name__ == "__main__":
    main()
