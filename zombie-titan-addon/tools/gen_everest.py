"""Generates Everest, the lance made from a Glowite Sword, a Shroomed Eye and a Spore Scroll: its
3D model held in the hand, its icon, its item and recipe; the portals of its Barrage and the
ball of its Supernova; the player's poses for its abilities; their particles; and names.

The lance is a steel shaft tapering to a glowing blue tip, a conical guard over its grip, three
rings of glowing runes turning round the guard and two glowing squares beside it, one with each
of the Hanzi of 珠峰 (Zhufeng, Mount Everest's name in Chinese). The glowing parts draw with an
additive material: black in their texture is see-through, colour glows.

    python3 tools/gen_everest.py      (after gen_crab_data.py: it adds to the same files)
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from geobuild import Geo, geometry_file  # noqa: E402
from texlib import Canvas, Painter, to_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
CLEAR = (0, 0, 0, 0)
S = 4                      # texels per model pixel
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
HANZI = ("珠", "峰")

STEEL_D, STEEL_M, STEEL_L, STEEL_H = (70, 78, 98), (140, 150, 170), (204, 212, 226), (244, 248, 255)
GRIP_D, GRIP_M, GRIP_L = (14, 22, 52), (28, 40, 86), (52, 70, 130)
GLOW_D, GLOW_M, GLOW_L, GLOW_W = (20, 90, 200), (60, 170, 255), (140, 225, 255), (235, 250, 255)


def out(root, *parts):
    p = os.path.join(root, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def dump(root, rel, data):
    with open(out(root, rel), "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def load(root, rel):
    with open(os.path.join(root, rel)) as f:
        return json.load(f)


# =============================================================================
# The lance: a pole along +Y (as the trident's is), held by its grip
# =============================================================================
SHAFT = [  # (width, y0, y1): the shaft tapering up from the guard
    (3.0, 7, 14), (2.5, 14, 21), (2.0, 21, 27), (1.5, 27, 31),
]
GUARD = [(6, 4), (5, 5), (4, 6)]   # (width, y): the conical guard over the grip
RING = 13                           # the rings' width (model pixels)
RING_Y = 5.5
TILTS = [(0, 0, 0), (62, 0, 0), (-62, 0, 35)]


def lance_geometry():
    g = Geo("geometry.zt.everest", 64, None, 3, 3, (0, 1, 0))
    g.part("pommel", 2, 2, 2)
    g.part("grip", 1.5, 7, 1.5)
    for w, _ in GUARD:
        g.part("guard%d" % w, w, 1, w)
    for i, (w, y0, y1) in enumerate(SHAFT):
        g.part("shaft%d" % i, w, y1 - y0, w)
    g.part("tip_base", 2, 2, 2)
    g.part("tip", 1, 5, 1)
    for k in range(3):
        g.part("ring%d" % k, RING, 0, RING)
    g.part("glyph0", 0, 6, 6)
    g.part("glyph1", 0, 6, 6)
    cubes = [g.cube("pommel", (-1, -5, -1)), g.cube("grip", (-0.75, -3, -0.75))]
    cubes += [g.cube("guard%d" % w, (-w / 2, y, -w / 2)) for w, y in GUARD]
    cubes += [g.cube("shaft%d" % i, (-w / 2, y0, -w / 2)) for i, (w, y0, y1) in enumerate(SHAFT)]
    g.bone("lance", pivot=(0, 24, 0), cubes=cubes)
    g.bones[-1]["binding"] = "q.item_slot_to_bone_name(c.item_slot)"
    g.bone("tip", "lance", (0, 31, 0), cubes=[g.cube("tip_base", (-1, 31, -1)), g.cube("tip", (-0.5, 33, -0.5))])
    # three rings of runes round the guard, each tilted its own way and turning about itself
    g.bone("rings", "lance", (0, RING_Y, 0))
    for k, tilt in enumerate(TILTS):
        g.bone("ring%d" % k, "rings", (0, RING_Y, 0), rotation=tilt)
        g.bone("ring%d_spin" % k, "ring%d" % k, (0, RING_Y, 0), cubes=[g.cube("ring%d" % k, (-RING / 2, RING_Y, -RING / 2))])
    # the two squares of Hanzi, either side of the guard
    g.bone("glyphs", "lance", (0, 5, 0), cubes=[g.cube("glyph0", (-8.5, 2, -3)), g.cube("glyph1", (8.5, 2, -3))])
    return g


def ring_texture(c, rect, k):
    """A ring of light round a band of runes (on black, which the additive material leaves out)."""
    x, y, w, h = (int(v) for v in rect)
    cx, cy = x + w / 2, y + h / 2
    r_out, r_in = w / 2 - 0.5, w / 2 - 0.5 - 2.6 * S
    rng = np.random.default_rng(9100 + k)
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
            if r_in - 0.6 <= d <= r_in + 0.6 or r_out - 1.2 <= d <= r_out:
                c.px(xx, yy, GLOW_L)                    # the band's rims
            elif r_in < d < r_out - 1.2:
                c.px(xx, yy, (6, 26, 60))               # a faint glow inside the band
    # runes round the band: little strokes, bars and dots
    n = 14
    for i in range(n):
        a = (i + 0.5) / n * math.tau
        rr = (r_in + r_out - 1.2) / 2
        px, py = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        kind = int(rng.integers(0, 4))
        tx, ty = -math.sin(a), math.cos(a)            # along the band
        nx, ny = math.cos(a), math.sin(a)             # across it
        def dot(u, v, col=GLOW_M):
            c.px(int(px + tx * u + nx * v), int(py + ty * u + ny * v), col)
        if kind == 0:
            for v in range(-3, 4):
                dot(0, v)
        elif kind == 1:
            for u in range(-2, 3):
                dot(u, -2)
                dot(u, 2)
        elif kind == 2:
            for v in range(-3, 4):
                dot(-1, v)
            for u in range(-1, 3):
                dot(u, 0)
        else:
            for t in range(-2, 3):
                dot(t, t)
                dot(t, -t)
        dot(0, 0, GLOW_W)


def glyph_texture(c, rect, char):
    """A glowing blue square with a Hanzi in it."""
    x, y, w, h = (int(v) for v in rect)
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            edge = min(xx - x, yy - y, x + w - 1 - xx, y + h - 1 - yy)
            c.px(xx, yy, GLOW_L if edge < 2 else (GLOW_D if edge < 3 else (8, 30, 70)))
    img = Image.new("L", (w * 4, h * 4), 0)
    font = ImageFont.truetype(FONT, int(h * 4 * 0.78), index=0)
    d = ImageDraw.Draw(img)
    bb = d.textbbox((0, 0), char, font=font)
    d.text(((w * 4 - (bb[2] - bb[0])) / 2 - bb[0], (h * 4 - (bb[3] - bb[1])) / 2 - bb[1]), char, fill=255, font=font)
    small = np.array(img.resize((w, h), Image.LANCZOS)) / 255.0
    for yy in range(h):
        for xx in range(w):
            t = small[yy, xx]
            if t > 0.3 and 3 <= xx < w - 3 and 3 <= yy < h - 3:
                c.px(x + xx, y + yy, GLOW_W if t > 0.7 else GLOW_M)


def lance_texture(g):
    c = Canvas(g.tw * S, g.th * S, CLEAR)
    p = Painter(c, 9001)
    for part in g.parts:
        for side, rect in g.faces(part, S).items():
            x, y, w, h = rect
            if w < 1 or h < 1:
                continue
            if part == "grip":
                p.material(x, y, w, h, GRIP_D, GRIP_M, GRIP_L, contrast=0.7)
                for k in range(int(y), int(y + h), S):
                    c.rect(x, k, w, max(1, S // 2), GRIP_L)          # the wrapping
            elif part.startswith("guard") or part == "pommel":
                p.material(x, y, w, h, STEEL_D, STEEL_M, STEEL_L, contrast=0.9)
                c.rect(x, y, w, max(1, S // 2), STEEL_H)
                if side == "top" and part == "guard6":
                    c.rect(x + w / 2 - S, y + S, 2 * S, S // 2, GLOW_M)
            elif part.startswith("shaft"):
                # polished steel: a bright streak down one side, a dark one down the other
                p.material(x, y, w, h, STEEL_M, STEEL_L, STEEL_H, contrast=0.6)
                if side in ("front", "back", "left", "right"):
                    c.rect(x + w * 0.2, y, max(1, S // 2), h, STEEL_H)
                    c.rect(x + w * 0.8, y, max(1, S // 2), h, STEEL_D)
                    # an engraved blue line spiralling up it
                    for yy in range(int(y), int(y + h), 2 * S):
                        c.rect(x + ((yy // (2 * S)) % 3) * w / 3, yy, w / 3, max(1, S // 3), GLOW_D)
            elif part.startswith("tip"):
                # the glowing tip: white-hot at its point, blue toward the shaft
                for yy in range(int(y), int(y + h)):
                    t = (yy - y) / max(1, h - 1)
                    col = tuple(int(GLOW_W[i] + (GLOW_M[i] - GLOW_W[i]) * t) for i in range(3))
                    c.rect(x, yy, w, 1, col if part == "tip" else GLOW_M)
            elif part.startswith("ring") and side in ("top", "bottom"):
                ring_texture(c, rect, int(part[-1]))
            elif part.startswith("glyph") and side in ("left", "right"):
                glyph_texture(c, rect, HANZI[int(part[-1])])
    return c


def portal_geometry():
    g = Geo("geometry.zt.everest_portal", 64, 32, 4, 4, (0, 1, 0))
    g.part("portal", 32, 32, 0)
    g.bone("portal", pivot=(0, 16, 0), cubes=[g.cube("portal", (-16, 0, 0))])
    return g


def portal_texture(g):
    """A ring of blue light swirling round a dark-blue middle (front and back alike)."""
    c = Canvas(g.tw * 2, g.th * 2, CLEAR)
    for side in ("front", "back"):
        x, y, w, h = (int(v) for v in g.faces("portal", 2)[side])
        cx, cy = x + w / 2, y + h / 2
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
                d = math.hypot(dx, dy) / (w / 2)
                a = math.atan2(dy, dx)
                swirl = 0.5 + 0.5 * math.sin(a * 3 + d * 10)
                if d < 0.62:
                    col = (int(10 + 40 * swirl * d), int(40 + 90 * swirl * d), int(90 + 120 * d))
                elif d < 0.95:
                    k = 1 - abs(d - 0.8) / 0.15
                    col = tuple(int(v * max(0.25, k)) for v in (110, 220, 255))
                else:
                    col = (0, 0, 0)
                c.px(xx, yy, col)
    return c


def supernova_geometry():
    """A ball of light: cubes turned every which way (one block across; the animation grows it)."""
    g = Geo("geometry.zt.supernova", 64, 64, 64, 64, (0, 0, 0))
    g.part("shell", 16, 16, 16)
    g.part("core", 10, 10, 10)
    cubes = [g.cube("shell", (-8, -8, -8))]
    for rot in ((45, 0, 0), (0, 45, 0), (0, 0, 45), (35, 45, 0), (-35, 45, 0)):
        cubes.append(g.cube("shell", (-8, -8, -8), rotation=rot, pivot=(0, 0, 0)))
    cubes.append(g.cube("core", (-5, -5, -5), rotation=(45, 45, 0), pivot=(0, 0, 0)))
    g.bone("ball", pivot=(0, 0, 0), cubes=cubes)
    return g


def supernova_texture(g):
    c = Canvas(g.tw * 2, g.th * 2, CLEAR)
    rng = np.random.default_rng(9201)
    for part, base in (("shell", (30, 90, 200)), ("core", (170, 235, 255))):
        for side, (x, y, w, h) in g.faces(part, 2).items():
            x, y, w, h = int(x), int(y), int(w), int(h)
            for yy in range(y, y + h):
                for xx in range(x, x + w):
                    # brighter toward each face's middle, flecked with sparks
                    e = min(xx - x, yy - y, x + w - 1 - xx, y + h - 1 - yy) / (min(w, h) / 2)
                    k = 0.25 + 0.55 * e + rng.random() * 0.15
                    c.px(xx, yy, tuple(min(255, int(v * k)) for v in base))
            for _ in range(w * h // 40):
                c.px(x + rng.integers(0, w), y + rng.integers(0, h), (220, 250, 255))
    return c


def everest_icon():
    """32 x 32, drawn pixel by pixel: the lance from bottom left to top right, its tip glowing, a
    ring of light round its guard and a glowing square either side."""
    c = Canvas(32, 32, CLEAR)
    OUT = (10, 16, 36)

    def diag(t0, t1, offsets, cols):
        """Pixels along the lance's diagonal (x + y = const lines), `offsets` across it."""
        for t in range(t0, t1 + 1):
            for o, col in zip(offsets, cols):
                c.px(t + o, 31 - t + o, col)
    # the pommel and grip
    diag(2, 3, (0, 1), (STEEL_L, STEEL_D))
    diag(4, 8, (0, 1), (GRIP_L, GRIP_D))
    for t in (5, 7):
        c.px(t, 31 - t, (90, 110, 170))
    # the shaft, tapering: a lit edge, a middle, a dark edge
    diag(10, 15, (-1, 0, 1), (STEEL_H, STEEL_L, STEEL_D))
    diag(16, 21, (0, 1), (STEEL_H, STEEL_M))
    diag(22, 24, (0,), (STEEL_L,))
    # the glowing tip
    diag(25, 28, (0,), (GLOW_M,))
    diag(25, 27, (1,), (GLOW_D,))
    c.px(29, 2, GLOW_W)
    c.px(28, 3, GLOW_L)
    # the guard: a steel bar across the shaft
    for k in range(-4, 5):
        c.px(9 + k, 22 + k, STEEL_L if k < 0 else STEEL_M)
    c.px(5, 18, STEEL_H)
    # a ring of light round the guard (an ellipse across the shaft)
    for i in range(72):
        a_ = i / 72 * math.tau
        u, v = math.cos(a_) * 7.0, math.sin(a_) * 2.6
        x = 9.5 + (u - v) * 0.7071
        y = 22.5 + (u + v) * 0.7071 - 0.0
        xi, yi = int(x), int(y)
        if c.a[yi, xi, 3] == 0 or i % 2:
            c.px(xi, yi, GLOW_L)
    # the two squares of Hanzi
    for x0, y0 in ((1, 13), (14, 25)):
        for yy in range(y0, y0 + 6):
            for xx in range(x0, x0 + 6):
                edge = xx in (x0, x0 + 5) or yy in (y0, y0 + 5)
                c.px(xx, yy, GLOW_L if edge else (14, 44, 104))
        for k in range(1, 5):
            c.px(x0 + k, y0 + 2, GLOW_W)
        c.px(x0 + 2, y0 + 1, GLOW_W)
        c.px(x0 + 2, y0 + 3, GLOW_W)
        c.px(x0 + 3, y0 + 4, GLOW_W)
    # a dark outline round it all
    mask = c.a[..., 3] > 0
    pad = np.pad(mask, 1)
    edge = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & ~mask
    for y, x in zip(*np.nonzero(edge)):
        c.px(x, y, OUT)
    c.save(out(RP, "textures", "items", "zt_everest.png"))


