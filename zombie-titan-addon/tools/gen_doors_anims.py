"""Builds the Doors entities' animations and animation controllers.

Script-driven properties pick the state: the Figure's zt:gait (0 idle, 1 walk,
2 run) and zt:act (1 listen, 2 roar, 3 kill, 4 stumble); Seek's zt:anim (0 idle,
1 rise, 2 run, 3 kill); the hotel door's zt:open; a hand's zt:anim (0 hidden,
1 out, 2 grab); a chandelier's zt:state (0 hanging, 1 falling, 2 fallen); the
lamp's zt:fallen.

Rotation conventions: -X swings a hanging limb forward, +X tilts an upright
part forward, +Y turns right, +Z swings a hanging limb out to the right.

    python3 tools/gen_doors_anims.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")


def write(rel, data):
    p = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def keys(frames, smooth=True):
    """{time: [x, y, z]} keyframes, eased with catmull-rom."""
    out = {}
    for t, v in frames:
        k = "%.2f" % t
        out[k] = {"post": v, "lerp_mode": "catmullrom"} if smooth else v
    return out


def track(frames, bones, smooth=True):
    """frames: [(time, {bone: [x, y, z], bone_pos: [...]})] -> per-bone rotation/position keyframes."""
    out = {}
    for bone in bones:
        has_rot = any(bone in f for _, f in frames)
        has_pos = any(bone + "_pos" in f for _, f in frames)
        entry = {}
        if has_rot:
            entry["rotation"] = keys([(t, f.get(bone, [0, 0, 0])) for t, f in frames], smooth)
        if has_pos:
            entry["position"] = keys([(t, f.get(bone + "_pos", [0, 0, 0])) for t, f in frames], smooth)
        if entry:
            out[bone] = entry
    return out


def P(name):
    return "q.property('%s')" % name


# =============================================================================================
# The Figure
# =============================================================================================
FIG_BONES = ["root", "pelvis", "belly", "chest", "neck", "head", "mouth", "glow"] + [
    s + b for s in ("right", "left") for b in ("Thigh", "Shin", "Foot", "Arm", "Forearm", "Hand")]


def figure_animations():
    A = {}
    act = P("zt:act")
    # the mouth gapes and its glow lights up while it hollers or bites
    A["animation.zt.figure.base"] = {"loop": True, "bones": {
        "glow": {"scale": "%s == 2 ? 1.0 : 0.0" % act},
        "mouth": {"scale": "%s == 2 ? 1.25 + math.sin(q.life_time * 1500) * 0.04 : (%s == 3 ? 1.35 : 1.0)" % (act, act)},
    }}
    t = "q.anim_time"
    A["animation.zt.figure.idle"] = {"loop": True, "animation_length": 3.0, "bones": {
        "chest": {"rotation": ["math.sin(%s * 120) * 2" % t, 0, 0]},
        "neck": {"rotation": ["math.sin(%s * 120 + 30) * 2" % t, 0, 0]},
        "head": {"rotation": ["math.sin(%s * 120 + 40) * 2" % t, 0, "math.sin(%s * 60) * 4" % t]},
        "mouth": {"rotation": [0, 0, "math.sin(%s * 240) * 3" % t]},
        "rightArm": {"rotation": ["math.sin(%s * 120 + 90) * 3" % t, 0, "math.cos(%s * 60) * 2" % t]},
        "leftArm": {"rotation": ["math.sin(%s * 120) * 3" % t, 0, "-math.cos(%s * 60) * 2" % t]},
    }}
    ph = "(q.anim_time * 225)"
    A["animation.zt.figure.walk"] = {"loop": True, "animation_length": 1.6, "bones": {
        "pelvis": {"rotation": [0, "math.sin(%s) * 6" % ph, 0],
                   "position": [0, "math.abs(math.cos(%s)) * 0.7 - 0.35" % ph, 0]},
        "chest": {"rotation": ["math.sin(%s * 2) * 2" % ph, 0, "math.sin(%s) * 3" % ph]},
        "head": {"rotation": ["math.sin(%s * 2) * 3" % ph, "-math.sin(%s) * 5" % ph, 0]},
        "rightThigh": {"rotation": ["math.sin(%s) * 26" % ph, 0, 0]},
        "leftThigh": {"rotation": ["-math.sin(%s) * 26" % ph, 0, 0]},
        "rightShin": {"rotation": ["math.max(0, math.cos(%s)) * 32" % ph, 0, 0]},
        "leftShin": {"rotation": ["math.max(0, -math.cos(%s)) * 32" % ph, 0, 0]},
        # the long arms swing loosely and drag behind
        "rightArm": {"rotation": ["-math.sin(%s) * 14 + 4" % ph, 0, 0]},
        "leftArm": {"rotation": ["math.sin(%s) * 14 + 4" % ph, 0, 0]},
        "rightForearm": {"rotation": ["math.max(0, math.sin(%s)) * -12" % ph, 0, 0]},
        "leftForearm": {"rotation": ["math.max(0, -math.sin(%s)) * -12" % ph, 0, 0]},
    }}
    ph = "(q.anim_time * 480)"
    A["animation.zt.figure.run"] = {"loop": True, "animation_length": 0.75, "bones": {
        "pelvis": {"position": [0, "math.abs(math.cos(%s)) * 1.2 - 0.6" % ph, 0]},
        "belly": {"rotation": [8, 0, 0]},
        "chest": {"rotation": ["14 + math.sin(%s * 2) * 3" % ph, "math.sin(%s) * 6" % ph, 0]},
        "head": {"rotation": ["-14 + math.sin(%s * 2) * 4" % ph, 0, "math.sin(%s) * 6" % ph]},
        "rightThigh": {"rotation": ["math.sin(%s) * 46" % ph, 0, 0]},
        "leftThigh": {"rotation": ["-math.sin(%s) * 46" % ph, 0, 0]},
        "rightShin": {"rotation": ["math.max(0, math.cos(%s)) * 62" % ph, 0, 0]},
        "leftShin": {"rotation": ["math.max(0, -math.cos(%s)) * 62" % ph, 0, 0]},
        # arms flailing, reaching ahead for whatever it heard
        "rightArm": {"rotation": ["-38 - math.sin(%s) * 34" % ph, 0, 10]},
        "leftArm": {"rotation": ["-38 + math.sin(%s) * 34" % ph, 0, -10]},
        "rightForearm": {"rotation": ["-20 + math.sin(%s) * 15" % ph, 0, 0]},
        "leftForearm": {"rotation": ["-20 - math.sin(%s) * 15" % ph, 0, 0]},
    }}
    t = "q.anim_time"
    A["animation.zt.figure.listen"] = {"loop": True, "animation_length": 2.4, "bones": {
        "pelvis": {"position": [0, -1.0, 0]},
        "rightThigh": {"rotation": [-12, 0, 0]},
        "leftThigh": {"rotation": [-12, 0, 0]},
        "rightShin": {"rotation": [22, 0, 0]},
        "leftShin": {"rotation": [22, 0, 0]},
        "neck": {"rotation": [12, 0, 0]},
        # head cocked one way then the other, straining to hear
        "head": {"rotation": ["math.sin(%s * 300) * 3" % t, "math.sin(%s * 75) * 18" % t, "math.sin(%s * 150) * 16" % t]},
        "rightArm": {"rotation": [-10, 0, 6]},
        "leftArm": {"rotation": [-10, 0, -6]},
    }}
    roar = [
        (0.0, {}),
        (0.35, {"chest": [-14, 0, 0], "neck": [-10, 0, 0], "head": [-32, 0, 0], "rightArm": [-30, 0, 48],
                "leftArm": [-30, 0, -48], "rightForearm": [-20, 0, 0], "leftForearm": [-20, 0, 0]}),
        (1.3, {"chest": [-10, 0, 0], "neck": [-6, 0, 0], "head": [-24, 0, 0], "rightArm": [-36, 0, 52],
               "leftArm": [-36, 0, -52], "rightForearm": [-26, 0, 0], "leftForearm": [-26, 0, 0]}),
        (1.65, {"chest": [16, 0, 0], "neck": [10, 0, 0], "head": [14, 0, 0], "rightArm": [-60, 0, 20],
                "leftArm": [-60, 0, -20]}),
        (2.0, {}),
    ]
    A["animation.zt.figure.roar"] = {"loop": "hold_on_last_frame", "animation_length": 2.0,
                                     "bones": track(roar, FIG_BONES)}
    A["animation.zt.figure.roar"]["bones"].setdefault("head", {})["position"] = [
        "math.sin(q.anim_time * 2400) * 0.15", 0, 0]
    kill = [
        (0.0, {}),
        (0.22, {"belly": [10, 0, 0], "chest": [26, 0, 0], "head": [-6, 0, 0], "rightArm": [-100, 0, 14],
                "leftArm": [-100, 0, -14], "rightForearm": [-10, 0, 0], "leftForearm": [-10, 0, 0]}),
        (0.45, {"belly": [12, 0, 0], "chest": [30, 0, 0], "head": [22, 0, 0], "rightArm": [-70, 0, -10],
                "leftArm": [-70, 0, 10], "rightForearm": [-50, 0, 0], "leftForearm": [-50, 0, 0]}),
        (1.0, {}),
    ]
    A["animation.zt.figure.kill"] = {"loop": "hold_on_last_frame", "animation_length": 1.0,
                                     "bones": track(kill, FIG_BONES)}
    t = "q.anim_time"
    A["animation.zt.figure.stumble"] = {"loop": True, "animation_length": 1.2, "bones": {
        "head": {"rotation": ["math.sin(%s * 300) * 6" % t, 0, "math.sin(%s * 150) * 20" % t]},
        "chest": {"rotation": [6, 0, "math.sin(%s * 300) * 6" % t]},
        "rightArm": {"rotation": ["math.sin(%s * 300) * 20" % t, 0, "12 + math.sin(%s * 600) * 6" % t]},
        "leftArm": {"rotation": ["-math.sin(%s * 300) * 20" % t, 0, "-12 - math.sin(%s * 600) * 6" % t]},
    }}
    return {"format_version": "1.8.0", "animations": A}


def figure_controllers():
    gait = P("zt:gait")
    act = P("zt:act")
    acts = {1: "listen", 2: "roar", 3: "kill", 4: "stumble"}
    act_states = {"none": {"transitions": [{n: "%s == %d" % (act, i)} for i, n in acts.items()], "blend_transition": 0.25}}
    for i, n in acts.items():
        act_states[n] = {"animations": [n], "transitions": [{"none": "%s != %d" % (act, i)}], "blend_transition": 0.25}
    return {"format_version": "1.10.0", "animation_controllers": {
        "controller.animation.zt.figure.gait": {"initial_state": "idle", "states": {
            "idle": {"animations": ["idle"], "transitions": [{"walk": "%s == 1" % gait}, {"run": "%s == 2" % gait}],
                     "blend_transition": 0.3},
            "walk": {"animations": ["walk"], "transitions": [{"idle": "%s == 0" % gait}, {"run": "%s == 2" % gait}],
                     "blend_transition": 0.3},
            "run": {"animations": ["run"], "transitions": [{"idle": "%s == 0" % gait}, {"walk": "%s == 1" % gait}],
                    "blend_transition": 0.25},
        }},
        "controller.animation.zt.figure.act": {"initial_state": "none", "states": act_states},
    }}


# =============================================================================================
# Seek
# =============================================================================================
SEEK_BONES = ["root", "puddle", "body", "hips", "torso", "head", "pupil"] + [
    s + b for s in ("right", "left") for b in ("Thigh", "Shin", "Arm", "Forearm", "Hand")]


def seek_animations():
    A = {}
    anim = P("zt:anim")
    A["animation.zt.seek.base"] = {"loop": True, "bones": {
        "puddle": {"scale": "%s == 1 ? 1.0 : 0.0" % anim},
        # the big eye darts around
        "pupil": {"position": ["math.sin(q.life_time * 70) * 0.35 + math.sin(q.life_time * 310) * 0.1",
                               "math.cos(q.life_time * 50) * 0.25", 0]},
    }}
    t = "q.anim_time"
    A["animation.zt.seek.idle"] = {"loop": True, "animation_length": 2.4, "bones": {
        "body": {"position": [0, "math.sin(%s * 150) * 0.3" % t, 0]},
        "torso": {"rotation": ["math.sin(%s * 150) * 3" % t, 0, "math.sin(%s * 75) * 4" % t]},
        "head": {"rotation": ["math.sin(%s * 150 + 60) * 4" % t, "math.sin(%s * 75) * 8" % t, 0]},
        "rightArm": {"rotation": ["math.sin(%s * 150) * 6" % t, 0, "math.sin(%s * 75) * 3" % t]},
        "leftArm": {"rotation": ["-math.sin(%s * 150) * 6" % t, 0, "-math.sin(%s * 75) * 3" % t]},
    }}
    rise = [
        (0.0, {"body_pos": [0, -36, 0], "torso": [40, 0, 0], "head": [30, 0, 0], "rightArm": [-160, 0, 10],
               "leftArm": [-160, 0, -10]}),
        (0.9, {"body_pos": [0, -24, 0], "torso": [34, 0, 6], "head": [24, 0, -10], "rightArm": [-130, 0, 20],
               "leftArm": [-140, 0, -20]}),
        (1.8, {"body_pos": [0, -9, 0], "torso": [18, 0, -6], "head": [10, 0, 8], "rightArm": [-50, 0, 24],
               "leftArm": [-60, 0, -24]}),
        (2.5, {"body_pos": [0, 1.2, 0], "torso": [-10, 0, 0], "head": [-16, 0, 0], "rightArm": [-20, 0, 40],
               "leftArm": [-20, 0, -40], "rightForearm": [-30, 0, 0], "leftForearm": [-30, 0, 0]}),
        (3.0, {}),
    ]
    A["animation.zt.seek.rise"] = {"loop": "hold_on_last_frame", "animation_length": 3.0,
                                   "bones": track(rise, SEEK_BONES)}
    A["animation.zt.seek.rise"]["bones"]["body"]["scale"] = [
        "1.0 + math.sin(q.anim_time * 900) * 0.04", "1.0", "1.0 + math.cos(q.anim_time * 900) * 0.04"]
    ph = "(q.anim_time * 720)"
    A["animation.zt.seek.run"] = {"loop": True, "animation_length": 0.5, "bones": {
        "body": {"position": [0, "math.abs(math.sin(%s)) * 1.2" % ph, 0]},
        "torso": {"rotation": ["22 + math.sin(%s * 2) * 3" % ph, "math.sin(%s) * 8" % ph, 0]},
        "head": {"rotation": ["-18", "-math.sin(%s) * 6" % ph, 0]},
        "rightThigh": {"rotation": ["math.sin(%s) * 55" % ph, 0, 0]},
        "leftThigh": {"rotation": ["-math.sin(%s) * 55" % ph, 0, 0]},
        "rightShin": {"rotation": ["math.max(0, math.cos(%s)) * 70" % ph, 0, 0]},
        "leftShin": {"rotation": ["math.max(0, -math.cos(%s)) * 70" % ph, 0, 0]},
        "rightArm": {"rotation": ["-math.sin(%s) * 62" % ph, 0, 8]},
        "leftArm": {"rotation": ["math.sin(%s) * 62" % ph, 0, -8]},
        "rightForearm": {"rotation": ["-25 - math.max(0, math.sin(%s)) * 30" % ph, 0, 0]},
        "leftForearm": {"rotation": ["-25 - math.max(0, -math.sin(%s)) * 30" % ph, 0, 0]},
    }}
    kill = [
        (0.0, {}),
        (0.2, {"torso": [34, 0, 0], "head": [-10, 0, 0], "rightArm": [-105, 0, 12], "leftArm": [-105, 0, -12]}),
        (0.45, {"torso": [40, 0, 0], "head": [18, 0, 0], "rightArm": [-80, 0, -14], "leftArm": [-80, 0, 14],
                "rightForearm": [-50, 0, 0], "leftForearm": [-50, 0, 0]}),
        (0.8, {"torso": [30, 0, 0], "head": [10, 0, 0], "rightArm": [-70, 0, -10], "leftArm": [-70, 0, 10],
               "rightForearm": [-60, 0, 0], "leftForearm": [-60, 0, 0]}),
    ]
    A["animation.zt.seek.kill"] = {"loop": "hold_on_last_frame", "animation_length": 0.8,
                                   "bones": track(kill, SEEK_BONES)}
    return {"format_version": "1.8.0", "animations": A}


def seek_controller():
    anim = P("zt:anim")
    names = {0: "idle", 1: "rise", 2: "run", 3: "kill"}
    states = {}
    for i, n in names.items():
        states[n] = {"animations": [n], "transitions": [{m: "%s == %d" % (anim, j)} for j, m in names.items() if j != i],
                     "blend_transition": 0.0 if n == "rise" else 0.2}
    return {"format_version": "1.10.0", "animation_controllers": {
        "controller.animation.zt.seek.main": {"initial_state": "idle", "states": states}}}


# =============================================================================================
# Props
# =============================================================================================
def prop_animations():
    A = {}
    A["animation.zt.door.open"] = {"loop": "hold_on_last_frame", "animation_length": 0.5, "bones": {
        "hinge": {"rotation": keys([(0.0, [0, 0, 0]), (0.35, [0, 108, 0]), (0.5, [0, 100, 0])])}}}
    A["animation.zt.door.close"] = {"loop": "hold_on_last_frame", "animation_length": 0.25, "bones": {
        "hinge": {"rotation": keys([(0.0, [0, 100, 0]), (0.2, [0, -3, 0]), (0.25, [0, 0, 0])])}}}
    # Seek's hands: hidden in the wall, burst out, grope, grab
    fingers = ["finger%d" % k for k in range(4)]
    out_pose = {"arm_pos": [0, 0, 0], "finger0": [-25, -18, 0], "finger1": [-20, -6, 0], "finger2": [-20, 6, 0],
                "finger3": [-25, 18, 0], "thumb": [0, 20, 0]}
    burst = [
        (0.0, {"arm_pos": [0, 0, 38], "arm": [0, 0, 0]}),
        (0.18, {"arm_pos": [0, 0, -4], "arm": [6, 10, 0], "forearm": [-8, -12, 0]}),
        (0.3, out_pose),
        (0.45, dict(out_pose, arm=[-4, -6, 0])),
    ]
    A["animation.zt.hand.burst"] = {"loop": "hold_on_last_frame", "animation_length": 0.45,
                                    "bones": track(burst, ["arm", "forearm", "thumb"] + fingers)}
    t = "q.anim_time"
    A["animation.zt.hand.grope"] = {"loop": True, "animation_length": 1.6, "bones": dict(
        {"arm": {"rotation": ["math.sin(%s * 225 + 90) * 7" % t, "math.sin(%s * 225) * 12" % t, 0]},
         "forearm": {"rotation": ["math.sin(%s * 450) * 6" % t, "math.sin(%s * 225 + 45) * 10" % t, 0]}},
        **{f: {"rotation": ["-22 + math.sin(%s * 450 + %d) * 22" % (t, k * 40), (-18, -6, 6, 18)[k], 0]}
           for k, f in enumerate(fingers)},
        **{f + "b": {"rotation": ["math.max(0, math.sin(%s * 450 + %d)) * 40" % (t, k * 40), 0, 0]}
           for k, f in enumerate(fingers)})}
    grab = [
        (0.0, out_pose),
        (0.15, dict({f: [70, 0, 0] for f in fingers}, arm_pos=[0, 0, -2], thumb=[0, -30, 0])),
        (0.5, dict({f: [80, 0, 0] for f in fingers}, arm_pos=[0, 0, 10], thumb=[0, -30, 0])),
    ]
    A["animation.zt.hand.grab"] = {"loop": "hold_on_last_frame", "animation_length": 0.5,
                                   "bones": track(grab, ["arm", "thumb"] + fingers)}
    for f in fingers:
        A["animation.zt.hand.grab"]["bones"][f + "b"] = {"rotation": [80, 0, 0]}
    A["animation.zt.hand.base"] = {"loop": True, "bones": {
        "root": {"scale": "%s == 0 ? 0.0 : 1.0" % P("zt:anim")}}}
    # chandeliers
    A["animation.zt.chandelier.hang"] = {"loop": True, "animation_length": 5.0, "bones": {
        "body": {"rotation": ["math.sin(q.anim_time * 72) * 2", 0, "math.cos(q.anim_time * 72) * 2"]}}}
    A["animation.zt.chandelier.fall"] = {"loop": True, "animation_length": 0.3, "bones": {
        "body": {"rotation": ["math.sin(q.anim_time * 1200) * 9", 0, "math.cos(q.anim_time * 1000) * 9"]}}}
    A["animation.zt.chandelier.fallen"] = {"loop": True, "bones": {
        "chain": {"scale": 0.0},
        "body": {"rotation": [-14, 0, 22], "position": [0, -2.5, 0]},
        "arm0": {"rotation": [28, 0, 0]},
        "arm2": {"rotation": [-34, 0, 10]},
        "arm4": {"rotation": [0, 0, 26]},
    }}
    # scenery faces the way the script set (zt:yaw, world degrees), whatever its body's rotation:
    # +Y on the root turns the model right, as a growing yaw does
    turn = "(q.property('zt:yaw') - q.body_y_rotation)"
    A["animation.zt.prop.face"] = {"loop": True, "bones": {"root": {"rotation": [0, turn, 0]}}}
    # the eyes watch you: the head's turn from the body, less the turn the model already has
    rel = "(math.mod(q.target_y_rotation - %s + 540.0, 360.0) - 180.0)" % turn
    look_x = "math.clamp(-%s / 40.0, -1.0, 1.0)" % rel
    look_y = "math.clamp(-q.target_x_rotation / 40.0, -1.0, 1.0)"
    A["animation.zt.seek_eye.look"] = {"loop": True, "bones": {
        "pupil": {"position": ["%s * 1.0" % look_x, "%s * 0.6" % look_y, 0]},
        "pupil2": {"position": ["%s * 0.7" % look_x, "%s * 0.4" % look_y, 0]},
    }}
    # a library book sliding a little in and out of its shelf
    A["animation.zt.library_book.idle"] = {"loop": True, "animation_length": 2.0, "bones": {
        "book": {"position": [0, 0, "math.sin(q.anim_time * 180) * 0.3 - 0.3"]}}}
    A["animation.zt.library_lamp.fall"] = {"loop": "hold_on_last_frame", "animation_length": 0.6, "bones": {
        "lamp": {"rotation": keys([(0.0, [0, 0, 0]), (0.45, [92, 0, 0]), (0.52, [84, 0, 0]), (0.6, [88, 0, 0])])}}}
    return {"format_version": "1.8.0", "animations": A}


def prop_controllers():
    is_open = P("zt:open")
    hand = P("zt:anim")
    state = P("zt:state")
    return {"format_version": "1.10.0", "animation_controllers": {
        "controller.animation.zt.door": {"initial_state": "closed", "states": {
            "closed": {"transitions": [{"opening": is_open}]},
            "opening": {"animations": ["open"], "transitions": [{"closing": "!" + is_open}]},
            "closing": {"animations": ["close"], "transitions": [{"opening": is_open},
                                                                 {"closed": "q.all_animations_finished"}]},
        }},
        "controller.animation.zt.hand": {"initial_state": "hidden", "states": {
            "hidden": {"transitions": [{"burst": "%s == 1" % hand}, {"grab": "%s == 2" % hand}]},
            "burst": {"animations": ["burst"], "transitions": [{"grope": "q.all_animations_finished"},
                                                               {"grab": "%s == 2" % hand}, {"hidden": "%s == 0" % hand}]},
            "grope": {"animations": ["grope"], "transitions": [{"grab": "%s == 2" % hand}, {"hidden": "%s == 0" % hand}],
                      "blend_transition": 0.15},
            "grab": {"animations": ["grab"], "transitions": [{"grope": "%s == 1" % hand}, {"hidden": "%s == 0" % hand}],
                     "blend_transition": 0.1},
        }},
        "controller.animation.zt.chandelier": {"initial_state": "hang", "states": {
            "hang": {"animations": ["hang"], "transitions": [{"fall": "%s == 1" % state}, {"fallen": "%s == 2" % state}]},
            "fall": {"animations": ["fall"], "transitions": [{"fallen": "%s == 2" % state}, {"hang": "%s == 0" % state}]},
            "fallen": {"animations": ["fallen"], "transitions": [{"hang": "%s == 0" % state}]},
        }},
        "controller.animation.zt.library_lamp": {"initial_state": "standing", "states": {
            "standing": {"transitions": [{"fallen": P("zt:fallen")}]},
            "fallen": {"animations": ["fall"], "transitions": [{"standing": "!" + P("zt:fallen")}]},
        }},
    }}


def main():
    write("animations/figure.animation.json", figure_animations())
    write("animation_controllers/figure.animation_controllers.json", figure_controllers())
    write("animations/seek.animation.json", seek_animations())
    write("animation_controllers/seek.animation_controllers.json", seek_controller())
    write("animations/doors_props.animation.json", prop_animations())
    write("animation_controllers/doors_props.animation_controllers.json", prop_controllers())
    print("doors animations written")


if __name__ == "__main__":
    main()
