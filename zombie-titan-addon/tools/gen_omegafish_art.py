"""Generates the Omegafish (the Titans mod's silverfish titan): its geometry and texture, the four
silverfish minion skins, the two spawn eggs and its boss bar.

The Omegafish is a silverfish built like an armoured titan: a small head with mandibles, antennae
and beady black eyes, six more body segments narrowing to a three-pronged tail, ridged armour plates
with spikes over its back (where the silverfish has its grey tufts), and short legs underneath.
Like the other titans it is modelled at mob size (about 19 px long, nose to tail) and rendered 16x:
about 19 blocks long and 8 tall at the plates. Each segment is a bone hanging off the one before
it, so a wave can run down its body. All textures are drawn procedurally.

    python3 tools/gen_omegafish_art.py
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_hotel_art import BAR_H, BAR_W, FRAME_H, FRAME_W, HX0, HY0, K, bar_back  # noqa: E402
from geobuild import Geo, geometry_file  # noqa: E402
from texlib import Canvas, Painter, box_faces, fbm, scaled, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)
S = 4

SILVER = ((70, 76, 86), (122, 128, 138), (172, 178, 186))
PLATE = ((54, 58, 66), (104, 110, 120), (158, 164, 174))
BELLY = ((110, 112, 112), (152, 154, 152), (196, 198, 194))
SEAM = (34, 36, 42)
EYE = (10, 10, 14)


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================================
# geometry
# =============================================================================================
# the body, head to tail: (bone, width, height, z0, z1); every segment sits on the ground (y = 0)
SEGMENTS = [
    ("head", 4.0, 3.0, -8.0, -5.5),
    ("seg1", 6.0, 4.0, -5.5, -2.5),
    ("seg2", 8.0, 5.0, -2.5, 1.0),
    ("seg3", 7.0, 4.5, 1.0, 4.0),
    ("seg4", 5.5, 3.5, 4.0, 6.5),
    ("seg5", 4.0, 2.5, 6.5, 8.5),
    ("tail", 2.5, 1.5, 8.5, 10.5),
]
# armour plates over the back: (bone it rides on, width, height, depth, lift above the segment)
PLATES = [("seg1", 8.0, 2.0, 2.6), ("seg2", 11.0, 3.0, 3.4), ("seg4", 7.5, 2.0, 2.4)]
BODY = "seg2"


def omegafish_geo():
    g = Geo("geometry.zt.omegafish", 128, None, 40, 16, (0, 4, 0))
    for name, w, h, z0, z1 in SEGMENTS:
        g.part(name, w, h, z1 - z0)
    for bone, w, h, d in PLATES:
        g.part("plate_" + bone, w, h, d)
    for name, size in [("spike", (1.0, 2.0, 1.0)), ("spike_s", (0.8, 1.4, 0.8)), ("mandible", (0.8, 0.8, 1.6)),
                       ("antenna", (0.4, 0.4, 5.0)), ("eye", (0.6, 0.8, 0.8)), ("leg", (0.8, 2.6, 0.8)),
                       ("prong", (0.5, 0.5, 3.0))]:
        g.part(name, *size)
    g.bone("root")
    z_of = {name: (z0, z1) for name, _, _, z0, z1 in SEGMENTS}
    w_of = {name: w for name, w, _, _, _ in SEGMENTS}
    h_of = {name: h for name, _, h, _, _ in SEGMENTS}
    order = [s[0] for s in SEGMENTS]
    mid = order.index(BODY)
    # each segment is a bone, pivoting at the joint with the one nearer the middle
    for i, name in enumerate(order):
        z0, z1 = z_of[name]
        w, h = w_of[name], h_of[name]
        cubes = [g.cube(name, (-w / 2, 0, z0))]
        if i == mid:
            parent, pivot = "root", (0, h / 2, (z0 + z1) / 2)
        elif i < mid:
            parent, pivot = order[i + 1], (0, h / 2, z1)
        else:
            parent, pivot = order[i - 1], (0, h / 2, z0)
        g.bone(name, parent, pivot, cubes=cubes)
    # armour plates and their spikes
    for bone, w, h, d in PLATES:
        z0, z1 = z_of[bone]
        zc = (z0 + z1) / 2
        top = h_of[bone] - 0.4
        cubes = [g.cube("plate_" + bone, (-w / 2, top, zc - d / 2))]
        n = 3 if bone == BODY else 2
        for k in range(n):
            x = (k - (n - 1) / 2) * (w / (n + 0.5))
            part = "spike" if bone == BODY else "spike_s"
            sw = 1.0 if part == "spike" else 0.8
            cubes.append(g.cube(part, (x - sw / 2, top + h - 0.2, zc - sw / 2), rotation=(-12, 0, x * 3),
                                pivot=(x, top + h, zc)))
        g.bone("plate_" + bone, bone, (0, top, zc), cubes=cubes)
    # the head: mandibles, antennae, eyes
    hz0, hz1 = z_of["head"]
    g.bone("mandibles", "head", (0, 0.6, hz0), cubes=[
        g.cube("mandible", (-1.6, 0.2, hz0 - 1.3), rotation=(0, 22, 0), pivot=(-1.2, 0.6, hz0)),
        g.cube("mandible", (0.8, 0.2, hz0 - 1.3), rotation=(0, -22, 0), pivot=(1.2, 0.6, hz0))])
    g.bone("antennae", "head", (0, 2.6, hz0 + 0.5), cubes=[
        g.cube("antenna", (-1.4, 2.6, hz0 - 4.6), rotation=(-28, 24, 0), pivot=(-1.2, 2.8, hz0 + 0.3)),
        g.cube("antenna", (1.0, 2.6, hz0 - 4.6), rotation=(-28, -24, 0), pivot=(1.2, 2.8, hz0 + 0.3))])
    g.bone("eyes", "head", (0, 1.8, hz0 + 0.8), cubes=[
        g.cube("eye", (-2.25, 1.3, hz0 + 0.4)), g.cube("eye", (1.65, 1.3, hz0 + 0.4))])
    # short legs under the front segments, splayed out
    for name in ("seg1", "seg2", "seg3"):
        z0, z1 = z_of[name]
        zc = (z0 + z1) / 2
        w = w_of[name]
        for side, sgn in (("r", -1), ("l", 1)):
            x = sgn * (w / 2 - 0.4)
            # (+z swings a hanging limb out to the model's right, -x: right legs splay with +z, left with -z)
            g.bone("leg_%s_%s" % (name, side), name, (x, 1.4, zc), rotation=(0, 0, -sgn * 38), cubes=[
                g.cube("leg", (x - 0.4, -1.2, zc - 0.4))])
    # the tail's three prongs
    tz1 = z_of["tail"][1]
    g.bone("prongs", "tail", (0, 0.8, tz1), cubes=[
        g.cube("prong", (-0.25, 0.55, tz1), rotation=(10, 0, 0), pivot=(0, 0.8, tz1)),
        g.cube("prong", (-0.25, 0.55, tz1), rotation=(6, 28, 0), pivot=(0, 0.8, tz1)),
        g.cube("prong", (-0.25, 0.55, tz1), rotation=(6, -28, 0), pivot=(0, 0.8, tz1))])
    return g


# =============================================================================================
# textures
# =============================================================================================
def paint(g, painters, default, seed):
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, seed=seed)
    rng = np.random.default_rng(seed)
    for part in g.parts:
        fn = painters.get(part, default)
        for side, rect in g.faces(part, S).items():
            if rect[2] < 1 or rect[3] < 1:
                continue
            fn(c, p, rect, side, rng, part)
    return c


def chitin(c, p, rect, side, rng, part):
    """Silver-grey chitin: bands across each segment, a paler underside, seams at the edges."""
    x, y, w, h = rect
    if side == "bottom":
        p.material(x, y, w, h, *BELLY, contrast=0.6, grain=0.1)
        p.shade_edges(x, y, w, h, amount=0.3)
        return
    p.material(x, y, w, h, *SILVER, contrast=1.1, grain=0.14)
    p.blotches(x, y, w, h, (150, 160, 178), threshold=0.66, alpha=0.35)        # a cold sheen
    if side in ("left", "right", "top"):
        # growth bands across the segment
        for k in range(1, 4):
            yy = y + h * k / 4 if side != "top" else y
            if side == "top":
                xx = x + w * k / 4
                c.rect(xx, y, 1, h, SEAM)
            else:
                c.rect(x, yy, w, 1, (92, 96, 106))
    if side in ("front", "back"):
        c.rect(x, y, w, max(1, S // 2), (150, 156, 166))
    p.shade_edges(x, y, w, h, amount=0.35)


def plate(c, p, rect, side, rng, part):
    x, y, w, h = rect
    p.material(x, y, w, h, *PLATE, contrast=1.2, grain=0.16)
    p.blotches(x, y, w, h, (40, 44, 50), threshold=0.62, field=p.n1, alpha=0.5)   # pitted
    if side == "top":
        for k in range(int(x + S), int(x + w), int(S * 2)):
            c.rect(k, y, 1, h, SEAM)                                               # ridges
    p.shade_edges(x, y, w, h, amount=0.4)


def spike(c, p, rect, side, rng, part):
    x, y, w, h = rect
    p.material(x, y, w, h, (60, 62, 68), (140, 144, 150), (210, 212, 216), contrast=1.0)
    c.rect(x, y, w, max(1, h // 4), (230, 232, 236))
    p.shade_edges(x, y, w, h, amount=0.3)


def head(c, p, rect, side, rng, part):
    chitin(c, p, rect, side, rng, part)
    x, y, w, h = rect
    if side == "front":
        c.rect(x + w * 0.2, y + h * 0.6, w * 0.6, max(1, h * 0.15), (40, 20, 24))   # mouth


def dark(color):
    def f(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, tuple(int(v * 0.6) for v in color), color, tuple(min(255, int(v * 1.4)) for v in color),
                   contrast=0.8)
        p.shade_edges(x, y, w, h, amount=0.3)
    return f


def eye(c, p, rect, side, rng, part):
    x, y, w, h = rect
    c.rect(x, y, w, h, EYE)
    c.rect(x, y, max(1, w // 3), max(1, h // 3), (90, 96, 110))    # a glint


def omegafish_texture(g):
    painters = {"head": head, "spike": spike, "spike_s": spike, "eye": eye, "mandible": dark((88, 70, 60)),
                "antenna": dark((96, 100, 110)), "leg": dark((90, 92, 100)), "prong": dark((120, 124, 132))}
    for bone, _, _, _ in PLATES:
        painters["plate_" + bone] = plate
    return paint(g, painters, chitin, 4401)


# =============================================================================================
# silverfish minions: the vanilla silverfish model (64 x 32, box uv), four ranks
# =============================================================================================
VANILLA_PARTS = [  # (u, v, w, h, d, is a fur layer)
    (0, 0, 3, 2, 2, False), (0, 4, 4, 3, 2, False), (0, 9, 6, 4, 3, False), (0, 16, 3, 3, 3, False),
    (0, 22, 2, 2, 3, False), (11, 0, 2, 1, 2, False), (13, 4, 1, 1, 2, False),
    (20, 0, 10, 8, 3, True), (20, 11, 6, 4, 3, True), (20, 18, 6, 5, 2, True),
]
RANKS = {
    "loyalist": ((86, 90, 98), (128, 132, 140), (170, 174, 182), None),
    "priest": ((150, 146, 132), (196, 192, 176), (236, 232, 216), (214, 176, 70)),
    "zealot": ((96, 40, 40), (146, 70, 66), (190, 112, 104), (40, 16, 16)),
    "templar": ((30, 26, 40), (60, 52, 78), (98, 88, 124), (214, 176, 70)),
}


def minion_skins():
    k = 2      # 128 x 64 pixels
    for rank, (d0, d1, d2, trim) in RANKS.items():
        c = Canvas(64 * k, 32 * k, CLEAR)
        p = Painter(c, seed=4500 + len(rank))
        for u, v, w, h, dd, layer in VANILLA_PARTS:
            for side, rect in box_faces(u, v, w, h, dd).items():
                x, y, ww, hh = scaled(rect, k)
                if ww < 1 or hh < 1:
                    continue
                if layer:
                    # the fur tufts: darker, shaggy
                    p.material(x, y, ww, hh, tuple(int(v_ * 0.7) for v_ in d0), d0, d1, contrast=1.3, grain=0.3)
                else:
                    p.material(x, y, ww, hh, d0, d1, d2, contrast=1.0, grain=0.15)
                    if trim and side in ("left", "right", "front", "back"):
                        c.rect(x, y, ww, 1, trim)
                p.shade_edges(x, y, ww, hh, amount=0.3)
        # its eyes on the head's front
        fx, fy, fw, fh = scaled(box_faces(0, 0, 3, 2, 2)["front"], k)
        for ex in (fx, fx + fw - k):
            c.rect(ex, fy + k // 2, k, k, (10, 10, 12) if rank != "templar" else (180, 120, 255))
        c.save(out("textures", "entity", "silverfish_minion", rank + ".png"))


# =============================================================================================
# spawn eggs
# =============================================================================================
def egg(path, base, spots):
    c = Canvas(16, 16, CLEAR)
    yy, xx = np.mgrid[0:16, 0:16]
    d = ((xx + 0.5 - 8) / 5.6) ** 2 + ((yy + 0.5 - 8.6) / 7.0) ** 2
    n = fbm(16, 16, len(path), cell=4, octaves=2)
    for y in range(16):
        for x in range(16):
            if d[y, x] <= 1.0:
                k = 0.75 + 0.35 * (1 - y / 16) + (n[y, x] - 0.5) * 0.2
                col = tuple(int(min(255, v * k)) for v in base)
                if spots(x, y, n[y, x]):
                    col = tuple(int(v * 0.45) for v in base)
                c.px(x, y, col)
            elif d[y, x] <= 1.18:
                c.px(x, y, (24, 24, 28))
    c.save(path)


def eggs():
    egg(out("textures", "items", "zt_omegafish_egg.png"), (150, 156, 166), lambda x, y, n: (y % 4 == 1) or n > 0.7)
    egg(out("textures", "items", "zt_silverfish_minion_egg.png"), (118, 122, 132), lambda x, y, n: n > 0.62)


# =============================================================================================
# boss bar: grey armour plates, segment by segment, round a pale silver meter
# =============================================================================================
def omegafish_bar():
    bar_back("omegafish", (14, 16, 20))
    w, h = BAR_W * K, BAR_H * K
    n = fbm(w, h, 4601, cell=5, octaves=3)
    arr = np.zeros((h, w, 4))
    c0, c1 = np.array((140, 150, 166)), np.array((226, 232, 242))
    arr[..., :3] = c0 + (c1 - c0) * (0.3 + 0.6 * n[..., None])
    arr[:K, :, :3] = arr[:K, :, :3] * 0.4 + 255 * 0.6
    arr[-K:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "omegafish_bar_fill.png"))

    W, H = FRAME_W * K, FRAME_H * K
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = HX0 * K, HY0 * K, (HX0 + BAR_W) * K, (HY0 + BAR_H) * K
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 4 * K) & (xx < hx1 + 4 * K) & (yy >= hy0 - 4 * K) & (yy < hy1 + 4 * K)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    n = fbm(W, H, 4603, cell=5, octaves=3)
    d0, d1 = np.array((62, 66, 74)), np.array((150, 156, 166))
    col = d0 + (d1 - d0) * n[..., None]
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    # segment seams every few pixels, like its body's plates
    seams = frame & ((xx - hx0) % (12 * K) < K)
    fr[seams, :3] = (34, 36, 42)
    outer = band & ~((xx >= hx0 - 3 * K) & (xx < hx1 + 3 * K) & (yy >= hy0 - 3 * K) & (yy < hy1 + 3 * K))
    fr[outer, :3] *= 0.55
    inner = frame & (xx >= hx0 - K) & (xx < hx1 + K) & (yy >= hy0 - K) & (yy < hy1 + K)
    fr[inner, :3] = (12, 12, 16)
    # spikes along the top edge
    for x in range(hx0, hx1, 12 * K):
        for k in range(3 * K):
            half = max(1, int((3 * K - k) / 2))
            cx = x + 6 * K
            fr[hy0 - 4 * K - k, cx - half:cx + half, :3] = (200, 204, 212)
            fr[hy0 - 4 * K - k, cx - half:cx + half, 3] = 255
    # its head at the left end, its tail prongs at the right
    cy = (hy0 + hy1) // 2
    for cx, r in ((hx0 - 5 * K, 6 * K),):
        d = np.hypot(xx + 0.5 - cx, (yy + 0.5 - cy) * 1.2)
        m = d <= r
        fr[m, :3] = col[m] * 1.1
        fr[m, 3] = 255
        for ex in (-2 * K, 2 * K):
            e = np.hypot(xx + 0.5 - (cx + ex), yy + 0.5 - (cy - K)) <= K
            fr[e, :3] = (8, 8, 10)
    for k, dy in enumerate((-3, 0, 3)):
        y0 = cy + dy * K
        x0 = hx1 + 2 * K
        fr[y0:y0 + K, x0:x0 + 5 * K, :3] = (150, 156, 166)
        fr[y0:y0 + K, x0:x0 + 5 * K, 3] = 255
    to_image(fr).save(out("textures", "ui", "zt", "omegafish_bar_frame.png"))


def main():
    g = omegafish_geo()
    with open(out("models", "entity", "omegafish.geo.json"), "w") as f:
        json.dump(geometry_file(g), f, indent="\t")
        f.write("\n")
    omegafish_texture(g).save(out("textures", "entity", "omegafish", "omegafish.png"))
    minion_skins()
    eggs()
    omegafish_bar()
    print("omegafish art written")


if __name__ == "__main__":
    main()