# =============================================================================
# Animations: the lance in hand, its rings turning; the player's poses for its abilities
# =============================================================================
FP = "c.is_first_person"
AIM_X = "(v.is_first_person ? -90 : (-90 + q.target_x_rotation))"
AIM_Y = "(v.is_first_person ? 0 : q.target_y_rotation)"


def animations():
    p = "animation.zt.everest."
    return {
        # held as a trident is
        p + "first_person": {"loop": True, "bones": {"lance": {"position": [-7.0, -3.0, -2.0], "rotation": [152.0, -9.0, 25.0]}}},
        p + "third_person": {"loop": True, "bones": {"lance": {"position": [1.5, -2.5, -10.5], "rotation": [97.0, -1.5, -49.0]}}},
        p + "spin": {"loop": True, "bones": {
            "ring0_spin": {"rotation": [0, "q.life_time * 90", 0]},
            "ring1_spin": {"rotation": [0, "-q.life_time * 120", 0]},
            "ring2_spin": {"rotation": [0, "q.life_time * 70", 0]},
            "glyphs": {"position": [0, "math.sin(q.life_time * 120) * 0.6", 0]},
            "tip": {"scale": "1 + math.sin(q.life_time * 300) * 0.06"},
        }},
        # Electro-Beam: the lance thrust out where the player looks, for seven seconds
        p + "aim": {"animation_length": 7.0, "bones": {
            "rightArm": {"rotation": [AIM_X, AIM_Y, 0]},
            "leftArm": {"rotation": ["(v.is_first_person ? 0 : (-70 + q.target_x_rotation))", "(v.is_first_person ? 0 : 30)", 0]},
        }},
        # Barrage: a thrust through each portal
        p + "stab": {"animation_length": 0.35, "bones": {
            "rightArm": {"rotation": {"0.0": [AIM_X, AIM_Y, 0], "0.12": ["%s - 15" % AIM_X, AIM_Y, 0], "0.35": [AIM_X, AIM_Y, 0]},
                         "position": {"0.0": [0, 0, 0], "0.12": [0, 0, -3], "0.35": [0, 0, 0]}},
        }},
        # Slam: up over the head and down into the floor
        p + "slam": {"animation_length": 0.8, "bones": {
            "rightArm": {"rotation": {"0.0": [0, 0, 0], "0.25": [-170, 0, 8], "0.42": [-30, 0, 0], "0.8": [0, 0, 0]}},
            "leftArm": {"rotation": {"0.0": [0, 0, 0], "0.25": [-150, 0, -8], "0.42": [-35, 0, 0], "0.8": [0, 0, 0]}},
            "body": {"rotation": {"0.0": [0, 0, 0], "0.25": [-6, 0, 0], "0.42": [12, 0, 0], "0.8": [0, 0, 0]}},
        }},
        # Supernova: the lance held high for ten seconds while the ball grows over it
        p + "raise": {"animation_length": 10.0, "bones": {
            "rightArm": {"rotation": ["v.is_first_person ? -120 : -175", 0, "v.is_first_person ? 0 : 8"]},
            "leftArm": {"rotation": ["v.is_first_person ? 0 : -160", 0, "v.is_first_person ? 0 : -10"]},
        }},
        # the portal opening and turning, the Supernova growing to fifty blocks across in ten seconds
        "animation.zt.everest_portal.turn": {"loop": True, "bones": {"portal": {
            "rotation": [0, 0, "q.life_time * 240"], "scale": "math.min(1, q.life_time * 4)"}}},
        "animation.zt.supernova.grow": {"loop": True, "bones": {"ball": {
            "rotation": ["q.life_time * 40", "q.life_time * 55", 0],
            "scale": "math.max(0.3, math.min(q.life_time, 10.0) * 5.0) * (1 + math.sin(q.life_time * 500) * 0.03)"}}},
    }


