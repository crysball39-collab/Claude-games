"""Builds the Zombie Titan, minion and proto-ball animation files.

Each titan attack is authored as a timeline of named poses (deltas from the
zombie "base" pose: arms reaching forward, slight hunch). The generator turns
that into Bedrock keyframes with every animated bone keyed at every step, so
attacks fully replace the base pose while they play.

Timings follow the Java Titans mod (0.45) Zombie Titan: e.g. the stomp is 150
ticks long with its two stomps landing on ticks 60 and 104.
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

BONES = ["root", "waist", "belly", "chest", "head", "jaw", "rightArm", "rightForearm",
         "leftArm", "leftForearm", "rightLeg", "rightShin", "leftLeg", "leftShin", "sword"]

# The idle zombie pose (absolute rotations, degrees)
BASE = {
    "chest": [6, 0, 0],
    "belly": [4, 0, 0],
    "head": [-8, 0, 0],
    "jaw": [6, 0, 0],
    "rightArm": [-92, -3, 0],
    "leftArm": [-92, 3, 0],
    "rightForearm": [-8, 0, 0],
    "leftForearm": [-8, 0, 0],
    "rightShin": [3, 0, 0],
    "leftShin": [3, 0, 0],
}


def P(**kw):
    """A pose: bone=[rx,ry,rz] rotation deltas, root_pos=[x,y,z]."""
    return kw


BASE_P = P()


def r(v):
    return round(float(v), 3)


def build_timeline(frames, enrage_speed=2.0, bone_list=None, base_pose=None):
    """frames: list of (time, pose[, 'smooth'|'linear']). Poses are deltas from base_pose (BASE)."""
    bone_list = BONES if bone_list is None else bone_list
    base_pose = BASE if base_pose is None else base_pose
    bones = {}
    used = set()
    for f in frames:
        for k in f[1]:
            used.add("root" if k == "root_pos" else k)
    used |= set(base_pose.keys())
    for bone in bone_list:
        if bone not in used:
            continue
        rot = {}
        pos = {}
        for f in frames:
            t, pose = f[0], f[1]
            mode = f[2] if len(f) > 2 else "smooth"
            base = base_pose.get(bone, [0, 0, 0])
            d = pose.get(bone, [0, 0, 0])
            val = [r(base[i] + d[i]) for i in range(3)]
            key = "%.2f" % t
            if mode == "smooth":
                rot[key] = {"post": val, "lerp_mode": "catmullrom"}
            else:
                rot[key] = val
            if bone == "root":
                p = pose.get("root_pos", [0, 0, 0])
                pv = [r(x) for x in p]
                pos[key] = {"post": pv, "lerp_mode": "catmullrom"} if mode == "smooth" else pv
        entry = {"rotation": rot}
        if bone == "root":
            entry["position"] = pos
        bones[bone] = entry
    length = frames[-1][0]
    return {
        "loop": "hold_on_last_frame",
        "animation_length": length,
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? %.1f : 1.0)" % enrage_speed,
        "bones": bones,
    }


def arms(dx, dz=0, fx=0):
    return {"rightArm": [dx, 0, dz], "leftArm": [dx, 0, -dz], "rightForearm": [fx, 0, 0], "leftForearm": [fx, 0, 0]}


def arms_abs(x, y, z, fx=0):
    """Both arms to an absolute rotation (left arm mirrored), as deltas from BASE."""
    rb, lb = BASE["rightArm"], BASE["leftArm"]
    return {"rightArm": [x - rb[0], y - rb[1], z - rb[2]], "leftArm": [x - lb[0], -y - lb[1], -z - lb[2]],
            "rightForearm": [fx, 0, 0], "leftForearm": [fx, 0, 0]}


def merge(*dicts):
    out = {}
    for d in dicts:
        out.update(d)
    return out


def titan_animations():
    A = {}
    A["animation.zt.titan.pose"] = {
        "loop": True,
        "bones": {b: {"rotation": v} for b, v in BASE.items()},
    }
    A["animation.zt.titan.idle"] = {
        "loop": True,
        "animation_length": 4.0,
        "bones": {
            "chest": {"rotation": ["math.sin(q.anim_time * 90) * 1.5", 0, 0]},
            "head": {"rotation": ["math.sin(q.anim_time * 90 + 40) * 2", "math.sin(q.anim_time * 45) * 7", 0]},
            "jaw": {"rotation": ["math.sin(q.anim_time * 90) * 3", 0, 0]},
            "rightArm": {"rotation": ["math.sin(q.anim_time * 90 + 90) * 2", 0, "math.cos(q.anim_time * 90) * 2"]},
            "leftArm": {"rotation": ["math.sin(q.anim_time * 90) * 2", 0, "-math.cos(q.anim_time * 90) * 2"]},
        },
    }
    ph = "q.anim_time * 112.5"
    A["animation.zt.titan.walk"] = {
        "loop": True,
        "animation_length": 3.2,
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 1.5 : 1.0)",
        "bones": {
            "root": {"position": [0, "-0.72 * math.abs(math.cos(%s))" % ph, 0]},
            "waist": {"rotation": [0, 0, "math.sin(%s) * 2" % ph]},
            "chest": {"rotation": [0, "math.cos(%s) * 4" % ph, 0]},
            "head": {"rotation": ["math.cos(%s * 2) * 2" % ph, "-math.cos(%s) * 3" % ph, 0]},
            "rightArm": {"rotation": ["math.cos(%s) * 5" % ph, 0, 0]},
            "leftArm": {"rotation": ["-math.cos(%s) * 5" % ph, 0, 0]},
            "rightLeg": {"rotation": ["-math.cos(%s) * 20" % ph, 0, 0]},
            "leftLeg": {"rotation": ["math.cos(%s) * 20" % ph, 0, 0]},
            "rightShin": {"rotation": ["math.max(0, -math.sin(%s)) * 38" % ph, 0, 0]},
            "leftShin": {"rotation": ["math.max(0, math.sin(%s)) * 38" % ph, 0, 0]},
        },
    }

    # --- 1 kick (60 ticks, hit @30) -------------------------------------------------
    A["animation.zt.titan.kick"] = build_timeline([
        (0.0, BASE_P),
        (1.0, P(rightLeg=[35, 0, 0], rightShin=[45, 0, 0], leftLeg=[-8, 0, 0], leftShin=[14, 0, 0], waist=[-4, 0, 0],
                chest=[-4, 0, 0], rightArm=[-10, 0, 10], leftArm=[-10, 0, -10], root_pos=[0, -0.6, 0])),
        (1.5, P(rightLeg=[-82, 0, 0], rightShin=[-3, 0, 0], leftLeg=[6, 0, 0], leftShin=[8, 0, 0], waist=[-10, 0, 0],
                chest=[-8, 0, 0], head=[12, 0, 0], jaw=[18, 0, 0], rightArm=[30, 0, 15], leftArm=[-20, 0, -15],
                root_pos=[0, -0.3, 0]), "linear"),
        (1.9, P(rightLeg=[-68, 0, 0], rightShin=[12, 0, 0], leftShin=[8, 0, 0], waist=[-8, 0, 0], chest=[-6, 0, 0],
                head=[10, 0, 0], jaw=[12, 0, 0], rightArm=[25, 0, 12], leftArm=[-15, 0, -12], root_pos=[0, -0.3, 0])),
        (2.6, P(rightLeg=[-8, 0, 0], rightShin=[10, 0, 0])),
        (3.0, BASE_P),
    ])
    # --- 2 reform sword (210 ticks, ground smash @50, sword back @160) --------------
    smash_low = P(waist=[25, 0, 0], belly=[15, 0, 0], chest=[12, 0, 0], head=[-15, 0, 0], jaw=[10, 0, 0],
                  rightLeg=[-35, 0, 0], leftLeg=[-35, 0, 0], rightShin=[55, 0, 0], leftShin=[55, 0, 0],
                  root_pos=[0, -1.5, 0], **arms(50))
    A["animation.zt.titan.reform"] = build_timeline([
        (0.0, BASE_P),
        (1.5, P(chest=[-14, 0, 0], belly=[-6, 0, 0], head=[-20, 0, 0], jaw=[22, 0, 0], root_pos=[0, 0.4, 0], **arms(-80, 0, 8))),
        (2.5, smash_low, "linear"),
        (4.0, merge(smash_low, arms(55))),
        (5.0, merge(smash_low, arms(47))),
        (6.0, merge(smash_low, arms(52))),
        (8.0, P(waist=[5, 0, 0], belly=[5, 0, 0], head=[-10, 0, 0], jaw=[25, 0, 0], rightArm=[-70, 0, 0],
                leftArm=[-30, 0, -20], rightShin=[5, 0, 0], leftShin=[5, 0, 0])),
        (9.0, P(chest=[-10, 0, 0], head=[-20, 0, 0], jaw=[32, 0, 0], rightArm=[-75, 0, 10], leftArm=[-20, 0, -25])),
        (10.5, BASE_P),
    ])
    # --- 3 smash (70 ticks, hit @32) --------------------------------------------------
    slam = P(waist=[22, 0, 0], belly=[14, 0, 0], chest=[10, 0, 0], head=[-12, 0, 0], jaw=[20, 0, 0],
             rightLeg=[-25, 0, 0], leftLeg=[-25, 0, 0], rightShin=[40, 0, 0], leftShin=[40, 0, 0],
             root_pos=[0, -1.0, 0], **arms(45))
    A["animation.zt.titan.smash"] = build_timeline([
        (0.0, BASE_P),
        (1.2, P(chest=[-12, 0, 0], belly=[-6, 0, 0], head=[-10, 0, 0], jaw=[15, 0, 0], root_pos=[0, 0.3, 0], **arms(-75))),
        (1.6, slam, "linear"),
        (2.3, merge(slam, arms(40))),
        (3.5, BASE_P),
    ])
    # --- 4 swat / anti-titan uppercut (30 ticks, hit @12) -----------------------------
    A["animation.zt.titan.swat"] = build_timeline([
        (0.0, BASE_P),
        (0.35, P(rightArm=[40, 0, 0], rightForearm=[-70, 0, 0], chest=[0, 25, 0], waist=[0, 8, 0], root_pos=[0, -0.5, 0])),
        (0.6, P(rightArm=[-75, 0, -10], chest=[-10, -25, 0], head=[-30, 0, 0], jaw=[15, 0, 0], leftArm=[20, 0, -15]), "linear"),
        (0.9, P(rightArm=[-70, 0, -10], chest=[-8, -20, 0], head=[-25, 0, 0], jaw=[10, 0, 0], leftArm=[15, 0, -10])),
        (1.5, BASE_P),
    ])
    # --- 5 lightning / "Super Zombu" (110 ticks, strike @64) -------------------------
    charge = P(chest=[-15, 0, 0], head=[-30, 0, 0], jaw=[30, 0, 0], root_pos=[0, 0.3, 0], **arms_abs(-25, 0, 125, -12))
    A["animation.zt.titan.lightning"] = build_timeline([
        (0.0, BASE_P),
        (1.2, charge),
        (1.7, merge(charge, arms_abs(-25, 0, 131, -12), P(jaw=[34, 0, 0]))),
        (2.3, merge(charge, arms_abs(-25, 0, 121, -12), P(jaw=[36, 0, 0]))),
        (3.0, P(rightArm=[-5, -15, 0], leftArm=[-5, 15, 0], chest=[5, 0, 0], jaw=[20, 0, 0])),
        (3.2, P(rightArm=[5, -10, 0], leftArm=[5, 10, 0], chest=[12, 0, 0], waist=[5, 0, 0], head=[10, 0, 0], jaw=[30, 0, 0]), "linear"),
        (4.2, P(rightArm=[3, -10, 0], leftArm=[3, 10, 0], chest=[10, 0, 0], waist=[4, 0, 0], head=[8, 0, 0], jaw=[24, 0, 0])),
        (5.5, BASE_P),
    ])
    # --- 6 stomp (150 ticks, stomps @60 and @104) --------------------------------------
    lift_r = P(rightLeg=[-70, 0, 0], rightShin=[75, 0, 0], leftShin=[10, 0, 0], waist=[-6, 0, 0], chest=[-4, 0, 0],
               head=[8, 0, 0], jaw=[12, 0, 0], root_pos=[0, 0.4, 0], **arms_abs(-40, 0, 55))
    stomp_r = P(rightLeg=[-12, 0, 0], rightShin=[8, 0, 0], leftLeg=[6, 0, 0], leftShin=[12, 0, 0], waist=[6, 0, 0],
                chest=[6, 0, 0], head=[15, 0, 0], jaw=[25, 0, 0], root_pos=[0, -1.2, 0], **arms_abs(-35, 0, 35))
    lift_l = P(leftLeg=[-70, 0, 0], leftShin=[75, 0, 0], rightShin=[10, 0, 0], waist=[-6, 0, 0], chest=[-4, 0, 0],
               head=[8, 0, 0], jaw=[12, 0, 0], root_pos=[0, 0.4, 0], **arms_abs(-40, 0, 55))
    stomp_l = P(leftLeg=[-12, 0, 0], leftShin=[8, 0, 0], rightLeg=[6, 0, 0], rightShin=[12, 0, 0], waist=[6, 0, 0],
                chest=[6, 0, 0], head=[15, 0, 0], jaw=[25, 0, 0], root_pos=[0, -1.2, 0], **arms_abs(-35, 0, 35))
    A["animation.zt.titan.stomp"] = build_timeline([
        (0.0, BASE_P),
        (2.4, lift_r),
        (3.0, stomp_r, "linear"),
        (3.6, P(rightLeg=[-6, 0, 0], root_pos=[0, -0.3, 0], **arms(10, 10))),
        (4.6, lift_l),
        (5.2, stomp_l, "linear"),
        (5.8, P(leftLeg=[-6, 0, 0], root_pos=[0, -0.3, 0], **arms(10, 10))),
        (7.5, BASE_P),
    ])
    # --- 7 downward slash (230 ticks, strike @120) -------------------------------------
    raised = P(rightArm=[-110, 0, 0], rightForearm=[-20, 0, 0], leftArm=[-85, 0, 0], leftForearm=[-30, 0, 0],
               chest=[-16, 0, 0], belly=[-6, 0, 0], head=[-18, 0, 0], jaw=[14, 0, 0], root_pos=[0, 0.4, 0])
    strike = P(rightArm=[40, 0, 0], leftArm=[30, 0, 0], waist=[14, 0, 0], belly=[16, 0, 0], chest=[16, 0, 0],
               head=[5, 0, 0], jaw=[24, 0, 0], rightLeg=[-30, 0, 0], leftLeg=[15, 0, 0], rightShin=[35, 0, 0],
               leftShin=[15, 0, 0], root_pos=[0, -1.4, 0])
    A["animation.zt.titan.slash_down"] = build_timeline([
        (0.0, BASE_P),
        (2.0, raised),
        (4.0, merge(raised, P(rightArm=[-115, 0, 0], leftArm=[-88, 0, 0], chest=[-18, 0, 0], jaw=[18, 0, 0]))),
        (5.6, merge(raised, P(rightArm=[-122, 0, 0], leftArm=[-90, 0, 0], chest=[-21, 0, 0], jaw=[20, 0, 0]))),
        (6.0, strike, "linear"),
        (8.5, merge(strike, P(rightArm=[38, 0, 0]))),
        (9.8, P(rightArm=[-30, 0, 0], waist=[6, 0, 0], belly=[6, 0, 0], chest=[4, 0, 0])),
        (11.5, BASE_P),
    ])
    # --- 8 stun (140 ticks) --------------------------------------------------------------
    A["animation.zt.titan.stun"] = build_timeline([
        (0.0, BASE_P),
        (0.4, P(chest=[-18, 0, 0], belly=[-8, 0, 0], head=[-25, 0, 10], jaw=[25, 0, 0], rightArm=[70, 0, 10],
                leftArm=[75, 0, -10], rightForearm=[8, 0, 0], leftForearm=[8, 0, 0], root_pos=[0, -0.4, 0]), "linear"),
        (1.5, P(head=[10, 0, -12], chest=[8, 0, 4], waist=[4, 0, -3], rightArm=[82, 0, 6], leftArm=[-55, 0, -28],
                leftForearm=[-80, 0, 0], rightLeg=[-10, 0, 0], rightShin=[20, 0, 0], leftShin=[10, 0, 0],
                root_pos=[0, -0.8, 0], jaw=[18, 0, 0])),
        (3.0, P(head=[12, 0, 12], chest=[6, 0, -4], waist=[3, 0, 3], rightArm=[80, 0, 4], leftArm=[-58, 0, -30],
                leftForearm=[-82, 0, 0], rightLeg=[-10, 0, 0], rightShin=[20, 0, 0], leftShin=[10, 0, 0],
                root_pos=[0, -0.8, 0], jaw=[22, 0, 0])),
        (4.5, P(head=[8, 0, -10], chest=[8, 0, 4], rightArm=[80, 0, 6], leftArm=[-55, 0, -28], leftForearm=[-80, 0, 0],
                rightLeg=[-8, 0, 0], rightShin=[16, 0, 0], leftShin=[8, 0, 0], root_pos=[0, -0.6, 0], jaw=[18, 0, 0])),
        (6.0, P(head=[0, -18, 0], jaw=[10, 0, 0], rightArm=[40, 0, 0], leftArm=[40, 0, 0])),
        (6.4, P(head=[0, 18, 0], jaw=[10, 0, 0], rightArm=[20, 0, 0], leftArm=[20, 0, 0])),
        (7.0, BASE_P),
    ])
    # --- 9 sideways slash (190 ticks, hit @106-110) -------------------------------------
    wind = P(chest=[0, 40, 0], belly=[0, 15, 0], waist=[0, 10, 0], rightArm=[0, 55, 10], rightForearm=[-10, 0, 0], sword=[45, 0, 0],
             leftArm=[10, 30, 0], head=[0, -25, 0], jaw=[10, 0, 0], rightLeg=[10, 0, 0], leftLeg=[-10, 0, 0],
             root_pos=[0, -0.6, 0])
    sweep = P(chest=[0, -45, 0], belly=[0, -15, 0], waist=[0, -10, 0], rightArm=[0, -55, -5], leftArm=[20, -20, 0], sword=[45, 0, 0],
              head=[0, 20, 0], jaw=[24, 0, 0], rightLeg=[-10, 0, 0], leftLeg=[10, 0, 0], root_pos=[0, -0.8, 0])
    A["animation.zt.titan.slash_side"] = build_timeline([
        (0.0, BASE_P),
        (3.0, wind),
        (5.0, merge(wind, P(chest=[0, 45, 0], rightArm=[0, 60, 12], jaw=[16, 0, 0]))),
        (5.4, sweep, "linear"),
        (6.2, merge(sweep, P(chest=[0, -50, 0], rightArm=[0, -60, -5]))),
        (8.0, P(chest=[0, -10, 0], rightArm=[0, -10, 0], sword=[20, 0, 0])),
        (9.5, BASE_P),
    ])
    # --- 11 roar / Zombie Apocalypse (100 ticks) ----------------------------------------
    roar = P(chest=[-22, 0, 0], belly=[-8, 0, 0], head=[-38, 0, 0], jaw=[42, 0, 0], root_pos=[0, 0.4, 0],
             **arms_abs(-30, 0, 95, -30))
    A["animation.zt.titan.roar"] = build_timeline([
        (0.0, BASE_P),
        (0.8, P(chest=[8, 0, 0], head=[12, 0, 0], jaw=[-6, 0, 0], root_pos=[0, -0.4, 0], **arms(20, 5))),
        (1.3, roar, "linear"),
        (2.2, merge(roar, P(jaw=[46, 0, 0], head=[-34, 0, 0]))),
        (3.0, merge(roar, P(jaw=[44, 0, 0], head=[-37, 0, 0]))),
        (3.6, merge(roar, P(jaw=[40, 0, 0]))),
        (5.0, BASE_P),
    ])
    # --- 12 proto balls (110 ticks, volley @52-60) --------------------------------------
    A["animation.zt.titan.spit"] = build_timeline([
        (0.0, BASE_P),
        (1.6, P(chest=[-12, 0, 0], belly=[-4, 0, 0], head=[-22, 0, 0], jaw=[8, 0, 0], root_pos=[0, 0.3, 0], **arms(15, 12))),
        (2.6, P(chest=[16, 0, 0], belly=[6, 0, 0], head=[18, 0, 0], jaw=[45, 0, 0], **arms(30, 20)), "linear"),
        (3.0, P(chest=[18, 0, 0], belly=[6, 0, 0], head=[22, 0, 0], jaw=[48, 0, 0], **arms(30, 20))),
        (3.8, P(chest=[4, 0, 0], jaw=[15, 0, 0])),
        (5.5, BASE_P),
    ])
    # --- 13 birth: hunched and breathing while it grows ---------------------------------
    hunched = {
        "chest": [28, 0, 0], "belly": [16, 0, 0], "waist": [6, 0, 0], "head": [12, 0, 0], "jaw": [16, 0, 0],
        "rightArm": [-12, 0, 6], "leftArm": [-12, 0, -6], "rightForearm": [-3, 0, 0], "leftForearm": [-3, 0, 0],
        "rightLeg": [-14, 0, 0], "leftLeg": [-14, 0, 0], "rightShin": [26, 0, 0], "leftShin": [26, 0, 0],
    }
    birth_bones = {b: {"rotation": v} for b, v in hunched.items()}
    birth_bones["chest"]["rotation"] = ["28 + math.sin(q.anim_time * 90) * 3", 0, 0]
    birth_bones["jaw"]["rotation"] = ["16 + math.sin(q.anim_time * 90) * 6", 0, 0]
    birth_bones["head"]["rotation"] = ["12 + math.sin(q.anim_time * 45) * 4", "math.sin(q.anim_time * 30) * 10", 0]
    birth_bones["root"] = {"position": [0, -1.0, 0]}
    A["animation.zt.titan.birth"] = {"loop": True, "animation_length": 4.0, "bones": birth_bones}
    # --- 14 leap (50 ticks: crouch, launch @12, land @38) --------------------------------
    A["animation.zt.titan.leap"] = build_timeline([
        (0.0, BASE_P),
        (0.6, P(rightLeg=[-50, 0, 0], leftLeg=[-50, 0, 0], rightShin=[90, 0, 0], leftShin=[90, 0, 0], waist=[20, 0, 0],
                chest=[10, 0, 0], root_pos=[0, -3.5, 0], **arms(70))),
        (0.75, P(rightLeg=[10, 0, 0], leftLeg=[10, 0, 0], rightShin=[5, 0, 0], leftShin=[5, 0, 0], chest=[-10, 0, 0],
                 jaw=[25, 0, 0], root_pos=[0, 0.5, 0], **arms(-60)), "linear"),
        (1.3, P(rightLeg=[-40, 0, 0], leftLeg=[-40, 0, 0], rightShin=[60, 0, 0], leftShin=[60, 0, 0], jaw=[20, 0, 0], **arms(-30))),
        (1.9, P(rightLeg=[-45, 0, 0], leftLeg=[-45, 0, 0], rightShin=[85, 0, 0], leftShin=[85, 0, 0], waist=[20, 0, 0],
                jaw=[34, 0, 0], root_pos=[0, -3.0, 0], **arms(40)), "linear"),
        (2.5, BASE_P),
    ], enrage_speed=1.0)
    # --- death (corpse entity, 300 ticks) -------------------------------------------------
    fallen = P(root=[88, 0, 0], root_pos=[0, 2.0, 0], head=[-10, 25, 0], jaw=[30, 0, 0],
               rightArm=[-75, 0, 10], leftArm=[-75, 0, -10], rightForearm=[8, 0, 0], leftForearm=[8, 0, 0],
               chest=[-6, 0, 0], belly=[-4, 0, 0])
    death = build_timeline([
        (0.0, BASE_P),
        (0.7, P(chest=[-20, 0, 0], head=[-35, 0, 0], jaw=[40, 0, 0], root_pos=[0, 0.3, 0], **arms_abs(-35, 0, 100, -25))),
        (1.8, P(chest=[10, 0, 8], head=[10, 0, 10], jaw=[30, 0, 0], rightLeg=[15, 0, 0], leftLeg=[-10, 0, 0],
                root_pos=[0, -0.3, 0], **arms(60, 10))),
        (2.8, P(chest=[5, 0, -8], head=[8, 0, -12], jaw=[28, 0, 0], rightLeg=[-8, 0, 0], leftLeg=[12, 0, 0], **arms(62, 8))),
        (3.8, P(rightLeg=[-15, 0, 0], leftLeg=[-15, 0, 0], rightShin=[30, 0, 0], leftShin=[30, 0, 0], chest=[14, 0, 0],
                head=[20, 0, 0], jaw=[28, 0, 0], root_pos=[0, -0.8, 0], **arms(70, 8))),
        (5.0, P(rightLeg=[-15, 0, 0], leftLeg=[-15, 0, 0], rightShin=[30, 0, 0], leftShin=[30, 0, 0], chest=[16, 0, 6],
                waist=[4, 0, -3], head=[24, 0, 10], jaw=[30, 0, 0], root_pos=[0, -0.8, 0], **arms(70, 8))),
        (5.6, P(root=[10, 0, 0], rightLeg=[-5, 0, 0], leftLeg=[-5, 0, 0], rightShin=[12, 0, 0], leftShin=[12, 0, 0],
                chest=[18, 0, 0], waist=[8, 0, 0], head=[20, 0, 0], jaw=[32, 0, 0], root_pos=[0, -0.4, 0], **arms(40, 8))),
        (6.6, fallen, "linear"),
        (7.2, merge(fallen, P(root=[83, 0, 0], root_pos=[0, 2.6, 0]))),
        (7.6, fallen),
        (9.0, merge(fallen, P(rightArm=[-69, 0, 10], head=[-10, 30, 0]))),
        (9.4, fallen),
        (11.0, merge(fallen, P(leftArm=[-81, 0, -10], jaw=[24, 0, 0]))),
        (11.4, fallen),
        (13.0, fallen),
        (15.0, merge(fallen, P(root_pos=[0, -7.0, 0]))),
    ], enrage_speed=1.0)
    death.pop("anim_time_update")
    A["animation.zt.titan.death"] = death
    return {"format_version": "1.8.0", "animations": A}


def minion_animations():
    return {
        "format_version": "1.8.0",
        "animations": {
            "animation.zt.minion.look": {
                "loop": True,
                "bones": {"head": {"rotation": ["q.target_x_rotation", "q.target_y_rotation", 0]}},
            },
            "animation.zt.minion.move": {
                "loop": True,
                "bones": {
                    "rightLeg": {"rotation": ["math.cos(q.modified_distance_moved * 38.17) * 80.0 * q.modified_move_speed", 0, 0]},
                    "leftLeg": {"rotation": ["-math.cos(q.modified_distance_moved * 38.17) * 80.0 * q.modified_move_speed", 0, 0]},
                },
            },
            "animation.zt.minion.arms": {
                "loop": True,
                "bones": {
                    "rightArm": {"rotation": [
                        "-90 - math.sin((v.attack_time ?? 0) * 180) * 60 + math.sin(q.life_time * 76.8) * 2.9",
                        "-5", "math.cos(q.life_time * 103.1) * 2.9 + 2.9"]},
                    "leftArm": {"rotation": [
                        "-90 - math.sin((v.attack_time ?? 0) * 180) * 60 - math.sin(q.life_time * 76.8) * 2.9",
                        "5", "-math.cos(q.life_time * 103.1) * 2.9 - 2.9"]},
                },
            },
            "animation.zt.minion.cast": {
                "loop": True,
                "bones": {
                    "rightArm": {"rotation": ["-150 + math.sin(q.life_time * 400) * 6", 0, "30"]},
                    "leftArm": {"rotation": ["-150 - math.sin(q.life_time * 400) * 6", 0, "-30"]},
                },
            },
        },
    }


def proto_ball_animations():
    return {
        "format_version": "1.8.0",
        "animations": {
            "animation.zt.proto_ball.spin": {
                "loop": True,
                "bones": {"ball": {"rotation": ["q.life_time * 540", "q.life_time * 360", 0],
                                   "scale": "1.0 + math.sin(q.life_time * 1440) * 0.08"}},
            },
            "animation.zt.player.barrage": {
                "loop": False,
                "animation_length": 7.0,
                "bones": {
                    "rightArm": {"rotation": [
                        "q.is_first_person ? math.sin(q.anim_time * 1500) * 10 : (-85 + math.sin(q.anim_time * 1200) * 25)",
                        "q.is_first_person ? 0 : 10", 0]},
                    "leftArm": {"rotation": [
                        "q.is_first_person ? 0 : (-85 - math.sin(q.anim_time * 1200) * 25)",
                        "q.is_first_person ? 0 : -10", 0]},
                },
            },
            "animation.zt.player.beam": {
                "loop": False,
                "animation_length": 5.5,
                "bones": {
                    "rightArm": {"rotation": ["q.is_first_person ? 0 : (-90 + q.target_x_rotation)", "q.is_first_person ? 0 : 8", 0]},
                    "leftArm": {"rotation": ["q.is_first_person ? 0 : (-90 + q.target_x_rotation)", "q.is_first_person ? 0 : -8", 0]},
                },
            },
            "animation.zt.player.reset": {
                "loop": False,
                "animation_length": 0.05,
                "bones": {"rightArm": {"rotation": [0, 0, 0]}},
            },
        },
    }


def write(rel, data):
    p = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def main():
    write("animations/zombie_titan.animation.json", titan_animations())
    write("animations/zombie_minion.animation.json", minion_animations())
    write("animations/zt_misc.animation.json", proto_ball_animations())
    print("animations written")


if __name__ == "__main__":
    main()
