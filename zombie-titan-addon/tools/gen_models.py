"""Builds the Skeleton Titan and giant arrow geometry.

The skeleton follows the Java Titans mod's ModelSkeletonTitan proportions (a
vanilla skeleton: 8 px skull, 8x7x4 ribcage on a thin spine, 2x2 limbs,
32 px tall, rendered 16x = 32 blocks), with a hinged jaw and a solid bow
built from angled limb segments. SKEL_PARTS is shared with gen_skeleton_art.py
so the box-UV layout lives in one place.

    python3 tools/gen_models.py
"""
import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

# name: ((u, v), (w, h, d)) in texture units (128 x 64 texture, box UV)
SKEL_PARTS = {
    "cranium": ((0, 0), (8, 6, 8)),
    "jaw": ((32, 0), (8, 2, 8)),
    "ribcage": ((64, 0), (8, 7, 4)),
    "hips": ((88, 0), (8, 2, 4)),
    "vertebra": ((112, 0), (2, 2, 1)),
    "r_upper_arm": ((0, 16), (2, 6, 2)),
    "r_forearm": ((8, 16), (2, 6, 2)),
    "l_upper_arm": ((16, 16), (2, 6, 2)),
    "l_forearm": ((24, 16), (2, 6, 2)),
    "r_thigh": ((32, 16), (2, 6, 2)),
    "r_shin": ((40, 16), (2, 6, 2)),
    "l_thigh": ((48, 16), (2, 6, 2)),
    "l_shin": ((56, 16), (2, 6, 2)),
    # the bow (wood + string) and the arrow nocked on it during the volley
    "grip": ((112, 4), (1.2, 3, 1.2)),
    "limb1": ((118, 4), (1, 4, 1)),
    "limb2": ((122, 4), (1, 3.5, 1)),
    "limb3": ((112, 9), (1, 2.5, 1)),
    "string": ((126, 0), (0.5, 20.2, 0.5)),
    "nock_shaft": ((116, 9), (0.5, 16, 0.5)),
    "nock_head": ((118, 10), (1.2, 1.4, 1.2)),
}

# bow limb segments: (length, angle in degrees), from the grip out to the tip
LIMBS = [("limb1", 4.0, 12.0), ("limb2", 3.5, 28.0), ("limb3", 2.5, 50.0)]
HAND = (-5.0, 12.5, 0.0)


def r(v):
    return round(v, 4)


def cube(part, origin, extra=None):
    (u, v), size = SKEL_PARTS[part]
    c = {"origin": [r(x) for x in origin], "size": list(size), "uv": [u, v]}
    if extra:
        c.update(extra)
    return c


def bow_cubes():
    """Cubes in bow-local space (Y = along the bow, -Z = string side), offset by the hand pivot.

    The bow bone's bind rotation (-90 on X) turns that into the forearm's frame,
    so the bow stands upright, string toward the archer, when the arm is raised.
    """
    hx, hy, hz = HAND
    cubes = []
    (_, _), (gw, gh, gd) = SKEL_PARTS["grip"]
    cubes.append(cube("grip", (hx - gw / 2, hy - gh / 2, hz - gd / 2)))
    tip = None
    for sign in (1, -1):
        y, z = 1.5, 0.0
        for part, length, ang in LIMBS:
            a = math.radians(ang)
            if sign > 0:
                origin = (hx - 0.5, hy + y, hz + z - 0.5)
                rot = ang          # positive X tilts the top toward -Z (the string side)
            else:
                origin = (hx - 0.5, hy - y - length, hz + z - 0.5)
                rot = -ang
            pivot = [hx, r(hy + sign * y), r(hz + z)]
            cubes.append(cube(part, origin, {"pivot": pivot, "rotation": [r(rot), 0, 0]}))
            y += length * math.cos(a)
            z -= length * math.sin(a)
        tip = (y, z)
    ty, tz = tip
    (_, _), (sw, sh, sd) = SKEL_PARTS["string"]
    cubes.append(cube("string", (hx - sw / 2, hy - sh / 2, hz + tz - sd / 2)))
    return cubes, tz