def controllers():
    return {"controller.animation.zt.everest.wield": {"initial_state": "first_person", "states": {
        "first_person": {"animations": ["first_person"], "transitions": [{"third_person": "!%s" % FP}]},
        "third_person": {"animations": ["third_person"], "transitions": [{"first_person": FP}]},
    }}}


# =============================================================================
# Data: the item and its recipe, the attachable, the portal and the Supernova, particles, names
# =============================================================================
def item():
    dump(BP, "items/everest.json", {"format_version": "1.21.90", "minecraft:item": {
        "description": {"identifier": "zt:everest", "menu_category": {"category": "equipment", "group": "minecraft:itemGroup.name.sword"}},
        "components": {
            "minecraft:icon": "zt_everest",
            "minecraft:display_name": {"value": "item.zt:everest.name"},
            "minecraft:max_stack_size": 1,
            "minecraft:hand_equipped": True,
            "minecraft:damage": 15,
            "minecraft:durability": {"max_durability": 4000},
            "minecraft:enchantable": {"slot": "sword", "value": 20},
            "minecraft:repairable": {"repair_items": [
                {"items": ["zt:glowite_ingot"], "repair_amount": "query.max_durability * 0.25"},
                {"items": ["zt:everest"], "repair_amount": "context.other->query.remaining_durability + 0.05 * context.other->query.max_durability"}]},
            "minecraft:tags": {"tags": ["minecraft:is_sword", "minecraft:is_tool", "minecraft:netherite_tier"]},
            "minecraft:fire_resistant": {"value": True},
            "minecraft:rarity": "epic",
            # (a use, so that tapping or holding use with it reaches everest.js)
            "minecraft:use_modifiers": {"use_duration": 0.5, "movement_modifier": 1.0},
        },
    }})
    dump(BP, "recipes/everest.json", {"format_version": "1.20.10", "minecraft:recipe_shapeless": {
        "description": {"identifier": "zt:everest"}, "tags": ["crafting_table"],
        "ingredients": [{"item": "zt:glowite_sword"}, {"item": "zt:shroomed_eye"}, {"item": "zt:spore_scroll"}],
        "unlock": [{"item": "zt:shroomed_eye"}], "result": {"item": "zt:everest", "count": 1}}})


