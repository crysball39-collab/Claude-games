"""Tool and armor art in the classic Minecraft style, for any material palette (the Obsidian and
Glowite sets use it).

Tool icons have a wooden handle running up from the bottom-left corner and a shaded head with
a dark outline at the top-right. Worn armor covers what vanilla armor covers on the standard
64x32 armor layout: the helmet a cap open at the face, the chestplate the chest and the
shoulders, the leggings the hips and thighs, the boots the shins and soles.

A palette is a dict of RGB tuples: outline, deep, dark, mid, light, glint.
"""
import numpy as np

from texlib import Canvas, box_faces, fbm

CLEAR = (0, 0, 0, 0)
WOOD = {"dark": (73, 54, 21), "mid": (104, 78, 30), "light": (137, 103, 39)}

# ---------------------------------------------------------------- tool heads: d dark, m mid, l light, g glint
HEADS = {
    "pickaxe": [
        "................",
        "................",
        "......lllll.....",
        ".....lmmmmmgl...",
        "......dddmmmm...",
        "..........dmmm..",
        "............mm..",
        "............mm..",
        "............md..",
        "............md..",
        "............dd..",
    ],
    "axe": [
        "................",
        "................",
        "........ll......",
        ".......lmml.....",
        "......lgmmm.....",
        "......lmmmmm....",
        "......lmmdmm....",
        ".......dddmmd...",
        "..........dd....",
    ],
    "shovel": [
        "................",
        "................",
        "...........lll..",
        "..........lgmml.",
        ".........lmmmmm.",
        "........lmmmmmd.",
        ".........dmmmd..",
        "..........ddd...",
    ],
    "hoe": [
        "................",
        "........lll.....",
        ".......lgmmm....",
        "........ddmmm...",
        "..........dmmm..",
        "............m...",
    ],
}
# where each handle runs: from the bottom-left end to its top under the head
HANDLES = {"pickaxe": (2, 14, 11, 5), "axe": (2, 14, 10, 6), "shovel": (2, 14, 9, 7), "hoe": (2, 14, 11, 5)}
# the sword: blade, guard (G), grip (w/h wood) and pommel (p)
SWORD = [
    "..............ll",
    ".............lgl",
    "............lmml",
    "...........lmmd.",
    "..........lmmd..",
    ".........lmmd...",
    "........lmmd....",
    "..GG...lmmd.....",
    "..GGG.lmmd......",
    "...GGGmmd.......",
    "....GGGd........",
    "....wwGGG.......",
    "...wh..GGG......",
    "..wh....GG......",
    "pph.............",
    "pp..............",
]


def outline(c, mask, color):
    """A one-pixel outline round the masked shape, on the empty pixels only."""
    pad = np.pad(mask, 1)
    edge = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    empty = c.a[..., 3] == 0
    c.a[edge & ~mask & empty] = np.array((*color, 255))


def handle(c, x0, y0, x1, y1):
    """A three-pixel-wide wooden handle on the diagonal, light down its middle."""
    n = x1 - x0
    for k in range(n + 1):
        x, y = x0 + k, y0 - k
        c.px(x - 1, y, WOOD["dark"])
        c.px(x, y, WOOD["light"] if k % 3 else WOOD["mid"])
        c.px(x + 1, y, WOOD["dark"])
    c.px(x0 - 1, y0 + 1, WOOD["dark"])
    c.px(x0, y0 + 1, WOOD["dark"])


def tool_icon(kind, pal):
    c = Canvas(16, 16, CLEAR)
    if kind == "sword":
        rows = SWORD
        mask = np.zeros((16, 16), dtype=bool)
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch in "lmdgG":
                    mask[y, x] = True
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                col = {"l": pal["light"], "m": pal["mid"], "d": pal["dark"], "g": pal["glint"], "G": pal["deep"],
                       "w": WOOD["light"], "h": WOOD["dark"], "p": pal["dark"]}.get(ch)
                if col:
                    c.px(x, y, col)
        outline(c, mask, pal["outline"])
        return c
    handle(c, *HANDLES[kind])
    mask = np.zeros((16, 16), dtype=bool)
    for y, row in enumerate(HEADS[kind]):
        for x, ch in enumerate(row):
            if ch != ".":
                mask[y, x] = True
                c.px(x, y, {"l": pal["light"], "m": pal["mid"], "d": pal["dark"], "g": pal["glint"]}[ch])
    outline(c, mask, pal["outline"])
    return c


# ---------------------------------------------------------------- armor icons
ARMOR_ICONS = {
    "helmet": [
        "................",
        "................",
        "................",
        ".....llllll.....",
        "....lgmmmmml....",
        "...lmmmmmmmmd...",
        "...lmmmmmmmmd...",
        "...lmdddddmmd...",
        "...lmd....dmd...",
        "...lmd....dmd...",
        "...ddd....ddd...",
    ],
    "chestplate": [
        "................",
        "..lll....lll....",
        ".lgmml..lmmml...",
        ".lmmmmllmmmmmd..",
        ".lmmmmmmmmmmmd..",
        "..ddlmmmmmmdd...",
        "....lmmmmmmd....",
        "....lmmmmmmd....",
        "....lmmmmmmd....",
        "....lmmmmmmd....",
        "....lmmmmmmd....",
        "....dddddddd....",
    ],
    "leggings": [
        "................",
        "...lllllllll....",
        "...lgmmmmmmmd...",
        "...lmmmmmmmmd...",
        "...lmmmddmmmd...",
        "...lmmd..lmmd...",
        "...lmmd..lmmd...",
        "...lmmd..lmmd...",
        "...lmmd..lmmd...",
        "...lmmd..lmmd...",
        "...lmmd..lmmd...",
        "...dddd..dddd...",
    ],
    "boots": [
        "................",
        "................",
        "................",
        "................",
        "................",
        "...llm....llm...",
        "...lgm....lmm...",
        "...lmm....lmm...",
        "...lmm....lmm...",
        "..lmmmd..lmmmd..",
        ".lmmmmd.lmmmmd..",
        ".ddddddd.ddddd..",
    ],
}