def skeleton_titan_geo():
    bow, string_z = bow_cubes()
    hx, hy, hz = HAND
    bones = [
        {"name": "root", "pivot": [0, 0, 0]},
        {"name": "hips", "parent": "root", "pivot": [0, 12, 0], "cubes": [cube("hips", (-4, 12, -2))]},
        {"name": "spine", "parent": "hips", "pivot": [0, 14, 2], "cubes": [
            cube("vertebra", (-1, 12, 1.5)), cube("vertebra", (-1, 14, 1.5)), cube("vertebra", (-1, 16, 1.5))]},
        {"name": "chest", "parent": "spine", "pivot": [0, 18, 0], "cubes": [
            cube("ribcage", (-4, 17, -2)), cube("vertebra", (-1, 18, 1.5)), cube("vertebra", (-1, 20, 1.5)),
            cube("vertebra", (-1, 22, 1.5))]},
        {"name": "head", "parent": "chest", "pivot": [0, 24, 0], "cubes": [cube("cranium", (-4, 26, -4))]},
        {"name": "jaw", "parent": "head", "pivot": [0, 26, 3.5], "cubes": [cube("jaw", (-4, 24, -4))]},
        {"name": "rightArm", "parent": "chest", "pivot": [-5, 21.5, 0], "cubes": [cube("r_upper_arm", (-6, 17.5, -1))]},
        {"name": "rightForearm", "parent": "rightArm", "pivot": [-5, 17.5, 0], "cubes": [cube("r_forearm", (-6, 11.5, -1))]},
        {"name": "bow", "parent": "rightForearm", "pivot": list(HAND), "rotation": [-90, 0, 0], "cubes": bow},
        # the arrow lies on the string pointing through the grip (bow-local +Y turned to +Z)
        {"name": "nockedArrow", "parent": "bow", "pivot": [hx, hy, r(hz + string_z)], "rotation": [-90, 0, 0], "cubes": [
            cube("nock_shaft", (hx - 0.25, hy, hz + string_z - 0.25)),
            cube("nock_head", (hx - 0.6, hy + 16, hz + string_z - 0.6))]},
        {"name": "leftArm", "parent": "chest", "pivot": [5, 21.5, 0], "cubes": [cube("l_upper_arm", (4, 17.5, -1))]},
        {"name": "leftForearm", "parent": "leftArm", "pivot": [5, 17.5, 0], "cubes": [cube("l_forearm", (4, 11.5, -1))]},
        {"name": "rightLeg", "parent": "root", "pivot": [-2, 12, 0], "cubes": [cube("r_thigh", (-3, 6, -1))]},
        {"name": "rightShin", "parent": "rightLeg", "pivot": [-2, 6, 0], "cubes": [cube("r_shin", (-3, 0, -1))]},
        {"name": "leftLeg", "parent": "root", "pivot": [2, 12, 0], "cubes": [cube("l_thigh", (1, 6, -1))]},
        {"name": "leftShin", "parent": "leftLeg", "pivot": [2, 6, 0], "cubes": [cube("l_shin", (1, 0, -1))]},
    ]
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.zt.skeleton_titan",
                "texture_width": 128,
                "texture_height": 64,
                "visible_bounds_width": 40,
                "visible_bounds_height": 40,
                "visible_bounds_offset": [0, 16, 0],
            },
            "bones": bones,
        }],
    }


# giant arrow: vanilla arrow layout (head toward +Z), drawn 3D; the client entity scales it up
ARROW_PARTS = {
    "shaft": ((0, 0), (1, 1, 15)),
    "head": ((0, 16), (2, 2, 2)),
    "tip": ((8, 16), (1, 1, 1.5)),
    "vane_v": ((16, 16), (0, 3, 4)),
    "vane_h": ((0, 22), (3, 0, 4)),
}


def titan_arrow_geo():
    def c(part, origin):
        (u, v), size = ARROW_PARTS[part]
        return {"origin": list(origin), "size": list(size), "uv": [u, v]}

    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.zt.titan_arrow",
                "texture_width": 32,
                "texture_height": 32,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2,
                "visible_bounds_offset": [0, 0, 0],
            },
            "bones": [{"name": "body", "pivot": [0, 0, 0], "cubes": [
                c("shaft", (-0.5, -0.5, -3)),
                c("head", (-1, -1, 12)),
                c("tip", (-0.5, -0.5, 14)),
                c("vane_v", (0, -1.5, -3)),
                c("vane_h", (-1.5, 0, -3)),
            ]}],
        }],
    }


def skeleton_minion_geo():
    """The vanilla skeleton (same bone names, so vanilla animations and held items work) with its hat layer shown."""
    def c(origin, size, uv, **kw):
        d = {"origin": origin, "size": size, "uv": uv}
        d.update(kw)
        return d

    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.zt.skeleton_minion",
                "texture_width": 64,
                "texture_height": 32,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2.5,
                "visible_bounds_offset": [0, 1.25, 0],
            },
            "bones": [
                {"name": "waist", "pivot": [0, 12, 0]},
                {"name": "body", "parent": "waist", "pivot": [0, 24, 0], "cubes": [c([-4, 12, -2], [8, 12, 4], [16, 16])]},
                {"name": "head", "parent": "body", "pivot": [0, 24, 0], "cubes": [c([-4, 24, -4], [8, 8, 8], [0, 0])]},
                {"name": "hat", "parent": "head", "pivot": [0, 24, 0], "cubes": [c([-4, 24, -4], [8, 8, 8], [32, 0], inflate=0.5)]},
                {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0], "cubes": [c([-6, 12, -1], [2, 12, 2], [40, 16])]},
                {"name": "rightItem", "parent": "rightArm", "pivot": [-6, 15, 1]},
                {"name": "leftArm", "parent": "body", "pivot": [5, 22, 0], "mirror": True, "cubes": [c([4, 12, -1], [2, 12, 2], [40, 16])]},
                {"name": "leftItem", "parent": "leftArm", "pivot": [6, 15, 1]},
                {"name": "rightLeg", "parent": "body", "pivot": [-2, 12, 0], "cubes": [c([-3, 0, -1], [2, 12, 2], [0, 16])]},
                {"name": "leftLeg", "parent": "body", "pivot": [2, 12, 0], "mirror": True, "cubes": [c([1, 0, -1], [2, 12, 2], [0, 16])]},
            ],
        }],
    }


def write(rel, data):
    p = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def main():
    write("models/entity/skeleton_titan.geo.json", skeleton_titan_geo())
    write("models/entity/titan_arrow.geo.json", titan_arrow_geo())
    write("models/entity/skeleton_minion.geo.json", skeleton_minion_geo())
    print("models written")


if __name__ == "__main__":
    main()
