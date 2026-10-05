"""Generates the Doors hotel's block textures (wallpaper, wainscoting, floor,
trim, ceiling, library shelves), the Doors item icons (the two door items,
the Figure and Seek spawn eggs, the solution paper and the ten shape books)
and the Figure's and Seek's boss bars.

    python3 tools/gen_hotel_art.py
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_art import DIGITS, draw_shape  # noqa: E402
from texlib import Canvas, Painter, fbm, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)

SHAPES = ["triangle", "square", "circle", "star", "diamond", "hexagon", "pentagon", "cross", "heart", "crescent"]


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


# =============================================================================================
# blocks (16 x 16, tiling)
# =============================================================================================
def damask(base, motif, accent, seed):
    """Wallpaper: a dark base with a repeating damask flourish and faint vertical stripes."""
    c = Canvas(16, 16, tuple(base) + (255,))
    p = Painter(c, seed=seed)
    b = np.array(base[:3], dtype=float)
    p.material(0, 0, 16, 16, tuple(b * 0.86), tuple(b), tuple(np.minimum(255, b * 1.1)), contrast=0.6, grain=0.08)
    for x in (0, 8):
        c.rect(x, 0, 1, 16, tuple(np.minimum(255, b * 1.12)))
    # the flourish: a diamond-shaped bud with curled leaves, centered so it tiles
    flourish = [
        "................",
        ".......#........",
        "......#.#.......",
        ".....#.#.#......",
        "....#.###.#.....",
        "...#..#.#..#....",
        "..#..#...#..#...",
        ".#..#..#..#..#..",
        "..#..#...#..#...",
        "...#..#.#..#....",
        "....#.###.#.....",
        ".....#.#.#......",
        "......#.#.......",
        ".......#........",
        "................",
        "................",
    ]
    for y, row in enumerate(flourish):
        for x, ch in enumerate(row):
            if ch == "#":
                c.px(x, y, motif)
    # gold dots where the motifs meet
    for (x, y) in ((0, 7), (15, 7), (7, 15), (7, 0)):
        c.px(x, y, accent)
    return c


def hotel_blocks():
    damask((84, 22, 28), (118, 40, 40), (166, 126, 70), 1401).save(out("textures", "blocks", "zt_hotel_wallpaper.png"))
    damask((30, 56, 40), (50, 88, 62), (150, 132, 80), 1403).save(out("textures", "blocks", "zt_hotel_wallpaper_green.png"))

    # wainscoting: a raised wooden panel
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=1405)
    p.material(0, 0, 16, 16, (46, 22, 12), (70, 36, 20), (96, 52, 30), contrast=1.0, grain=0.12)
    c.rect(0, 0, 16, 2, (96, 56, 32))       # chair rail
    c.rect(0, 1, 16, 1, (122, 76, 44))
    c.rect(2, 4, 12, 1, (104, 60, 36))      # panel bevels
    c.rect(2, 4, 1, 10, (96, 54, 32))
    c.rect(2, 13, 12, 1, (28, 12, 6))
    c.rect(13, 4, 1, 10, (34, 16, 8))
    c.a[5:13, 3:13, :3] *= 0.88
    c.rect(0, 15, 16, 1, (30, 14, 8))       # baseboard shadow
    c.save(out("textures", "blocks", "zt_hotel_wainscot.png"))

    # plain dark wood (tops of the wainscoting, shelves and trim)
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=1407)
    p.material(0, 0, 16, 16, (44, 22, 12), (66, 34, 20), (88, 48, 28), contrast=1.0, grain=0.14)
    for y in (3, 9, 13):
        c.rect(0, y, 16, 1, (38, 18, 10))
    c.save(out("textures", "blocks", "zt_hotel_wood.png"))

    # hotel floor: polished reddish hardwood, four boards with staggered joints
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=1409)
    rng = np.random.default_rng(1411)
    tones = [(92, 46, 26), (110, 56, 30), (84, 40, 22), (102, 52, 28)]
    for i in range(4):
        x0 = i * 4
        p.material(x0, 0, 4, 16, tuple(v * 0.8 for v in tones[i]), tones[i], tuple(min(255, v * 1.2) for v in tones[i]),
                   contrast=0.9, grain=0.12)
        c.rect(x0, 0, 1, 16, (44, 20, 10))          # gap between boards
        joint = (i * 7 + 3) % 16
        c.rect(x0, joint, 4, 1, (50, 24, 12))
        for _ in range(3):                           # grain streaks
            gx = x0 + 1 + rng.integers(0, 3)
            for gy in range(16):
                if rng.random() < 0.6:
                    c.blend_px(gx, gy, (140, 82, 46), 0.35)
    c.save(out("textures", "blocks", "zt_hotel_floor.png"))

    # crown molding: dark wood with a gilded line and carved dentils
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=1413)
    p.material(0, 0, 16, 16, (40, 20, 12), (62, 32, 18), (86, 46, 26), contrast=1.0)
    c.rect(0, 0, 16, 2, (98, 58, 34))
    c.rect(0, 4, 16, 1, (178, 140, 70))
    for x in range(0, 16, 3):
        c.rect(x, 7, 2, 3, (90, 52, 30))
        c.rect(x, 10, 2, 1, (30, 14, 8))
    c.rect(0, 12, 16, 1, (178, 140, 70))
    c.rect(0, 15, 16, 1, (28, 12, 6))
    c.save(out("textures", "blocks", "zt_hotel_trim.png"))

    # ceiling: dark plaster with a coffered square
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=1415)
    p.material(0, 0, 16, 16, (40, 34, 30), (54, 46, 40), (66, 58, 50), contrast=0.6, grain=0.08)
    c.rect(0, 0, 16, 1, (30, 24, 20))
    c.rect(0, 0, 1, 16, (30, 24, 20))
    c.rect(1, 1, 15, 1, (70, 62, 54))
    c.rect(1, 1, 1, 15, (70, 62, 54))
    c.save(out("textures", "blocks", "zt_hotel_ceiling.png"))

    # library shelf: a dark frame, two rows of mismatched old books
    c = Canvas(16, 16, (0, 0, 0, 255))
    p = Painter(c, seed=1417)
    rng = np.random.default_rng(1419)
    p.material(0, 0, 16, 16, (34, 16, 8), (52, 26, 14), (70, 38, 22), contrast=1.0)
    spines = [(110, 26, 26), (40, 70, 44), (80, 52, 30), (34, 44, 82), (120, 96, 52), (60, 30, 50), (24, 24, 28),
              (140, 60, 34)]
    for top in (1, 9):
        x = 1
        while x < 15:
            bw = int(rng.integers(1, 3))
            bh = int(rng.integers(5, 7))
            col = spines[rng.integers(0, len(spines))]
            if x + bw > 15:
                bw = 15 - x
            c.rect(x, top + 6 - bh, bw, bh, col)
            c.rect(x, top + 6 - bh, bw, 1, tuple(min(255, int(v * 1.3)) for v in col))
            if bh > 5 and rng.random() < 0.5:
                c.rect(x, top + 6 - bh + 2, bw, 1, (196, 160, 80))     # a gilded band
            x += bw
        c.rect(0, top + 6, 16, 2, (66, 36, 20))                         # the shelf board
        c.rect(0, top + 7, 16, 1, (30, 14, 8))
    c.rect(0, 0, 16, 1, (30, 14, 8))
    c.rect(0, 0, 1, 16, (60, 32, 18))
    c.rect(15, 0, 1, 16, (30, 14, 8))
    c.save(out("textures", "blocks", "zt_library_shelf.png"))


# =============================================================================================
# item icons
# =============================================================================================
def door_icon(number):
    c = Canvas(16, 16, CLEAR)
    p = Painter(c, seed=1500 + number)
    c.rect(2, 0, 12, 16, (34, 16, 8))                                 # the frame
    p.material(3, 1, 10, 15, (54, 26, 14), (78, 40, 22), (104, 56, 32), contrast=1.0)
    for (x, y, w, h) in ((4, 10, 3, 5), (9, 10, 3, 5)):              # lower panels
        c.rect(x, y, w, 1, (112, 66, 40))
        c.rect(x, y + h - 1, w, 1, (34, 16, 8))
    # a big brass plate across the top with the door number
    c.rect(4, 2, 8, 7, (214, 170, 70))
    c.rect(4, 8, 8, 1, (150, 110, 40))
    c.rect(4, 2, 8, 1, (246, 214, 120))
    x = 5
    for ch in str(number):
        for gy, row in enumerate(DIGITS[ch]):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.px(x + gx, 3 + gy, (40, 20, 6))
        x += 3 if ch == "1" else 4
    c.px(11, 11, (236, 200, 90))                                      # the knob
    c.px(12, 12, (150, 110, 40))
    c.save(out("textures", "items", "zt_door_%d.png" % number))


def shape_mask(shape, size=16, cx=8.5, cy=8.0, r=4.4):
    """A crisp filled shape: drawn 8x larger, then sampled down."""
    from PIL import Image, ImageDraw
    k = 8
    big = Canvas(size * k, size * k, CLEAR)
    pts = draw_shape(big, shape, cx * k, cy * k, r * k, (255, 255, 255))
    img = Image.new("L", (size * k, size * k), 0)
    ImageDraw.Draw(img).polygon([(x, y) for x, y in pts], fill=255)
    a = np.array(img, dtype=float).reshape(size, k, size, k).mean(axis=(1, 3))
    return a > 110


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


def egg(path, base, decorate):
    c = Canvas(16, 16, CLEAR)
    for y, row in enumerate(EGG):
        for x, ch in enumerate(row):
            if ch == "#":
                shade = 1.0 - 0.2 * (x / 15) - 0.12 * (y / 15)
                c.px(x, y, tuple(int(v * shade) for v in base))
    decorate(c)
    c.px(6, 2, (255, 255, 255, 140))
    c.px(5, 3, (255, 255, 255, 110))
    c.save(path)


def figure_egg(c):
    # the round mouth ringed with teeth, and glowing blisters
    for y in range(6, 12):
        for x in range(5, 11):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 9)
            if d < 1.8:
                c.px(x, y, (20, 2, 4))
            elif d < 2.9:
                c.px(x, y, (236, 226, 190) if (x + y) % 2 == 0 else (120, 26, 34))
    for (x, y) in ((4, 4), (11, 5), (3, 11), (12, 12)):
        c.px(x, y, (255, 190, 90))


def seek_egg(c):
    for y in range(6, 11):
        for x in range(4, 12):
            d = math.hypot((x + 0.5 - 8) / 1.5, y + 0.5 - 8.5)
            if d < 2.2:
                c.px(x, y, (232, 230, 224))
    c.px(7, 8, (10, 8, 10))
    c.px(8, 8, (10, 8, 10))
    c.px(7, 9, (10, 8, 10))
    c.px(8, 9, (10, 8, 10))
    c.px(5, 8, (170, 30, 30))
    c.px(10, 9, (170, 30, 30))
    for (x, y) in ((4, 12), (11, 13), (6, 3)):
        c.px(x, y, (90, 94, 120))


def paper_icon():
    c = Canvas(16, 16, CLEAR)
    p = Painter(c, seed=1601)
    p.material(2, 1, 12, 14, (200, 184, 142), (228, 214, 176), (246, 238, 212), contrast=0.6)
    c.rect(13, 1, 1, 14, (170, 152, 112))
    c.rect(2, 14, 12, 1, (170, 152, 112))
    for i, shape in enumerate(("triangle", "star", "circle")):
        draw_shape(c, shape, 4.5 + i * 3.5, 5, 1.4, (50, 36, 30))
    for y in (9, 11, 13):
        c.rect(4, y, 8 if y != 13 else 5, 1, (110, 90, 70))
    c.save(out("textures", "items", "zt_solution_paper.png"))


def book_icon(shape):
    c = Canvas(16, 16, CLEAR)
    p = Painter(c, seed=1700 + SHAPES.index(shape))
    p.material(3, 1, 11, 14, (16, 28, 74), (30, 52, 124), (54, 86, 172), contrast=0.8)
    c.rect(2, 1, 2, 14, (12, 20, 56))                                  # the spine
    c.rect(2, 3, 2, 1, (220, 180, 90))
    c.rect(2, 12, 2, 1, (220, 180, 90))
    c.rect(13, 2, 1, 13, (230, 220, 190))                              # page edges
    c.rect(3, 15, 11, 1, (230, 220, 190))
    # the shape in gold with a dark outline
    size = {"star": 5.8, "hexagon": 5.2, "pentagon": 5.2, "triangle": 5.4, "diamond": 5.4, "heart": 5.0,
            "cross": 5.0, "crescent": 5.0}.get(shape, 4.7)
    m = shape_mask(shape, cx=8.5, cy=8.2 if shape == "triangle" else 8.0, r=size)
    if shape == "circle":
        # a ring, so it doesn't read as a hexagon or pentagon
        m &= ~shape_mask("circle", cx=8.5, cy=8.0, r=2.2)
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    c.a[m] = (240, 196, 86, 255)
    c.a[edge] = (255, 232, 150, 255)
    ring = (np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)) & ~m
    ring[:, :3] = False
    ring[:, 13:] = False
    c.a[ring] = (8, 12, 34, 255)
    c.save(out("textures", "items", "zt_book_%s.png" % shape))


# =============================================================================================
# boss bars
# =============================================================================================
K = 2
BAR_W, BAR_H = 182, 6
FRAME_W, FRAME_H = 200, 26
HX0, HY0 = 9, 13


def bar_back(name, rgb):
    w, h = BAR_W * K, BAR_H * K
    n = fbm(w, h, 1801 + len(name), cell=6, octaves=3)
    arr = np.zeros((h, w, 4))
    arr[..., :3] = np.array(rgb) + (n[..., None] - 0.5) * 14
    arr[..., 3] = 255
    arr[:K, :, :3] *= 0.5
    to_image(arr).save(out("textures", "ui", "zt", name + "_bar_back.png"))


def figure_bar():
    bar_back("figure", (22, 10, 10))
    # the fill: safe green on the left, through yellow and orange, to red danger on the right
    w, h = BAR_W * K, BAR_H * K
    t = np.linspace(0, 1, w)[None, :, None]
    stops = [(0.0, (60, 190, 70)), (0.35, (226, 214, 60)), (0.65, (236, 130, 40)), (1.0, (214, 30, 30))]
    col = np.zeros((1, w, 3))
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        k = np.clip((t - t0) / (t1 - t0), 0, 1)
        seg = (t >= t0) & (t <= t1)
        col = np.where(seg, np.array(c0) + (np.array(c1) - np.array(c0)) * k, col)
    arr = np.zeros((h, w, 4))
    n = fbm(w, h, 1811, cell=4, octaves=2)
    arr[..., :3] = col * (0.9 + 0.2 * n[..., None])
    arr[:K, :, :3] = arr[:K, :, :3] * 0.5 + 255 * 0.5
    arr[-K:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "figure_bar_fill.png"))

    # the frame: the Figure's flesh, with rows of teeth biting down on the bar
    W, H = FRAME_W * K, FRAME_H * K
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = HX0 * K, HY0 * K, (HX0 + BAR_W) * K, (HY0 + BAR_H) * K
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 4 * K) & (xx < hx1 + 4 * K) & (yy >= hy0 - 4 * K) & (yy < hy1 + 4 * K)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    frame = band & ~hole
    n = fbm(W, H, 1813, cell=5, octaves=3)
    d0, d1 = np.array((70, 12, 12)), np.array((170, 56, 40))
    col = d0 + (d1 - d0) * n[..., None]
    fr[frame, :3] = col[frame]
    fr[frame, 3] = 255
    outer = band & ~((xx >= hx0 - 3 * K) & (xx < hx1 + 3 * K) & (yy >= hy0 - 3 * K) & (yy < hy1 + 3 * K))
    fr[outer, :3] *= 0.55
    inner = band & ~hole & (xx >= hx0 - K) & (xx < hx1 + K) & (yy >= hy0 - K) & (yy < hy1 + K)
    fr[inner, :3] = (30, 4, 6)
    rng = np.random.default_rng(1815)
    # teeth along the top and bottom edges, pointing into the bar
    for x in range(hx0 + 2 * K, hx1 - 2 * K, 7 * K):
        tw = rng.integers(2, 4) * K
        th = rng.integers(2, 4) * K
        x0 = x + rng.integers(0, 2 * K)
        for k in range(th):
            half = int(tw / 2 * (1 - k / th)) + 1
            cx = x0 + tw // 2
            fr[hy0 - K + k, cx - half:cx + half, :3] = (236, 226, 190)
            fr[hy0 - K + k, cx - half:cx + half, 3] = 255
            fr[hy1 + K - 1 - k, cx - half + 3 * K:cx + half + 3 * K, :3] = (220, 210, 172)
            fr[hy1 + K - 1 - k, cx - half + 3 * K:cx + half + 3 * K, 3] = 255
    # glowing blisters on the flesh
    for _ in range(12):
        bx = int(rng.integers(hx0 - 3 * K, hx1 + 3 * K))
        by = int(rng.choice([hy0 - 3 * K + K, hy1 + 2 * K]))
        fr[by:by + K, bx:bx + K, :3] = (255, 196, 96)
        fr[by:by + K, bx:bx + K, 3] = 255
    # the round, toothed mouth at each end
    for cx in (hx0 - 4 * K, hx1 + 4 * K):
        cy = (hy0 + hy1) // 2
        r = 6.5 * K
        d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
        m = d <= r
        fr[m, :3] = col[m] * 1.1
        fr[m, 3] = 255
        fr[d <= r * 0.62, :3] = (236, 226, 190)
        fr[d <= r * 0.45, :3] = (18, 2, 4)
        ring = (d > r * 0.45) & (d <= r * 0.62)
        ang = np.arctan2(yy - cy, xx - cx)
        gaps = ring & (np.mod(ang * 6 / math.pi, 1.0) < 0.35)
        fr[gaps, :3] = (110, 24, 30)
        fr[(d > r - K) & m, :3] *= 0.5
    to_image(fr).save(out("textures", "ui", "zt", "figure_bar_frame.png"))


def seek_bar():
    bar_back("seek", (8, 10, 20))
    # the fill: the Guiding Light's blue, with a soft shine
    w, h = BAR_W * K, BAR_H * K
    n = fbm(w, h, 1901, cell=5, octaves=3)
    arr = np.zeros((h, w, 4))
    c0, c1 = np.array((40, 110, 220)), np.array((150, 220, 255))
    arr[..., :3] = c0 + (c1 - c0) * (0.35 + 0.5 * n[..., None])
    arr[:K, :, :3] = arr[:K, :, :3] * 0.4 + 255 * 0.6
    arr[-K:, :, :3] *= 0.6
    arr[..., 3] = 255
    to_image(arr).save(out("textures", "ui", "zt", "seek_bar_fill.png"))

    # the frame: black slime dripping from the bar, eyes staring out of it
    W, H = FRAME_W * K, FRAME_H * K
    fr = np.zeros((H, W, 4))
    hx0, hy0, hx1, hy1 = HX0 * K, HY0 * K, (HX0 + BAR_W) * K, (HY0 + BAR_H) * K
    yy, xx = np.mgrid[0:H, 0:W]
    band = (xx >= hx0 - 3 * K) & (xx < hx1 + 3 * K) & (yy >= hy0 - 3 * K) & (yy < hy1 + 3 * K)
    hole = (xx >= hx0) & (xx < hx1) & (yy >= hy0) & (yy < hy1)
    n = fbm(W, H, 1903, cell=4, octaves=3)
    goo0, goo1 = np.array((6, 6, 10)), np.array((52, 54, 72))
    col = goo0 + (goo1 - goo0) * n[..., None] * 0.7
    rng = np.random.default_rng(1905)
    goo = band & ~hole
    # drips running down from the bottom edge, blobs on the top edge
    for x in range(hx0 - 2 * K, hx1 + 2 * K, 5 * K):
        x0 = x + int(rng.integers(0, 3 * K))
        length = int(rng.integers(1, 5)) * K
        goo |= (xx >= x0) & (xx < x0 + K + K // 2) & (yy >= hy1 + 3 * K) & (yy < hy1 + 3 * K + length)
        if rng.random() < 0.5:
            r = rng.uniform(1.0, 2.2) * K
            goo |= (np.hypot(xx + 0.5 - x0, yy + 0.5 - (hy0 - 3 * K)) <= r)
    fr[goo, :3] = col[goo]
    fr[goo, 3] = 255
    fr[goo & (yy < hy0 - 2 * K), :3] += 20
    inner = band & ~hole & (xx >= hx0 - K) & (xx < hx1 + K) & (yy >= hy0 - K) & (yy < hy1 + K)
    fr[inner, :3] = (2, 2, 4)

    def eye(cx, cy, rx, ry):
        d = np.hypot((xx + 0.5 - cx) / rx, (yy + 0.5 - cy) / ry)
        blob = d <= 1.5
        fr[blob, :3] = col[blob]
        fr[blob, 3] = 255
        fr[d <= 1.0, :3] = (232, 230, 222)
        fr[d <= 1.0, 3] = 255
        p = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy) <= ry * 0.62
        fr[p, :3] = (10, 6, 8)
        fr[np.hypot(xx + 0.5 - (cx - ry * 0.25), yy + 0.5 - (cy - ry * 0.25)) <= K * 0.7, :3] = (240, 240, 240)

    mid = (hy0 + hy1) // 2
    eye(hx0 - 4 * K, mid, 5 * K, 3.6 * K)
    eye(hx1 + 4 * K, mid, 5 * K, 3.6 * K)
    for x in (W * 0.3, W * 0.5, W * 0.7):
        eye(int(x), hy0 - 3 * K, 2.6 * K, 1.8 * K)
    to_image(fr).save(out("textures", "ui", "zt", "seek_bar_frame.png"))


def main():
    hotel_blocks()
    door_icon(50)
    door_icon(30)
    egg(out("textures", "items", "zt_figure_egg.png"), (150, 40, 30), figure_egg)
    egg(out("textures", "items", "zt_seek_egg.png"), (24, 24, 32), seek_egg)
    paper_icon()
    for shape in SHAPES:
        book_icon(shape)
    figure_bar()
    seek_bar()
    print("hotel art written")


if __name__ == "__main__":
    main()
