"""Builds the Spider Titan's animations and animation controller.

The spider's standing pose is the bind pose of its geometry (gen_spider_art.py),
so every pose here is a change from it: legs lift (knee up), swing (toward
the back) and bend (the lower segment opens out), the body rears up (thorax
X < 0) and the abdomen curls up over its back (abdomen X > 0).
Timings follow the Java Titans mod (0.45) Spider Titan: the force smash lands
on tick 75, the anti-titan strike on 12, the sweep on 20, the web shot on 70,
the lightning shot on 68 and the frontal clap on 25; a stunned spider gets
back up after 420 ticks.

    python3 tools/gen_spider_anims.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_spider_art import LEGS as LEG_REST, lower_bend  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
# each leg's standing pose: name -> (knee raise, lower segment bend)
REST_ANGLES = {n: (rz, lower_bend(rz)) for n, _, _, rz in LEG_REST}

NAMES = ["Arm", "Front", "Back", "Rear"]
RIGHT = ["right" + n for n in NAMES]
LEFT = ["left" + n for n in NAMES]
LEGS = RIGHT + LEFT
ARMS = ["rightArm", "leftArm"]
FRONTS = ["rightFront", "leftFront"]
BACKS = ["rightBack", "leftBack", "rightRear", "leftRear"]
# the two groups of four that step together (alternating tetrapod gait)
GAIT_A = ["rightArm", "leftFront", "rightBack", "leftRear"]
GAIT_B = ["leftArm", "rightFront", "leftBack", "rightRear"]
BONES = ["root", "thorax", "head", "fangRight", "fangLeft", "abdomen"] + [
    leg + part for leg in LEGS for part in ("Hip", "Upper", "Lower")]


def r(v):
    return round(v, 3)


def add(*poses):
    """Sum poses: bone -> [x, y, z] rotation, '<bone>_pos' -> position offset."""
    out = {}
    for p in poses:
        for k, v in p.items():
            cur = out.get(k, [0, 0, 0])
            out[k] = [cur[i] + v[i] for i in range(3)]
    return out


def leg(name, lift=0, swing=0, bend=0):
    """One leg: lift raises the knee, swing turns it toward the back (< 0: forward), bend opens the
    lower segment outward (< 0 tucks the foot in). Right legs point along -X, left ones mirror."""
    s = 1 if name.startswith("right") else -1
    return {name + "Hip": [0, swing * s, 0], name + "Upper": [0, 0, lift * s], name + "Lower": [0, 0, bend * s]}


def legs(names, **kw):
    return add(*[leg(n, **kw) for n in names])


def leg_at(name, knee, foot, swing=0):
    """One leg set to absolute angles: the upper segment `knee` degrees above level, the lower one
    `foot` degrees (0 points straight out, -90 straight down, beyond -90 it curls back in)."""
    rz, bend = REST_ANGLES[name[4:] if name.startswith("left") else name[5:]]
    return leg(name, lift=knee - rz, swing=swing, bend=(foot - knee) - bend)


def legs_at(names, knee, foot, swing=0):
    return add(*[leg_at(n, knee, foot, swing) for n in names])


def body(rear=0, y=0, turn=0, tilt=0, head=0, head_turn=0, tail=0, fangs=0):
    """rear < 0 lifts the front, y raises the whole spider, turn twists it, tilt rolls it,
    tail curls the abdomen up over its back, fangs spread the fangs apart."""
    return {"thorax": [rear, turn, tilt], "root_pos": [0, y, 0], "head": [head, head_turn, 0], "abdomen": [tail, 0, 0],
            "fangRight": [0, 0, fangs], "fangLeft": [0, 0, -fangs]}


def timeline(frames, enrage_speed=1.6):
    """frames: (time, pose[, 'smooth'|'linear'])."""
    bones = {}
    for bone in BONES:
        rot_used = any(bone in f[1] for f in frames)
        pos_used = any((bone + "_pos") in f[1] for f in frames)
        if not rot_used and not pos_used:
            continue
        rot, pos = {}, {}
        for f in frames:
            t, pose = f[0], f[1]
            mode = f[2] if len(f) > 2 else "smooth"
            key = "%.2f" % t
            if rot_used:
                v = [r(x) for x in pose.get(bone, [0, 0, 0])]
                rot[key] = {"post": v, "lerp_mode": "catmullrom"} if mode == "smooth" else v
            if pos_used:
                v = [r(x) for x in pose.get(bone + "_pos", [0, 0, 0])]
                pos[key] = {"post": v, "lerp_mode": "catmullrom"} if mode == "smooth" else v
        entry = {}
        if rot_used:
            entry["rotation"] = rot
        if pos_used:
            entry["position"] = pos
        bones[bone] = entry
    return {
        "loop": "hold_on_last_frame",
        "animation_length": frames[-1][0],
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? %.1f : 1.0)" % enrage_speed,
        "bones": bones,
    }


REST = {}


def titan_animations():
    X = {}
    # --- idle: breathing, the head turning, fangs working, the front legs feeling the air ---------
    X["animation.zt.spider.idle"] = {
        "loop": True,
        "animation_length": 4.0,
        "bones": {
            "abdomen": {"rotation": ["math.sin(q.anim_time * 90) * 2.5", 0, 0]},
            "head": {"rotation": ["math.sin(q.anim_time * 90 - 60) * 2", "math.sin(q.anim_time * 45) * 8", 0]},
            "fangRight": {"rotation": [0, 0, "math.max(0, math.sin(q.anim_time * 180)) * 10"]},
            "fangLeft": {"rotation": [0, 0, "-math.max(0, math.sin(q.anim_time * 180)) * 10"]},
            "rightArmUpper": {"rotation": [0, 0, "math.max(0, math.sin(q.anim_time * 90)) * 12"]},
            "leftArmUpper": {"rotation": [0, 0, "-math.max(0, math.sin(q.anim_time * 90 + 140)) * 12"]},
            "rightArmHip": {"rotation": [0, "math.sin(q.anim_time * 90) * -6", 0]},
            "leftArmHip": {"rotation": [0, "math.sin(q.anim_time * 90 + 140) * 6", 0]},
        },
    }
    # --- walk: two groups of four legs step in turn; each leg lifts as it swings forward ------------
    ph = "q.anim_time * 300"
    walk = {}
    for group, offset in ((GAIT_A, 0), (GAIT_B, 180)):
        for i, name in enumerate(group):
            s = 1 if name.startswith("right") else -1
            p = "(%s + %d + %d)" % (ph, offset, i * 12)
            walk[name + "Upper"] = {"rotation": [0, 0, "math.max(0, math.sin(%s)) * %d" % (p, 26 * s)]}
            walk[name + "Hip"] = {"rotation": [0, "math.cos(%s) * %d" % (p, 16 * s), 0]}
            walk[name + "Lower"] = {"rotation": [0, 0, "math.max(0, math.sin(%s)) * %d" % (p, -14 * s)]}
    walk["root"] = {"position": [0, "0.35 * math.abs(math.cos(%s))" % ph, 0]}
    walk["thorax"] = {"rotation": [0, "math.sin(%s) * 2.5" % ph, "math.cos(%s) * 2" % ph]}
    walk["abdomen"] = {"rotation": ["math.cos(%s * 2) * 3" % ph, "math.sin(%s) * -4" % ph, 0]}
    X["animation.zt.spider.walk"] = {
        "loop": True,
        "animation_length": 1.2,
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 1.6 : 1.0)",
        "bones": walk,
    }

    # --- 3 force smash (100 ticks, slam @75): rears high on its back legs, then crashes down --------
    rearing = add(body(rear=-26, y=3.0, head=-6, tail=14), legs(ARMS, lift=45, swing=-20, bend=20),
                  legs(FRONTS, lift=30, swing=-10, bend=10), legs(BACKS, lift=10, bend=-6))
    reared = add(body(rear=-40, y=4.6, head=-10, tail=26, fangs=12), legs(ARMS, lift=78, swing=-28, bend=48),
                 legs(FRONTS, lift=58, swing=-16, bend=30), legs(BACKS, lift=18, bend=-10))
    slam = add(body(rear=14, y=-1.6, head=10, tail=8), legs(ARMS, lift=-14, swing=-34, bend=36),
               legs(FRONTS, lift=-10, swing=-18, bend=24), legs(BACKS, lift=6, bend=-4))
    X["animation.zt.spider.smash"] = timeline([
        (0.0, REST),
        (1.0, rearing),
        (2.5, reared),
        (3.2, add(reared, legs(ARMS, lift=8, bend=8), body(y=0.3))),
        (3.5, add(reared, legs(ARMS, lift=12, bend=10), body(rear=-4, y=0.5))),
        (3.75, slam, "linear"),
        (4.3, add(slam, body(head=6))),
        (5.0, REST),
    ])
    # --- 4 anti-titan strike (30 ticks, hit @12): springs up and stabs upward with its front legs ---
    X["animation.zt.spider.anti_air"] = timeline([
        (0.0, REST),
        (0.35, add(body(rear=6, y=-1.0), legs(LEGS, lift=10, bend=-8))),
        (0.6, add(body(rear=-42, y=4.6, head=-14, tail=28, fangs=16), legs(ARMS, lift=100, swing=-12, bend=72),
                  legs(FRONTS, lift=70, swing=-8, bend=50), legs(BACKS, lift=18, bend=-10)), "linear"),
        (0.9, add(body(rear=-36, y=4.0, head=-10, tail=24, fangs=10), legs(ARMS, lift=90, swing=-14, bend=64),
                  legs(FRONTS, lift=60, swing=-6, bend=44), legs(BACKS, lift=14, bend=-8))),
        (1.5, REST),
    ], enrage_speed=1.0)
    # --- 5 sweep (50 ticks, hit @20): raises its right front leg and sweeps it across -------------
    X["animation.zt.spider.sweep"] = timeline([
        (0.0, REST),
        (0.7, add(body(turn=12, tilt=-4, head_turn=10), leg("rightArm", lift=66, swing=30, bend=30),
                  leg("rightFront", lift=12))),
        (1.0, add(body(turn=-14, tilt=4, head_turn=-12), leg("rightArm", lift=8, swing=-80, bend=44),
                  leg("rightFront", lift=6, swing=-8)), "linear"),
        (1.4, add(body(turn=-10, tilt=3, head_turn=-8), leg("rightArm", lift=4, swing=-70, bend=38))),
        (2.5, REST),
    ])
    # --- 6 web shot (140 ticks, shot @70): curls its abdomen up over its back and fires -----------
    braced = add(legs(FRONTS + ARMS, lift=-8, bend=14), legs(BACKS, lift=10, bend=-8))
    curled = add(braced, body(rear=6, y=-0.6, tail=104, head=4))
    X["animation.zt.spider.web"] = timeline([
        (0.0, REST),
        (1.5, add(braced, body(rear=4, y=-0.4, tail=60))),
        (3.0, curled),
        (3.35, add(curled, body(tail=-14))),
        (3.5, add(curled, body(tail=8, y=-0.3)), "linear"),
        (4.2, add(braced, body(rear=6, y=-0.6, tail=96))),
        (5.5, add(braced, body(rear=2, tail=40))),
        (7.0, REST),
    ])
    # --- 7 lightning shot (140 ticks, strike @68): rears up with both front legs raised to the sky,
    #     trembling, then whips them down to call the lightning ------------------------------------------
    sky = add(body(rear=-32, y=3.8, head=-12, tail=20, fangs=14), legs(ARMS, lift=92, swing=-6, bend=80),
              legs(FRONTS, lift=48, swing=-10, bend=26), legs(BACKS, lift=14, bend=-8))
    strike = add(body(rear=10, y=-1.0, head=8), legs(ARMS, lift=-16, swing=-26, bend=40), legs(FRONTS, lift=-6, bend=14))
    X["animation.zt.spider.lightning"] = timeline([
        (0.0, REST),
        (1.5, sky),
        (2.2, add(sky, legs(ARMS, lift=6, bend=-6), body(tilt=3))),
        (2.6, add(sky, legs(ARMS, lift=-4, bend=6), body(tilt=-3))),
        (3.0, add(sky, legs(ARMS, lift=8, bend=-4), body(tilt=3))),
        (3.25, add(sky, legs(ARMS, lift=10))),
        (3.4, strike, "linear"),
        (4.0, add(strike, body(head=4))),
        (7.0, REST),
    ])
    # --- 9 frontal clap (40 ticks, hit @25): spreads its front legs wide, then claps them shut ---------
    spread = add(body(rear=-12, y=0.8, fangs=12), legs(ARMS, lift=52, swing=40, bend=20), legs(FRONTS, lift=14, swing=10))
    clap = add(body(rear=6, y=-0.4, head=6), legs(ARMS, lift=22, swing=-78, bend=42), legs(FRONTS, lift=4, swing=-10))
    X["animation.zt.spider.clap"] = timeline([
        (0.0, REST),
        (0.8, spread),
        (1.1, add(spread, legs(ARMS, swing=6))),
        (1.25, clap, "linear"),
        (1.5, add(clap, legs(ARMS, swing=4))),
        (2.0, REST),
    ])
    # --- 8 stun (520 ticks): its legs buckle and it drops flat, legs twitching; at 21 s it heaves itself
    #     back up ---------------------------------------------------------------------------------------
    flat = add(body(rear=5, y=-6.4, head=8, tail=-6), legs_at(LEGS, knee=4, foot=-8))

    def twitch(names, k):
        return add(flat, legs(names, lift=16 * k, bend=-24 * k))

    X["animation.zt.spider.stun"] = timeline([
        (0.0, REST),
        (0.6, add(body(rear=-8, y=0.6, fangs=16), legs(LEGS, lift=8))),
        (1.0, add(body(rear=4, y=-2.4), legs_at(LEGS, knee=20, foot=-50))),
        (1.4, flat, "linear"),
        (1.7, add(flat, body(y=0.8))),
        (2.0, flat),
        (4.0, twitch(GAIT_A, 1)),
        (5.0, flat),
        (7.5, twitch(GAIT_B, 1)),
        (8.5, flat),
        (11.0, twitch(["rightArm", "leftRear"], 1.4)),
        (12.0, flat),
        (14.5, twitch(GAIT_A, 0.8)),
        (15.5, flat),
        (18.0, twitch(GAIT_B, 1.2)),
        (19.0, flat),
        (21.0, add(flat, legs(LEGS, lift=10, bend=-16), body(y=1.2))),
        (23.0, add(body(rear=4, y=-2.6), legs_at(LEGS, knee=26, foot=-56))),
        (24.5, add(body(rear=-6, y=0.4), legs(LEGS, lift=4))),
        (26.0, REST),
    ], enrage_speed=1.0)
    # --- 11 awaken (60 ticks): shakes itself, rears up with its front legs raised and hisses -----------
    X["animation.zt.spider.awaken"] = timeline([
        (0.0, REST),
        (0.4, body(tilt=6)),
        (0.8, body(tilt=-6)),
        (1.6, add(body(rear=-24, y=2.2, head=-10, fangs=18), legs(ARMS, lift=64, swing=-16, bend=40),
                  legs(FRONTS, lift=36, swing=-8, bend=20))),
        (2.3, add(body(rear=-20, y=1.8, head=-8, fangs=10), legs(ARMS, lift=56, swing=-14, bend=36),
                  legs(FRONTS, lift=30, bend=16))),
        (3.0, REST),
    ], enrage_speed=1.0)
    # --- 13 birth: crouched low and trembling while it grows ----------------------------------------
    crouch = add(body(y=-2.6, rear=4), legs(LEGS, lift=18, bend=-14))
    birth_bones = {}
    for b, v in crouch.items():
        if b.endswith("_pos"):
            birth_bones.setdefault(b[:-4], {})["position"] = [r(x) for x in v]
        else:
            birth_bones.setdefault(b, {})["rotation"] = [r(x) for x in v]
    birth_bones["thorax"]["rotation"] = [4, 0, "math.sin(q.anim_time * 700) * 1.2"]
    birth_bones["head"] = {"rotation": ["math.sin(q.anim_time * 45) * 4", "math.sin(q.anim_time * 30) * 12", 0]}
    birth_bones["abdomen"] = {"rotation": ["math.sin(q.anim_time * 90) * 4", 0, 0]}
    X["animation.zt.spider.birth"] = {"loop": True, "animation_length": 4.0, "bones": birth_bones}
    # --- 14 leap (50 ticks: crouch, launch @12, land @38) -------------------------------------------
    X["animation.zt.spider.leap"] = timeline([
        (0.0, REST),
        (0.55, add(body(y=-3.0, rear=6), legs(LEGS, lift=22, bend=-18))),
        (0.7, add(body(y=1.4, rear=-10), legs(LEGS, lift=-24, bend=40)), "linear"),
        (1.2, add(body(rear=-6), legs(ARMS + FRONTS, lift=30, swing=-14, bend=-30), legs(BACKS, lift=20, swing=12, bend=-24))),
        (1.75, add(body(rear=-4), legs(LEGS, lift=6, bend=10))),
        (1.9, add(body(y=-3.2, rear=8), legs(LEGS, lift=-22, bend=36)), "linear"),
        (2.5, REST),
    ], enrage_speed=1.0)
    # --- death (corpse entity): its legs give way, it crashes down, then rolls onto its back and its
    #     legs curl up over its belly, twitching, the way dead spiders lie ------------------------------
    collapse = add(body(rear=6, y=-6.4, head=8, tail=-6), legs_at(LEGS, knee=4, foot=-8))
    # on its back the model is upside down: a leg pointing "down" points up into the air
    on_back = add({"root": [0, 0, 180], "root_pos": [0, 14.4, 0]}, body(head=-10, tail=10, fangs=-6),
                  legs_at(LEGS, knee=-58, foot=-150))
    death = timeline([
        (0.0, REST),
        (0.8, add(body(rear=-14, y=1.0, head=-10, fangs=18), legs(ARMS, lift=40, bend=24))),
        (1.6, add(body(rear=4, y=-2.2, tilt=6), legs_at(RIGHT, knee=18, foot=-48), legs(LEFT, lift=4))),
        (2.5, collapse, "linear"),
        (2.8, add(collapse, body(y=0.7))),
        (3.1, collapse),
        (4.0, add(collapse, {"root": [0, 0, 40], "root_pos": [0, 2.0, 0]}, legs(LEFT, lift=20, bend=-30))),
        (5.0, add({"root": [0, 0, 120], "root_pos": [0, 9.5, 0]}, legs_at(LEGS, knee=-30, foot=-110)), "linear"),
        (5.6, on_back),
        (5.9, add(on_back, {"root_pos": [0, 0.8, 0]})),
        (6.2, on_back),
        (8.0, add(on_back, legs(GAIT_A, lift=-14, bend=-16))),
        (9.0, on_back),
        (10.5, add(on_back, legs(GAIT_B, lift=-10, bend=-12))),
        (11.5, add(on_back, legs(LEGS, lift=6, bend=-10))),
        (15.0, add(on_back, legs(LEGS, lift=6, bend=-10))),
    ], enrage_speed=1.0)
    death.pop("anim_time_update")
    X["animation.zt.spider.death"] = death
    return {"format_version": "1.8.0", "animations": X}


ATTACKS = {3: "smash", 4: "anti_air", 5: "sweep", 6: "web", 7: "lightning", 8: "stun", 9: "clap", 11: "awaken", 14: "leap"}


def titan_controller():
    states = {
        "default": {
            "animations": ["idle"],
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
            "controller.animation.zt.spider.main": {"initial_state": "default", "states": states},
        },
    }


def minion_cast_files():
    """A casting spider minion raises its two front legs and waves them."""
    anim = {"format_version": "1.8.0", "animations": {"animation.zt.spider_minion.cast": {
        "loop": True,
        "animation_length": 0.5,
        "bones": {
            "leg6": {"rotation": [0, 0, "-40 + math.sin(q.anim_time * 720) * 12"]},
            "leg7": {"rotation": [0, 0, "40 - math.sin(q.anim_time * 720) * 12"]},
            "head": {"rotation": ["-15", 0, 0]},
        },
    }}}
    ctrl = {"format_version": "1.10.0", "animation_controllers": {"controller.animation.zt.spider_minion.cast": {
        "initial_state": "default",
        "states": {
            "default": {"transitions": [{"casting": "q.property('zt:casting')"}], "blend_transition": 0.2},
            "casting": {"animations": ["cast_wave"], "transitions": [{"default": "!q.property('zt:casting')"}],
                        "blend_transition": 0.2},
        },
    }}}
    return anim, ctrl


def write(rel, data):
    p = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def main():
    write("animations/spider_titan.animation.json", titan_animations())
    write("animation_controllers/spider_titan.animation_controllers.json", titan_controller())
    anim, ctrl = minion_cast_files()
    write("animations/spider_minion.animation.json", anim)
    write("animation_controllers/spider_minion.animation_controllers.json", ctrl)
    print("spider animations written")


if __name__ == "__main__":
    main()
