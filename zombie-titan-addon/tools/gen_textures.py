"""Generates every texture in the Zombie Titan resource pack.

All art is drawn procedurally (nothing is copied from the Java mod), so the
pack can be rebuilt from source:  python3 tools/gen_textures.py
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from texlib import (Canvas, Painter, box_faces, fbm, hexc, ragged_edge,  # noqa: E402
                    radial, scaled, to_image, value_noise)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")

# --- palette -----------------------------------------------------------------
SKIN_D, SKIN_M, SKIN_L = (52, 86, 40), (88, 132, 62), (126, 166, 88)
ROT_D, ROT_M = (50, 58, 28), (82, 88, 42)
WOUND, FLESH = (88, 18, 24), (150, 58, 56)
BONE, BONE_D = (218, 210, 182), (150, 140, 110)
SHIRT_D, SHIRT_M, SHIRT_L = (6, 84, 90), (20, 128, 132), (58, 164, 160)
PANTS_D, PANTS_M, PANTS_L = (36, 32, 86), (58, 54, 132), (88, 84, 166)
HAIR_D, HAIR_M = (30, 40, 22), (54, 66, 36)
MOUTH = (36, 8, 10)
SOCKET = (12, 16, 10)
STEEL_D, STEEL_M, STEEL_L = (96, 102, 110), (160, 166, 174), (226, 232, 238)
RUST = (120, 70, 38)
LEATHER_D, LEATHER_M = (52, 32, 18), (92, 58, 32)
GLOW_RED = (255, 52, 30, 6)     # low alpha = emissive with entity_emissive_alpha


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================
# Zombie Titan (geometry.zt.zombie_titan, 128 x 64 texture units, 4 px/unit)
# =============================================================================
S = 4
TITAN_PARTS = {
    "skull": ((0, 0), (8, 6, 8)),
    "jaw": ((32, 0), (8, 2, 8)),
    "chest": ((0, 14), (8, 4, 4)),
    "belly": ((24, 14), (8, 4, 4)),
    "waist": ((0, 22), (8, 4, 4)),
    "r_upper_arm": ((0, 30), (4, 6, 4)),
    "r_forearm": ((16, 30), (4, 6, 4)),
    "l_upper_arm": ((32, 30), (4, 6, 4)),
    "l_forearm": ((48, 30), (4, 6, 4)),
    "r_thigh": ((0, 40), (4, 6, 4)),
    "r_shin": ((16, 40), (4, 6, 4)),
    "l_thigh": ((32, 40), (4, 6, 4)),
    "l_shin": ((48, 40), (4, 6, 4)),
    "blade": ((64, 0), (1, 3, 18)),
    "guard": ((104, 0), (2, 7, 1)),
    "grip": ((110, 0), (1, 1, 4)),
    "pommel": ((104, 8), (2, 2, 1)),
    "tip": ((112, 8), (1, 2, 3)),
}


def faces_px(part):
    (u, v), (w, h, d) = TITAN_PARTS[part]
    return {k: scaled(r, S) for k, r in box_faces(u, v, w, h, d).items()}


def titan_texture():
    c = Canvas(128 * S, 64 * S, (88, 132, 62, 255))
    p = Painter(c, seed=7)
    rng = np.random.default_rng(42)

    def skin(r, rot=0.6, wounds=0.0):
        p.material(*r, SKIN_D, SKIN_M, SKIN_L, contrast=1.15)
        p.blotches(*r, ROT_M, threshold=rot, soft=0.06, alpha=0.85)
        p.blotches(*r, ROT_D, threshold=rot + 0.1, soft=0.05, alpha=0.9)
        if wounds:
            p.blotches(*r, WOUND, threshold=1 - wounds, field=p.n1, soft=0.03)

    def shirt(r):
        p.material(*r, SHIRT_D, SHIRT_M, SHIRT_L, contrast=1.1)
        p.blotches(*r, (52, 70, 44), threshold=0.66, soft=0.08, alpha=0.7)   # grime

    def pants(r):
        p.material(*r, PANTS_D, PANTS_M, PANTS_L, contrast=1.1)
        p.blotches(*r, (46, 40, 52), threshold=0.66, soft=0.08, alpha=0.6)

    def steel(r):
        p.material(*r, STEEL_D, STEEL_M, STEEL_L, contrast=0.8, grain=0.08)

    def hem(r, frac, top_mat, bottom_mat, seed, amp=0.12):
        """Top part `top_mat`, bottom part `bottom_mat`, joined by a torn edge."""
        x, y, w, h = r
        bottom_mat(r)
        edge = ragged_edge(np.random.default_rng(seed), int(w), frac * h, amp * h, smooth=2)
        tmp = Canvas(c.w, c.h)
        tmp.a = c.a.copy()
        top_mat(r)
        topped = c.a.copy()
        c.a = tmp.a
        for i in range(int(w)):
            cut = int(max(0, min(h, edge[i])))
            c.a[int(y):int(y) + cut, int(x) + i] = topped[int(y):int(y) + cut, int(x) + i]
            if 0 < cut < h:   # dark frayed thread line
                c.a[int(y) + cut - 1, int(x) + i, :3] *= 0.55

    def ribs(x, y, w, h):
        c.rect(x, y, w, h, WOUND)
        for i in range(int(h // (S * 0.75))):
            yy = y + S * 0.35 + i * S * 0.75
            c.rect(x + 1, yy, w - 2, max(2, S // 2), BONE)
            c.rect(x + 1, yy + max(2, S // 2) - 1, w - 2, 1, BONE_D)

    def tear(x, y, w, h, inner, seed):
        """Ragged hole in cloth showing `inner` (a callable painting a rect)."""
        rr = np.random.default_rng(seed)
        tmp = c.a.copy()
        inner((x, y, w, h))
        painted = c.a.copy()
        c.a = tmp
        cx, cy = x + w / 2, y + h / 2
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                dx = (xx + 0.5 - cx) / (w / 2)
                dy = (yy + 0.5 - cy) / (h / 2)
                if dx * dx + dy * dy < 0.75 + rr.random() * 0.35:
                    c.a[yy, xx] = painted[yy, xx]
                elif dx * dx + dy * dy < 1.15:
                    c.a[yy, xx, :3] *= 0.7

    # ---- skull -----------------------------------------------------------------
    f = faces_px("skull")
    for side in ("right", "left", "back"):
        x, y, w, h = f[side]
        skin(f[side])
        # hair band on the upper part of the head
        hem(f[side], 0.22 if side != "back" else 0.42,
            lambda r: p.material(*r, HAIR_D, HAIR_M, (74, 86, 48), contrast=1.2),
            lambda r: None, seed={"right": 31, "left": 32, "back": 33}[side])
        p.shade_edges(*f[side], amount=0.25)
    # ears
    for side in ("right", "left"):
        x, y, w, h = f[side]
        c.rect(x + w * 0.42, y + h * 0.42, S * 1.2, S * 1.6, SKIN_D)
        c.rect(x + w * 0.42 + 2, y + h * 0.42 + 2, S * 0.6, S * 1.0, (40, 66, 32))
    # top of head: hair with a wound exposing the skull
    x, y, w, h = f["top"]
    p.material(x, y, w, h, HAIR_D, HAIR_M, (74, 86, 48), contrast=1.2)
    p.blotches(x, y, w, h, SKIN_M, threshold=0.64, soft=0.05)
    c.rect(x + w * 0.58, y + h * 0.18, S * 2.2, S * 1.6, WOUND)
    c.rect(x + w * 0.62, y + h * 0.22, S * 1.4, S * 1.0, BONE)
    p.shade_edges(x, y, w, h, amount=0.2)
    # face
    x, y, w, h = f["front"]
    skin(f["front"], rot=0.66)
    hem(f["front"], 0.13, lambda r: p.material(*r, HAIR_D, HAIR_M, (74, 86, 48)), lambda r: None, seed=5)
    u = S
    # brow ridge
    c.rect(x + 0.6 * u, y + 2.0 * u, 2.8 * u, 0.55 * u, SKIN_D)
    c.rect(x + 4.6 * u, y + 2.0 * u, 2.8 * u, 0.55 * u, SKIN_D)
    # eye sockets + glowing pupils (emissive)
    for ex in (1.0, 5.0):
        c.rect(x + ex * u, y + 2.55 * u, 2.0 * u, 1.3 * u, SOCKET)
        c.rect(x + (ex + 0.25) * u, y + 2.65 * u, 1.5 * u, 1.1 * u, (4, 6, 4))
        px0 = x + (ex + (1.1 if ex < 3 else 0.4)) * u
        c.rect(px0, y + 2.95 * u, 0.55 * u, 0.55 * u, GLOW_RED)
        c.rect(px0 + 1, y + 2.95 * u + 1, 0.55 * u - 2, 0.55 * u - 2, (255, 150, 90, 4))
    # nose
    c.rect(x + 3.5 * u, y + 3.9 * u, 1.0 * u, 1.0 * u, SKIN_D)
    c.rect(x + 3.55 * u, y + 4.5 * u, 0.35 * u, 0.35 * u, SOCKET)
    c.rect(x + 4.1 * u, y + 4.5 * u, 0.35 * u, 0.35 * u, SOCKET)
    # cheek wound and stitched scar
    c.rect(x + 0.4 * u, y + 4.2 * u, 1.6 * u, 0.9 * u, WOUND)
    c.rect(x + 0.6 * u, y + 4.4 * u, 0.9 * u, 0.4 * u, FLESH)
    for i in range(5):
        c.rect(x + 5.2 * u + i * 0.45 * u, y + 4.3 * u, 2, 0.8 * u, (30, 26, 20))
    c.rect(x + 5.1 * u, y + 4.65 * u, 2.3 * u, 2, (30, 26, 20))
    # upper lip / gum line with teeth tips
    c.rect(x, y + 5.55 * u, w, 0.45 * u, MOUTH)
    for i in range(1, 15):
        if i % 2:
            c.rect(x + i * 0.5 * u, y + 5.55 * u, 0.45 * u, 0.35 * u, BONE)
    p.shade_edges(*f["front"], amount=0.18)
    # roof of the mouth (only seen when the jaw opens)
    x, y, w, h = f["bottom"]
    c.rect(x, y, w, h, MOUTH)
    p.blotches(x, y, w, h, (70, 16, 20), threshold=0.55, soft=0.1)
    for i in range(16):
        if i % 2 == 0:
            c.rect(x + i * 0.5 * u, y, 0.45 * u, 0.6 * u, BONE)
            c.rect(x + i * 0.5 * u, y + h - 0.6 * u, 0.45 * u, 0.6 * u, BONE)

    # ---- jaw ------------------------------------------------------------------
    f = faces_px("jaw")
    for side in ("right", "left", "back"):
        skin(f[side])
        p.shade_edges(*f[side], amount=0.3)
    x, y, w, h = f["front"]
    skin(f["front"], rot=0.62)
    c.rect(x, y, w, 0.95 * u, MOUTH)
    for i in range(16):
        if i % 2 == 0:
            c.rect(x + i * 0.5 * u + 1, y + 0.45 * u, 0.4 * u, 0.5 * u, BONE)
    c.rect(x + 2.5 * u, y + 1.3 * u, 2.0 * u, 0.4 * u, ROT_D)
    p.shade_edges(*f["front"], amount=0.2)
    x, y, w, h = f["top"]
    c.rect(x, y, w, h, (60, 12, 16))
    c.rect(x + 1.5 * u, y + 1.5 * u, 5 * u, 5 * u, (120, 40, 46))        # tongue
    for i in range(16):
        if i % 2 == 0:
            c.rect(x + i * 0.5 * u, y + h - 0.6 * u, 0.45 * u, 0.6 * u, BONE)
            c.rect(x + i * 0.5 * u, y, 0.45 * u, 0.6 * u, BONE)
    x, y, w, h = f["bottom"]
    skin(f["bottom"])
    p.vertical_gradient(x, y, w, h, 0.8, 0.8)

    # ---- torso ----------------------------------------------------------------
    f = faces_px("chest")
    for side in ("top", "bottom", "right", "left", "back", "front"):
        shirt(f[side])
    x, y, w, h = f["front"]
    # V collar showing the neck
    for row in range(int(1.6 * u)):
        half = (1.4 * u) * (1 - row / (1.6 * u))
        c.a[int(y) + row, int(x + w / 2 - half):int(x + w / 2 + half), :3] = np.array(SKIN_M)
    tear(x + 4.9 * u, y + 0.8 * u, 2.6 * u, 2.9 * u, lambda r: ribs(*r), seed=11)
    tear(x + 0.6 * u, y + 2.2 * u, 1.8 * u, 1.4 * u, lambda r: skin(r, wounds=0.3), seed=12)
    x, y, w, h = f["back"]
    tear(x + 2.5 * u, y + 0.6 * u, 3.0 * u, 2.6 * u, lambda r: skin(r, wounds=0.2), seed=13)
    c.rect(x + w / 2 - 2, y + 0.9 * u, 4, 2.2 * u, BONE_D)                 # spine
    for side in f:
        p.shade_edges(*f[side], amount=0.2)

    f = faces_px("belly")
    for side in f:
        shirt(f[side])
    x, y, w, h = f["front"]
    tear(x + 1.8 * u, y + 0.3 * u, 4.4 * u, 3.4 * u, lambda r: skin(r, rot=0.55, wounds=0.35), seed=21)
    tear(x + 6.4 * u, y + 2.2 * u, 1.3 * u, 1.5 * u, lambda r: skin(r), seed=22)
    x, y, w, h = f["left"]
    tear(x + 0.6 * u, y + 0.8 * u, 2.6 * u, 2.4 * u, lambda r: ribs(*r), seed=23)
    for side in f:
        p.shade_edges(*f[side], amount=0.2)

    f = faces_px("waist")
    for side in ("right", "front", "left", "back"):
        hem(f[side], 0.45, shirt, pants, seed=31 + len(side), amp=0.2)
        p.shade_edges(*f[side], amount=0.2)
    shirt(f["top"])
    pants(f["bottom"])
    p.shade_edges(*f["bottom"], amount=0.35)

    # ---- arms -----------------------------------------------------------------
    for prefix, sleeve, seed in (("r", 0.72, 41), ("l", 0.5, 51)):
        f = faces_px(prefix + "_upper_arm")
        shirt(f["top"])
        skin(f["bottom"])
        for side in ("right", "front", "left", "back"):
            hem(f[side], sleeve, shirt, lambda r: skin(r, wounds=0.15), seed=seed + len(side), amp=0.14)
            p.shade_edges(*f[side], amount=0.2)
        if prefix == "l":   # bitten bicep
            x, y, w, h = f["front"]
            c.rect(x + 0.8 * u, y + 3.5 * u, 2.2 * u, 1.3 * u, WOUND)
            c.rect(x + 1.1 * u, y + 3.8 * u, 1.4 * u, 0.6 * u, FLESH)
        f = faces_px(prefix + "_forearm")
        skin(f["top"])
        for side in ("right", "front", "left", "back"):
            x, y, w, h = f[side]
            skin(f[side], rot=0.58)
            # hand: lower 1.6 units, knuckles and nails
            hand_y = y + h - 1.6 * u
            p.vertical_gradient(x, hand_y, w, 1.6 * u, 0.86, 0.72)
            if side in ("front", "back"):
                for k in range(4):
                    c.rect(x + k * u + 1, y + h - 0.45 * u, u - 2, 0.35 * u, (44, 52, 30))
            c.rect(x, hand_y, w, 2, SKIN_D)
            p.shade_edges(*f[side], amount=0.22)
        x, y, w, h = f["bottom"]
        skin(f["bottom"])
        for k in range(1, 4):
            c.rect(x + k * u - 1, y, 2, h, (40, 56, 30))
        if prefix == "l":   # exposed ulna
            x, y, w, h = f["back"]
            c.rect(x + 1.2 * u, y + 0.4 * u, 1.4 * u, 3.8 * u, WOUND)
            c.rect(x + 1.55 * u, y + 0.5 * u, 0.7 * u, 3.6 * u, BONE)

    # ---- legs -----------------------------------------------------------------
    for prefix, seed in (("r", 61), ("l", 71)):
        f = faces_px(prefix + "_thigh")
        for side in f:
            pants(f[side])
            p.shade_edges(*f[side], amount=0.2)
        x, y, w, h = f["front"]
        if prefix == "r":
            tear(x + 0.6 * u, y + 2.0 * u, 2.4 * u, 2.2 * u, lambda r: skin(r, wounds=0.25), seed=seed)
        f = faces_px(prefix + "_shin")
        pants(f["top"])
        for side in ("right", "front", "left", "back"):
            x, y, w, h = f[side]
            hem(f[side], 0.55 if prefix == "r" else 0.4, pants, lambda r: skin(r, rot=0.56), seed=seed + len(side), amp=0.16)
            # rag wraps around the feet
            c.rect(x, y + h - 1.1 * u, w, 1.1 * u, LEATHER_D)
            for k in range(int(w)):
                if (k // 3) % 2 == 0:
                    c.a[int(y + h - 1.1 * u):int(y + h - 1.1 * u) + 2, int(x) + k, :3] = np.array(LEATHER_M)
            p.shade_edges(*f[side], amount=0.22)
        x, y, w, h = f["bottom"]
        p.material(x, y, w, h, (30, 24, 20), (48, 38, 30), (64, 52, 40))

    # ---- giant iron sword ----------------------------------------------------
    f = faces_px("blade")
    for side in f:
        steel(f[side])
    for side in ("right", "left"):
        x, y, w, h = f[side]
        c.rect(x, y, w, max(2, S // 2), STEEL_L)                 # edges
        c.rect(x, y + h - max(2, S // 2), w, max(2, S // 2), STEEL_L)
        c.rect(x, y + h / 2 - 1, w, 2, STEEL_D)                    # fuller
        p.blotches(x, y, w, h, RUST, threshold=0.7, soft=0.06, alpha=0.8)
    for side in ("top", "bottom", "front", "back"):
        x, y, w, h = f[side]
        p.material(x, y, w, h, STEEL_M, STEEL_L, (250, 252, 255), contrast=0.6)
    f = faces_px("tip")
    for side in f:
        p.material(*f[side], STEEL_M, STEEL_L, (250, 252, 255), contrast=0.6)
    f = faces_px("guard")
    for side in f:
        p.material(*f[side], (52, 54, 60), (84, 88, 96), (120, 124, 132))
        p.shade_edges(*f[side], amount=0.3)
    x, y, w, h = f["front"]
    for k in (0.2, 0.8):
        c.rect(x + w / 2 - 2, y + h * k - 2, 4, 4, (180, 186, 196))
    f = faces_px("grip")
    for side in f:
        p.material(*f[side], LEATHER_D, LEATHER_M, (120, 80, 46))
        x, y, w, h = f[side]
        for k in range(0, int(max(w, h)), 3):
            if w >= h:
                c.rect(x + k, y, 1, h, LEATHER_D)
            else:
                c.rect(x, y + k, w, 1, LEATHER_D)
    f = faces_px("pommel")
    for side in f:
        p.material(*f[side], (52, 54, 60), (84, 88, 96), (120, 124, 132))
    x, y, w, h = f["back"]
    c.rect(x + w / 2 - 2, y + h / 2 - 2, 4, 4, (150, 20, 30))

    c.save(out("textures", "entity", "zombie_titan", "zombie_titan.png"))
    return c


# =============================================================================
# Zombie minions (geometry.zt.zombie_minion, 64 x 32 texture units, 1 px/unit)
# =============================================================================
MINION = {
    # name: (skin palette, body, legs, eyes)
    "loyalist": {"skin": (SKIN_D, SKIN_M, SKIN_L), "shirt": (SHIRT_D, SHIRT_M, SHIRT_L),
                 "pants": (PANTS_D, PANTS_M, PANTS_L), "eye": (120, 255, 90, 6), "seed": 101},
    "priest": {"skin": ((70, 96, 58), (104, 138, 86), (140, 172, 118)),
               "shirt": ((52, 18, 70), (86, 34, 112), (124, 60, 150)),
               "pants": ((52, 18, 70), (86, 34, 112), (124, 60, 150)), "eye": (255, 230, 90, 6), "seed": 202},
    "zealot": {"skin": ((40, 66, 30), (66, 104, 46), (96, 136, 66)),
               "shirt": ((70, 10, 12), (118, 22, 24), (158, 44, 40)),
               "pants": ((24, 20, 22), (44, 38, 40), (66, 58, 60)), "eye": (255, 60, 40, 6), "seed": 303},
    "templar": {"skin": (SKIN_D, SKIN_M, SKIN_L), "shirt": ((70, 74, 82), (120, 126, 136), (176, 182, 192)),
                "pants": ((70, 74, 82), (120, 126, 136), (176, 182, 192)), "eye": (210, 90, 255, 6), "seed": 404},
}


def minion_texture(name):
    cfg = MINION[name]
    c = Canvas(64, 32, (0, 0, 0, 0))
    p = Painter(c, seed=cfg["seed"])
    sd, sm, sl = cfg["skin"]

    def skin(r):
        p.material(*r, sd, sm, sl, contrast=1.1)
        p.blotches(*r, ROT_M, threshold=0.64, soft=0.06, alpha=0.8)

    def cloth(r, pal):
        p.material(*r, pal[0], pal[1], pal[2], contrast=1.0)

    head = box_faces(0, 0, 8, 8, 8)
    for k, r in head.items():
        skin(r)
    x, y, w, h = head["top"]
    p.material(x, y, w, h, HAIR_D, HAIR_M, (74, 86, 48))
    for side in ("right", "left", "back"):
        x, y, w, h = head[side]
        p.material(x, y, w, 2, HAIR_D, HAIR_M, (74, 86, 48))
    x, y, w, h = head["front"]
    c.rect(x, y, w, 1, HAIR_D)
    c.rect(x + 1, y + 3, 2, 2, SOCKET)
    c.rect(x + 5, y + 3, 2, 2, SOCKET)
    c.px(x + 2, y + 4, cfg["eye"])
    c.px(x + 5, y + 4, cfg["eye"])
    c.rect(x + 3, y + 5, 2, 1, sd)
    c.rect(x + 2, y + 6, 4, 1, MOUTH)
    c.px(x + 2, y + 6, BONE)
    c.px(x + 4, y + 6, BONE)
    if name == "zealot":       # war paint
        c.rect(x + 1, y + 2, 6, 1, (120, 10, 14))
        c.rect(x + 1, y + 5, 1, 2, (120, 10, 14))
        c.rect(x + 6, y + 5, 1, 2, (120, 10, 14))

    body = box_faces(16, 16, 8, 12, 4)
    for k, r in body.items():
        cloth(r, cfg["shirt"])
    arm = box_faces(40, 16, 4, 12, 4)
    for k, r in arm.items():
        skin(r)
    leg = box_faces(0, 16, 4, 12, 4)
    for k, r in leg.items():
        cloth(r, cfg["pants"])

    if name == "loyalist":
        for side in ("right", "front", "left", "back"):
            x, y, w, h = body[side]
            for i in range(int(w)):
                cut = int(h - 1 - np.random.default_rng(i * 7 + len(side)).integers(0, 3))
                c.a[y + cut:y + h, x + i, :3] = np.array(sm)
        x, y, w, h = body["front"]
        c.rect(x + 2, y + 4, 3, 3, sm)
    if name == "priest":
        for side in ("front", "back"):
            x, y, w, h = body[side]
            c.rect(x + 3, y, 2, h, (214, 172, 60))          # gold stole
            c.rect(x + 2, y + 3, 4, 1, (214, 172, 60))
        for side in ("right", "front", "left", "back"):
            x, y, w, h = arm[side]
            cloth((x, y, w, 7), cfg["shirt"])              # sleeves
            c.rect(x, y + 6, w, 1, (214, 172, 60))
        # hood overlay
        hat = box_faces(32, 0, 8, 8, 8)
        for k, r in hat.items():
            if k == "front":
                x, y, w, h = r
                cloth((x, y, w, 2), cfg["shirt"])
                cloth((x, y, 1, h), cfg["shirt"])
                cloth((x + w - 1, y, 1, h), cfg["shirt"])
            elif k != "bottom":
                cloth(r, cfg["shirt"])
    if name == "zealot":
        for side in ("right", "front", "left", "back"):
            x, y, w, h = body[side]
            p.blotches(x, y, w, h, (30, 10, 10), threshold=0.6, soft=0.06)
        x, y, w, h = body["front"]
        c.rect(x + 1, y + 2, 6, 1, (30, 26, 24))
        c.rect(x + 1, y + 9, 6, 1, (30, 26, 24))
    if name == "templar":
        for side in ("right", "front", "left", "back"):
            x, y, w, h = arm[side]
            p.material(x, y, w, h, (70, 74, 82), (120, 126, 136), (176, 182, 192))
            c.rect(x, y + 4, w, 1, (60, 62, 70))
        for side in ("front", "back"):
            x, y, w, h = body[side]
            c.rect(x + 2, y + 1, 4, h - 1, (90, 30, 120))        # tabard
            c.rect(x + 3, y + 3, 2, 5, (200, 170, 70))           # cross
            c.rect(x + 2, y + 4, 4, 1, (200, 170, 70))
        hat = box_faces(32, 0, 8, 8, 8)
        for k, r in hat.items():
            p.material(*r, (70, 74, 82), (120, 126, 136), (176, 182, 192))
        x, y, w, h = hat["front"]
        c.rect(x + 1, y + 3, 6, 2, (0, 0, 0, 0))                  # visor slit shows glowing eyes
        c.rect(x, y + 5, w, 3, (0, 0, 0, 0))
        c.rect(x + 3, y + 5, 2, 3, (120, 126, 136))
        x, y, w, h = hat["bottom"]
        c.rect(x, y, w, h, (0, 0, 0, 0))
    c.save(out("textures", "entity", "zombie_minion", name + ".png"))


# =============================================================================
# Proto ball (6x6x6 cube, 32 x 16 units, 2 px/unit)
# =============================================================================
def proto_ball_texture():
    s = 2
    c = Canvas(32 * s, 16 * s, (0, 0, 0, 0))
    p = Painter(c, seed=55)
    for k, r in box_faces(0, 0, 6, 6, 6).items():
        r = scaled(r, s)
        p.material(*r, (20, 90, 20), (60, 190, 40), (190, 255, 120), contrast=1.4)
        p.blotches(*r, (230, 255, 200), threshold=0.68, soft=0.05)
        x, y, w, h = r
        reg = c.a[int(y):int(y + h), int(x):int(x + w)]
        reg[..., 3] = 8   # emissive everywhere
    c.save(out("textures", "entity", "proto_ball.png"))


# =============================================================================
# Item icons
# =============================================================================
def dark_fists_icon():
    """32x32 icon: two clenched black-purple gauntlets wreathed in dark energy."""
    n = 32

    def fist(scale_col, ox, oy):
        img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        base = tuple(int(v * scale_col) for v in (24, 12, 36)) + (255,)
        mid = tuple(int(v * scale_col) for v in (58, 28, 90)) + (255,)
        light = tuple(int(v * scale_col) for v in (112, 62, 176)) + (255,)
        hi = tuple(int(v * scale_col) for v in (196, 130, 255)) + (255,)
        rune = (255, 120, 255, 255)
        # wrist cuff
        d.rectangle([ox + 3, oy + 16, ox + 13, oy + 21], fill=base)
        d.rectangle([ox + 3, oy + 16, ox + 13, oy + 16], fill=hi)
        d.point([(ox + 8, oy + 18), (ox + 7, oy + 19), (ox + 9, oy + 19), (ox + 8, oy + 20)], fill=rune)
        # hand
        d.rounded_rectangle([ox + 1, oy + 4, ox + 15, oy + 16], radius=3, fill=mid)
        # four knuckles with spikes
        for i in range(4):
            x0 = ox + 1 + i * 3.6
            d.ellipse([x0, oy + 2, x0 + 4, oy + 7], fill=light)
            d.point([(x0 + 2, oy + 2)], fill=hi)
        # finger joints
        for i in range(1, 4):
            x = ox + 1 + i * 3.6
            d.line([(x, oy + 6), (x, oy + 11)], fill=base)
        d.line([(ox + 2, oy + 8), (ox + 14, oy + 8)], fill=base)
        # thumb wrapping across the fingers
        d.rounded_rectangle([ox + 2, oy + 10, ox + 13, oy + 13], radius=1, fill=light, outline=base)
        d.line([(ox + 3, oy + 11), (ox + 11, oy + 11)], fill=hi)
        return img

    back = fist(0.55, 1, 9)
    front = fist(1.0, 14, 7)
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    img.alpha_composite(back)
    img.alpha_composite(front)
    arr = np.array(img).astype(np.float64)
    # outline
    m = arr[..., 3] > 0
    grown = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    edge = grown & ~m
    arr[edge] = (10, 4, 16, 255)
    # dark aura
    mask = Image.fromarray(((arr[..., 3] > 0) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.8))
    g = np.array(mask).astype(np.float64) / 255.0
    aura = np.zeros_like(arr)
    aura[..., 0], aura[..., 1], aura[..., 2] = 150, 40, 210
    aura[..., 3] = np.clip(g * 260, 0, 170)
    a = arr[..., 3:4] / 255.0
    outa = aura.copy()
    outa[..., :3] = arr[..., :3] * a + aura[..., :3] * (1 - a)
    outa[..., 3] = np.maximum(arr[..., 3], aura[..., 3])
    o = to_image(outa)
    o.save(out("textures", "items", "zt_dark_fists.png"))
    return o


def egg_icon(path, base, spots, face=False):
    """16x16 spawn egg."""
    shape = [
        "......####......",
        ".....######.....",
        "....########....",
        "...##########...",
        "...##########...",
        "..############..",
        "..############..",
        ".##############.",
        ".##############.",
        ".##############.",
        ".##############.",
        "..############..",
        "..############..",
        "...##########...",
        "....########....",
        "......####......",
    ]
    rng = np.random.default_rng(len(path))
    c = Canvas(16, 16, (0, 0, 0, 0))
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "#":
                shade = 1.0 - 0.18 * (x / 15) - 0.12 * (y / 15)
                col = tuple(int(v * shade) for v in base)
                c.px(x, y, col)
    for _ in range(9):
        x, y = rng.integers(3, 13), rng.integers(2, 14)
        if shape[y][x] == "#":
            c.px(x, y, spots)
            if x + 1 < 16 and shape[y][x + 1] == "#":
                c.px(x + 1, y, spots)
    if face:
        g, d = (106, 150, 74), (30, 40, 24)
        c.rect(5, 6, 6, 6, g)
        c.rect(5, 6, 6, 1, (54, 70, 36))
        c.rect(6, 8, 1, 1, d)
        c.rect(9, 8, 1, 1, d)
        c.px(6, 8, (220, 40, 30))
        c.px(9, 8, (220, 40, 30))
        c.rect(7, 10, 2, 1, (40, 10, 12))
    # outline highlight
    c.px(6, 2, (255, 255, 255, 140))
    c.px(5, 3, (255, 255, 255, 110))
    c.save(path)


# =============================================================================
# Particles
# =============================================================================
def particle_textures():
    # soft glow orb
    n = 32
    r = radial(n, n, n / 2, n / 2, n / 2)
    a = np.clip(1 - r, 0, 1) ** 1.6
    arr = np.zeros((n, n, 4))
    arr[..., :3] = 255
    arr[..., 3] = a * 255
    to_image(arr).save(out("textures", "particle", "zt_glow.png"))

    # shockwave ring
    n = 64
    r = radial(n, n, n / 2, n / 2, n / 2)
    ring = np.exp(-((r - 0.82) / 0.09) ** 2)
    arr = np.zeros((n, n, 4))
    arr[..., :3] = 255
    arr[..., 3] = np.clip(ring, 0, 1) * 255
    to_image(arr).save(out("textures", "particle", "zt_ring.png"))

    # smoke puff, 4 frames (16x16 each) getting more diffuse
    frames = []
    for f in range(4):
        n = 16
        noise = value_noise(n, n, 4, 900 + f)
        r = radial(n, n, n / 2, n / 2, n / 2 * (0.75 + 0.08 * f))
        a = np.clip(1 - r, 0, 1) * (0.55 + 0.45 * noise)
        a = np.clip(a * 1.8 - f * 0.12, 0, 1)
        arr = np.zeros((n, n, 4))
        arr[..., :3] = 255
        arr[..., 3] = a * 255
        frames.append(arr)
    to_image(np.concatenate(frames, axis=1)).save(out("textures", "particle", "zt_smoke.png"))

    # spark (4 point star)
    n = 16
    arr = np.zeros((n, n, 4))
    yy, xx = np.mgrid[0:n, 0:n]
    dx, dy = np.abs(xx + 0.5 - n / 2), np.abs(yy + 0.5 - n / 2)
    star = np.clip(1 - (np.minimum(dx, dy) * 0.9 + np.maximum(dx, dy) * 0.12), 0, 1)
    arr[..., :3] = 255
    arr[..., 3] = np.clip(star * 1.5, 0, 1) * 255
    to_image(arr).save(out("textures", "particle", "zt_spark.png"))

    # dark fist (barrage)
    fist = [
        "................",
        "....##.##.##....",
        "...#########....",
        "...##########...",
        "..###########...",
        "..############..",
        "..############..",
        "..#######++###..",
        "..######++++##..",
        "...#####++####..",
        "...###########..",
        "....##########..",
        "....########....",
        ".....#######....",
        ".....######.....",
        "................",
    ]
    arr = np.zeros((16, 16, 4))
    for y, row in enumerate(fist):
        for x, ch in enumerate(row):
            if ch == "#":
                shade = 0.75 + 0.25 * (1 - y / 15)
                arr[y, x] = (int(60 * shade), int(30 * shade), int(88 * shade), 255)
            elif ch == "+":
                arr[y, x] = (240, 140, 255, 255)
    # rim light
    m = arr[..., 3] > 0
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    arr[edge, :3] = (190, 110, 255)
    to_image(arr).save(out("textures", "particle", "zt_fist.png"))


# =============================================================================
# Boss bar (custom HUD art, drawn at 2x)
# =============================================================================
def boss_bar_textures():
    k = 2
    # empty bar back: 182 x 6
    w, h = 182 * k, 6 * k
    noise = fbm(w, h, 77, cell=6, octaves=3)
    arr = np.zeros((h, w, 4))
    base = np.array((14, 26, 16))
    arr[..., :3] = base + (noise[..., None] - 0.5) * 18
    arr[..., 3] = 255
    arr[:k, :, :3] *= 0.5
    to_image(arr).save(out("textures", "ui", "zt", "titan_bar_back.png"))

    # filled bar: rotten-flesh red with a lighter top highlight
    noise = fbm(w, h, 78, cell=5, octaves=3)
    grain = np.random.default_rng(3).random((h, w))
    arr = np.zeros((h, w, 4))
    dark, mid, light = np.array((120, 34, 22)), np.array((178, 70, 38)), np.array((224, 120, 70))
    t = np.clip(noise * 0.8 + grain * 0.2, 0, 1)[..., None]
    arr[..., :3] = np.where(t < 0.5, dark + (mid - dark) * (t / 0.5), mid + (light - mid) * ((t - 0.5) / 0.5))
    arr[:k, :, :3] = arr[:k, :, :3] * 0.6 + np.array((255, 190, 140)) * 0.4
    arr[-k:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "titan_bar_fill.png"))

    # frame overlay: 200 x 26 with a hole for the 182x6 bar at (9, 13)
    W, H = 200 * k, 26 * k
    fr = np.zeros((H, W, 4))
    moss = fbm(W, H, 79, cell=8, octaves=4)
    hx0, hy0, hx1, hy1 = 9 * k, 13 * k, (9 + 182) * k, (13 + 6) * k
    yy, xx = np.mgrid[0:H, 0:W]
    # border band around the hole
    band = (xx >= hx0 - 3 * k) & (xx < hx1 + 3 * k) & (yy >= hy0 - 3 * k) & (yy < hy1 + 3 * k)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    dark, mid, light = np.array((10, 34, 14)), np.array((34, 84, 30)), np.array((92, 150, 64))
    t = moss[..., None]
    col = np.where(t < 0.5, dark + (mid - dark) * (t / 0.5), mid + (light - mid) * ((t - 0.5) / 0.5))
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    # inner bevel
    inner = band & ~hole & (xx >= hx0 - k) & (xx < hx1 + k) & (yy >= hy0 - k) & (yy < hy1 + k)
    fr[inner, :3] = (6, 14, 8)
    # mossy tufts / vines hanging off the frame
    rng = np.random.default_rng(80)
    for _ in range(26):
        x = int(rng.integers(hx0 - 2 * k, hx1 + 2 * k))
        if rng.random() < 0.55:
            y0, length, step = hy1 + 3 * k, int(rng.integers(1, 4)) * k, 1
        else:
            y0, length, step = hy0 - 3 * k - 1, int(rng.integers(1, 3)) * k, -1
        for i in range(length):
            yy0 = y0 + i * step
            if 0 <= yy0 < H:
                fr[yy0, x:x + k, :3] = (40 + rng.integers(0, 40), 100 + rng.integers(0, 50), 40)
                fr[yy0, x:x + k, 3] = 255
    # end caps (skull studs)
    for cx in (hx0 - 3 * k, hx1 + 3 * k):
        for dy in range(-5 * k, 5 * k):
            for dx in range(-5 * k, 5 * k):
                if dx * dx + dy * dy <= (5 * k) ** 2:
                    x, y = cx + dx, (hy0 + hy1) // 2 + dy
                    if 0 <= x < W and 0 <= y < H:
                        shade = 0.7 + 0.3 * (1 - (dx + dy) / (10 * k))
                        fr[y, x, :3] = np.array((60, 120, 50)) * shade
                        fr[y, x, 3] = 255
    # two zombie heads peeking over the middle of the frame
    def head(cx):
        s = k
        x0, y0 = cx - 4 * s, hy0 - 3 * k - 7 * s
        fr[y0:y0 + 8 * s, x0:x0 + 8 * s, :3] = (88, 132, 62)
        fr[y0:y0 + 8 * s, x0:x0 + 8 * s, 3] = 255
        fr[y0:y0 + 2 * s, x0:x0 + 8 * s, :3] = (40, 56, 30)
        fr[y0 + 3 * s:y0 + 4 * s, x0 + 1 * s:x0 + 3 * s, :3] = (10, 14, 8)
        fr[y0 + 3 * s:y0 + 4 * s, x0 + 5 * s:x0 + 7 * s, :3] = (10, 14, 8)
        fr[y0 + 3 * s:y0 + 4 * s, x0 + 2 * s:x0 + 3 * s, :3] = (230, 40, 30)
        fr[y0 + 3 * s:y0 + 4 * s, x0 + 5 * s:x0 + 6 * s, :3] = (230, 40, 30)
        fr[y0 + 5 * s:y0 + 6 * s, x0 + 3 * s:x0 + 5 * s, :3] = (52, 86, 40)
        fr[y0 + 6 * s:y0 + 7 * s, x0 + 2 * s:x0 + 6 * s, :3] = (40, 10, 12)
        # hands gripping the frame
        for hxo in (-6 * s, 6 * s):
            fr[hy0 - 4 * k:hy0 - 2 * k, cx + hxo - s:cx + hxo + s, :3] = (100, 146, 70)
            fr[hy0 - 4 * k:hy0 - 2 * k, cx + hxo - s:cx + hxo + s, 3] = 255
    head(W // 2 - 7 * k)
    head(W // 2 + 7 * k)
    to_image(fr).save(out("textures", "ui", "zt", "titan_bar_frame.png"))


# =============================================================================
# Pack icon
# =============================================================================
def pack_icon():
    n = 256
    bg = fbm(n, n, 91, cell=40, octaves=4)
    arr = np.zeros((n, n, 4))
    r = radial(n, n, n / 2, n / 2, n * 0.7)
    base = np.stack([20 + bg * 30, 40 + bg * 50, 22 + bg * 24], -1)
    arr[..., :3] = base * (1.2 - r[..., None] * 0.7)
    arr[..., 3] = 255
    # pixel-art titan head, 16x16 blown up 12x
    face = [
        "HHHHHHHHHHHHHHHH",
        "HHHHHHHHHHHHHHHH",
        "HSSHSSSHHSSSSHSH",
        "SSSSSSSSSSSSSSSS",
        "SSSSSSSSSSSSSSSS",
        "SBBBBSSSSSSBBBBS",
        "SEEEESSSSSSEEEES",
        "SEERESSSSSSERRES",
        "SEEEESSDDSSEEEES",
        "SSSSSSSDDSSSSSSS",
        "SSWWSSSSSSSSSSSS",
        "SWWWSSSSSSSSSSSS",
        "SMTMTMTMTMTMTMTS",
        "SMMMMMMMMMMMMMMS",
        "SSTMTMTMTMTMTMSS",
        "SSSSSSSSSSSSSSSS",
    ]
    cols = {"H": (44, 56, 30), "S": (96, 140, 68), "B": (60, 90, 44), "E": (10, 14, 8), "R": (255, 50, 30),
            "D": (52, 86, 40), "W": (120, 26, 30), "M": (40, 8, 10), "T": (220, 212, 186)}
    k = 12
    ox, oy = (n - 16 * k) // 2, 20
    noise = fbm(16 * k, 16 * k, 92, cell=10, octaves=3)
    for y, row in enumerate(face):
        for x, ch in enumerate(row):
            col = np.array(cols[ch], dtype=np.float64)
            blk = noise[y * k:(y + 1) * k, x * k:(x + 1) * k, None]
            arr[oy + y * k:oy + (y + 1) * k, ox + x * k:ox + (x + 1) * k, :3] = col * (0.85 + blk * 0.3)
    # glowing eyes
    glow = np.zeros((n, n))
    for ex in (3, 12):
        glow += np.exp(-(((np.arange(n)[None, :] - (ox + ex * k + k / 2)) ** 2 +
                          (np.arange(n)[:, None] - (oy + 7 * k + k / 2)) ** 2) / (2 * 14.0 ** 2)))
    arr[..., 0] = np.clip(arr[..., 0] + glow * 160, 0, 255)
    arr[..., 1] = np.clip(arr[..., 1] + glow * 20, 0, 255)
    img = to_image(arr)
    img.save(out("pack_icon.png"))
    os.makedirs(BP, exist_ok=True)
    img.save(os.path.join(BP, "pack_icon.png"))


def main():
    titan_texture()
    for name in MINION:
        minion_texture(name)
    proto_ball_texture()
    dark_fists_icon()
    egg_icon(out("textures", "items", "zt_zombie_titan_egg.png"), (34, 150, 140), (70, 110, 60), face=True)
    egg_icon(out("textures", "items", "zt_zombie_minion_egg.png"), (60, 100, 46), (20, 120, 120))
    particle_textures()
    boss_bar_textures()
    pack_icon()
    print("textures written to", RP)


if __name__ == "__main__":
    main()
