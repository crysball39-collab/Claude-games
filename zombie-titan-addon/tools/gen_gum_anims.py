"""Builds the Gum Gum Fruit's player animations: the stretching arms and leg of
each move, Gear 2, and the flags that turn the player's skin pink.

The scripts play these on the player with Entity.playAnimation, so every
player nearby sees them. An arm stretches by scaling its bone along its
length; the arm's cube starts 2 px above the shoulder pivot, so each stretch
also slides the bone back along the arm by 2 * (scale - 1) px to keep the
shoulder end in place. Arms point where the player looks: in third person the
same way the vanilla bow pose aims (-90 + target_x_rotation), in first person
straight along the view (the first-person body already turns with the view).

The reach of an arm is chosen per throw from a few lengths (the script picks
the one that reaches the target), since playAnimation can't pass a length.

    python3 tools/gen_gum_anims.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

PX_PER_BLOCK = 16 / 0.9375  # the player model is drawn at 0.9375 scale
PUNCH_REACH = [4, 7, 10, 13, 16]
ROCKET_REACH = [6, 10, 14, 18, 22]
FP = "v.is_first_person"


def arm_scale(reach):
    """Scale that makes an arm reach `reach` blocks from the shoulder."""
    return round((reach * PX_PER_BLOCK + 2) / 12, 3)


def sel(fp, tp):
    return "(%s ? (%s) : (%s))" % (FP, fp, tp)


AIM_X = sel("-90", "-90 + q.target_x_rotation")
AIM_Y = sel("0", "q.target_y_rotation")


def arm_key(x, y, s):
    """Rotation, position and scale of a stretched arm. x, y: Molang rotation; s: scale (number or Molang)."""
    rot = [x, y, 0]
    if isinstance(s, (int, float)) and abs(s - 1) < 1e-6:
        return rot, [0, 0, 0], [1, 1, 1]
    k = "(2 * ((%s) - 1))" % s if isinstance(s, str) else "%g" % round(2 * (s - 1), 3)
    pos = [
        "%s * math.sin(%s) * math.sin(%s)" % (k, x, y),
        "-%s * math.cos(%s)" % (k, x),
        "%s * math.sin(%s) * math.cos(%s)" % (k, x, y),
    ]
    return rot, pos, [1, s, 1]


def arm_track(keys):
    """keys: [(time, x, y, s)] -> bone channels."""
    rot, pos, scl = {}, {}, {}
    for t, x, y, s in keys:
        r, p, sc = arm_key(str(x), str(y), s)
        key = "%.2f" % t
        rot[key], pos[key], scl[key] = r, p, sc
    return {"rotation": rot, "position": pos, "scale": scl}


def leg_track(keys):
    rot, scl = {}, {}
    for t, x, s in keys:
        key = "%.2f" % t
        rot[key] = [x, 0, 0]
        scl[key] = [1, s, 1]
    return {"rotation": rot, "scale": scl}


def move(length, bones, flags_start, flags_end="v.zt_both_arms = 0; v.zt_leg = 0;"):
    return {
        "animation_length": length,
        "override_previous_animation": True,
        "bones": bones,
        "timeline": {"0.00": flags_start, "%.2f" % length: flags_end},
    }


ONE_ARM = "v.zt_both_arms = 0; v.zt_leg = 0;"
TWO_ARMS = "v.zt_both_arms = 1; v.zt_leg = 0;"
LEG = "v.zt_both_arms = 0; v.zt_leg = 1;"
REST_X, REST_Y = 0, 0
BACK_X = sel("-25", "55")   # an arm pulled back behind the shoulder


def throw_keys(w, p, h, e, s, back):
    """Pull the arm back stretched, swing it to the aim while short, shoot it out to full length,
    hold, then shrink it back along the aim before it drops (so a long arm never sweeps the ground)."""
    return [
        (0.0, REST_X, REST_Y, 1),
        (w, BACK_X, 0, back),
        (w + (p - w) * 0.45, AIM_X, AIM_Y, 1.2),
        (p, AIM_X, AIM_Y, s),
        (h, AIM_X, AIM_Y, s),
        (h + (e - h) * 0.6, AIM_X, AIM_Y, 1.0),
        (e, REST_X, REST_Y, 1),
    ]


def pistol(reach, jet):
    s = arm_scale(reach)
    w, p, h, e = (0.12, 0.17, 0.25, 0.4) if jet else (0.35, 0.45, 0.6, 0.9)
    return move(e, {"rightArm": arm_track(throw_keys(w, p, h, e, s, 1.7))}, ONE_ARM)


def bazooka(reach, jet):
    s = arm_scale(reach)
    w, p, h, e = (0.15, 0.21, 0.31, 0.5) if jet else (0.5, 0.62, 0.8, 1.15)
    keys = throw_keys(w, p, h, e, s, 2.0)
    return move(e, {"rightArm": arm_track(keys), "leftArm": arm_track(keys)}, TWO_ARMS)


def gatling(jet):
    freq = 4320 if jet else 2160   # degrees per second: each arm punches 6 (12) times a second
    length = 7.0
    bones = {}
    for bone, phase in (("rightArm", 0), ("leftArm", 180)):
        stretch = "(1 + 3.2 * math.max(0, math.sin(q.anim_time * %d + %d)))" % (freq, phase)
        x = sel("-90 + math.sin(q.anim_time * %d) * 8" % (freq // 3), "-90 + q.target_x_rotation + math.sin(q.anim_time * %d) * 8" % (freq // 3))
        y = sel("math.cos(q.anim_time * %d + %d) * 10" % (freq // 2, phase), "q.target_y_rotation + math.cos(q.anim_time * %d + %d) * 10" % (freq // 2, phase))
        r, p, sc = arm_key(x, y, stretch)
        bones[bone] = {"rotation": r, "position": p, "scale": sc}
    return move(length, bones, TWO_ARMS)


def stamp(jet):
    up, slam, hold, end = (0.15, 0.25, 0.35, 0.55) if jet else (0.45, 0.6, 0.75, 1.1)
    # up: the leg stretches straight up; slam: it snaps down onto the ground 3 blocks ahead
    return move(end, {"rightLeg": leg_track([
        (0.0, 0, 1),
        (up, -170, 3.6),
        (slam, -78, 4.4),
        (hold, -78, 4.4),
        (end, 0, 1),
    ])}, LEG)


def rocket(reach, jet):
    s = arm_scale(reach)
    w, g, h, e = (0.06, 0.12, 0.18, 0.4) if jet else (0.15, 0.3, 0.42, 0.85)
    keys = throw_keys(w, g, h, e, s, 1.3)   # the arms pull back in as the player flies to what they grabbed
    return move(e, {"rightArm": arm_track(keys), "leftArm": arm_track(keys)}, TWO_ARMS)


def gear2():
    """Crouches into a lunge and stretches a fist down to the ground; the skin turns pink at 0.8 s."""
    down = sel("-35", "-12")
    keys = [(0.0, 0, 0, 1), (0.5, down, 0, 2.0), (1.0, down, 0, 2.0), (1.4, 0, 0, 1)]
    lean = {"0.00": [sel("q.target_x_rotation", "0"), sel("q.target_y_rotation", "0"), 0],
            "0.50": [sel("q.target_x_rotation", "28"), sel("q.target_y_rotation", "0"), 0],
            "1.00": [sel("q.target_x_rotation", "28"), sel("q.target_y_rotation", "0"), 0],
            "1.40": [sel("q.target_x_rotation", "0"), sel("q.target_y_rotation", "0"), 0]}
    bones = {
        "body": {"rotation": lean},
        "rightArm": arm_track(keys),
        "leftArm": {"rotation": {"0.00": [0, 0, 0], "0.50": [35, 0, -12], "1.00": [35, 0, -12], "1.40": [0, 0, 0]}},
        "rightLeg": {"rotation": {"0.00": [0, 0, 0], "0.50": [-38, 0, 0], "1.00": [-38, 0, 0], "1.40": [0, 0, 0]}},
        "leftLeg": {"rotation": {"0.00": [0, 0, 0], "0.50": [28, 0, 0], "1.00": [28, 0, 0], "1.40": [0, 0, 0]}},
    }
    a = move(1.4, bones, ONE_ARM)
    a["timeline"]["0.80"] = "v.zt_gear2 = 1;"
    return a


def animations():
    A = {}
    for jet in (False, True):
        pre = "animation.zt.gum.jet_" if jet else "animation.zt.gum."
        for r in PUNCH_REACH:
            A["%spistol_%d" % (pre, r)] = pistol(r, jet)
            A["%sbazooka_%d" % (pre, r)] = bazooka(r, jet)
        for r in ROCKET_REACH:
            A["%srocket_%d" % (pre, r)] = rocket(r, jet)
        A[pre + "gatling"] = gatling(jet)
        A[pre + "stamp"] = stamp(jet)
    A["animation.zt.gum.gear2"] = gear2()
    # the Gear 2 flag: re-sent every couple of seconds so players who arrive later see the pink skin too
    A["animation.zt.gum.gear2_on"] = {"animation_length": 0.05, "timeline": {"0.00": "v.zt_gear2 = 1;"}}
    A["animation.zt.gum.gear2_off"] = {"animation_length": 0.05, "timeline": {"0.00": "v.zt_gear2 = 0;"}}
    return {"format_version": "1.8.0", "animations": A}


def main():
    p = os.path.join(RP, "animations", "gum_gum.animation.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(animations(), f, indent="\t")
        f.write("\n")
    print("gum gum animations written:", len(animations()["animations"]))


if __name__ == "__main__":
    main()
