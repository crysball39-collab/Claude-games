"""Builds the Player's animations. player.js drives them through the Player's properties:

    zt:pose    0 standing, 1 sneaking, 2 swimming, 3 asleep, 4 sitting
    zt:use     0 nothing, 1 eating or drinking, 2 drawing a bow, 3 shield up, 4 crafting or working at a
               table, 5 throwing, 6 stopping to think, 7 waving
    zt:swing   a counter: each change swings the right arm (a hit, a block mined or placed)
    zt:look_x  head pitch (down is positive), zt:look_y head turn from the body (right is positive)

The client entity smooths look_x/look_y into v.look_x/v.look_y, times the swing in v.swing_t
and v.swing_p (0 to 1 over 0.3 s), and works out the walk cycle v.tcos0 the way a player's is.
Rotation conventions (model faces -Z): -X swings an arm or leg forward, +X tips the body or head
forward, +Y turns right.

    python3 tools/gen_player_anims.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
LT = "q.life_time"


def anim(bones, **extra):
    a = {"loop": True, "bones": bones}
    a.update(extra)
    return a


def animations():
    A = {}
    # idle: the arms sway a little as it breathes
    A["base"] = anim({
        "rightArm": {"rotation": [0, 0, "(math.cos(%s * 103.2) * 2.865) + 2.865" % LT]},
        "leftArm": {"rotation": [0, 0, "-((math.cos(%s * 103.2) * 2.865) + 2.865)" % LT]},
    })
    A["look"] = anim({"head": {"rotation": ["v.look_x", "v.look_y", 0]}})
    # holding something: the arm comes up a little, as a player's does
    A["hold"] = anim({"rightArm": {"rotation": ["q.is_item_equipped(0) ? -18.0 : 0.0", 0, 0]},
                      "leftArm": {"rotation": ["q.is_item_equipped(1) ? -18.0 : 0.0", 0, 0]}})
    A["walk"] = anim({
        "rightArm": {"rotation": ["-v.tcos0", 0, 0]},
        "leftArm": {"rotation": ["v.tcos0", 0, 0]},
        "rightLeg": {"rotation": ["v.tcos0 * 1.4", 0.1, 0.1]},
        "leftLeg": {"rotation": ["v.tcos0 * -1.4", -0.1, -0.1]},
    })
    # sneaking: it leans forward from the hips, knees bent (the legs stay upright)
    A["sneak"] = anim({
        "root": {"rotation": [28.0, 0, 0], "position": [0, 1.25, 9.0]},
        "rightLeg": {"rotation": [-28.0, 0, 0]},
        "leftLeg": {"rotation": [-28.0, 0, 0]},
        "rightArm": {"rotation": [-5.7, 0, 0]},
        "leftArm": {"rotation": [-5.7, 0, 0]},
        "head": {"position": [0, -1.0, 0]},
        "body": {"position": [0, -2.0, 0]},
    })
    # swimming: flat in the water, face down, arms sweeping, legs kicking
    A["swim"] = anim({
        "root": {"rotation": [80.0, 0, 0], "position": [0, 6.0, -10.0]},
        "head": {"rotation": [-70.0, 0, 0]},
        "rightArm": {"rotation": ["-168.0 + math.sin(%s * 200.0) * 28.0" % LT, 0, "math.cos(%s * 200.0) * 24.0" % LT]},
        "leftArm": {"rotation": ["-168.0 - math.sin(%s * 200.0) * 28.0" % LT, 0, "-math.cos(%s * 200.0) * 24.0" % LT]},
        "rightLeg": {"rotation": ["math.sin(%s * 400.0) * 20.0" % LT, 0, 0]},
        "leftLeg": {"rotation": ["-math.sin(%s * 400.0) * 20.0" % LT, 0, 0]},
    })
    # asleep on its back in a bed
    A["sleep"] = anim({
        "root": {"rotation": [-90.0, 0, 0], "position": [0, 9.0, 12.0]},
        "head": {"rotation": [0, 0, 0]},
        "rightArm": {"rotation": [0, 0, 6.0]},
        "leftArm": {"rotation": [0, 0, -6.0]},
    }, override_previous_animation=True)
    # sitting on the ground, legs out in front
    A["sit"] = anim({
        "root": {"position": [0, -10.0, 0]},
        "rightLeg": {"rotation": [-80.0, 8.0, 0]},
        "leftLeg": {"rotation": [-80.0, -8.0, 0]},
        "rightArm": {"rotation": [-20.0, 0, 6.0]},
        "leftArm": {"rotation": [-20.0, 0, -6.0]},
    })
    # an arm swing, over 0.3 s (the player attack swing: up, across and down)
    p = "v.swing_p"
    eased = "math.sin((1.0 - math.pow(1.0 - %s, 4.0)) * 180.0)" % p
    A["swing"] = anim({
        "body": {"rotation": [0, "math.sin(math.sqrt(%s) * 360.0) * 8.0" % p, 0]},
        "rightArm": {"rotation": ["-(%s * 1.2 + math.sin(%s * 180.0)) * 38.0" % (eased, p),
                                  "-%s * 20.0" % eased, "%s * 8.0" % eased]},
        "leftArm": {"rotation": ["-(%s * 1.2 + math.sin(%s * 180.0)) * 8.0" % (eased, p), 0, 0]},
    })
    # eating or drinking: the hand at its mouth, bobbing
    A["eat"] = anim({
        "rightArm": {"rotation": ["-62.0 + math.sin(%s * 720.0) * 9.0" % LT, -22.5, -5.6]},
        "head": {"rotation": ["math.sin(%s * 720.0) * 4.0" % LT, 0, 0]},
    })
    # drawing a bow: both arms up along where it looks
    A["bow"] = anim({
        "rightArm": {"rotation": ["v.look_x - 90.0 + math.sin(%s * 76.8) * 2.865" % LT, "v.look_y - 5.73", 2.865]},
        "leftArm": {"rotation": ["v.look_x - 90.0 - math.sin(%s * 76.8) * 2.865" % LT, "v.look_y + 28.65", -2.865]},
    })
    # shield up in the off hand
    A["shield"] = anim({"leftArm": {"rotation": [-50.0, 25.0, 0]}, "rightArm": {"rotation": [-10.0, 0, 0]}})
    # crafting: both hands busy in front of it
    A["work"] = anim({
        "rightArm": {"rotation": ["-50.0 + math.sin(%s * 600.0) * 12.0" % LT, -12.0, 0]},
        "leftArm": {"rotation": ["-45.0 + math.cos(%s * 600.0) * 12.0" % LT, 12.0, 0]},
        "head": {"rotation": [18.0, 0, 0]},
    })
    # throwing (an ender pearl, an eye of ender): the arm goes up and over
    A["throw"] = anim({"rightArm": {"rotation": [-150.0, -10.0, 0]}})
    # stopping to think: a hand to its chin, head tipped, eyes up
    A["think"] = anim({
        "rightArm": {"rotation": [-112.0, -38.0, 12.0]},
        "leftArm": {"rotation": [-30.0, 30.0, 0]},
        "head": {"rotation": ["-12.0 + math.sin(%s * 40.0) * 4.0" % LT, "math.sin(%s * 25.0) * 10.0" % LT, 8.0]},
    })
    # waving hello
    A["wave"] = anim({"rightArm": {"rotation": [-165.0, 0, "math.sin(%s * 720.0) * 22.0 - 10.0" % LT]}})
    return {"format_version": "1.8.0", "animations": {"animation.zt.player." + k: v for k, v in A.items()}}


def main():
    path = os.path.join(RP, "animations", "zt_player.animation.json")
    with open(path, "w") as f:
        json.dump(animations(), f, indent="\t")
        f.write("\n")
    print("player animations written")


if __name__ == "__main__":
    main()