def inanimate(ident, seconds):
    return {"format_version": "1.21.90", "minecraft:entity": {
        "description": {"identifier": ident, "is_spawnable": False, "is_summonable": True},
        "component_groups": {"zt:fade": {"minecraft:instant_despawn": {}}},
        "components": {
            "minecraft:type_family": {"family": ["inanimate"]},
            "minecraft:collision_box": {"width": 0.1, "height": 0.1},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
            "minecraft:timer": {"looping": False, "time": seconds, "time_down_event": {"event": "zt:fade"}},
        },
        "events": {"zt:fade": {"add": {"component_groups": ["zt:fade"]}}},
    }}


def client_files():
    dump(RP, "attachables/everest.json", {"format_version": "1.10.0", "minecraft:attachable": {"description": {
        "identifier": "zt:everest",
        "materials": {"default": "entity_alphatest", "enchanted": "entity_alphatest_glint", "glow": "entity_beam_additive"},
        "textures": {"default": "textures/entity/zt_everest", "enchanted": "textures/misc/enchanted_item_glint"},
        "geometry": {"default": "geometry.zt.everest"},
        "animations": {"wield": "controller.animation.zt.everest.wield", "first_person": "animation.zt.everest.first_person",
                       "third_person": "animation.zt.everest.third_person", "spin": "animation.zt.everest.spin"},
        "scripts": {"animate": ["wield", "spin"]},
        "render_controllers": ["controller.render.zt.everest"],
    }}})
    for ident, geo, tex, anim in (("zt:everest_portal", "geometry.zt.everest_portal", "zt_everest_portal", "animation.zt.everest_portal.turn"),
                                  ("zt:supernova", "geometry.zt.supernova", "zt_supernova", "animation.zt.supernova.grow")):
        dump(RP, "entity/%s.entity.json" % ident.split(":")[1], {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
            "identifier": ident,
            "materials": {"default": "entity_beam_additive"},
            "textures": {"default": "textures/entity/" + tex},
            "geometry": {"default": geo},
            "scripts": {"animate": ["main"], "should_update_bones_and_effects_offscreen": "1.0"},
            "animations": {"main": anim},
            "render_controllers": ["controller.render.zt.glowite_default"],
        }}})
    dump(RP, "render_controllers/everest.render_controllers.json", {"format_version": "1.8.0", "render_controllers": {
        "controller.render.zt.everest": {
            "geometry": "Geometry.default",
            "materials": [{"*": "variable.is_enchanted ? Material.enchanted : Material.default"},
                          {"tip": "Material.glow"}, {"ring*": "Material.glow"}, {"glyphs": "Material.glow"}],
            "textures": ["Texture.default", "Texture.enchanted"],
        },
    }})


