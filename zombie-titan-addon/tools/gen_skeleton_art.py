"""Generates the Skeleton Titan's textures: the titan, its giant arrows, the
four skeleton minion skins, spawn eggs and the bone boss bar.

All of it is drawn procedurally (nothing copied from the Java mod):
    python3 tools/gen_skeleton_art.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_models import ARROW_PARTS, SKEL_PARTS  # noqa: E402
from texlib import Canvas, Painter, box_faces, fbm, scaled, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

BONE_L, BONE_M, BONE_D, BONE_X = (238, 234, 220), (206, 199, 178), (156, 147, 124), (98, 90, 74)
YELLOWED = (184, 168, 126)
SOCKET = (18, 16, 14)
GLOW_ICE = (160, 225, 255, 6)          # low alpha = emissive with entity_emissive_alpha
WOOD_D, WOOD_M, WOOD_L = (70, 46, 24), (112, 78, 44), (152, 112, 66)
LEATHER_D, LEATHER_M = (44, 28, 18), (78, 52, 32)
STRING = (226, 224, 214)
STEEL_D, STEEL_M, STEEL_L = (96, 102, 110), (160, 166, 174), (226, 232, 238)
CLEAR = (0, 0, 0, 0)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def jagged_line(c, rng, x, y, length, dx, dy, color, wobble=0.6):
    """A thin crack: a random walk along (dx, dy)."""
    for _ in range(int(length)):
        c.px(x, y, color)
        x += dx + rng.uniform(-wobble, wobble)
        y += dy + rng.uniform(-wobble, wobble)


# =============================================================================
# Skeleton Titan (geometry.zt.skeleton_titan, 128 x 64 texture units, 4 px/unit)
# =============================================================================
S = 4


def faces(part, parts=SKEL_PARTS, s=S):
    (u, v), (w, h, d) = parts[part]
    return {k: scaled(r, s) for k, r in box_faces(u, v, w, h, d).items()}


def skeleton_titan_texture():
    c = Canvas(128 * S, 64 * S, CLEAR)
    p = Painter(c, seed=17)
    rng = np.random.default_rng(23)

    def bone(r, contrast=1.1):
        x, y, w, h = r
        if w < 1 or h < 1:
            return
        p.material(x, y, w, h, BONE_D, BONE_M, BONE_L, contrast=contrast, grain=0.10)
        p.blotches(x, y, w, h, YELLOWED, threshold=0.66, soft=0.07, alpha=0.45)
        p.shade_edges(x, y, w, h, amount=0.22)

    def wood(r, along="v"):
        x, y, w, h = r
        if w < 1 or h < 1:
            return
        p.material(x, y, w, h, WOOD_D, WOOD_M, WOOD_L, contrast=1.0, grain=0.14)
        # grain lines along the limb
        if along == "v":
            for k in range(int(x) + 1, int(x + w), 3):
                c.a[int(y):int(y + h), k, :3] *= 0.82
        else:
            for k in range(int(y) + 1, int(y + h), 3):
                c.a[k, int(x):int(x + w), :3] *= 0.82

    # ---- cranium: eye sockets with a faint ice-blue glow, nose hole, cracks -------------
    f = faces("cranium")
    for side in f:
        bone(f[side])
    x, y, w, h = f["front"]
    u = S
    for ex in (1.0, 5.0):
        sx, sy, sw, sh = x + ex * u, y + 2.1 * u, 2.0 * u, 1.9 * u
        c.rect(sx, sy, sw, sh, SOCKET)
        for cx, cy in ((sx, sy), (sx + sw - 1, sy), (sx, sy + sh - 1), (sx + sw - 1, sy + sh - 1)):
            c.px(cx, cy, BONE_D)                                    # rounded corners
        c.rect(sx, sy, sw, 1, BONE_X)                                # brow ridge shadow
        c.rect(sx + sw / 2 - 1, sy + sh / 2 - 1, 3, 3, GLOW_ICE)     # pupil glow
    nx, ny = x + 3.5 * u, y + 4.5 * u
    c.rect(nx, ny + 1, u, 1.2 * u - 1, SOCKET)
    c.rect(nx + 1, ny, u - 2, 1, SOCKET)
    c.rect(x, y + h - 2, w, 2, BONE_D)                               # cheekbone line
    for side in ("top", "left", "back"):
        sx, sy, sw, sh = f[side]
        for _ in range(2):
            jagged_line(c, rng, sx + rng.uniform(0.2, 0.8) * sw, sy + rng.uniform(0.1, 0.4) * sh,
                        rng.integers(8, 16), rng.uniform(-0.5, 0.5), 1.0, BONE_X)
    # ---- jaw: a row of teeth, dark mouth inside --------------------------------------
    f = faces("jaw")
    for side in ("right", "left", "back", "bottom"):
        bone(f[side])
    c.rect(*f["top"], SOCKET)
    x, y, w, h = f["front"]
    bone(f["front"])
    teeth_h = h * 0.55
    c.rect(x, y, w, teeth_h, SOCKET)
    k = 0
    while k < w:
        c.rect(x + k, y, 3, teeth_h, BONE_L)
        c.rect(x + k, y + teeth_h - 1, 3, 1, BONE_D)
        k += 4
    # the teeth carry round the front corners of the jaw (box UV: the right face's front end is
    # its right edge, the left face's front end is its left edge)
    for side in ("right", "left"):
        sx, sy, sw, sh = f[side]
        span = sw * 0.4
        x0 = sx + sw - span if side == "right" else sx
        c.rect(x0, sy, span, sh * 0.5, SOCKET)
        k = 0
        while k < span:
            c.rect(x0 + k, sy, 3, sh * 0.5, BONE_L)
            k += 4

    # ---- ribcage: rib bars with see-through gaps and a sternum -------------------------
    f = faces("ribcage")
    rows = [(0, 4), (7, 10), (13, 16), (19, 22), (24, 27)]

    def ribs(r, sternum=False, spine=False):
        x, y, w, h = r
        tmp = Canvas(c.w, c.h, CLEAR)
        keep = c.a.copy()
        bone(r)
        painted = c.a.copy()
        c.a = keep
        for y0, y1 in rows:
            band = painted[int(y + y0):int(y + y1), int(x):int(x + w)].copy()
            band[0, :, :3] = np.minimum(255, band[0, :, :3] * 1.08)        # lit top edge
            band[-1, :, :3] *= 0.72                                         # shadow under each rib
            c.a[int(y + y0):int(y + y1), int(x):int(x + w)] = band
        if sternum:
            c.a[int(y):int(y + 22), int(x + w / 2 - 2):int(x + w / 2 + 2)] = painted[int(y):int(y + 22), int(x + w / 2 - 2):int(x + w / 2 + 2)]
            c.a[int(y):int(y + 22), int(x + w / 2 - 2), :3] *= 0.8
        if spine:
            c.a[int(y):int(y + h), int(x + w / 2 - 4):int(x + w / 2 + 4)] = painted[int(y):int(y + h), int(x + w / 2 - 4):int(x + w / 2 + 4)]
            for k in range(int(y), int(y + h), 4):
                c.a[k, int(x + w / 2 - 4):int(x + w / 2 + 4), :3] *= 0.7
        del tmp

    ribs(f["front"], sternum=True)
    ribs(f["back"], spine=True)
    ribs(f["right"])
    ribs(f["left"])
    bone(f["top"])                                                   # collarbones / shoulder plate
    x, y, w, h = f["top"]
    c.rect(x + w / 2 - 1, y, 2, h, BONE_X)
    # bottom of the ribcage stays open (transparent)

    # ---- hips: pelvis with dark hollows ---------------------------------------------------
    f = faces("hips")
    for side in f:
        bone(f[side])
    x, y, w, h = f["front"]
    c.rect(x, y, w, 1, BONE_D)                                       # rim of the pelvis
    c.rect(x + w / 2 - 2, y + h - 3, 4, 3, SOCKET)                   # pubic arch
    c.rect(x + w / 2 - 3, y + h - 4, 6, 1, BONE_D)
    # ---- vertebrae ------------------------------------------------------------------------
    f = faces("vertebra")
    for side in f:
        bone(f[side], contrast=0.9)
    for side in ("right", "front", "left", "back"):
        x, y, w, h = f[side]
        c.rect(x, y + h / 2, w, 1, BONE_X)

    # ---- limbs: knobbly joints, twin bones in the forearms and shins ------------------------
    for part in ("r_upper_arm", "l_upper_arm", "r_thigh", "l_thigh", "r_forearm", "l_forearm", "r_shin", "l_shin"):
        f = faces(part)
        for side in f:
            bone(f[side])
        for side in ("right", "front", "left", "back"):
            x, y, w, h = f[side]
            c.rect(x, y, 1, h, BONE_D)                                # thinner-looking shaft
            c.rect(x + w - 1, y, 1, h, BONE_D)
            c.rect(x, y, w, 3, BONE_L)                                # joint knobs
            c.rect(x, y + h - 3, w, 3, BONE_L)
            c.rect(x, y + 3, w, 1, BONE_D)
            c.rect(x, y + h - 4, w, 1, BONE_D)
            if part.endswith(("forearm", "shin")):
                c.rect(x + w / 2 - 0.5, y + 4, 1, h - 8, SOCKET)      # gap between the two bones
        x, y, w, h = f["bottom"]
        if part.endswith("forearm"):                                  # finger bones
            for k in range(int(x), int(x + w), 2):
                c.rect(k, y, 1, h, BONE_X)
        if part.endswith("shin"):                                     # toes
            for k in range(int(x) + 1, int(x + w), 3):
                c.rect(k, y, 1, h, BONE_X)

    # ---- the bow -----------------------------------------------------------------------------
    for part in ("limb1", "limb2", "limb3"):
        f = faces(part)
        for side in f:
            wood(f[side])
    f = faces("limb3")
    for side in ("right", "front", "left", "back"):
        x, y, w, h = f[side]
        c.rect(x, y + h - 3, w, 3, (204, 196, 170))                   # horn nocks at the tips
    f = faces("grip")
    for side in f:
        x, y, w, h = f[side]
        if w < 1 or h < 1:
            continue
        p.material(x, y, w, h, LEATHER_D, LEATHER_M, (110, 76, 46), grain=0.1)
        for k in range(int(y), int(y + h), 3):
            c.rect(x, k, w, 1, LEATHER_D)
    f = faces("string")
    for side in f:
        x, y, w, h = f[side]
        c.rect(x, y, max(1, w), max(1, h), STRING)
    f = faces("nock_shaft")
    for side in f:
        x, y, w, h = f[side]
        c.rect(x, y, max(1, w), max(1, h), WOOD_L)
    f = faces("nock_head")
    for side in f:
        x, y, w, h = f[side]
        if w >= 1 and h >= 1:
            p.material(x, y, w, h, STEEL_D, STEEL_M, STEEL_L, contrast=0.7)

    c.save(out("textures", "entity", "skeleton_titan", "skeleton_titan.png"))


# =============================================================================
# Giant arrow (geometry.zt.titan_arrow, 32 x 32 units, 4 px/unit)
# =============================================================================
def titan_arrow_texture():
    c = Canvas(32 * S, 32 * S, CLEAR)
    p = Painter(c, seed=31)
    f = faces("shaft", ARROW_PARTS)
    for side in f:
        x, y, w, h = f[side]
        if w < 1 or h < 1:
            continue
        p.material(x, y, w, h, WOOD_D, WOOD_M, WOOD_L, grain=0.12)
    for side in ("top", "bottom"):                                    # bindings near the fletching
        x, y, w, h = f[side]
        c.rect(x, y + h - 12, w, 2, LEATHER_D)
        c.rect(x, y + h - 4, w, 2, LEATHER_D)
    for part in ("head", "tip"):
        f = faces(part, ARROW_PARTS)
        for side in f:
            x, y, w, h = f[side]
            if w >= 1 and h >= 1:
                p.material(x, y, w, h, STEEL_D, STEEL_M, STEEL_L, contrast=0.8)
                p.shade_edges(x, y, w, h, amount=0.3)

    def feather(r):
        """Grey-white fletching with darker barb stripes, a dark quill along one edge."""
        x, y, w, h = (int(v) for v in r)
        if w < 1 or h < 1:
            return
        for yy in range(h):
            for xx in range(w):
                tone = 232 - (36 if xx % 4 == 0 else 0) - (24 if yy == 0 or yy == h - 1 else 0)
                c.px(x + xx, y + yy, (tone, tone, tone - 10))
        c.rect(x, y, 2, h, (60, 60, 66))

    for part in ("vane_v", "vane_h"):
        for side, r in faces(part, ARROW_PARTS).items():
            feather(r)
    c.save(out("textures", "entity", "titan_arrow.png"))


# =============================================================================
# Skeleton minions (geometry.zt.skeleton_minion: the vanilla skeleton with its hat layer shown)
# =============================================================================
MINIONS = {
    # eye glow matches the zombie minion tiers
    "loyalist": {"eye": (150, 220, 255, 6), "cloth": ((60, 66, 74), (92, 100, 110), (128, 136, 146)), "seed": 111},
    "priest": {"eye": (255, 230, 90, 6), "cloth": ((52, 18, 70), (86, 34, 112), (124, 60, 150)), "seed": 222},
    "zealot": {"eye": (255, 60, 40, 6), "cloth": ((70, 10, 12), (118, 22, 24), (158, 44, 40)), "seed": 333},
    "templar": {"eye": (210, 90, 255, 6), "cloth": (STEEL_D, STEEL_M, STEEL_L), "seed": 444},
}


def skeleton_minion_texture(name):
    cfg = MINIONS[name]
    c = Canvas(64, 32, CLEAR)
    p = Painter(c, seed=cfg["seed"])
    cd, cm, cl = cfg["cloth"]

    def bone(r):
        x, y, w, h = r
        p.material(x, y, w, h, BONE_D, BONE_M, BONE_L, contrast=1.0, grain=0.12)

    def cloth(r):
        x, y, w, h = r
        p.material(x, y, w, h, cd, cm, cl, contrast=1.0, grain=0.1)

    def fc(u, v, w, h, d):
        return box_faces(u, v, w, h, d)

    # head
    head = fc(0, 0, 8, 8, 8)
    for side in head:
        bone(head[side])
    x, y, w, h = head["front"]
    for ex in (1, 5):
        c.rect(x + ex, y + 3, 2, 2, SOCKET)
        c.px(x + ex + 1, y + 4, cfg["eye"])
    c.rect(x + 3, y + 5, 2, 1, SOCKET)                               # nose
    c.rect(x + 1, y + 6, 6, 1, SOCKET)                               # teeth
    for k in range(1, 7, 2):
        c.px(x + k, y + 6, BONE_L)
    # body: ribs with see-through gaps, like the vanilla skeleton
    body = fc(16, 16, 8, 12, 4)
    for side, r in body.items():
        bone(r)
        if side in ("front", "back", "right", "left"):
            x, y, w, h = r
            for row in range(h):
                if row in (3, 5, 7, 9) and side in ("front", "back"):
                    c.rect(x, y + row, w, 1, CLEAR)
                    if side == "front":
                        c.rect(x + w / 2 - 1, y + row, 2, 1, BONE_M)  # sternum
                if row in (3, 5, 7, 9) and side in ("right", "left"):
                    c.rect(x, y + row, w, 1, CLEAR)
            if h >= 12:
                c.rect(x, y + 10, w, 2, BONE_D)                       # pelvis band
    # arms and legs: thin bones
    for u0 in (40, 0):
        limb = fc(u0, 16, 2, 12, 2)
        for side, r in limb.items():
            bone(r)
            x, y, w, h = r
            if h >= 12:
                c.rect(x, y + 5, w, 1, BONE_D)                        # elbow / knee
    # tier decorations
    hat = fc(32, 0, 8, 8, 8)
    if name == "loyalist":
        # a tattered grey sash across the ribs
        x, y, w, h = body["front"]
        for i in range(w):
            c.rect(x + i, y + 1 + i, 1, 2, cm)
    elif name == "priest":
        for side in ("top", "right", "left", "back"):
            cloth(hat[side])
        x, y, w, h = hat["front"]
        c.rect(x, y, w, 2, cm)                                        # hood rim over the brow
        c.rect(x, y, 1, h, cd)
        c.rect(x + w - 1, y, 1, h, cd)
        x, y, w, h = body["front"]
        cloth((x + 2, y, 4, h))                                       # robe tabard
        c.rect(x + 3, y + 3, 2, 1, (230, 200, 90))                    # gold clasp
    elif name == "zealot":
        for side in ("right", "front", "left", "back"):
            x, y, w, h = hat[side]
            cloth((x, y + 1, w, 2))                                   # bandana band
        x, y, w, h = hat["back"]
        cloth((x + 3, y + 3, 2, 4))                                   # knot tails
        x, y, w, h = body["front"]
        for i in range(w):
            c.rect(x + w - 1 - i, y + i, 1, 2, cm)
    elif name == "templar":
        for side in hat:
            p.material(*hat[side], STEEL_D, STEEL_M, STEEL_L, contrast=0.8)
        x, y, w, h = hat["front"]
        c.rect(x, y + 3, w, 2, CLEAR)                                 # visor slit shows the eyes
        c.rect(x + 3, y + 5, 2, 3, STEEL_D)                           # nose guard
        x, y, w, h = hat["bottom"]
        c.rect(x, y, w, h, CLEAR)
        x, y, w, h = body["front"]
        p.material(x, y, w, 8, STEEL_D, STEEL_M, STEEL_L, contrast=0.8)
        c.rect(x + 3, y + 1, 2, 6, (150, 20, 30))                     # red cross on the plate
        c.rect(x + 1, y + 3, 6, 2, (150, 20, 30))
    c.save(out("textures", "entity", "skeleton_minion", name + ".png"))


# =============================================================================
# Spawn eggs
# =============================================================================
EGG = [
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


def egg_icon(path, base, spots, skull=False):
    rng = np.random.default_rng(len(path) + 7)
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(EGG):
        for x, ch in enumerate(row):
            if ch == "#":
                shade = 1.0 - 0.18 * (x / 15) - 0.12 * (y / 15)
                c.px(x, y, tuple(int(v * shade) for v in base))
    for _ in range(9):
        x, y = rng.integers(3, 13), rng.integers(2, 14)
        if EGG[y][x] == "#":
            c.px(x, y, spots)
    if skull:
        c.rect(5, 6, 6, 5, (236, 232, 218))
        c.rect(6, 11, 4, 1, (206, 199, 178))
        c.rect(6, 8, 1, 1, SOCKET)
        c.rect(9, 8, 1, 1, SOCKET)
        c.px(6, 8, (120, 200, 255))
        c.px(9, 8, (120, 200, 255))
        c.px(7, 10, SOCKET)
        c.px(8, 10, SOCKET)
    c.px(6, 2, (255, 255, 255, 140))
    c.px(5, 3, (255, 255, 255, 110))
    c.save(path)


# =============================================================================
# Boss bar: bleached bone frame with two skulls (182x6 bar inside a 200x26 frame, drawn at 2x)
# =============================================================================
def boss_bar_textures():
    k = 2
    w, h = 182 * k, 6 * k
    noise = fbm(w, h, 91, cell=6, octaves=3)
    arr = np.zeros((h, w, 4))
    arr[..., :3] = np.array((30, 28, 26)) + (noise[..., None] - 0.5) * 16
    arr[..., 3] = 255
    arr[:k, :, :3] *= 0.5
    to_image(arr).save(out("textures", "ui", "zt", "skeleton_bar_back.png"))

    noise = fbm(w, h, 92, cell=5, octaves=3)
    grain = np.random.default_rng(9).random((h, w))
    arr = np.zeros((h, w, 4))
    dark, mid, light = np.array((170, 162, 140)), np.array((214, 208, 190)), np.array((246, 243, 232))
    t = np.clip(noise * 0.8 + grain * 0.2, 0, 1)[..., None]
    arr[..., :3] = np.where(t < 0.5, dark + (mid - dark) * (t / 0.5), mid + (light - mid) * ((t - 0.5) / 0.5))
    arr[:k, :, :3] = arr[:k, :, :3] * 0.5 + 255 * 0.5
    arr[-k:, :, :3] *= 0.65
    for x in range(0, w, 14 * k):                                  # faint vertebra notches
        arr[:, x:x + k, :3] *= 0.86
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "skeleton_bar_fill.png"))

    W, H = 200 * k, 26 * k
    fr = np.zeros((H, W, 4))
    tex = fbm(W, H, 93, cell=7, octaves=4)
    hx0, hy0, hx1, hy1 = 9 * k, 13 * k, (9 + 182) * k, (13 + 6) * k
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 3 * k) & (xx < hx1 + 3 * k) & (yy >= hy0 - 3 * k) & (yy < hy1 + 3 * k)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    dark, mid, light = np.array((150, 142, 120)), np.array((206, 199, 178)), np.array((240, 236, 222))
    t = tex[..., None]
    col = np.where(t < 0.5, dark + (mid - dark) * (t / 0.5), mid + (light - mid) * ((t - 0.5) / 0.5))
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    outer = band & ~((xx >= hx0 - 3 * k + k) & (xx < hx1 + 3 * k - k) & (yy >= hy0 - 3 * k + k) & (yy < hy1 + 3 * k - k))
    fr[outer, :3] *= 0.62                                          # dark outline
    inner = band & ~hole & (xx >= hx0 - k) & (xx < hx1 + k) & (yy >= hy0 - k) & (yy < hy1 + k)
    fr[inner, :3] = (40, 36, 30)
    # vertebra bumps along the top and bottom edges
    for x in range(hx0 + 6 * k, hx1 - 4 * k, 12 * k):
        for (y0, y1) in ((hy0 - 5 * k, hy0 - 3 * k), (hy1 + 3 * k, hy1 + 5 * k)):
            fr[y0:y1, x:x + 4 * k, :3] = (214, 208, 190)
            fr[y0:y1, x:x + 4 * k, 3] = 255
            fr[y0:y1, x:x + k, :3] = (150, 142, 120)
    # bone knobs at both ends (the bar is one long bone)
    for cx in (hx0 - 3 * k, hx1 + 3 * k):
        for cy in ((hy0 + hy1) // 2 - 3 * k, (hy0 + hy1) // 2 + 3 * k):
            for dy in range(-4 * k, 4 * k):
                for dx in range(-4 * k, 4 * k):
                    if dx * dx + dy * dy <= (4 * k) ** 2:
                        x, y = cx + dx, cy + dy
                        if 0 <= x < W and 0 <= y < H:
                            shade = 0.72 + 0.28 * (1 - (dx + dy) / (8 * k))
                            fr[y, x, :3] = np.array((236, 232, 218)) * shade
                            fr[y, x, 3] = 255

    # two skulls peeking over the middle
    def skull(cx):
        s = k
        x0, y0 = cx - 4 * s, hy0 - 3 * k - 8 * s
        fr[y0:y0 + 8 * s, x0:x0 + 8 * s, :3] = (232, 228, 214)
        fr[y0:y0 + 8 * s, x0:x0 + 8 * s, 3] = 255
        fr[y0:y0 + s, x0:x0 + 8 * s, :3] = (206, 199, 178)
        fr[y0 + 3 * s:y0 + 5 * s, x0 + 1 * s:x0 + 3 * s, :3] = (18, 16, 14)
        fr[y0 + 3 * s:y0 + 5 * s, x0 + 5 * s:x0 + 7 * s, :3] = (18, 16, 14)
        fr[y0 + 4 * s:y0 + 5 * s, x0 + 2 * s:x0 + 3 * s, :3] = (140, 210, 255)
        fr[y0 + 4 * s:y0 + 5 * s, x0 + 5 * s:x0 + 6 * s, :3] = (140, 210, 255)
        fr[y0 + 5 * s:y0 + 6 * s, x0 + 3 * s:x0 + 5 * s, :3] = (18, 16, 14)
        fr[y0 + 7 * s:y0 + 8 * s, x0 + 1 * s:x0 + 7 * s, :3] = (18, 16, 14)
        for tx in range(1, 7, 2):
            fr[y0 + 7 * s:y0 + 8 * s, x0 + tx * s:x0 + (tx + 1) * s, :3] = (236, 232, 218)
        # bony fingers gripping the frame
        for hxo in (-6 * s, 6 * s):
            for fx in (-s, 0, s):
                fr[hy0 - 5 * k:hy0 - 3 * k, cx + hxo + fx:cx + hxo + fx + 1, :3] = (220, 214, 196)
                fr[hy0 - 5 * k:hy0 - 3 * k, cx + hxo + fx:cx + hxo + fx + 1, 3] = 255

    skull(W // 2 - 7 * k)
    skull(W // 2 + 7 * k)
    to_image(fr).save(out("textures", "ui", "zt", "skeleton_bar_frame.png"))


def main():
    skeleton_titan_texture()
    titan_arrow_texture()
    for name in MINIONS:
        skeleton_minion_texture(name)
    egg_icon(out("textures", "items", "zt_skeleton_titan_egg.png"), (196, 196, 196), (78, 78, 78), skull=True)
    egg_icon(out("textures", "items", "zt_skeleton_minion_egg.png"), (170, 170, 170), (96, 70, 130))
    boss_bar_textures()
    print("skeleton art written")


if __name__ == "__main__":
    main()
