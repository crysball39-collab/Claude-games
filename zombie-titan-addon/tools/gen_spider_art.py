"""Generates the Spider Titan: its geometry, its texture, the four spider
minion skins, spawn eggs and the cobweb boss bar.

The model follows the Java Titans mod's ModelSpiderTitan (0.45): a spider
with an 8 px head, a 6 px thorax and a 10 x 8 x 12 abdomen, and eight legs
of two segments each. It is rendered 16x, like the Java one: 16 blocks tall
at the knees and about 32 across the legs. Here the legs stand the way a
real spider's do, knees above the body and feet planted around it; each leg
has a hip bone (its spread), an upper and a lower segment, and the rest pose
is the bind pose of those bones, solved so every foot touches the ground.
All textures are drawn procedurally; nothing is copied from the Java mod.

    python3 tools/gen_spider_art.py
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texlib import Canvas, Painter, box_faces, fbm, scaled, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

# name: ((u, v), (w, h, d)) in texture units (128 x 64 texture, box UV)
SPIDER_PARTS = {
    "head": ((0, 0), (8, 8, 8)),
    "thorax": ((32, 0), (6, 6, 6)),
    "abdomen": ((56, 0), (10, 8, 12)),
    "upper": ((0, 24), (10, 2, 2)),
    "lower": ((0, 28), (16, 2, 2)),
    "fang": ((40, 24), (2, 3, 2)),
}
HIP_Y = 9.0
HIP_X = 3.0
UPPER = 10.0
LOWER = 16.0
# the four legs down each side, front to back: (name, hip z, spread toward the back in degrees,
# how high the knee is raised); the front pair reach forward like arms
LEGS = [("Arm", -2.0, -50.0, 44.0), ("Front", -1.0, -20.0, 38.0), ("Back", 1.0, 20.0, 36.0), ("Rear", 2.0, 48.0, 40.0)]
SIDES = [("right", -1), ("left", 1)]
FOOT_Y = 1.0  # the axis of the foot segment, one block up: its underside rests on the ground


def r(v):
    return round(v, 4)


def lower_bend(raise_deg):
    """The knee bend (relative to the upper segment) that brings the foot down to FOOT_Y."""
    knee_y = HIP_Y + UPPER * math.sin(math.radians(raise_deg))
    down = math.degrees(math.asin(max(-1.0, min(1.0, (FOOT_Y - knee_y) / LOWER))))
    return down - raise_deg


def leg_names():
    return [side + name for side, _ in SIDES for name, _, _, _ in LEGS]


def leg_rest(side_sign, spread, raise_deg):
    """Bind rotations (hip, upper, lower) of one leg. Right legs point along -X, where a positive
    Z rotation lifts the tip and a positive Y rotation swings it toward the back; left legs mirror."""
    bend = lower_bend(raise_deg)
    if side_sign < 0:
        return [0, spread, 0], [0, 0, raise_deg], [0, 0, bend]
    return [0, -spread, 0], [0, 0, -raise_deg], [0, 0, -bend]


def cube(part, origin, mirror=False):
    (u, v), size = SPIDER_PARTS[part]
    c = {"origin": [r(x) for x in origin], "size": list(size), "uv": [u, v]}
    if mirror:
        c["mirror"] = True
    return c


def spider_bones():
    bones = [
        {"name": "root", "pivot": [0, 0, 0]},
        {"name": "thorax", "parent": "root", "pivot": [0, HIP_Y, 0], "cubes": [cube("thorax", (-3, 6, -3))]},
        {"name": "head", "parent": "thorax", "pivot": [0, HIP_Y, -3], "cubes": [cube("head", (-4, 5, -11))]},
        {"name": "fangRight", "parent": "head", "pivot": [-1.5, 6, -10.5], "rotation": [-10, 0, 14],
         "cubes": [cube("fang", (-2.5, 3, -11.5))]},
        {"name": "fangLeft", "parent": "head", "pivot": [1.5, 6, -10.5], "rotation": [-10, 0, -14],
         "cubes": [cube("fang", (0.5, 3, -11.5), True)]},
        {"name": "abdomen", "parent": "thorax", "pivot": [0, HIP_Y, 3], "cubes": [cube("abdomen", (-5, 5, 3))]},
    ]
    for side, sgn in SIDES:
        for name, z, spread, raise_deg in LEGS:
            hip, upper, lower = leg_rest(sgn, spread, raise_deg)
            n = side + name
            hx = HIP_X * sgn
            kx = (HIP_X + UPPER) * sgn
            bones.append({"name": n + "Hip", "parent": "thorax", "pivot": [hx, HIP_Y, z], "rotation": hip})
            up_origin = (hx - UPPER, HIP_Y - 1, z - 1) if sgn < 0 else (hx, HIP_Y - 1, z - 1)
            bones.append({"name": n + "Upper", "parent": n + "Hip", "pivot": [hx, HIP_Y, z], "rotation": upper,
                          "cubes": [cube("upper", up_origin, sgn > 0)]})
            lo_origin = (kx - LOWER, HIP_Y - 1, z - 1) if sgn < 0 else (kx, HIP_Y - 1, z - 1)
            bones.append({"name": n + "Lower", "parent": n + "Upper", "pivot": [kx, HIP_Y, z], "rotation": lower,
                          "cubes": [cube("lower", lo_origin, sgn > 0)]})
    return bones


def spider_titan_geo():
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.zt.spider_titan",
                "texture_width": 128,
                "texture_height": 64,
                "visible_bounds_width": 48,
                "visible_bounds_height": 24,
                "visible_bounds_offset": [0, 8, 0],
            },
            "bones": spider_bones(),
        }],
    }


# =============================================================================
# textures
# =============================================================================
S = 4  # pixels per texture unit on the titan
CLEAR = (0, 0, 0, 0)
B_DARK, B_MID, B_LIGHT = (26, 21, 18), (58, 49, 42), (92, 80, 68)
BAND = (14, 11, 10)
HAIR = (128, 116, 102)
EYE_BIG = (255, 28, 22, 10)     # low alpha = emissive with entity_emissive_alpha
EYE_SMALL = (200, 8, 8, 10)
EYE_SHINE = (255, 196, 170, 14)
FANG = (150, 140, 128)
FANG_TIP = (36, 28, 24)

# the face on an 8 x 8 grid: s = small eye, L = big eye (two of them, 2 x 2 each), m = the mouth
FACE_GRID = [
    "........",
    "..s..s..",
    "s..ss..s",
    ".LL..LL.",
    ".LL..LL.",
    "........",
    "..mmmm..",
    "...mm...",
]


def faces(part, s=S):
    (u, v), (w, h, d) = SPIDER_PARTS[part]
    return {k: scaled(rr, s) for k, rr in box_faces(u, v, w, h, d).items()}


def hairs(c, rng, rect, count, color=HAIR, length=2):
    x, y, w, h = rect
    for _ in range(int(count)):
        hx, hy = x + rng.uniform(0, w - 1), y + rng.uniform(0, h - 1)
        dx = rng.choice([-1, 0, 1])
        for k in range(length):
            c.blend_px(hx + dx * k * 0.5, hy - k, color, 0.75 - 0.25 * k)


def spider_titan_texture():
    c = Canvas(128 * S, 64 * S, CLEAR)
    p = Painter(c, seed=71)
    rng = np.random.default_rng(73)
    blot = fbm(c.w, c.h, 79, cell=8, octaves=3)

    def skin(rect, darken=1.0, hair=0.012):
        x, y, w, h = rect
        if w < 1 or h < 1:
            return
        p.material(x, y, w, h, B_DARK, B_MID, B_LIGHT, contrast=1.3, grain=0.2)
        p.blotches(x, y, w, h, BAND, threshold=0.6, field=blot, soft=0.06, alpha=0.75)
        p.shade_edges(x, y, w, h, amount=0.22)
        if darken != 1.0:
            c.a[int(y):int(y + h), int(x):int(x + w), :3] *= darken
        hairs(c, rng, rect, w * h * hair)

    for part in ("head", "thorax", "abdomen"):
        for side, rect in faces(part).items():
            skin(rect, 0.8 if side == "bottom" else 1.0)

    # ---- the face: eight red eyes that glow in the dark, and the fang roots -----------------
    x, y, w, h = faces("head")["front"]
    u = w / 8
    for gy, row in enumerate(FACE_GRID):
        for gx, ch in enumerate(row):
            cx, cy = x + gx * u, y + gy * u
            if ch == "s":
                c.rect(cx, cy, u, u, BAND)
                c.rect(cx + 0.5, cy + 0.5, u - 1, u - 1, EYE_SMALL)
                c.px(cx + 1, cy + 1, EYE_SHINE)
            elif ch == "m":
                c.rect(cx, cy, u, u, BAND)
    for ex in (1, 5):
        # each big eye: a round red lens in a dark socket, with a shine
        ex0, ey0, size = x + ex * u, y + 3 * u, 2 * u
        c.rect(ex0 - 1, ey0 - 1, size + 2, size + 2, BAND)
        yy, xx = np.mgrid[0:int(size), 0:int(size)]
        rr = np.hypot(xx + 0.5 - size / 2, yy + 0.5 - size / 2)
        lens = rr <= size / 2 - 0.3
        reg = c.a[int(ey0):int(ey0 + size), int(ex0):int(ex0 + size)]
        reg[lens] = np.array(EYE_BIG, dtype=np.float64)
        reg[lens & (rr > size / 2 - 1.5)] = np.array((170, 8, 8, 10), dtype=np.float64)
        c.rect(ex0 + 2, ey0 + 2, 2, 2, EYE_SHINE)
    # a dark brow ridge over the big eyes
    c.rect(x + u, y + 2.6 * u, 6 * u, 0.4 * u, BAND)

    # ---- the abdomen: a pale arrow pattern down its back and the spinnerets at the end -------
    x, y, w, h = faces("abdomen")["top"]  # 10 wide (x) by 12 deep (y runs front to back)
    for k in range(5):
        cy = y + h * (0.18 + k * 0.16)
        half = w * (0.36 - k * 0.055)
        for i in range(int(half)):
            for t in range(2):
                c.blend_px(x + w / 2 - i, cy + i * 0.55 + t, (150, 132, 112), 0.9)
                c.blend_px(x + w / 2 + i - 1, cy + i * 0.55 + t, (150, 132, 112), 0.9)
            c.blend_px(x + w / 2 - i, cy + i * 0.55 + 2, BAND, 0.8)
            c.blend_px(x + w / 2 + i - 1, cy + i * 0.55 + 2, BAND, 0.8)
    c.rect(x + w / 2 - 1, y + h * 0.1, 2, h * 0.8, (40, 32, 28))
    x, y, w, h = faces("abdomen")["back"]
    c.rect(x + w * 0.38, y + h * 0.55, w * 0.24, h * 0.3, BAND)
    c.rect(x + w * 0.44, y + h * 0.62, w * 0.12, h * 0.16, (70, 60, 52))
    # ---- the thorax: a dark groove where the legs meet ------------------------------------
    x, y, w, h = faces("thorax")["top"]
    c.rect(x + w / 2 - 1, y + h * 0.3, 2, h * 0.4, BAND)

    # ---- legs: dark segments, banded at the joints, hairy, the feet black --------------------
    for part, bands in (("upper", (0.12, 0.5, 0.88)), ("lower", (0.1, 0.42))):
        for side, rect in faces(part).items():
            skin(rect, 0.85 if side == "bottom" else 1.0, hair=0.03)
            x, y, w, h = rect
            if w <= h:
                continue  # the 2 x 2 ends
            for t in bands:
                c.a[int(y):int(y + h), int(x + w * t - 2):int(x + w * t + 2), :3] *= 0.35
            if part == "lower":
                # the foot end (+u on the right legs, mirrored on the left ones) fades to black
                xs = np.arange(int(w))
                fade = np.clip((xs - w * 0.72) / (w * 0.28), 0, 1)[None, :, None] * 0.8
                reg = c.a[int(y):int(y + h), int(x):int(x + w), :3]
                reg[:] = reg * (1 - fade) + np.array(BAND) * fade
    for side, rect in faces("fang").items():
        x, y, w, h = rect
        # glossy black chelicerae; the hooked fang at the bottom is pale bone
        p.material(x, y, w, h, (8, 6, 6), (30, 24, 22), (70, 60, 56), contrast=1.0, grain=0.1)
        if side in ("front", "back", "right", "left"):
            p.material(x, y + h * 0.62, w, h * 0.38, (120, 112, 100), FANG, (214, 206, 192), contrast=0.8, grain=0.1)
            c.rect(x, y + h * 0.9, w, h * 0.1, FANG_TIP)
    c.save(out("textures", "entity", "spider_titan", "spider_titan.png"))


# ---- spider minions: the vanilla spider layout (64 x 32), one look per tier ---------------
MINIONS = {
    # tier: (dark, mid, light), eye colour, seed
    "loyalist": (((34, 28, 24), (70, 60, 52), (104, 92, 80)), (220, 20, 20), 3),
    "priest": (((132, 124, 112), (190, 182, 168), (236, 230, 220)), (240, 196, 60), 5),
    "zealot": (((70, 14, 12), (128, 30, 24), (178, 64, 44)), (255, 170, 40), 7),
    "templar": (((40, 46, 64), (82, 92, 120), (140, 150, 180)), (90, 220, 255), 11),
}
MINION_BOXES = {"body0": (0, 0, 6, 6, 6), "head": (32, 4, 8, 8, 8), "body1": (0, 12, 10, 8, 12), "leg": (18, 0, 16, 2, 2)}


def spider_minion_texture(name):
    (dark, mid, light), eye, seed = MINIONS[name]
    c = Canvas(64, 32, CLEAR)
    p = Painter(c, seed=seed)
    spots = fbm(64, 32, seed + 50, cell=3, octaves=2)
    for (u, v, w, h, d) in MINION_BOXES.values():
        for rect in box_faces(u, v, w, h, d).values():
            x, y, ww, hh = rect
            p.material(x, y, ww, hh, dark, mid, light, contrast=1.2, grain=0.16)
            p.blotches(x, y, ww, hh, tuple(int(k * 0.55) for k in dark), threshold=0.62, field=spots, soft=0.06,
                       alpha=0.8)
    x, y, w, h = box_faces(*MINION_BOXES["head"])["front"]
    for gy, row in enumerate(FACE_GRID):
        for gx, ch in enumerate(row):
            if ch in "sL":
                c.px(x + gx, y + gy, eye + (3,))   # alpha 3: glows, like the vanilla spider's eyes
            elif ch == "m":
                c.px(x + gx, y + gy, FANG if gy == 6 else FANG_TIP)
    top = box_faces(*MINION_BOXES["body1"])["top"]
    tx, ty, tw, th = top
    if name == "priest":
        c.rect(tx + 4, ty + 2, 2, 8, (232, 196, 80))       # a gold cross on its back
        c.rect(tx + 2, ty + 4, 6, 2, (232, 196, 80))
    elif name == "zealot":
        for i in range(0, th, 3):                          # dark war stripes
            c.rect(tx, ty + i, tw, 1, (40, 6, 4))
    elif name == "templar":
        p.material(*box_faces(*MINION_BOXES["head"])["top"], (90, 96, 110), (160, 166, 176), (224, 228, 236),
                   contrast=0.8)                           # a steel cap
        c.rect(tx + 4, ty + 2, 2, 8, (170, 24, 34))         # and a red cross on its back
        c.rect(tx + 2, ty + 4, 6, 2, (170, 24, 34))
    else:
        c.rect(tx + 4, ty + 3, 2, 6, tuple(int(k * 1.4) for k in mid))   # a pale stripe
    c.save(out("textures", "entity", "spider_minion", name + ".png"))


# ---- spawn eggs ---------------------------------------------------------------------------
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


def egg_icon(path, base, spots, eyes=None):
    rng = np.random.default_rng(len(path) + 23)
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(EGG):
        for x, ch in enumerate(row):
            if ch == "#":
                shade = 1.0 - 0.18 * (x / 15) - 0.12 * (y / 15)
                c.px(x, y, tuple(int(v * shade) for v in base))
    for _ in range(12):
        x, y = rng.integers(3, 13), rng.integers(2, 14)
        if EGG[y][x] == "#":
            c.px(x, y, spots)
    if eyes:
        for (ex, ey) in ((5, 7), (6, 7), (9, 7), (10, 7), (5, 8), (6, 8), (9, 8), (10, 8), (4, 6), (11, 6), (6, 5), (9, 5)):
            c.px(ex, ey, eyes)
    c.px(6, 2, (255, 255, 255, 140))
    c.px(5, 3, (255, 255, 255, 110))
    c.save(path)


# ---- boss bar: a black frame with red eye studs, cobwebs in its corners and a spider hanging over it ----
def boss_bar_textures():
    k = 2
    w, h = 182 * k, 6 * k
    noise = fbm(w, h, 81, cell=6, octaves=3)
    arr = np.zeros((h, w, 4))
    arr[..., :3] = np.array((16, 12, 11)) + (noise[..., None] - 0.5) * 10
    arr[..., 3] = 255
    arr[:k, :, :3] *= 0.5
    to_image(arr).save(out("textures", "ui", "zt", "spider_bar_back.png"))

    # the fill: the spider's grey-brown, lighter at the top, with a few dark hairs
    grain = np.random.default_rng(82).random((h, w))
    big = fbm(w, h, 83, cell=5, octaves=3)
    top, bottom = np.array((112, 94, 86)), np.array((58, 48, 44))
    t = (np.arange(h) / (h - 1))[:, None, None]
    arr = np.zeros((h, w, 4))
    arr[..., :3] = top + (bottom - top) * t
    arr[..., :3] *= (0.86 + big[..., None] * 0.22 + (grain[..., None] - 0.5) * 0.12)
    hair = np.random.default_rng(84).random((h, w)) < 0.025
    arr[hair, :3] = (30, 24, 22)
    arr[:k, :, :3] = arr[:k, :, :3] * 0.6 + 255 * 0.25
    arr[-k:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "spider_bar_fill.png"))

    W, H = 200 * k, 26 * k
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = 9 * k, 13 * k, (9 + 182) * k, (13 + 6) * k
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 3 * k) & (xx < hx1 + 3 * k) & (yy >= hy0 - 3 * k) & (yy < hy1 + 3 * k)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    n = fbm(W, H, 85, cell=4, octaves=3)
    col = np.array((22, 17, 15)) + (np.array((62, 52, 48)) - np.array((22, 17, 15))) * n[..., None]
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    outer = band & ~((xx >= hx0 - 2 * k) & (xx < hx1 + 2 * k) & (yy >= hy0 - 2 * k) & (yy < hy1 + 2 * k))
    fr[outer, :3] *= 0.55
    inner = band & ~hole & (xx >= hx0 - k) & (xx < hx1 + k) & (yy >= hy0 - k) & (yy < hy1 + k)
    fr[inner, :3] = (8, 6, 6)
    top_edge = hy0 - 3 * k

    def put(x, y, color, a=255):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            fr[y, x, :3] = color
            fr[y, x, 3] = a

    def line(x0, y0, x1, y1, color, a=200):
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(steps):
            t = i / max(1, steps - 1)
            put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color, a)

    # cobwebs in the four corners above and below the bar: spokes and sagging threads
    web = (196, 192, 186)
    for cx, cy, sx, sy in ((hx0 - 3 * k, top_edge, 1, -1), (hx1 + 3 * k - 1, top_edge, -1, -1),
                           (hx0 - 3 * k, hy1 + 3 * k - 1, 1, 1), (hx1 + 3 * k - 1, hy1 + 3 * k - 1, -1, 1)):
        reach = 11 * k
        for ang in (0.0, 0.35, 0.8, 1.25, 1.5707):
            ex = cx + sx * math.cos(ang) * reach
            ey = cy + sy * math.sin(ang) * min(reach, 5 * k)
            line(cx, cy, ex, ey, web, 150)
        for ring in (0.35, 0.65, 0.95):
            pts = []
            for ang in (0.0, 0.35, 0.8, 1.25, 1.5707):
                pts.append((cx + sx * math.cos(ang) * reach * ring, cy + sy * math.sin(ang) * min(reach, 5 * k) * ring))
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                line(ax, ay, bx, by, web, 110)

    # red eye studs at both ends of the frame, top and bottom, like eyes peering out of the dark
    for x in (hx0 - 1 * k, hx1 + 1 * k):
        for y in (hy0 - 2 * k, hy1 + 2 * k - 1):
            for dx in range(-k, k + 1):
                for dy in range(-k, k + 1):
                    if abs(dx) + abs(dy) <= k:
                        put(x + dx, y + dy, (190, 26, 22) if abs(dx) + abs(dy) < k else (90, 10, 10))
            put(x, y - k // 2, (255, 150, 130))

    # a spider hanging from a thread over the middle of the bar
    mx = W // 2
    line(mx, 0, mx, top_edge - 6 * k, web, 220)
    body_y = top_edge - 4 * k
    for dx in range(-2 * k, 2 * k + 1):
        for dy in range(-2 * k, 2 * k + 1):
            if dx * dx + dy * dy <= (2 * k) ** 2:
                put(mx + dx, body_y + dy, (20, 16, 14))
    for dx in range(-k - 1, k + 2):
        for dy in range(-k - 1, k + 2):
            if dx * dx + dy * dy <= (k + 1) ** 2:
                put(mx + dx, body_y - 2 * k - 1 + dy, (28, 22, 20))
    put(mx - 1, body_y - 2 * k, (230, 30, 24))
    put(mx + 1, body_y - 2 * k, (230, 30, 24))
    for sgn in (-1, 1):
        for i, (ax, ay) in enumerate(((5, -3), (6, -1), (6, 1), (5, 3))):
            kx, ky = mx + sgn * 2 * k, body_y + (i - 1.5) * k
            knee = (kx + sgn * ax * k * 0.55, ky - 2 * k + ay * 0.3 * k)
            foot = (kx + sgn * ax * k, ky + ay * k)
            line(kx, ky, knee[0], knee[1], (24, 20, 18), 255)
            line(knee[0], knee[1], foot[0], foot[1], (24, 20, 18), 255)
    to_image(fr).save(out("textures", "ui", "zt", "spider_bar_frame.png"))


def write_json(rel, data):
    p = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def main():
    write_json("models/entity/spider_titan.geo.json", spider_titan_geo())
    spider_titan_texture()
    for name in MINIONS:
        spider_minion_texture(name)
    egg_icon(out("textures", "items", "zt_spider_titan_egg.png"), (44, 36, 32), (20, 16, 14), eyes=(220, 24, 20))
    egg_icon(out("textures", "items", "zt_spider_minion_egg.png"), (92, 80, 70), (40, 32, 28), eyes=(200, 20, 20))
    boss_bar_textures()
    print("spider art written")


if __name__ == "__main__":
    main()