def particle(ident, material, components):
    return {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": ident, "basic_render_parameters": {"material": material, "texture": "textures/particle/zt_glow"}},
        "components": components}}


def billboard(size):
    return {"size": [size, size], "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 32, "texture_height": 32, "uv": [0, 0], "uv_size": [32, 32]}}


def fade(c0, c1):
    return {"color": {"gradient": {"0.0": c0, "1.0": c1}, "interpolant": "v.particle_age / v.particle_lifetime"}}


def particles():
    shrink = "%s * (1 - v.particle_age / v.particle_lifetime)"
    P = {}
    # a spark of the Electro-Beam's lightning (drawn along the beam every other tick)
    P["electro_spark"] = particle("zt:electro_spark", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 2},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.08, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.12 + v.particle_random_1 * 0.08"},
        "minecraft:particle_initial_speed": 0.4,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": billboard(shrink % "0.22"),
        "minecraft:particle_appearance_tinting": fade([0.9, 1.0, 1.0, 1.0], [0.3, 0.6, 1.0, 0.0]),
    })
    # where the beam strikes
    P["electro_hit"] = particle("zt:electro_hit", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 10},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.2, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.2 + v.particle_random_1 * 0.2"},
        "minecraft:particle_initial_speed": "3 + v.particle_random_2 * 4",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 4},
        "minecraft:particle_appearance_billboard": billboard(shrink % "0.25"),
        "minecraft:particle_appearance_tinting": fade([0.85, 1.0, 1.0, 1.0], [0.2, 0.5, 1.0, 0.0]),
    })
    # Slam's surge: blue glow bursting up out of the ground
    P["surge"] = particle("zt:surge", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 22},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 1.1, "direction": [0, 1, 0], "plane_normal": "y"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.5 + v.particle_random_1 * 0.4"},
        "minecraft:particle_initial_speed": "5 + v.particle_random_2 * 7",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.5},
        "minecraft:particle_appearance_billboard": billboard(shrink % "0.45"),
        "minecraft:particle_appearance_tinting": fade([0.7, 0.95, 1.0, 1.0], [0.1, 0.4, 1.0, 0.0]),
    })
    # a portal opening or closing
    P["portal_burst"] = particle("zt:portal_burst", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 16},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 1.0, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.3 + v.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": "2 + v.particle_random_2 * 3",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": billboard(shrink % "0.3"),
        "minecraft:particle_appearance_tinting": fade([0.6, 0.9, 1.0, 1.0], [0.2, 0.3, 1.0, 0.0]),
    })
    # light streaming into the Supernova as it grows (variable.size: how far out it starts)
    P["nova_charge"] = particle("zt:nova_charge", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 14},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "v.size", "surface_only": True, "direction": "inwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.8},
        "minecraft:particle_initial_speed": "v.size * 1.1",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": billboard("0.3 + v.size * 0.02"),
        "minecraft:particle_appearance_tinting": fade([0.5, 0.85, 1.0, 0.0], [0.8, 1.0, 1.0, 1.0]),
    })
    # the Supernova bursting
    P["nova_burst"] = particle("zt:nova_burst", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 160},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 4, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1.5 + v.particle_random_1 * 1.5"},
        "minecraft:particle_initial_speed": "30 + v.particle_random_2 * 40",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.2},
        "minecraft:particle_appearance_billboard": billboard(shrink % "3.0"),
        "minecraft:particle_appearance_tinting": fade([0.85, 1.0, 1.0, 1.0], [0.1, 0.4, 1.0, 0.0]),
    })
    for name, data in P.items():
        dump(RP, "particles/%s.particle.json" % name, data)


