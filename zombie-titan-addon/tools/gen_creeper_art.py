"""Generates the Creeper Titan: its geometry (plus the inflated shell for the
charged glow), its texture, the four creeper minion skins, spawn eggs and
the grass-and-TNT boss bar.

The model follows the Java Titans mod's ModelCreeperTitan (0.45): a creeper
whose body is three stacked segments that bend like a neck, an 8 px head,
and four splayed legs of three segments each (thigh, calf, foot). It is
26 px tall and rendered 16x = 26 blocks. All textures are drawn
procedurally; nothing is copied from the Java mod.

    python3 tools/gen_creeper_art.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texlib import Canvas, Painter, box_faces, fbm, scaled, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

# name: ((u, v), (w, h, d)) in texture units (128 x 64 texture, box UV)
CREEPER_PARTS = {
    "head": ((0, 0), (8, 8, 8)),
    "body_top": ((32, 0), (8, 4, 4)),
    "body_mid": ((56, 0), (8, 4, 4)),
    "body_bot": ((80, 0), (8, 4, 4)),
}
# legs: right/left x front/back, each a thigh, calf and foot of 4 x 4 x 4
LEGS = [("rightFront", -3, -1), ("leftFront", 3, -1), ("rightBack", -3, 1), ("leftBack", 3, 1)]
SEGMENTS = ["Thigh", "Calf", "Foot"]
for i, (leg, _, _) in enumerate(LEGS):
    for j, seg in enumerate(SEGMENTS):
        n = i * 3 + j
        CREEPER_PARTS[leg + seg] = (((n % 8) * 16, 16 + (n // 8) * 8), (4, 4, 4))

HIP_Y = 8.0


def r(v):
    return round(v, 4)


def cube(part, origin, inflate=0.0):
    (u, v), size = CREEPER_PARTS[part]
    c = {"origin": [r(x) for x in origin], "size": list(size), "uv": [u, v]}
    if inflate:
        c["inflate"] = inflate
    return c


def creeper_titan_bones(inflate=0.0):
    bones = [
        {"name": "root", "pivot": [0, 0, 0]},
        {"name": "bodyBottom", "parent": "root", "pivot": [0, 8, 0], "cubes": [cube("body_bot", (-4, 6, -2), inflate)]},
        {"name": "bodyMiddle", "parent": "bodyBottom", "pivot": [0, 10, 0], "cubes": [cube("body_mid", (-4, 10, -2), inflate)]},
        {"name": "bodyTop", "parent": "bodyMiddle", "pivot": [0, 14, 0], "cubes": [cube("body_top", (-4, 14, -2), inflate)]},
        {"name": "head", "parent": "bodyTop", "pivot": [0, 18, 0], "cubes": [cube("head", (-4, 18, -4), inflate)]},
    ]
    for leg, hx, hz in LEGS:
        y = HIP_Y
        parent = "root"
        for seg in SEGMENTS:
            name = leg + seg
            bones.append({"name": name, "parent": parent, "pivot": [hx, r(y), hz],
                          "cubes": [cube(name, (hx - 2, y - 4, hz - 2), inflate)]})
            parent = name
            y -= 3.5
    return bones


def creeper_titan_geo():
    def geo(ident, inflate):
        return {
            "description": {
                "identifier": ident,
                "texture_width": 128,
                "texture_height": 64,
                "visible_bounds_width": 44,
                "visible_bounds_height": 40,
                "visible_bounds_offset": [0, 13, 0],
            },
            "bones": creeper_titan_bones(inflate),
        }

    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [
            geo("geometry.zt.creeper_titan", 0.0),
            # the charged glow: the same bones, slightly inflated, drawn with the vanilla charged-creeper swirl
            geo("geometry.zt.creeper_titan.charged", 0.6),
        ],
    }


# =============================================================================
# textures
# =============================================================================
S = 4  # pixels per texture unit on the titan
CLEAR = (0, 0, 0, 0)
G_DARK, G_MID, G_LIGHT = (40, 112, 34), (82, 168, 66), (132, 214, 112)
G_PALE = (190, 214, 184)
G_DEEP = (22, 70, 22)
FACE = (14, 22, 14)
FACE_IN = (34, 52, 30)
EYE_GLOW = (255, 64, 40, 10)   # low alpha = emissive with entity_emissive_alpha
VINE = (24, 82, 26)
DIRT = (84, 62, 40)

# the classic creeper face on an 8 x 8 grid
FACE_GRID = [
    "........",
    "........",
    ".XX..XX.",
    ".XX..XX.",
    "...XX...",
    "..XXXX..",
    "..XXXX..",
    "..X..X..",
]


def faces(part, s=S):
    (u, v), (w, h, d) = CREEPER_PARTS[part]
    return {k: scaled(rr, s) for k, rr in box_faces(u, v, w, h, d).items()}


def wiggle_line(c, rng, x, y, length, dx, dy, color, wobble=0.5, width=1):
    for _ in range(int(length)):
        for k in range(width):
            c.px(x + k * dy, y + k * dx, color)
        x += dx + rng.uniform(-wobble, wobble)
        y += dy + rng.uniform(-wobble, wobble)


def creeper_titan_texture():
    c = Canvas(128 * S, 64 * S, CLEAR)
    p = Painter(c, seed=41)
    rng = np.random.default_rng(43)
    pale = fbm(c.w, c.h, 47, cell=7, octaves=3)
    deep = fbm(c.w, c.h, 53, cell=9, octaves=3)

    def skin(r, darken=1.0):
        x, y, w, h = r
        if w < 1 or h < 1:
            return
        p.material(x, y, w, h, G_DARK, G_MID, G_LIGHT, contrast=1.25, grain=0.16)
        # the creeper camouflage: pale grey-green patches and deep green ones
        p.blotches(x, y, w, h, G_PALE, threshold=0.64, field=pale, soft=0.05, alpha=0.85)
        p.blotches(x, y, w, h, G_DEEP, threshold=0.66, field=deep, soft=0.05, alpha=0.7)
        p.shade_edges(x, y, w, h, amount=0.18)
        if darken != 1.0:
            c.a[int(y):int(y + h), int(x):int(x + w), :3] *= darken

    for part in CREEPER_PARTS:
        f = faces(part)
        leg = part.startswith(("right", "left"))
        for side, rect in f.items():
            if leg and part.endswith("Foot"):
                skin(rect, 0.85)
            elif leg and part.endswith("Calf"):
                skin(rect, 0.93)
            else:
                skin(rect)

    # ---- the face: brows, glowing red eyes, the black creeper mouth ---------------------
    x, y, w, h = faces("head")["front"]
    u = w / 8
    for gy, row in enumerate(FACE_GRID):
        for gx, ch in enumerate(row):
            if ch == "X":
                c.rect(x + gx * u, y + gy * u, u, u, FACE)
    # the mouth's inside is a little lighter than its rim
    c.rect(x + 2.5 * u, y + 5.3 * u, 3 * u, 1.4 * u, FACE_IN)
    c.rect(x + 3.2 * u, y + 4.3 * u, 1.6 * u, 0.6 * u, FACE_IN)
    for ex, tilt in ((1, 1), (5, -1)):
        # red glare in each eye
        cx, cy = x + (ex + 1) * u, y + 3 * u
        c.rect(cx - 0.45 * u, cy - 0.3 * u, 0.9 * u, 0.7 * u, EYE_GLOW)
        c.rect(cx - 0.2 * u, cy - 0.1 * u, 0.4 * u, 0.3 * u, (255, 220, 160, 14))
        # angry brows sloping down toward the middle
        for k in range(int(2.4 * u)):
            bx = x + (ex - 0.2) * u + k
            by = y + 1.25 * u + (k if tilt > 0 else (2.4 * u - k)) * 0.28
            c.rect(bx, by, 1, 0.55 * u, FACE)
    # a few scars across the face and crown
    for side in ("front", "top", "right", "left", "back"):
        sx, sy, sw, sh = faces("head")[side]
        for _ in range(2 if side != "front" else 1):
            wiggle_line(c, rng, sx + rng.uniform(0.15, 0.85) * sw, sy + rng.uniform(0.05, 0.3) * sh,
                        rng.integers(10, 22), rng.uniform(-0.4, 0.4), 1.0, VINE)

    # ---- vines creeping up the body and legs ---------------------------------------------
    for part in ("body_bot", "body_mid", "body_top"):
        for side in ("front", "right", "left", "back"):
            sx, sy, sw, sh = faces(part)[side]
            for _ in range(2):
                wiggle_line(c, rng, sx + rng.uniform(0.1, 0.9) * sw, sy + sh - 1, sh, rng.uniform(-0.3, 0.3), -1.0,
                            VINE, wobble=0.7)
            # small leaves on the vines
            for _ in range(3):
                lx, ly = sx + rng.uniform(0.1, 0.9) * sw, sy + rng.uniform(0.1, 0.9) * sh
                c.rect(lx, ly, 3, 2, (46, 128, 40))
                c.px(lx, ly, VINE)
    for leg, _, _ in LEGS:
        for side in ("front", "right", "left", "back"):
            sx, sy, sw, sh = faces(leg + "Foot")[side]
            # mud caked on the feet
            yy = np.arange(int(sh))[:, None]
            t = np.clip((yy - sh * 0.45) / (sh * 0.55), 0, 1)[..., None] * 0.75
            reg = c.a[int(sy):int(sy + sh), int(sx):int(sx + sw)]
            reg[..., :3] = reg[..., :3] * (1 - t) + np.array(DIRT) * t
        sx, sy, sw, sh = faces(leg + "Foot")["bottom"]
        p.material(sx, sy, sw, sh, (52, 38, 24), DIRT, (110, 86, 58), contrast=0.9)
        for seg in SEGMENTS:
            sx, sy, sw, sh = faces(leg + seg)["front"]
            wiggle_line(c, rng, sx + rng.uniform(0.2, 0.8) * sw, sy + sh - 1, sh, rng.uniform(-0.3, 0.3), -1.0,
                        VINE, wobble=0.6)
    c.save(out("textures", "entity", "creeper_titan", "creeper_titan.png"))


# ---- creeper minions: the vanilla creeper layout (64 x 32), one look per tier ---------------
MINIONS = {
    # tier: (dark, mid, light), face colour, eye colour, seed
    "loyalist": (((44, 120, 38), (88, 176, 72), (140, 220, 120)), FACE, (40, 40, 40), 3),
    "priest": (((150, 168, 144), (204, 220, 198), (240, 248, 236)), (40, 36, 22), (240, 200, 70), 5),
    "zealot": (((128, 40, 30), (190, 70, 44), (232, 130, 90)), (30, 8, 6), (255, 220, 120), 7),
    "templar": (((54, 46, 96), (96, 86, 160), (150, 140, 214)), (14, 10, 30), (120, 220, 255), 11),
}


def creeper_minion_texture(name):
    (dark, mid, light), face, eye, seed = MINIONS[name]
    c = Canvas(64, 32, CLEAR)
    p = Painter(c, seed=seed)
    pale = fbm(64, 32, seed + 50, cell=4, octaves=2)
    for (u, v, w, h, d) in ((0, 0, 8, 8, 8), (16, 16, 8, 12, 4), (0, 16, 4, 6, 4)):
        for rect in box_faces(u, v, w, h, d).values():
            x, y, ww, hh = rect
            p.material(x, y, ww, hh, dark, mid, light, contrast=1.2, grain=0.14)
            p.blotches(x, y, ww, hh, tuple(min(255, int(k * 1.18)) for k in light), threshold=0.66, field=pale,
                       soft=0.06, alpha=0.7)
    x, y, w, h = box_faces(0, 0, 8, 8, 8)["front"]
    for gy, row in enumerate(FACE_GRID):
        for gx, ch in enumerate(row):
            if ch == "X":
                c.px(x + gx, y + gy, face)
    c.px(x + 2, y + 3, eye)
    c.px(x + 5, y + 3, eye)
    body = box_faces(16, 16, 8, 12, 4)
    bx, by, bw, bh = body["front"]
    if name == "priest":
        c.rect(bx + 3, by + 1, 2, 9, (232, 196, 80))       # a gold sash down the front
        c.rect(bx + 1, by + 3, 6, 2, (232, 196, 80))
    elif name == "zealot":
        for i in range(bw):                                # a dark war-paint stripe
            c.px(bx + i, by + 2 + i // 2, (70, 14, 10))
        hx, hy, hw, hh = box_faces(0, 0, 8, 8, 8)["front"]
        c.rect(hx, hy + 1, hw, 1, (70, 14, 10))
    elif name == "templar":
        top = box_faces(0, 0, 8, 8, 8)["top"]
        p.material(*top, (90, 96, 110), (160, 166, 176), (224, 228, 236), contrast=0.8)   # a steel cap
        for side in ("right", "front", "left", "back"):
            sx, sy, sw, sh = box_faces(0, 0, 8, 8, 8)[side]
            p.material(sx, sy, sw, 1, (90, 96, 110), (160, 166, 176), (224, 228, 236), contrast=0.8)
        c.rect(bx + 3, by + 2, 2, 6, (150, 20, 30))         # red cross on the chest
        c.rect(bx + 1, by + 4, 6, 2, (150, 20, 30))
    c.save(out("textures", "entity", "creeper_minion", name + ".png"))


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


def egg_icon(path, base, spots, face=False):
    rng = np.random.default_rng(len(path) + 11)
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(EGG):
        for x, ch in enumerate(row):
            if ch == "#":
                shade = 1.0 - 0.18 * (x / 15) - 0.12 * (y / 15)
                c.px(x, y, tuple(int(v * shade) for v in base))
    for _ in range(10):
        x, y = rng.integers(3, 13), rng.integers(2, 14)
        if EGG[y][x] == "#":
            c.px(x, y, spots)
    if face:
        # a tiny creeper face with red eyes
        for gy, row in enumerate(FACE_GRID[2:]):
            for gx, ch in enumerate(row):
                if ch == "X":
                    c.px(4 + gx, 6 + gy, FACE)
        c.px(5, 6, (220, 40, 30))
        c.px(9, 6, (220, 40, 30))
    c.px(6, 2, (255, 255, 255, 140))
    c.px(5, 3, (255, 255, 255, 110))
    c.save(path)


# ---- boss bar: a grassy frame with creeper heads at the ends and a TNT block in the middle ----
def boss_bar_textures():
    k = 2
    w, h = 182 * k, 6 * k
    noise = fbm(w, h, 61, cell=6, octaves=3)
    arr = np.zeros((h, w, 4))
    arr[..., :3] = np.array((20, 30, 18)) + (noise[..., None] - 0.5) * 14
    arr[..., 3] = 255
    arr[:k, :, :3] *= 0.5
    to_image(arr).save(out("textures", "ui", "zt", "creeper_bar_back.png"))

    # the fill: bright creeper camouflage
    big = fbm(w, h, 62, cell=4, octaves=3)
    pale = fbm(w, h, 63, cell=3, octaves=2)
    grain = np.random.default_rng(64).random((h, w))
    arr = np.zeros((h, w, 4))
    dark, mid, light = np.array(G_DARK), np.array(G_MID), np.array(G_LIGHT)
    t = np.clip(big * 0.8 + grain * 0.2, 0, 1)[..., None]
    arr[..., :3] = np.where(t < 0.5, dark + (mid - dark) * (t / 0.5), mid + (light - mid) * ((t - 0.5) / 0.5))
    m = np.clip((pale - 0.62) / 0.05, 0, 1)[..., None] * 0.8
    arr[..., :3] = arr[..., :3] * (1 - m) + np.array(G_PALE) * m
    arr[:k, :, :3] = arr[:k, :, :3] * 0.6 + 255 * 0.4
    arr[-k:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "creeper_bar_fill.png"))

    W, H = 200 * k, 26 * k
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = 9 * k, 13 * k, (9 + 182) * k, (13 + 6) * k
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 3 * k) & (xx < hx1 + 3 * k) & (yy >= hy0 - 3 * k) & (yy < hy1 + 3 * k)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    # dirt with a grass top, like a grass block seen from the side
    dirt_n = fbm(W, H, 65, cell=5, octaves=3)
    grass_n = fbm(W, H, 66, cell=3, octaves=2)
    d0, d1 = np.array((92, 64, 40)), np.array((134, 96, 62))
    g0, g1 = np.array((62, 132, 46)), np.array((112, 186, 84))
    col = d0 + (d1 - d0) * dirt_n[..., None]
    grass_depth = (2 + (grass_n * 3).astype(int)) * k // 2
    top_edge = hy0 - 3 * k
    is_grass = yy < top_edge + grass_depth
    gcol = g0 + (g1 - g0) * grass_n[..., None]
    col = np.where(is_grass[..., None], gcol, col)
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    outer = band & ~((xx >= hx0 - 2 * k) & (xx < hx1 + 2 * k) & (yy >= hy0 - 2 * k) & (yy < hy1 + 2 * k))
    fr[outer, :3] *= 0.6
    inner = band & ~hole & (xx >= hx0 - k) & (xx < hx1 + k) & (yy >= hy0 - k) & (yy < hy1 + k)
    fr[inner, :3] = (26, 22, 16)
    # grass tufts poking above the frame
    rng = np.random.default_rng(67)
    for x in range(hx0 - 2 * k, hx1 + 2 * k, 3 * k):
        tuft = rng.integers(1, 4) * k
        x0 = x + rng.integers(0, 2 * k)
        fr[top_edge - tuft:top_edge, x0:x0 + k, :3] = (90, 170, 70) if rng.random() < 0.5 else (70, 146, 54)
        fr[top_edge - tuft:top_edge, x0:x0 + k, 3] = 255

    def creeper_head(cx, cy, size):
        s = size // 8
        x0, y0 = cx - 4 * s, cy - 4 * s
        n = fbm(8 * s, 8 * s, 68 + cx, cell=max(1, s), octaves=2)
        g = np.array(G_DARK) + (np.array(G_LIGHT) - np.array(G_DARK)) * n[..., None]
        fr[y0:y0 + 8 * s, x0:x0 + 8 * s, :3] = g
        fr[y0:y0 + 8 * s, x0:x0 + 8 * s, 3] = 255
        for gy, row in enumerate(FACE_GRID):
            for gx, ch in enumerate(row):
                if ch == "X":
                    fr[y0 + gy * s:y0 + (gy + 1) * s, x0 + gx * s:x0 + (gx + 1) * s, :3] = FACE
        # dark outline
        fr[y0:y0 + 8 * s, x0:x0 + s // 2 + 1, :3] *= 0.6
        fr[y0:y0 + 8 * s, x0 + 8 * s - s // 2 - 1:x0 + 8 * s, :3] *= 0.6
        fr[y0 + 8 * s - s // 2 - 1:y0 + 8 * s, x0:x0 + 8 * s, :3] *= 0.6

    mid_y = (hy0 + hy1) // 2
    creeper_head(hx0 - 3 * k, mid_y, 12 * k)
    creeper_head(hx1 + 3 * k, mid_y, 12 * k)

    # the TNT block in the middle of the top edge
    tw, th = 16 * k, 10 * k  # 2 + 3 + 1 + 4 + 1 + 3 + 2 units of label
    tx0, ty0 = W // 2 - tw // 2, top_edge - th + 2 * k
    fr[ty0:ty0 + th, tx0:tx0 + tw, :3] = (200, 46, 34)
    fr[ty0:ty0 + th, tx0:tx0 + tw, 3] = 255
    for sx in range(tx0, tx0 + tw, 4 * k):               # darker red stripes
        fr[ty0:ty0 + th, sx:sx + k, :3] = (150, 30, 24)
    band_y = ty0 + th // 2 - 2 * k
    fr[band_y:band_y + 4 * k, tx0:tx0 + tw, :3] = (236, 232, 222)   # the white label
    fr[band_y:band_y + k // 2 + 1, tx0:tx0 + tw, :3] = (180, 176, 168)
    letters = {"T": ["XXX", ".X.", ".X.", ".X."], "N": ["X..X", "XX.X", "X.XX", "X..X"]}
    lx = tx0 + 2 * k
    for ch in "TNT":
        for gy, row in enumerate(letters[ch]):
            for gx, cc in enumerate(row):
                if cc == "X":
                    fr[band_y + gy * k:band_y + (gy + 1) * k, lx + gx * k:lx + (gx + 1) * k, :3] = (20, 18, 16)
        lx += (len(letters[ch][0]) + 1) * k
    fr[ty0:ty0 + k, tx0:tx0 + tw, :3] = (90, 70, 54)       # the top with its fuse
    fr[ty0 - 2 * k:ty0, W // 2 - k // 2:W // 2 + k // 2 + 1, :3] = (60, 50, 40)
    fr[ty0 - 2 * k:ty0, W // 2 - k // 2:W // 2 + k // 2 + 1, 3] = 255
    to_image(fr).save(out("textures", "ui", "zt", "creeper_bar_frame.png"))


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
    write_json("models/entity/creeper_titan.geo.json", creeper_titan_geo())
    creeper_titan_texture()
    for name in MINIONS:
        creeper_minion_texture(name)
    egg_icon(out("textures", "items", "zt_creeper_titan_egg.png"), (64, 160, 54), (22, 70, 22), face=True)
    egg_icon(out("textures", "items", "zt_creeper_minion_egg.png"), (90, 176, 74), (226, 226, 226))
    boss_bar_textures()
    print("creeper art written")


if __name__ == "__main__":
    main()
