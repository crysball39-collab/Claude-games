"""Generates the Hotel's (Floor 1) entity geometry and textures: closets, beds, dressers,
nightstands, desks, cabinets, couches, keys, flesh piles; the elevator doors, the iron
gates (with a white door number), door 100's grey metal door, wide grey gate, the
elevator's folding gate, its lever, breaker box and switches and the live wire; the herb
plant and the angel statue; Jeff, El Goblino, Bob and the shop's goods; Rush and Screech.

Shapes follow DOORS (Roblox): Rush is a cloud of black smoke with a huge pale face (wide
staring eyes, a grin of teeth); Screech a small pale-pink thing coated in black goo, with
six tentacles, glowing white eyes and a round mouth of human teeth in red gums; Jeff a
dark royal-blue tentacled thing with glowing eyes (here blue) in the shadows; El Goblino a
little red goblin with big yellow eyes, sharp ears, a gold earring, a beaky nose, two
fangs, spiked wristbands, ripped brown shorts and a small tail; Bob a skeleton in a chair.
Everything is drawn procedurally.

    python3 tools/gen_floor1_art.py
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_art import BRASS, DIGITS, glyph_bones, glyph_parts, paint_glyphs  # noqa: E402
from geobuild import Geo, geometry_file  # noqa: E402
from texlib import Canvas, Painter  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)
S = 4

DARK_WOOD = ((34, 18, 10), (58, 32, 18), (86, 52, 30))
WOOD = ((60, 34, 18), (92, 56, 32), (124, 80, 48))
LIGHT_WOOD = ((104, 72, 40), (146, 106, 62), (184, 144, 92))
GREY_METAL = ((64, 68, 74), (104, 110, 118), (150, 156, 164))
DARK_METAL = ((24, 24, 28), (44, 46, 52), (70, 74, 82))
IRON = ((30, 28, 28), (52, 48, 46), (82, 74, 68))
RUST = (110, 56, 30)
RED_FABRIC = ((84, 14, 18), (126, 26, 30), (164, 48, 50))
GREEN_FABRIC = ((22, 54, 34), (36, 82, 52), (58, 112, 74))
TORN_FABRIC = ((62, 44, 32), (92, 66, 46), (118, 90, 64))
SHEET = ((176, 176, 172), (214, 214, 210), (240, 240, 236))
PALE_BLUE = ((112, 140, 162), (146, 176, 196), (182, 206, 222))
BONE = ((150, 140, 112), (200, 190, 160), (232, 226, 204))
STONE = ((86, 86, 84), (122, 122, 118), (160, 160, 154))
GOLD = ((128, 86, 18), (204, 156, 40), (250, 214, 110))
FLESH = ((84, 10, 16), (150, 34, 40), (204, 86, 90))


def out(*parts):
    p = os.path.join(RP, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def write_geo(name, *geos):
    with open(out("models", "entity", name + ".geo.json"), "w") as f:
        json.dump(geometry_file(*geos), f, indent="\t")
        f.write("\n")


def save(c, name):
    c.save(out("textures", "entity", "hotel", name + ".png"))


# ---------------------------------------------------------------- painting helpers
def mat(dark, mid, light, contrast=1.0, grain=0.12, edges=0.25):
    def f(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, dark, mid, light, contrast=contrast, grain=grain)
        if edges:
            p.shade_edges(x, y, w, h, amount=edges)
    return f


def flat(color):
    def f(c, p, rect, side, rng, part):
        x, y, w, h = rect
        c.rect(x, y, w, h, color)
    return f


def paint(g, painters, default=None, seed=1, base=CLEAR):
    c = Canvas(g.tw * S, g.th * S, base)
    p = Painter(c, seed=seed)
    rng = np.random.default_rng(seed)
    for part in g.parts:
        fn = painters.get(part, default)
        if fn is None:
            continue
        for side, rect in g.faces(part, S).items():
            if rect[2] < 1 or rect[3] < 1:
                continue
            fn(c, p, rect, side, rng, part)
    return c


def wood_grain(c, rng, rect, dark=(30, 16, 8), light=(120, 76, 44), vertical=True, amount=0.25):
    x, y, w, h = rect
    if vertical:
        for gx in range(int(x), int(x + w)):
            if rng.random() < 0.3:
                col = dark if rng.random() < 0.6 else light
                for gy in range(int(y), int(y + h)):
                    if rng.random() < 0.7:
                        c.blend_px(gx, gy, col, amount)
    else:
        for gy in range(int(y), int(y + h)):
            if rng.random() < 0.3:
                col = dark if rng.random() < 0.6 else light
                for gx in range(int(x), int(x + w)):
                    if rng.random() < 0.7:
                        c.blend_px(gx, gy, col, amount)


def panel_lines(c, rect, inset, color=(20, 10, 6), light=(140, 90, 56)):
    """A raised panel: a dark groove inside the face, lit on its top and left."""
    x, y, w, h = rect
    i = inset
    c.rect(x + i, y + i, w - 2 * i, 1, light)
    c.rect(x + i, y + i, 1, h - 2 * i, light)
    c.rect(x + i, y + h - i - 1, w - 2 * i, 1, color)
    c.rect(x + w - i - 1, y + i, 1, h - 2 * i, color)


def text_px(c, x, y, text, color, k=1):
    """Tiny 3x5 capitals and digits."""
    font = dict(DIGITS)
    font.update({
        "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"],
        "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"], "G": ["011", "100", "101", "101", "011"],
        "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"],
        "L": ["100", "100", "100", "100", "111"], "N": ["101", "111", "111", "111", "101"], "O": ["010", "101", "101", "101", "010"],
        "P": ["110", "101", "110", "100", "100"], "R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"],
        "T": ["111", "010", "010", "010", "010"], "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"],
        "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"], "Y": ["101", "101", "010", "010", "010"],
        "D": ["110", "101", "101", "101", "110"], "K": ["101", "110", "100", "110", "101"], "M": ["101", "111", "111", "101", "101"],
        "?": ["111", "001", "010", "000", "010"], "!": ["010", "010", "010", "000", "010"], ":": ["000", "010", "000", "010", "000"],
        " ": ["000", "000", "000", "000", "000"],
    })
    for ch in text:
        for gy, row in enumerate(font.get(ch, font[" "])):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.rect(x + gx * k, y + gy * k, k, k, color)
        x += 4 * k


# =============================================================================================
# Closets (wardrobes): a tall cabinet with two slatted doors you can see out through
# =============================================================================================
def wardrobe_geo():
    g = Geo("geometry.zt.wardrobe", 128, None, 2, 3.5, (0, 1.5, 0))
    for name, size in [("back", (16, 42, 1)), ("side", (1, 42, 15)), ("top", (18, 2, 17)), ("crown", (17, 1, 16)),
                       ("base", (16, 2, 15)), ("door", (7.5, 39, 1)), ("knob", (1, 1.6, 1)), ("foot", (2, 1, 2))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("body", "root", (0, 0, 0), cubes=[
        g.cube("back", (-8, 1, 7)),
        g.cube("side", (-8, 1, -8)),
        g.cube("side", (7, 1, -8), mirror=True),
        g.cube("top", (-9, 43, -9)),
        g.cube("crown", (-8.5, 42, -8.5)),
        g.cube("base", (-8, 1, -8)),
        g.cube("foot", (-7.5, 0, -7.5)), g.cube("foot", (5.5, 0, -7.5)), g.cube("foot", (-7.5, 0, 5.5)), g.cube("foot", (5.5, 0, 5.5)),
    ])
    g.bone("door_l", "root", (-7.5, 3, -7.5), cubes=[g.cube("door", (-7.5, 3, -8)), g.cube("knob", (-1.6, 21, -9))])
    g.bone("door_r", "root", (7.5, 3, -7.5), cubes=[g.cube("door", (0, 3, -8), mirror=True), g.cube("knob", (0.6, 21, -9))])
    return g


def wardrobe_textures(g):
    woods = [DARK_WOOD, LIGHT_WOOD, ((54, 50, 46), (84, 80, 74), (116, 110, 102))]
    for i, W in enumerate(woods):
        def body(c, p, rect, side, rng, part, W=W):
            x, y, w, h = rect
            p.material(x, y, w, h, *W, contrast=1.0, grain=0.12)
            wood_grain(c, rng, rect, vertical=part not in ("top", "crown", "base"))
            if part in ("side", "back") and side in ("left", "right", "front", "back") and h > 20:
                panel_lines(c, rect, 2 * S, color=tuple(int(v * 0.4) for v in W[0]), light=W[2])
            p.shade_edges(x, y, w, h, amount=0.3)

        def door(c, p, rect, side, rng, part, W=W):
            x, y, w, h = rect
            p.material(x, y, w, h, *W, contrast=1.0, grain=0.1)
            wood_grain(c, rng, rect)
            if side in ("front", "back"):
                # louvred slats in the upper part: dark wooden slats with see-through gaps between
                top = y + 3 * S
                bottom = y + h * 0.55
                k = int(top)
                while k < bottom:
                    c.rect(x + S, k, w - 2 * S, S * 0.75, tuple(int(v * 0.75) for v in W[1]))
                    c.rect(x + S, k + S * 0.75, w - 2 * S, S * 0.6, CLEAR)
                    k += int(S * 1.5)
                # a panel below
                panel_lines(c, (x, y + h * 0.6, w, h * 0.36), S, color=tuple(int(v * 0.4) for v in W[0]), light=W[2])
            p.shade_edges(x, y, w, h, amount=0.3)
        tex = paint(g, {"door": door, "knob": mat(*BRASS, edges=0.1)}, default=body, seed=1100 + i)
        save(tex, "wardrobe_%d" % i)


# =============================================================================================
# Beds: a hotel double bed (red blanket) and a hospital bed (white, on a metal frame)
# =============================================================================================
def bed_geo():
    g = Geo("geometry.zt.hotel_bed", 192, None, 3, 2, (0, 0.6, 0))
    for name, size in [("headboard", (32, 22, 2)), ("footboard", (32, 12, 2)), ("rail", (1, 3, 44)), ("leg", (2, 4, 2)),
                       ("mattress", (30, 5, 44)), ("blanket", (31, 1.5, 32)), ("drape", (31, 4, 0.5)), ("pillow", (12, 3, 7))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("frame", "root", (0, 0, 0), cubes=[
        g.cube("headboard", (-16, 0, 22)),
        g.cube("footboard", (-16, 0, -24)),
        g.cube("rail", (-16, 3, -22)), g.cube("rail", (15, 3, -22), mirror=True),
        g.cube("leg", (-16, 0, -22)), g.cube("leg", (14, 0, -22)), g.cube("leg", (-16, 0, 20)), g.cube("leg", (14, 0, 20)),
    ])
    g.bone("bedding", "root", (0, 4, 0), cubes=[
        g.cube("mattress", (-15, 4, -22)),
        g.cube("blanket", (-15.5, 9, -22.5)),
        g.cube("drape", (-15.5, 5.5, -23)),
        g.cube("pillow", (-14, 9, 13)), g.cube("pillow", (2, 9, 13)),
    ])
    return g


def bed_textures(g):
    for i, (frame, blanket, sheet) in enumerate([(DARK_WOOD, RED_FABRIC, SHEET), (GREY_METAL, PALE_BLUE, SHEET)]):
        def fabric(c, p, rect, side, rng, part, B=blanket):
            x, y, w, h = rect
            p.material(x, y, w, h, *B, contrast=0.8, grain=0.08)
            if i == 0 and part == "blanket" and side == "top":
                # a gold-stitched border across the foot
                c.rect(x, y + h * 0.82, w, 2, (190, 150, 60))
            p.shade_edges(x, y, w, h, amount=0.2)
        frame_fn = mat(*frame, edges=0.3)
        if i == 0:
            def frame_fn(c, p, rect, side, rng, part, F=frame):
                x, y, w, h = rect
                p.material(x, y, w, h, *F, contrast=1.0, grain=0.12)
                wood_grain(c, rng, rect)
                if part == "headboard" and side in ("front", "back"):
                    panel_lines(c, rect, 2 * S, light=F[2])
                p.shade_edges(x, y, w, h, amount=0.3)
        tex = paint(g, {"mattress": mat(*sheet, contrast=0.6), "pillow": mat(*sheet, contrast=0.6, edges=0.35), "blanket": fabric,
                        "drape": fabric}, default=frame_fn, seed=1200 + i)
        save(tex, "hotel_bed_%d" % i)


# =============================================================================================
# Dressers, nightstands, desks and cabinets: drawers that slide out (bones d0, d1, d2)
# =============================================================================================
def drawer(g, name, x0, y0, w, h, front_z, depth, handle=True):
    """A drawer bone: its front, a tray behind it, a brass pull."""
    cubes = [g.cube("front_%dx%d" % (w * 10, h * 10), (x0, y0, front_z)),
             g.cube("tray_%dx%d" % (w * 10, depth * 10), (x0 + 0.5, y0 + 0.5, front_z + 1))]
    if handle:
        cubes.append(g.cube("pull", (x0 + w / 2 - 2, y0 + h / 2 - 0.5, front_z - 0.8)))
    return cubes


def drawer_parts(g, sizes, depth):
    for w, h in sizes:
        g.part("front_%dx%d" % (w * 10, h * 10), w, h, 1)
        g.part("tray_%dx%d" % (w * 10, depth * 10), w - 1, h - 1, depth)
    g.part("pull", 4, 1, 0.8)


def dresser_geo():
    g = Geo("geometry.zt.dresser", 160, None, 2.5, 1.5, (0, 0.5, 0))
    for name, size in [("body", (32, 14, 14)), ("top", (33, 1.5, 15)), ("leg", (2, 1.5, 2)), ("mirror", (20, 14, 1)),
                       ("mirror_frame", (22, 1, 1.5))]:
        g.part(name, *size)
    drawer_parts(g, [(14, 4)], 11)
    g.bone("root")
    g.bone("body", "root", (0, 0, 0), cubes=[
        g.cube("body", (-16, 1.5, -6)), g.cube("top", (-16.5, 15.5, -6.5)),
        g.cube("leg", (-16, 0, -6)), g.cube("leg", (14, 0, -6)), g.cube("leg", (-16, 0, 6)), g.cube("leg", (14, 0, 6)),
    ])
    # three rows of drawers, each a pair (both halves of a row open together)
    for k, y in enumerate((11, 6.5, 2)):
        g.bone("d%d" % k, "root", (0, y, -6.5), cubes=drawer(g, "", -15, y, 14, 4, -7, 11) + drawer(g, "", 1, y, 14, 4, -7, 11))
    return g


def nightstand_geo():
    g = Geo("geometry.zt.nightstand", 96, None, 1.2, 1.2, (0, 0.5, 0))
    for name, size in [("body", (14, 10, 13)), ("top", (15, 1.5, 14)), ("leg", (1.5, 2, 1.5)), ("lamp_base", (3, 1, 3)),
                       ("lamp_stem", (1, 5, 1)), ("lamp_shade", (5, 3, 5))]:
        g.part(name, *size)
    drawer_parts(g, [(12, 4)], 10)
    g.bone("root")
    g.bone("body", "root", (0, 0, 0), cubes=[
        g.cube("body", (-7, 2, -6)), g.cube("top", (-7.5, 12, -6.5)),
        g.cube("leg", (-7, 0, -6)), g.cube("leg", (5.5, 0, -6)), g.cube("leg", (-7, 0, 5.5)), g.cube("leg", (5.5, 0, 5.5)),
        g.cube("lamp_base", (2, 13.5, 1)), g.cube("lamp_stem", (3, 14.5, 2)), g.cube("lamp_shade", (1, 19.5, 0)),
    ])
    g.bone("d0", "root", (0, 7, -6.5), cubes=drawer(g, "", -6, 7, 12, 4, -7, 10))
    return g


def desk_geo():
    g = Geo("geometry.zt.desk", 160, None, 2.5, 1.5, (0, 0.5, 0))
    for name, size in [("top", (32, 1.5, 14)), ("leg", (2, 14, 2)), ("pedestal", (12, 14, 13)), ("modesty", (18, 8, 1)),
                       ("papers", (6, 0.3, 8)), ("lamp", (2, 6, 2)), ("shade", (4, 2, 4))]:
        g.part(name, *size)
    drawer_parts(g, [(11, 5)], 10)
    g.bone("root")
    g.bone("body", "root", (0, 0, 0), cubes=[
        g.cube("top", (-16, 14, -7)),
        g.cube("leg", (-16, 0, -7)), g.cube("leg", (-16, 0, 5)),
        g.cube("pedestal", (4, 0, -6)), g.cube("modesty", (-14, 6, 5)),
        g.cube("papers", (-10, 15.5, -4)), g.cube("lamp", (-14, 15.5, 2)), g.cube("shade", (-15, 21.5, 1)),
    ])
    for k, y in enumerate((8, 2)):
        g.bone("d%d" % k, "root", (0, y, -6.5), cubes=drawer(g, "", 4.5, y, 11, 5, -7, 10))
    return g


def cabinet_geo():
    g = Geo("geometry.zt.cabinet", 128, None, 1.2, 2.2, (0, 1.0, 0))
    for name, size in [("body", (14, 30, 12)), ("label", (4, 1.5, 0.3))]:
        g.part(name, *size)
    drawer_parts(g, [(12, 8.5)], 10)
    g.bone("root")
    g.bone("body", "root", (0, 0, 0), cubes=[g.cube("body", (-7, 0, -5))])
    for k, y in enumerate((20.5, 11.5, 2.5)):
        g.bone("d%d" % k, "root", (0, y, -5.5), cubes=drawer(g, "", -6, y, 12, 8.5, -6, 10) + [g.cube("label", (-2, y + 6, -6.3))])
    return g


def drawer_painters(W, metal=False):
    def body(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *W, contrast=1.0, grain=0.12 if not metal else 0.05)
        if not metal:
            wood_grain(c, rng, rect, vertical=False)
        p.shade_edges(x, y, w, h, amount=0.3)

    def front(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *W, contrast=0.9, grain=0.1)
        if side == "front":
            panel_lines(c, rect, max(1, S // 2), color=tuple(int(v * 0.4) for v in W[0]), light=W[2])
        p.shade_edges(x, y, w, h, amount=0.25)

    def tray(c, p, rect, side, rng, part):
        x, y, w, h = rect
        # the inside of a drawer: dark, a little dusty
        p.material(x, y, w, h, (20, 14, 10), (40, 30, 22), (64, 50, 38), contrast=0.6)
    return {"pull": mat(*BRASS, edges=0.1), "label": flat((226, 220, 200)), "tray": tray, "body": body, "top": body,
            "leg": body, "pedestal": body, "modesty": body, "papers": flat((232, 228, 214)), "lamp": mat(*BRASS),
            "lamp_base": mat(*BRASS), "lamp_stem": mat(*BRASS), "shade": mat((150, 120, 70), (200, 170, 110), (240, 214, 150)),
            "lamp_shade": mat((150, 120, 70), (200, 170, 110), (240, 214, 150)), "mirror": flat((130, 150, 160)),
            "mirror_frame": mat(*BRASS), "_front": front, "_tray": tray}


def drawer_textures():
    for name, geo, W, metal in [("dresser", dresser_geo(), WOOD, False), ("nightstand", nightstand_geo(), WOOD, False),
                                ("desk", desk_geo(), DARK_WOOD, False), ("cabinet", cabinet_geo(), GREY_METAL, True)]:
        P = drawer_painters(W, metal)
        painters = {k: v for k, v in P.items() if not k.startswith("_")}
        for part in geo.parts:
            if part.startswith("front_"):
                painters[part] = P["_front"]
            if part.startswith("tray_"):
                painters[part] = P["_tray"]
        tex = paint(geo, painters, default=P["body"], seed=1300 + len(name))
        save(tex, name)
        write_geo(name, geo)


# =============================================================================================
# Couches
# =============================================================================================
def couch_geo():
    g = Geo("geometry.zt.couch", 192, None, 3.5, 1.5, (0, 0.6, 0))
    for name, size in [("base", (44, 6, 15)), ("seat", (14, 3, 12)), ("back", (44, 11, 4)), ("arm", (3, 10, 15)), ("leg", (2, 2, 2)),
                       ("cushion", (13, 7, 3))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("couch", "root", (0, 0, 0), cubes=[
        g.cube("base", (-22, 2, -7)), g.cube("back", (-22, 8, 4)),
        g.cube("arm", (-25, 2, -7)), g.cube("arm", (22, 2, -7), mirror=True),
        g.cube("seat", (-21.5, 8, -7.5)), g.cube("seat", (-7, 8, -7.5)), g.cube("seat", (7.5, 8, -7.5)),
        g.cube("cushion", (-21, 11, 1.5)), g.cube("cushion", (-6.5, 11, 1.5)), g.cube("cushion", (8, 11, 1.5)),
        g.cube("leg", (-24, 0, -6)), g.cube("leg", (22, 0, -6)), g.cube("leg", (-24, 0, 6)), g.cube("leg", (22, 0, 6)),
    ])
    return g


def couch_textures(g):
    for i, F in enumerate([RED_FABRIC, GREEN_FABRIC, TORN_FABRIC]):
        def fabric(c, p, rect, side, rng, part, F=F, i=i):
            x, y, w, h = rect
            p.material(x, y, w, h, *F, contrast=0.8, grain=0.1)
            if part in ("seat", "cushion") and side in ("front", "top"):
                # buttons and seams
                for k in range(2):
                    c.rect(x + w * (0.3 + 0.4 * k), y + h * 0.5, 1, 1, tuple(int(v * 0.6) for v in F[0]))
            if i == 2 and rng.random() < 0.6:
                # rips showing the stuffing
                rx, ry = x + rng.uniform(0.1, 0.7) * w, y + rng.uniform(0.1, 0.7) * h
                c.rect(rx, ry, max(2, w * 0.2), 2, (200, 190, 160))
            p.shade_edges(x, y, w, h, amount=0.3)
        tex = paint(g, {"leg": mat(*DARK_WOOD)}, default=fabric, seed=1400 + i)
        save(tex, "couch_%d" % i)


# =============================================================================================
# Keys (lying on things, or hanging on the reception's key rack), flesh piles
# =============================================================================================
def key_geo():
    g = Geo("geometry.zt.room_key", 64, None, 1, 1, (0, 0.3, 0))
    for name, size in [("bow", (4, 0.8, 4)), ("shaft", (7, 0.8, 1.2)), ("bit", (1.6, 0.8, 2.4)), ("tag", (4, 0.4, 3)),
                       ("ring", (1, 0.6, 3)), ("hook", (1, 1, 2))]:
        g.part(name, *size)
    g.bone("root")
    flat_cubes = [g.cube("bow", (-6, 0, -2)), g.cube("shaft", (-2, 0, -0.6)), g.cube("bit", (3.5, 0, -0.6)),
                  g.cube("ring", (-8, 0.1, -1.5)), g.cube("tag", (-12, 0.2, -1.5))]
    g.bone("flat", "root", (0, 0, 0), cubes=flat_cubes)
    # hanging on a hook on the wall: the same key turned upright, 3 to 4 px behind the entity (the script
    # puts the entity 0.72 of a block out from the wall, so the key hangs just off the wall's face) and
    # from the entity's feet up, inside its tap box
    z, y = 2.4, 5.0
    g.bone("hanging", "root", (0, 0, 0), rotation=(0, 0, 0), cubes=[
        g.cube("hook", (-0.5, 4.5 + y, z)),
        g.cube("bow", (-2, 1.5 + y, z), rotation=(90, 0, 90), pivot=(0, 3.5 + y, z + 0.4)),
        g.cube("shaft", (-1, -2.5 + y, z), rotation=(90, 0, 90), pivot=(0, -0.5 + y, z + 0.4)),
        g.cube("bit", (-0.8, -5.0 + y, z), rotation=(90, 0, 90), pivot=(0, -4.0 + y, z + 0.4)),
        g.cube("tag", (-2, -1 + y, z + 0.6), rotation=(90, 0, 0), pivot=(0, y, z + 0.8)),
    ])
    return g


def key_textures(g):
    for name, M in [("room_key", GOLD), ("room_key_grey", GREY_METAL)]:
        def tag(c, p, rect, side, rng, part):
            x, y, w, h = rect
            c.rect(x, y, w, h, (226, 214, 180))
            if w > 6 and h > 6:
                c.rect(x + 1, y + h / 2, w - 2, 1, (140, 40, 30))
        tex = paint(g, {"tag": tag, "hook": mat(*DARK_METAL)}, default=mat(*M, edges=0.2), seed=1500 + len(name))
        save(tex, name)


def flesh_geo():
    g = Geo("geometry.zt.flesh_pile", 64, None, 1.5, 1, (0, 0.3, 0))
    for name, size in [("lump_a", (8, 3.5, 7)), ("lump_b", (6, 3, 6)), ("lump_c", (5, 2.5, 5)), ("bit", (2, 1.5, 2)), ("smear", (12, 0.2, 10))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("smear", "root", (0, 0, 0), cubes=[g.cube("smear", (-6, 0.02, -5))])
    g.bone("lump_a", "root", (0, 0, 0), cubes=[g.cube("lump_a", (-4, 0, -3.5), rotation=(0, 14, 6), pivot=(0, 0, 0)),
                                               g.cube("bit", (4, 0, 2))])
    g.bone("lump_b", "root", (0, 0, 0), cubes=[g.cube("lump_b", (1, 0, -4), rotation=(5, -20, 0), pivot=(4, 0, -1)),
                                               g.cube("bit", (-5, 0, 3))])
    g.bone("lump_c", "root", (0, 0, 0), cubes=[g.cube("lump_c", (-5, 0, 1), rotation=(0, 30, -8), pivot=(-2.5, 0, 3.5)),
                                               g.cube("bit", (2, 0, -5))])
    return g


def flesh_texture(g):
    def flesh(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *FLESH, contrast=1.4, grain=0.25)
        p.blotches(x, y, w, h, (40, 4, 8), threshold=0.6, alpha=0.6)
        for _ in range(int(w * h / 40)):
            c.px(x + rng.uniform(0, w), y + rng.uniform(0, h), (230, 130, 120))
        p.shade_edges(x, y, w, h, amount=0.3)

    def smear(c, p, rect, side, rng, part):
        x, y, w, h = rect
        if side != "top":
            return
        yy, xx = np.mgrid[0:int(h), 0:int(w)]
        d = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2))
        reg = c.a[int(y):int(y) + int(h), int(x):int(x) + int(w)]
        mask = d + p.n2[int(y):int(y) + int(h), int(x):int(x) + int(w)] * 0.5 < 0.95
        reg[mask] = (70, 6, 10, 255)
    tex = paint(g, {"smear": smear}, default=flesh, seed=1600)
    save(tex, "flesh_pile")


# =============================================================================================
# Doors: the elevator's sliding doors, the iron gates, door 100's grey door and wide gate,
# the elevator's folding gate
# =============================================================================================
def elevator_door_geo():
    g = Geo("geometry.zt.elevator_door", 128, None, 3, 3.5, (0, 1.5, 0))
    g.part("panel", 16, 48, 1)
    g.part("trim", 1, 48, 1.2)
    g.bone("root")
    g.bone("left", "root", (0, 0, 0), cubes=[g.cube("panel", (-16, 0, -0.5)), g.cube("trim", (-1, 0, -0.6))])
    g.bone("right", "root", (0, 0, 0), cubes=[g.cube("panel", (0, 0, -0.5), mirror=True), g.cube("trim", (0, 0, -0.6))])
    return g


def elevator_door_texture(g):
    def panel(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, (60, 44, 22), (104, 80, 40), (150, 118, 64), contrast=0.7, grain=0.06)
        if side in ("front", "back"):
            # art deco: brass rays fanning up from the bottom, a frame
            c.rect(x + S, y + S, w - 2 * S, S * 0.5, BRASS[2])
            c.rect(x + S, y + h - 1.5 * S, w - 2 * S, S * 0.5, BRASS[1])
            for k in range(5):
                fx = x + w * (0.2 + 0.15 * k)
                for t in range(int(h * 0.55)):
                    c.blend_px(fx + (k - 2) * t * 0.08, y + h - 2 * S - t, BRASS[2], 0.55)
            c.rect(x + w * 0.25, y + h * 0.18, w * 0.5, S * 2, (40, 30, 16))
        p.shade_edges(x, y, w, h, amount=0.25)
    tex = paint(g, {"trim": mat(*BRASS)}, default=panel, seed=1700)
    save(tex, "elevator_door")


def gate_geo():
    g = Geo("geometry.zt.gate_door", 128, None, 4, 4, (0, 1.5, 0))
    for name, size in [("stile", (2, 48, 2)), ("rail", (28, 2, 2)), ("bar", (1, 44, 1)), ("plate", (10, 5, 0.6)),
                       ("lock", (3.2, 3.2, 1.4)), ("shackle", (2.2, 2.2, 0.5)), ("spike", (1, 2, 1))]:
        g.part(name, *size)
    glyph_parts(g)
    g.bone("root")
    cubes = [g.cube("stile", (-16, 0, -1)), g.cube("stile", (14, 0, -1)),
             g.cube("rail", (-14, 0, -1)), g.cube("rail", (-14, 22, -1)), g.cube("rail", (-14, 46, -1))]
    for k in range(7):
        x = -12 + k * 4
        cubes.append(g.cube("bar", (x - 0.5, 2, -0.5)))
        cubes.append(g.cube("spike", (x - 0.5, 48, -0.5)))
    g.bone("hinge", "root", (16, 0, 0), cubes=cubes)
    g.bone("plate", "hinge", (0, 22, -1.3), cubes=[g.cube("plate", (-5, 20.5, -1.6))])
    glyph_bones(g, "plate", 21.5, -1.66)
    g.bone("padlock", "hinge", (-13.5, 27, -2), cubes=[g.cube("lock", (-15.1, 24.2, -3.0)), g.cube("shackle", (-14.6, 27.4, -2.55))])
    return g


def gate_texture(g):
    def iron(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *IRON, contrast=1.2, grain=0.15)
        p.blotches(x, y, w, h, RUST, threshold=0.62, alpha=0.6)
        p.shade_edges(x, y, w, h, amount=0.2)

    def plate(c, p, rect, side, rng, part):
        x, y, w, h = rect
        c.rect(x, y, w, h, (16, 16, 18))
        if side == "front":
            c.rect(x, y, w, 1, (60, 60, 64))
            c.rect(x, y + h - 1, w, 1, (60, 60, 64))
    tex = paint(g, {"plate": plate, "lock": mat((60, 62, 70), (110, 114, 124), (170, 176, 188)),
                    "shackle": mat((120, 124, 134), (176, 180, 190), (220, 224, 232))}, default=iron, seed=1800)
    paint_glyphs(tex, g, S, (240, 240, 236))
    save(tex, "gate_door")


def metal_door_geo():
    g = Geo("geometry.zt.metal_door", 128, None, 4, 4, (0, 1.5, 0))
    for name, size in [("leaf", (32, 48, 2)), ("sign", (22, 13, 0.4)), ("handle", (1.5, 6, 1.5)), ("window", (10, 6, 0.3))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("hinge", "root", (16, 0, 0), cubes=[g.cube("leaf", (-16, 0, -1)), g.cube("handle", (-14, 18, -2.5)),
                                               g.cube("window", (-5, 36, -1.2))])
    g.bone("sign", "hinge", (0, 24, -1.3), cubes=[g.cube("sign", (-11, 21, -1.5))])
    return g


def metal_door_texture(g):
    def leaf(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *GREY_METAL, contrast=0.8, grain=0.08)
        if side in ("front", "back"):
            for (rx, ry) in [(0.08, 0.05), (0.92, 0.05), (0.08, 0.95), (0.92, 0.95), (0.08, 0.5), (0.92, 0.5)]:
                c.rect(x + w * rx - 1, y + h * ry - 1, 2, 2, (70, 74, 80))
            c.rect(x, y + h - 3 * S, w, 3 * S, (196, 160, 40))
            for k in range(0, int(w), int(2 * S)):
                for t in range(int(3 * S)):
                    c.rect(x + k + t, y + h - 3 * S + t, S, 1, (24, 22, 20))
        p.blotches(x, y, w, h, (80, 70, 60), threshold=0.66, alpha=0.4)
        p.shade_edges(x, y, w, h, amount=0.3)

    def sign(c, p, rect, side, rng, part):
        x, y, w, h = rect
        if side != "front":
            c.rect(x, y, w, h, (196, 160, 40))
            return
        c.rect(x, y, w, h, (226, 186, 30))
        c.rect(x, y, w, S * 0.75, (20, 20, 20))
        c.rect(x, y + h - S * 0.75, w, S * 0.75, (20, 20, 20))
        k = 2
        text_px(c, x + 4, y + 5, "WARNING", (20, 20, 20), k)
        text_px(c, x + 4, y + 20, "HIGH", (20, 20, 20), k)
        text_px(c, x + 4, y + 33, "VOLTAGE", (20, 20, 20), k)
        # a lightning bolt
        bx = x + w - 18
        for t in range(16):
            c.rect(bx + 6 - t * 0.35 + (4 if t > 7 else 0), y + 16 + t, 4, 1, (20, 20, 20))
    tex = paint(g, {"sign": sign, "handle": mat(*DARK_METAL), "window": flat((20, 26, 30))}, default=leaf, seed=1900)
    save(tex, "metal_door")


def big_gate_geo():
    g = Geo("geometry.zt.big_gate", 256, None, 7, 5, (0, 2, 0))
    g.part("panel", 48, 64, 2)
    g.part("rib", 48, 1.5, 2.6)
    g.bone("root")
    for name, x0, m in (("left", -48, False), ("right", 0, True)):
        g.bone(name, "root", (0, 0, 0), cubes=[g.cube("panel", (x0, 0, -1), mirror=m)] +
               [g.cube("rib", (x0, y, -1.3), mirror=m) for y in (8, 24, 40, 56)])
    return g


def big_gate_texture(g):
    def panel(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, (62, 66, 70), (96, 102, 108), (132, 138, 146), contrast=0.9, grain=0.1)
        if side in ("front", "back") and h > 100:
            # corrugation, hazard stripes along the foot
            for k in range(int(x), int(x + w), int(S * 2)):
                c.rect(k, y, S * 0.5, h, (70, 74, 80))
            c.rect(x, y + h - 5 * S, w, 5 * S, (210, 170, 30))
            for k in range(0, int(w) + int(5 * S), int(3 * S)):
                for t in range(int(5 * S)):
                    c.rect(x + k - t, y + h - 5 * S + t, 1.5 * S, 1, (24, 22, 20))
            p.blotches(x, y, w, h, (90, 70, 50), threshold=0.68, alpha=0.4)
        p.shade_edges(x, y, w, h, amount=0.25)
    tex = paint(g, {"rib": mat(*GREY_METAL)}, default=panel, seed=2000)
    save(tex, "big_gate")


def elevator_gate_geo():
    g = Geo("geometry.zt.elevator_gate", 128, None, 4.5, 3.5, (0, 1.5, 0))
    for name, size in [("bar", (1, 46, 1)), ("rail", (32, 1.5, 1.5)), ("lattice", (0.6, 9, 0.6)), ("handle", (1, 5, 2))]:
        g.part(name, *size)
    g.bone("root")
    for name, x0, sgn in (("left", -32, 1), ("right", 0, -1)):
        cubes = [g.cube("rail", (x0, 0, -0.75)), g.cube("rail", (x0, 46.5, -0.75)), g.cube("rail", (x0, 23, -0.75))]
        for k in range(9):
            bx = x0 + 0.5 + k * 3.9
            cubes.append(g.cube("bar", (bx - 0.5, 1, -0.5)))
            if k < 8:
                for j, y in enumerate((5, 14, 28, 37)):
                    a = 24 if (k + j) % 2 == 0 else -24
                    cubes.append(g.cube("lattice", (bx + 1.65, y, -0.3), rotation=(0, 0, a), pivot=(bx + 1.95, y + 4.5, 0)))
        cubes.append(g.cube("handle", (x0 + (31 if sgn > 0 else 0), 20, -1.8)))
        g.bone(name, "root", ((x0 if sgn > 0 else x0 + 32), 0, 0), cubes=cubes)
    return g


def elevator_gate_texture(g):
    tex = paint(g, {"handle": mat(*BRASS)}, default=mat((20, 18, 14), (46, 40, 30), (84, 72, 52), edges=0.1), seed=2100)
    save(tex, "elevator_gate")


# =============================================================================================
# Door 100: the lever, the breaker box and its switches, the live wire
# =============================================================================================
def wall_lever_geo():
    g = Geo("geometry.zt.wall_lever", 64, None, 1, 1.5, (0, 0.8, 0))
    for name, size in [("base", (6, 10, 2)), ("stick", (1.4, 7, 1.4)), ("grip", (2.6, 2.6, 2.6)), ("slot", (1.6, 7, 0.3))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("base", "root", (0, 0, 0), cubes=[g.cube("base", (-3, -5, 0)), g.cube("slot", (-0.8, -3.5, -0.3))])
    # the handle points up and a little out from the wall (positive x rotation tips it forward, -z); pulling it
    # swings it down
    g.bone("handle", "root", (0, 0, -0.5), cubes=[g.cube("stick", (-0.7, 0, -1.2), rotation=(30, 0, 0), pivot=(0, 0, -0.5)),
                                                  g.cube("grip", (-1.3, 5.5, -1.8), rotation=(30, 0, 0), pivot=(0, 0, -0.5))])
    return g


def wall_lever_texture(g):
    tex = paint(g, {"grip": mat((120, 14, 14), (180, 30, 26), (230, 70, 60)), "slot": flat((14, 14, 16)),
                    "stick": mat(*GREY_METAL)}, default=mat(*DARK_METAL), seed=2200)
    save(tex, "wall_lever")


NUM_X = [-14.4 + c * 7.2 for c in range(5)]
BIG = (3.0, 5.0, 0.05)      # the screen's digits: a 3 x 5 grid of 1 x 1 cells
QMARK = ["111", "001", "010", "000", "010"]


def breaker_box_geo():
    g = Geo("geometry.zt.breaker_box", 256, None, 3, 3, (0, 1.3, 0))
    for name, size in [("body", (40, 40, 6)), ("door", (40, 40, 1)), ("screen", (34, 10, 0.3)), ("led", (2, 2, 0.4)),
                       ("sq_side", (6, 0.6, 0.2)), ("sq_post", (0.6, 6, 0.2)), ("sq_fill", (4.4, 4.4, 0.2)), ("conduit", (4, 20, 4)),
                       ("sw_plate", (3, 5, 0.6)), ("sw_stick", (1.1, 1.1, 3.4)), ("sw_tip", (1.6, 1.6, 1.6))]:
        g.part(name, *size)
    for n in list(range(10)) + ["q"]:
        g.part("big%s" % n, *BIG)
    g.bone("root")
    g.bone("body", "root", (0, 0, 0), cubes=[g.cube("body", (-20, 0, -3.12)), g.cube("conduit", (-2, 40, -1))])
    g.bone("screen_on", "body", (0, 0, 0), cubes=[g.cube("screen", (-17, 27, -3.42))])
    # the screen: a number (1-10, or ??) and a square, full or empty
    z = -3.5
    for n in range(1, 11):
        digits = str(n)
        x = -11 if len(digits) == 1 else -13
        g.bone("num_%d" % n, "body", (0, 30, z), cubes=[g.cube("big" + ch, (x + k * 4, 29.5, z)) for k, ch in enumerate(digits)])
    g.bone("num_q", "body", (0, 30, z), cubes=[g.cube("bigq", (-13, 29.5, z)), g.cube("bigq", (-9, 29.5, z))])
    g.bone("square", "body", (6, 30, z), cubes=[g.cube("sq_side", (3, 29, z)), g.cube("sq_side", (3, 34.4, z)),
                                                g.cube("sq_post", (3, 29, z)), g.cube("sq_post", (8.4, 29, z))])
    g.bone("square_fill", "body", (6, 30, z), cubes=[g.cube("sq_fill", (3.8, 29.8, z + 0.05))])
    g.bone("ok_light", "body", (15, 38, z), cubes=[g.cube("led", (14, 37, z))])
    g.bone("door", "root", (-20, 0, -3.5), cubes=[g.cube("door", (-20, 0, -4.12))])
    # the switches put into the slots (tipped down, off), shown until the real switches take over
    for n in range(1, 11):
        row, col = divmod(n - 1, 5)
        x, y = NUM_X[col], 16 if row == 0 else 8
        g.bone("sw_%d" % n, "body", (x, y, -3.12), cubes=[
            g.cube("sw_plate", (x - 1.5, y - 2.5, -3.72)),
            g.cube("sw_stick", (x - 0.55, y - 0.55, -7.12), rotation=(35, 0, 0), pivot=(x, y, -3.72)),
            g.cube("sw_tip", (x - 0.8, y - 0.8, -8.4), rotation=(35, 0, 0), pivot=(x, y, -3.72))])
    return g


def breaker_box_texture(g):
    def body(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *GREY_METAL, contrast=0.7, grain=0.06)
        if side == "front" and part == "body":
            # ten slots where the switches go, in two rows of five, numbered under each
            for k in range(10):
                row, col = divmod(k, 5)
                cx = x + (NUM_X[col] + 20) * S
                cy = y + (40 - (16 if row == 0 else 8)) * S
                c.rect(cx - 1.5 * S, cy - 2.5 * S, 3 * S, 5 * S, (14, 14, 16))
                c.rect(cx - 1.5 * S, cy - 2.5 * S, 3 * S, 0.5 * S, (60, 62, 66))
                text_px(c, cx - (2 if k < 9 else 6), cy + 2.7 * S, str(k + 1), (20, 20, 22), 1)
            # the black screen's bezel
            c.rect(x + 2.5 * S, y + 2.5 * S, 35 * S, 11 * S, (30, 30, 34))
            text_px(c, x + 3 * S, y + 15 * S, "BREAKER", (40, 40, 44), 1)
        p.shade_edges(x, y, w, h, amount=0.25)

    def door(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *GREY_METAL, contrast=0.7, grain=0.06)
        if side == "front":
            c.rect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.25, (196, 160, 40))
            text_px(c, x + w * 0.24, y + h * 0.25, "DANGER", (20, 20, 20), 2)
            c.rect(x + w - 3 * S, y + h * 0.45, S, 4 * S, (40, 40, 44))
        p.shade_edges(x, y, w, h, amount=0.35)

    ink = (240, 240, 236, 10)

    def big(c, p, rect, side, rng, part):
        x, y, w, h = rect
        if side != "front":
            return
        rows = QMARK if part == "bigq" else DIGITS[part[3:]]
        for gy, row in enumerate(rows):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.rect(x + gx * w / 3, y + gy * h / 5, w / 3, h / 5, ink)
    painters = {"door": door, "screen": flat((6, 8, 10)), "led": flat((60, 230, 80, 40)), "sq_side": flat(ink),
                "sq_post": flat(ink), "sq_fill": flat(ink), "conduit": mat(*DARK_METAL), "sw_plate": mat(*DARK_METAL),
                "sw_stick": mat(*GREY_METAL), "sw_tip": mat((150, 16, 14), (200, 34, 28), (240, 90, 80))}
    painters.update({"big%s" % n: big for n in list(range(10)) + ["q"]})
    tex = paint(g, painters, default=body, seed=2300)
    save(tex, "breaker_box")


def breaker_lever_geo():
    g = Geo("geometry.zt.breaker_lever", 32, None, 1, 1, (0, 0.2, 0))
    for name, size in [("plate", (3, 5, 0.6)), ("stick", (1.1, 1.1, 3.4)), ("tip", (1.6, 1.6, 1.6))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("plate", "root", (0, 0, 0), cubes=[g.cube("plate", (-1.5, -2.5, -0.3))])
    g.bone("handle", "root", (0, 0, -0.3), cubes=[g.cube("stick", (-0.55, -0.55, -3.7)), g.cube("tip", (-0.8, -0.8, -5.0))])
    return g


def switch_pickup_geo():
    g = Geo("geometry.zt.switch_pickup", 32, None, 1, 1, (0, 0.2, 0))
    for name, size in [("plate", (3, 5, 0.6)), ("stick", (1.1, 1.1, 3.4)), ("tip", (1.6, 1.6, 1.6))]:
        g.part(name, *size)
    g.bone("root")
    # lying on the shelf: the plate flat, the handle up
    g.bone("switch", "root", (0, 0, 0), rotation=(-90, 0, 0), cubes=[
        g.cube("plate", (-1.5, -2.5, -0.6)), g.cube("stick", (-0.55, -0.55, -4.0)), g.cube("tip", (-0.8, -0.8, -5.3))])
    return g


def breaker_lever_texture(g):
    tex = paint(g, {"tip": mat((150, 16, 14), (200, 34, 28), (240, 90, 80)), "stick": mat(*GREY_METAL)}, default=mat(*DARK_METAL),
                seed=2400)
    save(tex, "breaker_lever")


def live_wire_geo():
    g = Geo("geometry.zt.live_wire", 64, None, 2, 6, (0, 2.5, 0))
    for name, size in [("cable", (1, 21, 1)), ("strand", (0.3, 2, 0.3)), ("cap", (1.6, 1.6, 1.6))]:
        g.part(name, *size)
    g.bone("root")
    # from the pipe above down to the floor in four lengths, sagging, the end frayed and sparking
    g.bone("c0", "root", (0, 80, 0), cubes=[g.cube("cable", (-0.5, 59, -0.5)), g.cube("cap", (-0.8, 78.6, -0.8))])
    g.bone("c1", "c0", (0, 59.5, 0), rotation=(0, 0, 8), cubes=[g.cube("cable", (-0.5, 39, -0.5))])
    g.bone("c2", "c1", (0, 39.5, 0), rotation=(0, 0, 10), cubes=[g.cube("cable", (-0.5, 19, -0.5))])
    g.bone("c3", "c2", (0, 19.5, 0), rotation=(0, 0, 18), cubes=[g.cube("cable", (-0.5, -1, -0.5))] +
           [g.cube("strand", (-0.5 + k * 0.3, -2.6, -0.2 + (k % 2) * 0.4), rotation=(k * 12 - 18, 0, k * 15 - 20), pivot=(0, -1, 0))
            for k in range(4)])
    return g


def live_wire_texture(g):
    tex = paint(g, {"strand": mat((140, 70, 30), (200, 110, 50), (250, 170, 90)), "cap": mat(*DARK_METAL)},
                default=mat((14, 14, 16), (28, 28, 32), (50, 50, 56), edges=0.1), seed=2500)
    save(tex, "live_wire")


# =============================================================================================
# The Infirmary's herb, the Courtyard's angel
# =============================================================================================
def herb_geo():
    g = Geo("geometry.zt.herb_plant", 64, None, 1, 1.2, (0, 0.5, 0))
    for name, size in [("pot", (6, 5, 6)), ("rim", (7, 1, 7)), ("soil", (5, 0.2, 5)), ("leaf", (7, 9, 0.1)), ("bud", (2, 2, 2))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("pot", "root", (0, 0, 0), cubes=[g.cube("pot", (-3, 0, -3)), g.cube("rim", (-3.5, 4.5, -3.5)), g.cube("soil", (-2.5, 5, -2.5))])
    leaves = []
    for k in range(4):
        leaves.append(g.cube("leaf", (-3.5, 5, -0.05), rotation=(0, k * 45, 0), pivot=(0, 5, 0)))
    g.bone("leaves", "pot", (0, 5, 0), cubes=leaves)
    g.bone("bud", "leaves", (0, 13, 0), cubes=[g.cube("bud", (-1, 13, -1))])
    return g


def herb_texture(g):
    def leaf(c, p, rect, side, rng, part):
        x, y, w, h = rect
        if side not in ("front", "back"):
            return
        # a sprig of bright green leaves (the bud on top glows)
        cx = x + w / 2
        for t in range(int(h)):
            c.px(cx, y + t, (60, 160, 70))
        for k in range(4):
            ly = y + h * (0.15 + 0.2 * k)
            for dx in range(1, int(w / 2)):
                hh = max(1, int((w / 2 - dx) / 2.5))
                for s in (-1, 1):
                    for dy in range(-hh, hh + 1):
                        c.px(cx + s * dx, ly + dy + dx * 0.3, (80, 220, 110) if (dx + dy) % 3 else (150, 255, 170))
    tex = paint(g, {"leaf": leaf, "bud": flat((210, 255, 200, 14)), "soil": flat((40, 28, 18)),
                    "pot": mat((110, 56, 36), (150, 80, 52), (186, 110, 76)), "rim": mat((110, 56, 36), (150, 80, 52), (186, 110, 76))},
                seed=2600)
    save(tex, "herb_plant")


def angel_geo():
    g = Geo("geometry.zt.angel_statue", 128, None, 3, 4, (0, 1.5, 0))
    for name, size in [("plinth", (14, 4, 14)), ("robe", (10, 18, 7)), ("torso", (8, 9, 5)), ("head", (5, 5.5, 5)), ("hair", (5.6, 3, 5.6)),
                       ("arm", (2, 9, 2)), ("hands", (3, 3, 2)), ("wing", (2, 24, 12)), ("feather", (1.5, 12, 6))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("plinth", "root", (0, 0, 0), cubes=[g.cube("plinth", (-7, 0, -7))])
    g.bone("body", "plinth", (0, 4, 0), cubes=[g.cube("robe", (-5, 4, -3.5)), g.cube("torso", (-4, 22, -2.5))])
    g.bone("head", "body", (0, 31, 0), rotation=(14, 0, 0), cubes=[g.cube("head", (-2.5, 31, -2.5)), g.cube("hair", (-2.8, 34, -2.6))])
    g.bone("arms", "body", (0, 29, -1), cubes=[g.cube("arm", (-4.5, 21, -3.5), rotation=(-50, 0, 18), pivot=(-3.5, 29, -2.5)),
                                               g.cube("arm", (2.5, 21, -3.5), rotation=(-50, 0, -18), pivot=(3.5, 29, -2.5)),
                                               g.cube("hands", (-1.5, 24, -7.5))])
    for side, sgn in (("wing_r", -1), ("wing_l", 1)):
        g.bone(side, "body", (sgn * 2, 28, 2), rotation=(-12, sgn * -32, sgn * 14), cubes=[
            g.cube("wing", (sgn * 2 - 1, 8, 2)), g.cube("feather", (sgn * 2 - 0.75, 4, 6))])
    return g


def angel_texture(g):
    def stone(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *STONE, contrast=1.1, grain=0.2)
        p.blotches(x, y, w, h, (70, 96, 52), threshold=0.66, alpha=0.6)   # moss
        p.blotches(x, y, w, h, (60, 60, 58), threshold=0.7, field=p.n1, alpha=0.5)
        if part in ("wing", "feather") and side in ("left", "right", "front", "back"):
            for k in range(0, int(h), int(S * 2)):
                c.rect(x, y + k, w, 1, (90, 90, 86))
        p.shade_edges(x, y, w, h, amount=0.3)
    tex = paint(g, {}, default=stone, seed=2700)
    save(tex, "angel_statue")


# =============================================================================================
# Jeff's shop: Jeff, El Goblino, Bob, the goods
# =============================================================================================
NAVY = ((4, 6, 22), (10, 16, 46), (22, 34, 82))
BLUE_GLOW = (110, 190, 255, 12)


def jeff_geo():
    g = Geo("geometry.zt.jeff", 128, None, 3, 4, (0, 1.4, 0))
    for name, size in [("body", (16, 18, 13)), ("hump", (12, 8, 10)), ("brow", (14, 3, 4)), ("eye", (4.5, 3.2, 0.6)),
                       ("pupil", (1.2, 1.6, 0.3)), ("tent", (3, 9, 3)), ("tent2", (2.4, 9, 2.4)), ("tent3", (1.8, 8, 1.8))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("body", "root", (0, 14, 0), cubes=[g.cube("body", (-8, 14, -6.5)), g.cube("hump", (-6, 30, -4)),
                                              g.cube("brow", (-7, 28, -8))])
    g.bone("eyes", "body", (0, 26, -7), cubes=[g.cube("eye", (-6, 25, -7.3)), g.cube("eye", (1.5, 25, -7.3))])
    g.bone("pupils", "eyes", (0, 26, -7.6), cubes=[g.cube("pupil", (-4.4, 25.8, -7.6)), g.cube("pupil", (3.1, 25.8, -7.6))])
    # six tentacles hanging from under the body, curling on the floor
    for k in range(6):
        a = math.radians(k * 60 + 30)
        x, z = math.sin(a) * 5.5, math.cos(a) * 4.5
        g.bone("t%d_0" % k, "body", (x, 15, z), rotation=(10 * math.cos(a), 0, -12 * math.sin(a)),
               cubes=[g.cube("tent", (x - 1.5, 6, z - 1.5))])
        g.bone("t%d_1" % k, "t%d_0" % k, (x, 6.5, z), rotation=(14 * math.cos(a), 0, -16 * math.sin(a)),
               cubes=[g.cube("tent2", (x - 1.2, -2.5, z - 1.2))])
        g.bone("t%d_2" % k, "t%d_1" % k, (x, -2, z), rotation=(-50 * math.cos(a), 0, 40 * math.sin(a)),
               cubes=[g.cube("tent3", (x - 0.9, -9.5, z - 0.9))])
    return g


def jeff_texture(g):
    def skin(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *NAVY, contrast=1.2, grain=0.12)
        p.blotches(x, y, w, h, (30, 50, 110), threshold=0.66, alpha=0.5)
        if part.startswith("tent") and side in ("front", "back", "left", "right"):
            for k in range(int(y + 2), int(y + h), int(S * 1.5)):
                c.rect(x + w * 0.3, k, w * 0.4, 1, (34, 52, 110))   # suckers
        p.shade_edges(x, y, w, h, amount=0.35)
    tex = paint(g, {"eye": flat(BLUE_GLOW), "pupil": flat((230, 250, 255, 8))}, default=skin, seed=2800)
    save(tex, "jeff")


GOBLIN = ((120, 18, 16), (176, 36, 30), (220, 76, 62))


def goblino_geo():
    g = Geo("geometry.zt.el_goblino", 128, None, 1.5, 1.5, (0, 0.6, 0))
    for name, size in [("head", (8, 7, 7)), ("eye", (2.4, 2.4, 0.5)), ("pupil", (1, 1.2, 0.3)), ("nose", (2, 2, 3)), ("ear", (4.5, 3, 1)),
                       ("ring", (1, 1, 0.6)), ("fang", (0.6, 1.2, 0.4)), ("body", (6, 6, 4)), ("shorts", (6.4, 3, 4.4)),
                       ("arm", (2, 5, 2)), ("band", (2.6, 1.4, 2.6)), ("spike", (0.6, 0.6, 1.2)), ("leg", (2, 4, 2)), ("tail", (1, 1, 4))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("body", "root", (0, 4, 0), cubes=[g.cube("body", (-3, 4, -2)), g.cube("shorts", (-3.2, 3, -2.2)),
                                             g.cube("tail", (-0.5, 4.5, 1.8), rotation=(-30, 0, 0), pivot=(0, 5, 2))])
    g.bone("head", "body", (0, 10, 0), cubes=[g.cube("head", (-4, 10, -4)), g.cube("nose", (-1, 11.5, -6.5), rotation=(20, 0, 0), pivot=(0, 12.5, -4)),
                                              g.cube("fang", (-1.6, 10.2, -4.3)), g.cube("fang", (1.0, 10.2, -4.3))])
    g.bone("eyes", "head", (0, 14, -4), cubes=[g.cube("eye", (-3.5, 13.5, -4.3)), g.cube("eye", (1.1, 13.5, -4.3)),
                                               g.cube("pupil", (-2.7, 14.1, -4.6)), g.cube("pupil", (1.9, 14.1, -4.6))])
    g.bone("ear_r", "head", (-4, 14, 0), rotation=(0, 20, 18), cubes=[g.cube("ear", (-8.5, 13, -0.5))])
    g.bone("ear_l", "head", (4, 14, 0), rotation=(0, -20, -18), cubes=[g.cube("ear", (4, 13, -0.5), mirror=True),
                                                                        g.cube("ring", (7.5, 12.2, -0.3))])
    for side, x, sgn in (("arm_r", -4, -1), ("arm_l", 4, 1)):
        g.bone(side, "body", (x, 9.5, 0), rotation=(-10, 0, sgn * 10), cubes=[
            g.cube("arm", (x - 1, 4.5, -1)), g.cube("band", (x - 1.3, 4.6, -1.3)),
            g.cube("spike", (x - 0.3 + sgn * 1.3, 5.0, -0.3)), g.cube("spike", (x - 0.3, 5.0, -1.9))])
    for side, x in (("leg_r", -1.6), ("leg_l", 1.6)):
        g.bone(side, "body", (x, 4, 0), cubes=[g.cube("leg", (x - 1, 0, -1))])
    return g


def goblino_texture(g):
    def skin(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *GOBLIN, contrast=1.0, grain=0.12)
        if part == "head" and side == "front":
            # a wide toothy grin
            c.rect(x + w * 0.2, y + h * 0.75, w * 0.6, S * 0.6, (50, 6, 6))
        p.shade_edges(x, y, w, h, amount=0.3)

    def shorts(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, (60, 38, 20), (92, 60, 32), (122, 86, 50), contrast=1.0)
        # ripped hems
        for k in range(int(x), int(x + w)):
            if rng.random() < 0.4:
                c.rect(k, y + h - S * rng.uniform(0.2, 1.2), 1, S, CLEAR)
        p.shade_edges(x, y, w, h, amount=0.25)
    tex = paint(g, {"eye": flat((250, 214, 40)), "pupil": flat((10, 8, 6)), "ring": mat(*GOLD), "fang": flat((240, 236, 220)),
                    "shorts": shorts, "band": mat(*DARK_METAL), "spike": mat(*GREY_METAL)}, default=skin, seed=2900)
    save(tex, "el_goblino")


def bob_geo():
    g = Geo("geometry.zt.bob", 128, None, 1.5, 2, (0, 0.8, 0))
    for name, size in [("seat", (12, 2, 12)), ("chair_leg", (1.5, 7, 1.5)), ("chair_back", (12, 14, 1.5)), ("skull", (5.5, 5.5, 5.5)),
                       ("jaw", (4, 1.5, 3.5)), ("spine", (1.5, 10, 1.5)), ("rib", (7, 0.8, 4)), ("pelvis", (6, 2.5, 3.5)),
                       ("bone", (1.4, 7, 1.4)), ("hand", (2, 1, 2.5))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("chair", "root", (0, 0, 0), cubes=[
        g.cube("seat", (-6, 7, -6)), g.cube("chair_back", (-6, 9, 4.5)),
        g.cube("chair_leg", (-6, 0, -6)), g.cube("chair_leg", (4.5, 0, -6)), g.cube("chair_leg", (-6, 0, 4.5)), g.cube("chair_leg", (4.5, 0, 4.5))])
    ribs = [g.cube("rib", (-3.5, 13 + k * 1.8, -1.5)) for k in range(4)]
    g.bone("torso", "chair", (0, 9, 1), rotation=(-12, 0, 6), cubes=[g.cube("pelvis", (-3, 9, -1)), g.cube("spine", (-0.75, 11, 1))] + ribs)
    g.bone("skull", "torso", (0, 21, 1), rotation=(28, 14, 12), cubes=[g.cube("skull", (-2.75, 21, -1.5)), g.cube("jaw", (-2, 20, -2.5),
                                                                                                                    rotation=(18, 0, 0), pivot=(0, 21, 0))])
    for side, x, sgn in (("arm_r", -3.8, -1), ("arm_l", 3.8, 1)):
        g.bone(side, "torso", (x, 19, 0.5), rotation=(-8, 0, sgn * 8), cubes=[g.cube("bone", (x - 0.7, 12, -0.2)),
                                                                              g.cube("hand", (x - 1, 11, -1.5))])
    for side, x in (("leg_r", -1.7), ("leg_l", 1.7)):
        g.bone(side, "chair", (x, 10, 0), rotation=(-88, 0, 0), cubes=[g.cube("bone", (x - 0.7, 3, -0.7))])
        g.bone(side + "_shin", side, (x, 3.5, 0), rotation=(88, 0, 0), cubes=[g.cube("bone", (x - 0.7, -3.5, -0.7))])
    return g


def bob_texture(g):
    def bone(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *BONE, contrast=1.0, grain=0.15)
        if part == "skull" and side == "front":
            for ex in (0.2, 0.58):
                c.rect(x + w * ex, y + h * 0.35, w * 0.22, h * 0.22, (24, 18, 16))
            c.rect(x + w * 0.45, y + h * 0.65, w * 0.1, h * 0.12, (40, 30, 26))
        p.shade_edges(x, y, w, h, amount=0.25)

    def chair(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *WOOD, contrast=1.0, grain=0.12)
        wood_grain(c, rng, rect)
        p.shade_edges(x, y, w, h, amount=0.3)
    tex = paint(g, {"seat": chair, "chair_leg": chair, "chair_back": chair}, default=bone, seed=3000)
    save(tex, "bob")


def display_geo():
    g = Geo("geometry.zt.shop_display", 64, None, 1.5, 1, (0, 0.3, 0))
    for name, size in [("cloth", (16, 0.4, 10)), ("lighter", (2, 3, 1.2)), ("light_tube", (2, 2, 6)), ("light_head", (2.6, 2.6, 1.5)),
                       ("key_shaft", (5, 0.6, 1)), ("key_bow", (2.4, 0.6, 2.4)), ("cross_v", (1, 5, 0.6)), ("cross_h", (3.4, 1, 0.6)),
                       ("tag", (2, 0.2, 1.2))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("goods", "root", (0, 0, 0), cubes=[
        g.cube("cloth", (-8, 0, -5)),
        g.cube("lighter", (-6.5, 0.4, -1)), g.cube("tag", (-7, 0.4, -3.5)),
        g.cube("light_tube", (-3, 0.4, -3), rotation=(0, 20, 0), pivot=(-2, 0, 0)), g.cube("light_head", (-3.3, 0.2, -4.5),
                                                                                                rotation=(0, 20, 0), pivot=(-2, 0, 0)),
        g.cube("tag", (-2.5, 0.4, 2.8)),
        g.cube("key_shaft", (1.5, 0.4, -0.5)), g.cube("key_bow", (0, 0.4, -1.2)), g.cube("tag", (1.5, 0.4, 2.5)),
        g.cube("cross_v", (5.5, 0.4, -0.3)), g.cube("cross_h", (4.3, 2.8, -0.3)), g.cube("tag", (5, 0.4, 2.5)),
    ])
    return g


def display_texture(g):
    tex = paint(g, {"cloth": mat((60, 10, 14), (96, 20, 26), (128, 36, 40), edges=0.15), "lighter": mat((150, 20, 20), (190, 40, 36), (230, 90, 80)),
                    "light_tube": mat(*DARK_METAL), "light_head": mat(*GREY_METAL), "key_shaft": mat(*BONE), "key_bow": mat(*BONE),
                    "cross_v": mat(*GOLD), "cross_h": mat(*GOLD), "tag": flat((236, 230, 210))}, seed=3100)
    save(tex, "shop_display")


# =============================================================================================
# Rush and Screech
# =============================================================================================
SMOKE = ((4, 4, 6), (18, 18, 22), (44, 44, 50))


def rush_geo():
    g = Geo("geometry.zt.rush", 256, None, 5, 5, (0, 1.5, 0))
    for name, size in [("cloud", (30, 30, 12)), ("puff", (14, 14, 10)), ("puff_s", (9, 9, 8)), ("eye", (8, 9, 0.6)), ("pupil", (2.4, 3, 0.4)),
                       ("mouth", (22, 8, 0.6)), ("tooth", (1.6, 2.4, 0.4))]:
        g.part(name, *size)
    g.bone("root")
    cloud = [g.cube("cloud", (-15, 2, -6))]
    rng = np.random.default_rng(7)
    for k in range(9):
        a = k * 40 + rng.uniform(-10, 10)
        r = 13 + rng.uniform(-2, 2)
        x, y = math.cos(math.radians(a)) * r, 17 + math.sin(math.radians(a)) * r
        part = "puff" if k % 2 == 0 else "puff_s"
        s = 14 if part == "puff" else 9
        cloud.append(g.cube(part, (x - s / 2, y - s / 2, -5 + rng.uniform(-1, 3))))
    g.bone("cloud", "root", (0, 17, 0), cubes=cloud)
    g.bone("face", "cloud", (0, 17, -6.4), cubes=[
        g.cube("eye", (-11, 18, -6.6)), g.cube("eye", (3, 18, -6.6)),
        g.cube("mouth", (-11, 6, -6.6))] + [g.cube("tooth", (-10 + k * 2.1, 9.2 if k % 2 else 6.6, -6.9)) for k in range(10)])
    g.bone("pupils", "face", (0, 22, -7), cubes=[g.cube("pupil", (-8.2, 21, -7.0)), g.cube("pupil", (5.8, 21, -7.0))])
    return g


def rush_texture(g):
    def smoke(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *SMOKE, contrast=1.5, grain=0.25)
        p.blotches(x, y, w, h, (70, 70, 78), threshold=0.7, alpha=0.5)
        p.shade_edges(x, y, w, h, amount=0.4)

    def eye(c, p, rect, side, rng, part):
        x, y, w, h = rect
        yy, xx = np.mgrid[0:int(h), 0:int(w)]
        d = np.hypot((xx + 0.5 - w / 2) / (w / 2), (yy + 0.5 - h / 2) / (h / 2))
        reg = c.a[int(y):int(y) + int(h), int(x):int(x) + int(w)]
        reg[:] = SMOKE[0] + (255,)
        reg[d <= 1.0] = (236, 234, 226, 20)
        reg[(d > 0.86) & (d <= 1.0)] = (10, 10, 12, 255)

    def mouth(c, p, rect, side, rng, part):
        x, y, w, h = rect
        c.rect(x, y, w, h, (6, 2, 4))
        c.rect(x, y + h * 0.45, w, 1, (60, 10, 14))
    tex = paint(g, {"eye": eye, "pupil": flat((4, 4, 6)), "mouth": mouth, "tooth": flat((234, 228, 210, 24))}, default=smoke, seed=3200)
    save(tex, "rush")


PINK = ((170, 110, 112), (212, 152, 150), (236, 192, 186))


def screech_geo():
    g = Geo("geometry.zt.screech", 128, None, 2, 2, (0, 0.8, 0))
    for name, size in [("body", (10, 10, 10)), ("bulge", (12, 6, 8)), ("eye", (2.4, 2.4, 0.4)), ("mouth", (6, 6, 0.4)), ("jaw", (6, 2, 2)),
                       ("tooth", (0.8, 1.2, 0.3)), ("tent", (1.6, 6, 1.6)), ("tent2", (1.2, 6, 1.2))]:
        g.part(name, *size)
    g.bone("root")
    g.bone("body", "root", (0, 8, 0), cubes=[g.cube("body", (-5, 3, -5)), g.cube("bulge", (-6, 5, -4))])
    g.bone("face", "body", (0, 8, -5.2), cubes=[g.cube("eye", (-3.6, 9.5, -5.3)), g.cube("eye", (1.2, 9.5, -5.3)), g.cube("mouth", (-3, 3.8, -5.3))] +
           [g.cube("tooth", (-2.6 + k * 1.05, 8.2, -5.5)) for k in range(5)] + [g.cube("tooth", (-2.6 + k * 1.05, 3.9, -5.5)) for k in range(5)])
    g.bone("jaw", "face", (0, 4, -5), cubes=[g.cube("jaw", (-3, 2.2, -6))])
    for k in range(6):
        a = math.radians(k * 60)
        x, z = math.sin(a) * 4, math.cos(a) * 4
        g.bone("t%d" % k, "body", (x, 4, z), rotation=(25 * math.cos(a), 0, -25 * math.sin(a)), cubes=[g.cube("tent", (x - 0.8, -2, z - 0.8))])
        g.bone("t%d_b" % k, "t%d" % k, (x, -1.5, z), rotation=(30 * math.cos(a), 0, -30 * math.sin(a)),
               cubes=[g.cube("tent2", (x - 0.6, -7.5, z - 0.6))])
    return g


def screech_texture(g):
    def skin(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, *PINK, contrast=1.0, grain=0.15)
        p.blotches(x, y, w, h, (8, 8, 10), threshold=0.52, alpha=0.95)   # black goo over most of it
        p.shade_edges(x, y, w, h, amount=0.3)

    def tent(c, p, rect, side, rng, part):
        x, y, w, h = rect
        p.material(x, y, w, h, (6, 6, 8), (20, 20, 24), (50, 46, 50), contrast=1.2)
        p.blotches(x, y, w, h, PINK[1], threshold=0.72, alpha=0.7)

    def mouth(c, p, rect, side, rng, part):
        x, y, w, h = rect
        c.rect(x, y, w, h, (120, 20, 26))   # red gums
        c.rect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.4, (20, 4, 6))
    tex = paint(g, {"eye": flat((250, 250, 245, 10)), "tooth": flat((236, 230, 214)), "mouth": mouth, "jaw": flat((120, 20, 26)),
                    "tent": tent, "tent2": tent}, default=skin, seed=3300)
    save(tex, "screech")


# =============================================================================================
def main():
    for name, geo, painter in [
        ("wardrobe", wardrobe_geo(), wardrobe_textures), ("hotel_bed", bed_geo(), bed_textures), ("couch", couch_geo(), couch_textures),
        ("flesh_pile", flesh_geo(), flesh_texture), ("elevator_door", elevator_door_geo(), elevator_door_texture),
        ("gate_door", gate_geo(), gate_texture), ("metal_door", metal_door_geo(), metal_door_texture),
        ("big_gate", big_gate_geo(), big_gate_texture), ("elevator_gate", elevator_gate_geo(), elevator_gate_texture),
        ("wall_lever", wall_lever_geo(), wall_lever_texture), ("breaker_box", breaker_box_geo(), breaker_box_texture),
        ("breaker_lever", breaker_lever_geo(), breaker_lever_texture), ("live_wire", live_wire_geo(), live_wire_texture),
        ("herb_plant", herb_geo(), herb_texture), ("angel_statue", angel_geo(), angel_texture), ("jeff", jeff_geo(), jeff_texture),
        ("el_goblino", goblino_geo(), goblino_texture), ("bob", bob_geo(), bob_texture), ("shop_display", display_geo(), display_texture),
        ("rush", rush_geo(), rush_texture), ("screech", screech_geo(), screech_texture),
    ]:
        write_geo(name, geo)
        painter(geo)
    k = key_geo()
    write_geo("room_key", k)
    key_textures(k)
    write_geo("switch_pickup", switch_pickup_geo())
    drawer_textures()
    print("floor 1 art written")


if __name__ == "__main__":
    main()