NAMES = {
    "item.zt:everest.name": "Everest",
    "entity.zt:everest_portal.name": "Everest Portal",
    "entity.zt:supernova.name": "Supernova",
}


def registrations():
    icons = load(RP, "textures/item_texture.json")
    icons["texture_data"]["zt_everest"] = {"textures": "textures/items/zt_everest"}
    dump(RP, "textures/item_texture.json", icons)
    for lang in ("en_US", "en_GB"):
        path = os.path.join(RP, "texts", lang + ".lang")
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        if "## everest begin" in lines:
            a, b = lines.index("## everest begin"), lines.index("## everest end")
            lines = lines[:a] + lines[b + 1:]
        while lines and lines[-1] == "":
            lines.pop()
        lines += ["## everest begin"] + ["%s=%s" % kv for kv in NAMES.items()] + ["## everest end", ""]
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))


def main():
    lg = lance_geometry()
    lance_texture(lg).save(out(RP, "textures", "entity", "zt_everest.png"))
    pg = portal_geometry()
    portal_texture(pg).save(out(RP, "textures", "entity", "zt_everest_portal.png"))
    ng = supernova_geometry()
    supernova_texture(ng).save(out(RP, "textures", "entity", "zt_supernova.png"))
    geo = geometry_file(lg, pg, ng)
    geo["format_version"] = "1.16.0"     # (bones bound to the item slot)
    dump(RP, "models/entity/everest.geo.json", geo)
    everest_icon()
    dump(RP, "animations/everest.animation.json", {"format_version": "1.10.0", "animations": animations()})
    dump(RP, "animation_controllers/everest.animation_controllers.json", {"format_version": "1.10.0", "animation_controllers": controllers()})
    item()
    dump(BP, "entities/everest_portal.json", inanimate("zt:everest_portal", 10))
    dump(BP, "entities/supernova.json", inanimate("zt:supernova", 15))
    client_files()
    particles()
    registrations()
    print("everest written")


if __name__ == "__main__":
    main()
