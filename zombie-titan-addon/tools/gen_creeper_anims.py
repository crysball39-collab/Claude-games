"""Builds the Creeper Titan's animations and animation controller.

Poses are written as absolute rotations (A(...)) and stored as deltas from the
creeper's rest pose, which stands it on four splayed legs (thigh raised 75
degrees, calf and foot bent back down) like the Java mod's ModelCreeperTitan.
Timings follow the Java Titans mod (0.45) Creeper Titan: the head slam lands
on tick 32, the stomps on 60 and 104, the body slam on 90, the kick on 30,
the anti-air strike on 12, the TNT is hurled on 40 and the thunder clap
strikes on 100 and slams on 150.

    python3 tools/gen_creeper_anims.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_animations import merge  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

LEGS = ["rightFront", "leftFront", "rightBack", "leftBack"]
BODY = ["bodyBottom", "bodyMiddle", "bodyTop", "head"]
CR_BONES = ["root"] + BODY + [leg + seg for leg in LEGS for seg in ("Thigh", "Calf", "Foot")]


def thigh_rest(leg):
    """Raised 75 degrees, then splayed: front legs 30 degrees out, back legs 140 (right legs turn +Y)."""
    yaw = 30 if "Front" in leg else 140
    return [-75, yaw if leg.startswith("right") else -yaw, 0]


CR_BASE = {}
for _leg in LEGS:
    CR_BASE[_leg + "Thigh"] = thigh_rest(_leg)
    CR_BASE[_leg + "Calf"] = [45, 0, 0]
    CR_BASE[_leg + "Foot"] = [30, 0, 0]


def r(v):
    return round(v, 3)


def A(**kw):
    """A pose from absolute rotations; `<bone>_pos` keys pass through as position offsets."""
    pose = {}
    for k, v in kw.items():
        if k.endswith("_pos"):
            pose[k] = v
        else:
            b = CR_BASE.get(k, [0, 0, 0])
            pose[k] = [v[0] - b[0], v[1] - b[1], v[2] - b[2]]
    return pose


def leg(name, dx=0, dy=0, dz=0, calf=0, foot=0):
    """One leg relative to its rest pose: raise (dx < 0) / lower the thigh, turn it, bend the calf and foot."""
    t = thigh_rest(name)
    return {name + "Thigh": [t[0] + dx, t[1] + dy, t[2] + dz], name + "Calf": [45 + calf, 0, 0],
            name + "Foot": [30 + foot, 0, 0]}


def legs(names, **kw):
    out = {}
    for n in names:
        out.update(leg(n, **kw))
    return out


def body(b=0, m=0, t=0, h=0, hy=0, z=0):
    """Bend the three body segments and the head forward (+X) or back (-X); z leans them sideways."""
    return {"bodyBottom": [b, 0, z], "bodyMiddle": [m, 0, z * 0.6], "bodyTop": [t, 0, z * 0.4], "head": [h, hy, 0]}


def timeline(frames, enrage_speed=1.6):
    """frames: (time, pose[, 'smooth'|'linear']); poses hold deltas from CR_BASE and `<bone>_pos` offsets."""
    bones = {}
    used = set(CR_BASE)
    for f in frames:
        for k in f[1]:
            used.add(k[:-4] if k.endswith("_pos") else k)
    for bone in CR_BONES:
        if bone not in used:
            continue
        rot, pos = {}, {}
        has_pos = any((bone + "_pos") in f[1] for f in frames)
        for f in frames:
            t, pose = f[0], f[1]
            mode = f[2] if len(f) > 2 else "smooth"
            base = CR_BASE.get(bone, [0, 0, 0])
            d = pose.get(bone, [0, 0, 0])
            val = [r(base[i] + d[i]) for i in range(3)]
            key = "%.2f" % t
            rot[key] = {"post": val, "lerp_mode": "catmullrom"} if mode == "smooth" else val
            if has_pos:
                pv = [r(x) for x in pose.get(bone + "_pos", [0, 0, 0])]
                pos[key] = {"post": pv, "lerp_mode": "catmullrom"} if mode == "smooth" else pv
        entry = {"rotation": rot}
        if has_pos:
            entry["position"] = pos
        bones[bone] = entry
    return {
        "loop": "hold_on_last_frame",
        "animation_length": frames[-1][0],
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? %.1f : 1.0)" % enrage_speed,
        "bones": bones,
    }


REST = A()
FRONT = ["rightFront", "leftFront"]
BACK = ["rightBack", "leftBack"]
RIGHT = ["rightFront", "rightBack"]
LEFT = ["leftFront", "leftBack"]


def titan_animations():
    X = {}
    X["animation.zt.creeper.pose"] = {"loop": True, "bones": {b: {"rotation": v} for b, v in CR_BASE.items()}}
    X["animation.zt.creeper.idle"] = {
        "loop": True,
        "animation_length": 4.0,
        "bones": {
            "bodyMiddle": {"rotation": ["math.sin(q.anim_time * 90) * 1.5", 0, "math.cos(q.anim_time * 90) * 1.0"]},
            "bodyTop": {"rotation": ["math.sin(q.anim_time * 90 - 40) * 1.5", 0, "math.cos(q.anim_time * 90 - 40) * 1.0"]},
            "head": {"rotation": ["math.sin(q.anim_time * 90 - 80) * 2", "math.sin(q.anim_time * 45) * 10", 0]},
        },
    }
    # a trot: the diagonal pairs lift and swing forward in turn while a wave runs up the body
    ph = "q.anim_time * 138.5"
    walk = {}
    for name, phase in (("rightFront", 0), ("leftBack", 0), ("leftFront", 180), ("rightBack", 180)):
        p = "(%s + %d)" % (ph, phase)
        side = 1 if name.startswith("right") else -1
        rest = thigh_rest(name)
        walk[name + "Thigh"] = {"rotation": [
            "%d - math.max(0, -math.cos(%s)) * 32" % (rest[0], p),
            "%d + math.sin(%s) * %d" % (rest[1], p, 22 * side),  # lifted legs swing toward the front
            0]}
        walk[name + "Calf"] = {"rotation": ["45 + math.max(0, -math.cos(%s)) * 26" % p, 0, 0]}
        walk[name + "Foot"] = {"rotation": ["30 - math.max(0, -math.cos(%s)) * 12" % p, 0, 0]}
    for i, b in enumerate(BODY):
        walk[b] = {"rotation": [0, 0, "math.cos(%s * 2 - %d) * %.1f" % (ph, 50 * i, 3.0 if b != "head" else 4.0)]}
    walk["root"] = {"position": [0, "-0.25 * math.abs(math.sin(%s))" % ph, 0]}
    X["animation.zt.creeper.walk"] = {
        "loop": True,
        "animation_length": 2.6,
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 1.6 : 1.0)",
        "bones": walk,
    }

    # --- 1 head slam (90 ticks, impact @32, head down until @80): rears its head back, then whips it down --
    slammed = merge(body(40, 40, 38, 34), legs(FRONT, dx=8, calf=-14), legs(BACK, dx=-6), {"bodyBottom_pos": [0, -1.8, -0.4]})
    X["animation.zt.creeper.head_slam"] = timeline([
        (0.0, REST),
        (0.55, A(**merge(body(-10, -12, -14, -20), legs(FRONT, dx=-20, calf=10), {"bodyBottom_pos": [0, 0.5, 0.6]}))),
        (1.0, A(**merge(body(-14, -16, -18, -28), legs(FRONT, dx=-26, calf=14), {"bodyBottom_pos": [0, 0.7, 0.8]}))),
        (1.6, A(**slammed), "linear"),
        (2.6, A(**merge(slammed, {"head": [24, 6, 0]}))),
        (4.0, A(**merge(slammed, {"head": [28, -4, 0]}))),
        (4.5, REST),
    ])
    # --- 2 stomp (150 ticks, stomps @60 and @104): rears up on one side, then the other ------------------
    right_up = merge(legs(RIGHT, dx=-55, calf=30), legs(LEFT, dx=8, calf=-10), body(-6, -4, 0, -18, z=-10),
                     {"bodyBottom_pos": [-0.8, 1.2, 0]})
    right_down = merge(legs(RIGHT, dx=6, calf=-8), legs(LEFT, dx=2), body(8, 6, 4, 16, z=8), {"bodyBottom_pos": [0.6, -0.6, 0]})
    left_up = merge(legs(LEFT, dx=-55, calf=30), legs(RIGHT, dx=8, calf=-10), body(-6, -4, 0, -18, z=10),
                    {"bodyBottom_pos": [0.8, 1.2, 0]})
    left_down = merge(legs(LEFT, dx=6, calf=-8), legs(RIGHT, dx=2), body(8, 6, 4, 16, z=-8), {"bodyBottom_pos": [-0.6, -0.6, 0]})
    X["animation.zt.creeper.stomp"] = timeline([
        (0.0, REST),
        (1.25, A(**body(4, 4, 4, -30))),
        (2.5, A(**right_up)),
        (3.0, A(**right_down), "linear"),
        (3.6, A(**merge(right_down, body(4, 4, 2, 6)))),
        (4.6, A(**left_up)),
        (5.2, A(**left_down), "linear"),
        (6.2, A(**left_down)),
        (7.5, REST),
    ])
    # --- 3 body slam (170 ticks, impact @90): rears up on its back legs and crashes down ----------------
    reared = merge(legs(FRONT, dx=-70, calf=40, foot=10), legs(BACK, dx=10, calf=-14), body(-22, -10, -6, -10),
                   {"bodyBottom_pos": [0, 2.6, 1.8]})
    crashed = merge(legs(FRONT, dx=14, calf=-20), legs(BACK, dx=-10, calf=10), body(46, 40, 36, 30),
                    {"bodyBottom_pos": [0, -2.2, -2.2]})
    X["animation.zt.creeper.body_slam"] = timeline([
        (0.0, REST),
        (1.0, A(**merge(body(10, 8, 8, 10), legs(FRONT, dx=6)))),
        (3.0, A(**reared)),
        (3.6, A(**merge(reared, body(-24, -12, -8, -16), {"bodyBottom_pos": [0, 2.9, 2.0]}))),
        (4.5, A(**crashed), "linear"),
        (5.5, A(**merge(crashed, {"head": [24, 0, 0]}))),
        (6.5, A(**merge(crashed, {"head": [18, 0, 0]}))),
        (8.5, REST),
    ])
    # --- 4 anti-air strike (30 ticks, hit @12): springs up, head and front legs snapping skyward -----------
    X["animation.zt.creeper.anti_air"] = timeline([
        (0.0, REST),
        (0.35, A(**merge(legs(FRONT, dx=10, calf=-10), legs(BACK, dx=8), body(14, 10, 8, 16), {"bodyBottom_pos": [0, -1.0, -0.6]}))),
        (0.6, A(**merge(legs(FRONT, dx=-80, calf=40), legs(BACK, dx=12, calf=-20), body(-26, -16, -14, -40),
                        {"bodyBottom_pos": [0, 3.0, 1.4]})), "linear"),
        (0.9, A(**merge(legs(FRONT, dx=-70, calf=34), legs(BACK, dx=8, calf=-14), body(-20, -12, -10, -30),
                        {"bodyBottom_pos": [0, 2.4, 1.2]}))),
        (1.5, REST),
    ], enrage_speed=1.0)
    # --- 5 kick (60 ticks, hit @30): lifts a front leg and lashes it out ----------------------------------
    X["animation.zt.creeper.kick"] = timeline([
        (0.0, REST),
        (1.0, A(**merge(leg("rightFront", dx=-50, dy=40, calf=60, foot=20), body(0, -6, -6, 10, hy=-30, z=-6),
                        {"bodyBottom_pos": [0.6, 0, 0]}))),
        (1.5, A(**merge(leg("rightFront", dx=-35, dy=-45, calf=-25, foot=-20), body(0, 8, 8, -12, hy=30, z=6),
                        {"bodyBottom_pos": [-0.6, 0, -0.4]})), "linear"),
        (2.0, A(**merge(leg("rightFront", dx=-20, dy=-30, calf=-10), body(0, 6, 6, -6, hy=20)))),
        (3.0, REST),
    ])
    # --- 6 TNT rain (60 ticks, hurled @40): rears its head back, then flings it up and forward --------------
    X["animation.zt.creeper.tnt"] = timeline([
        (0.0, REST),
        (1.0, A(**merge(body(-10, -14, -16, -26), legs(FRONT, dx=-10), {"bodyBottom_pos": [0, 0.4, 0.4]}))),
        (1.7, A(**merge(body(-14, -18, -20, -36), legs(FRONT, dx=-14), {"bodyBottom_pos": [0, 0.6, 0.6]}))),
        (2.0, A(**merge(body(10, 14, 18, 26), legs(FRONT, dx=6), {"bodyBottom_pos": [0, -0.3, -0.4]})), "linear"),
        (2.4, A(**body(8, 10, 12, 18))),
        (3.0, REST),
    ])
    # --- 7 thunder clap (230 ticks: head strike @100, body slam @150): rears up, claps its front legs
    #     together over its head, smashes its head down, then throws its whole body down (@150) -------------------
    up = merge(legs(FRONT, dx=-75, calf=30), legs(BACK, dx=10, calf=-12), body(-16, -8, -6, -12),
               {"bodyBottom_pos": [0, 2.4, 1.6]})
    spread = merge(up, leg("rightFront", dx=-95, dz=50, calf=20), leg("leftFront", dx=-95, dz=-50, calf=20))
    clap = merge(up, leg("rightFront", dx=-140, dz=-10, calf=10), leg("leftFront", dx=-140, dz=10, calf=10),
                 body(-20, -10, -8, -30))
    strike = merge(legs(FRONT, dx=-30, calf=10), legs(BACK, dx=4), body(36, 38, 40, 40), {"bodyBottom_pos": [0, -1.4, 0]})
    X["animation.zt.creeper.thunder"] = timeline([
        (0.0, REST),
        (1.0, A(**merge(body(10, 8, 8, 10), legs(FRONT, dx=6)))),
        (2.5, A(**up)),
        (3.5, A(**spread)),
        (4.75, A(**clap)),
        (5.0, A(**strike), "linear"),
        (6.4, A(**merge(strike, {"head": [30, 0, 0]}))),
        (7.0, A(**reared)),
        (7.5, A(**crashed), "linear"),
        (8.5, A(**merge(crashed, {"head": [20, 0, 0]}))),
        (11.5, REST),
    ])
    # --- 8 stun (520 ticks): staggers, rolls onto its side, lies there kicking, then heaves itself back up ----
    sag = merge(legs(LEGS, dx=14, calf=-16), body(10, 8, 8, 20), {"bodyBottom_pos": [0, -1.2, 0]})
    # tipped over onto its right side: the whole model turns on the root, the legs on top flail in the air
    on_side = merge({"root": [0, 0, 84], "root_pos": [0, 4.2, 0]},
                    leg("rightFront", dx=30, dz=-20, calf=-20), leg("rightBack", dx=30, dz=-20, calf=-20),
                    leg("leftFront", dx=-10, dz=-30, calf=20), leg("leftBack", dx=-10, dz=-30, calf=20),
                    body(6, 8, 8, 18, hy=-10))
    kick_a = merge(on_side, leg("leftFront", dx=-35, dz=-30, calf=40), leg("leftBack", dx=10, dz=-30, calf=0))
    kick_b = merge(on_side, leg("leftFront", dx=10, dz=-30, calf=0), leg("leftBack", dx=-35, dz=-30, calf=40))
    X["animation.zt.creeper.stun"] = timeline([
        (0.0, REST),
        (1.0, A(**merge(body(-6, -8, -10, -24), legs(FRONT, dx=-10)))),
        (3.0, A(**sag)),
        (4.5, A(**merge(sag, {"root": [0, 0, 20], "root_pos": [0, 0.6, 0]}))),
        (5.6, A(**on_side), "linear"),
        (6.0, A(**merge(on_side, {"root_pos": [0, 4.8, 0]}))),
        (6.6, A(**on_side)),
        (9.0, A(**kick_a)),
        (11.0, A(**kick_b)),
        (13.0, A(**kick_a)),
        (15.0, A(**kick_b)),
        (18.0, A(**on_side)),
        (20.5, A(**merge(on_side, legs(LEFT, dx=20, calf=-20), body(10, 10, 10, 24, hy=6)))),
        (22.5, A(**merge(sag, {"root": [0, 0, 26], "root_pos": [0, 0.8, 0]}))),
        (24.0, A(**sag)),
        (26.0, REST),
    ], enrage_speed=1.0)
    # --- 11 awaken (60 ticks): shakes itself, rears up and hisses -----------------------------------------
    X["animation.zt.creeper.awaken"] = timeline([
        (0.0, REST),
        (0.5, A(**body(6, 6, 6, 10, z=6))),
        (0.9, A(**body(6, 6, 6, 10, z=-6))),
        (1.4, A(**merge(body(-12, -10, -10, -24), legs(FRONT, dx=-25, calf=12), {"bodyBottom_pos": [0, 0.8, 0.6]}))),
        (2.2, A(**merge(body(-10, -8, -8, -20), legs(FRONT, dx=-20, calf=10)))),
        (3.0, REST),
    ], enrage_speed=1.0)
    # --- 13 birth: hunched low and trembling while it grows ---------------------------------------------
    hunched = merge(legs(LEGS, dx=12, calf=-12), body(16, 12, 12, 20))
    birth_bones = {b: {"rotation": [r(CR_BASE.get(b, [0, 0, 0])[i] + v[i]) for i in range(3)]}
                   for b, v in A(**hunched).items()}
    birth_bones["bodyTop"]["rotation"][0] = "12 + math.sin(q.anim_time * 90) * 3"
    birth_bones["head"]["rotation"] = ["20 + math.sin(q.anim_time * 45) * 4", "math.sin(q.anim_time * 30) * 10",
                                       "math.sin(q.anim_time * 700) * 1.5"]
    birth_bones["bodyBottom"]["position"] = [0, -1.0, 0]
    X["animation.zt.creeper.birth"] = {"loop": True, "animation_length": 4.0, "bones": birth_bones}
    # --- 14 leap (50 ticks: crouch, launch @12, land @38) --------------------------------------------------
    X["animation.zt.creeper.leap"] = timeline([
        (0.0, REST),
        (0.6, A(**merge(legs(LEGS, dx=24, calf=-30), body(14, 8, 6, 14), {"bodyBottom_pos": [0, -2.0, 0]}))),
        (0.75, A(**merge(legs(LEGS, dx=-24, calf=30, foot=20), body(-10, -6, -4, -16), {"bodyBottom_pos": [0, 1.0, 0]})), "linear"),
        (1.6, A(**merge(legs(FRONT, dx=-30, calf=20), legs(BACK, dx=-10, calf=10), body(-6, -4, -4, -10)))),
        (1.9, A(**merge(legs(LEGS, dx=22, calf=-26), body(16, 10, 8, 20), {"bodyBottom_pos": [0, -1.8, 0]})), "linear"),
        (2.5, REST),
    ], enrage_speed=1.0)
    # --- death (corpse entity): staggers, then topples onto its side with its legs in the air; the
    #     swelling before it blows comes from the swell animation and the corpse's zt:fuse property ---------
    toppled = merge({"root": [0, 0, -86], "root_pos": [0, 4.2, 0]},
                    leg("leftFront", dx=30, dz=20, calf=-20), leg("leftBack", dx=30, dz=20, calf=-20),
                    leg("rightFront", dx=-25, dz=40, calf=30), leg("rightBack", dx=-25, dz=40, calf=30),
                    body(4, 8, 10, 22, hy=12))
    death = timeline([
        (0.0, REST),
        (1.0, A(**merge(body(-10, -12, -16, -30), legs(FRONT, dx=-16)))),
        (2.0, A(**merge(body(8, 10, 12, 24, z=-10), legs(RIGHT, dx=8), {"root": [0, 0, 6]}))),
        (3.0, A(**merge(body(10, 10, 12, 24, z=10), legs(LEFT, dx=10, calf=-10), {"root": [0, 0, -18],
                                                                                  "root_pos": [0, 0.6, 0]}))),
        (4.2, A(**toppled), "linear"),
        (4.6, A(**merge(toppled, {"root_pos": [0, 5.0, 0]}))),
        (5.2, A(**toppled)),
        (8.0, A(**merge(toppled, body(4, 8, 10, 28, hy=6)))),
        (20.0, A(**merge(toppled, body(4, 8, 10, 28, hy=6)))),
    ], enrage_speed=1.0)
    death.pop("anim_time_update")
    X["animation.zt.creeper.death"] = death
    # the swell before it blows: like a vanilla creeper's fuse (wider, a little taller, wobbling), driven by
    # the corpse's zt:fuse property (0..1)
    X["animation.zt.creeper.swell"] = {
        "loop": True,
        "bones": {"root": {"scale": [
            "(math.pow(q.property('zt:fuse'), 2) * 0.45 + 1.0) * (1.0 + math.sin(q.life_time * 2200) * q.property('zt:fuse') * 0.03)",
            "(math.pow(q.property('zt:fuse'), 2) * 0.12 + 1.0) / (1.0 + math.sin(q.life_time * 2200) * q.property('zt:fuse') * 0.03)",
            "(math.pow(q.property('zt:fuse'), 2) * 0.45 + 1.0) * (1.0 + math.sin(q.life_time * 2200) * q.property('zt:fuse') * 0.03)",
        ]}},
    }
    return {"format_version": "1.8.0", "animations": X}


ATTACKS = {1: "head_slam", 2: "stomp", 3: "body_slam", 4: "anti_air", 5: "kick", 6: "tnt", 7: "thunder", 8: "stun",
           11: "awaken", 14: "leap"}


def titan_controller():
    states = {
        "default": {
            "animations": ["pose", "idle"],
            "transitions": [{"birth": "q.property('zt:anim') == 13"}, {"walk": "q.property('zt:anim') == 0 && q.property('zt:moving')"}]
            + [{name: "q.property('zt:anim') == %d" % i} for i, name in ATTACKS.items()],
            "blend_transition": 0.3,
        },
        "walk": {
            "animations": ["walk"],
            "transitions": [{"default": "q.property('zt:anim') != 0 || !q.property('zt:moving')"}],
            "blend_transition": 0.3,
        },
        "birth": {
            "animations": ["birth"],
            "transitions": [{"default": "q.property('zt:anim') != 13"}],
            "blend_transition": 0.6,
        },
    }
    for i, name in ATTACKS.items():
        states[name] = {"animations": [name], "transitions": [{"default": "q.property('zt:anim') != %d" % i}],
                        "blend_transition": 0.25}
    return {
        "format_version": "1.10.0",
        "animation_controllers": {
            "controller.animation.zt.creeper.main": {"initial_state": "default", "states": states},
        },
    }


def write(rel, data):
    p = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def main():
    write("animations/creeper_titan.animation.json", titan_animations())
    write("animation_controllers/creeper_titan.animation_controllers.json", titan_controller())
    print("creeper animations written")


if __name__ == "__main__":
    main()