def armor_icon(kind, pal):
    c = Canvas(16, 16, CLEAR)
    mask = np.zeros((16, 16), dtype=bool)
    for y, row in enumerate(ARMOR_ICONS[kind]):
        for x, ch in enumerate(row):
            if ch != ".":
                mask[y, x] = True
                c.px(x, y, {"l": pal["light"], "m": pal["mid"], "d": pal["dark"], "g": pal["glint"]}[ch])
    outline(c, mask, pal["outline"])
    return c


# ---------------------------------------------------------------- worn armor (64 x 32)
HEAD = (0, 0, 8, 8, 8)
BODY = (16, 16, 8, 12, 4)
ARM = (40, 16, 4, 12, 4)
LEG = (0, 16, 4, 12, 4)


def coverage(layer):
    """Which pixels of the 64x32 armor texture each layer's pieces cover."""
    m = np.zeros((32, 64), dtype=bool)

    def face(box, name, rows=None, cols=None):
        x, y, w, h = (int(v) for v in box_faces(*box)[name])
        for r in range(h):
            if rows is not None and r not in rows:
                continue
            for k in range(w):
                if cols is not None and k not in cols:
                    continue
                m[y + r, x + k] = True

    if layer == 1:
        # helmet: a cap, open at the face below the brow
        face(HEAD, "top")
        face(HEAD, "front", rows=range(0, 3))
        face(HEAD, "front", rows=range(3, 4), cols=[0, 1, 6, 7])
        face(HEAD, "front", rows=range(4, 6), cols=[0, 7])
        for side in ("right", "left"):
            face(HEAD, side, rows=range(0, 6))
        face(HEAD, "back", rows=range(0, 7))
        # chestplate: the chest and back down to the waist, and the shoulders
        for side in ("front", "back", "right", "left"):
            face(BODY, side, rows=range(0, 10))
        face(ARM, "top")
        for side in ("front", "back", "right", "left"):
            face(ARM, side, rows=range(0, 6))
        # boots: the shins and soles
        face(LEG, "bottom")
        for side in ("front", "back", "right", "left"):
            face(LEG, side, rows=range(7, 12))
    else:
        # leggings: the hips and the legs down past the knee
        for side in ("front", "back", "right", "left"):
            face(BODY, side, rows=range(8, 12))
        face(BODY, "bottom")
        face(LEG, "top")
        for side in ("front", "back", "right", "left"):
            face(LEG, side, rows=range(0, 9))
    return m


def armor_layer(layer, pal, seed, accent=None):
    """A worn armor layer: plates shaded light at their top edges and dark at their bottom ones,
    with a few glints (and the material's accent, if any, along the plates' seams)."""
    mask = coverage(layer)
    c = Canvas(64, 32, CLEAR)
    noise = fbm(64, 32, seed, cell=4, octaves=3)
    rng = np.random.default_rng(seed + 1)
    stops = [pal["deep"], pal["dark"], pal["mid"], pal["light"]]
    for y in range(32):
        for x in range(64):
            if not mask[y, x]:
                continue
            v = 0.35 + noise[y, x] * 0.45 + (rng.random() - 0.5) * 0.06
            i = min(2, int(v * 3))
            t = v * 3 - i
            a, b = np.array(stops[i]), np.array(stops[i + 1])
            c.px(x, y, tuple(int(q) for q in a + (b - a) * min(1, max(0, t))))
    # each covered run of a face: its top row lit, its bottom row in shadow, its sides darker
    boxes = [HEAD, BODY, ARM, LEG]
    for box in boxes:
        for name, (fx, fy, fw, fh) in box_faces(*box).items():
            fx, fy, fw, fh = int(fx), int(fy), int(fw), int(fh)
            for k in range(fw):
                col = [r for r in range(fh) if mask[fy + r, fx + k]]
                if not col:
                    continue
                c.px(fx + k, fy + col[0], pal["light"])
                c.px(fx + k, fy + col[-1], pal["deep"])
            for r in range(fh):
                row = [k for k in range(fw) if mask[fy + r, fx + k]]
                if len(row) > 2 and name in ("front", "back"):
                    c.blend_px(fx + row[0], fy + r, pal["dark"], 0.5)
                    c.blend_px(fx + row[-1], fy + r, pal["dark"], 0.5)
    if accent is not None:
        # a seam down the middle of the chest, a band at the brow and the belt
        cx, cy, cw, ch = (int(v) for v in box_faces(*BODY)["front"])
        if layer == 1:
            for r in range(1, 9, 2):
                c.px(cx + cw // 2, cy + r, accent)
            hx, hy, hw, hh = (int(v) for v in box_faces(*HEAD)["front"])
            for k in range(1, hw - 1):
                c.px(hx + k, hy + 2, accent)
        else:
            for k in range(0, cw, 2):
                c.px(cx + k, cy + 9, accent)
    ys, xs = np.nonzero(mask)
    for _ in range(5):
        i = rng.integers(0, len(xs))
        c.px(xs[i], ys[i], pal["glint"])
    return c
