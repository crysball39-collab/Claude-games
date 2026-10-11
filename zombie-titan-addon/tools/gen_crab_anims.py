"""Builds the animations of the Crabulon update: the Shroomy Crab's scuttle, its sideways walk,
its idle pincer twitching and its claw snap; Crabulon's (the same bones, ten blocks tall): its
walk, its Bullet Barrage, its jump (crouch, flight, landing), its Summon and Shroom Rain, its claw
snap, its roar, its descent from the roof and its death; the Crab Totem rising off the altar.

The crab's standing pose is the bind pose of its geometry (gen_crab_art.py): every pose here
is a change from it. A leg lifts by swinging further out from its hip (Z: out for the left
legs is negative, for the right ones positive) and strides by turning on its hip (Y); four legs
step together, the other four half a stride later. A pincer opens with a negative X.

    python3 tools/gen_crab_anims.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

# the two groups of four legs that step together
GAIT_A = ["l0", "r1", "l2", "r3"]
GAIT_B = ["r0", "l1", "r2", "l3"]


def side_sign(leg):
    """+1 for the left legs (they swing out with a negative Z), -1 for the right ones."""
    return 1 if leg[0] == "l" else -1


def scuttle(rate, lift, stride, bob):
    """A walk cycle: `rate` degrees of phase a second."""
    bones = {}
    for group, phase in ((GAIT_A, 0), (GAIT_B, 180)):
        for leg in group:
            s = side_sign(leg)
            wave = "math.sin(q.anim_time * %d + %d)" % (rate, phase)
            bones["leg_" + leg] = {"rotation": [0, 0, "%s * math.max(0, %s) * %s" % (-s, wave, lift)]}
            bones["hip_" + leg] = {"rotation": [0, "math.cos(q.anim_time * %d + %d) * %s" % (rate, phase, stride), 0]}
    bones["body"] = {"position": [0, "math.abs(math.sin(q.anim_time * %d)) * %s" % (rate, bob), 0],
                     "rotation": [0, 0, "math.sin(q.anim_time * %d) * 2" % rate]}
    return bones


def crab_animations():
    p = "animation.zt.shroomy_crab."
    return {
        p + "walk": {"loop": True, "bones": scuttle(900, 20, 12, 0.35)},
        # it walks sideways, as crabs do: its body turns across the way it's going
        p + "sidle": {"loop": True, "bones": {"root": {"rotation": [0, 90, 0]}}},
        p + "idle": {"loop": True, "bones": {
            "rightPincer": {"rotation": ["-6 - math.sin(q.life_time * 110) * 8", 0, 0]},
            "leftPincer": {"rotation": ["-6 - math.sin(q.life_time * 110 + 70) * 8", 0, 0]},
            "eyes": {"rotation": ["math.sin(q.life_time * 80) * 4", "math.sin(q.life_time * 50) * 6", 0]},
            "shrooms": {"rotation": [0, 0, "math.sin(q.life_time * 60) * 2"]},
            "body": {"position": [0, "math.sin(q.life_time * 90) * 0.12", 0]},
        }},
        # a snap: the right claw reaches up and forward, its pincer wide, and shuts on the swing
        p + "attack": {"loop": True, "bones": {
            "rightArm": {"rotation": ["-math.sin(v.attack_time * 180) * 40", "math.sin(v.attack_time * 180) * 10", 0]},
            "rightPincer": {"rotation": ["v.attack_time < 0.6 ? -30 : 0", 0, 0]},
            "leftArm": {"rotation": ["-math.sin(v.attack_time * 180) * 15", 0, 0]},
            "body": {"rotation": ["-math.sin(v.attack_time * 180) * 6", 0, 0]},
        }},
    }


def crab_controllers():
    p = "controller.animation.zt.shroomy_crab."
    return {
        p + "move": {"initial_state": "still", "states": {
            "still": {"animations": ["idle"], "transitions": [{"moving": "q.ground_speed > 0.4"}], "blend_transition": 0.25},
            "moving": {"animations": ["walk", {"sidle": "v.attack_time > 0 ? 0 : 1"}],
                       "transitions": [{"still": "q.ground_speed < 0.2"}], "blend_transition": 0.25},
        }},
    }


# Crabulon's animations, by the value of its zt:anim property (crabulon.js sets it)
BOSS = {"barrage": 1, "crouch": 2, "air": 3, "land": 4, "summon": 5, "rain": 6, "claw": 7, "roar": 8, "descend": 9}
LEGS = ["%s%d" % (sd, i) for sd in "lr" for i in range(4)]


def legs_pose(spread=0, shin=0):
    """Every leg swung further out (spread > 0) and its shin bent back in (shin > 0)."""
    bones = {}
    for leg in LEGS:
        s = side_sign(leg)
        bones["leg_" + leg] = {"rotation": [0, 0, -s * spread]}
        bones["shin_" + leg] = {"rotation": [0, 0, s * shin]}
    return bones


def merge(*parts):
    out = {}
    for part in parts:
        for bone, chans in part.items():
            out.setdefault(bone, {}).update(chans)
    return out


def arms(x, y, pincer=None, tremble=0):
    """Both claws: raised by x (negative is up and forward), turned out by y; pincers opened."""
    t = " + math.sin(q.anim_time * 1700) * %s" % tremble if tremble else ""
    out = {"rightArm": {"rotation": ["%s%s" % (x, t), y, 0]}, "leftArm": {"rotation": ["%s%s" % (x, t), -y if isinstance(y, (int, float)) else "-(%s)" % y, 0]}}
    if pincer is not None:
        out["rightPincer"] = {"rotation": [pincer, 0, 0]}
        out["leftPincer"] = {"rotation": [pincer, 0, 0]}
    return out


def crabulon_animations():
    p = "animation.zt.crabulon."
    speed = "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 1.4 : 1.0)"
    return {
        p + "idle": {"loop": True, "bones": {
            "rightPincer": {"rotation": ["-8 - math.sin(q.life_time * 70) * 10", 0, 0]},
            "leftPincer": {"rotation": ["-8 - math.sin(q.life_time * 70 + 90) * 10", 0, 0]},
            "eyes": {"rotation": ["math.sin(q.life_time * 50) * 5", "math.sin(q.life_time * 30) * 10", 0]},
            "shrooms": {"rotation": [0, 0, "math.sin(q.life_time * 40) * 2"],
                        "scale": "1 + math.sin(q.life_time * 120) * 0.03"},
            "body": {"position": [0, "math.sin(q.life_time * 60) * 0.18", 0]},
        }},
        p + "walk": {"loop": True, "anim_time_update": speed, "bones": scuttle(640, 22, 14, 0.4)},
        # Bullet Barrage: claws thrown wide, its shell shuddering, the mushrooms on its back pulsing
        p + "barrage": {"loop": True, "bones": merge(arms(-38, 38, -35), {
            "body": {"position": ["math.sin(q.anim_time * 2200) * 0.12", 0, 0]},
            "shrooms": {"scale": "1.05 + math.sin(q.anim_time * 900) * 0.08"},
            "eyes": {"rotation": [-10, 0, 0]},
        })},
        # the jump: it crouches, tucks its legs in the air, and lands squashed, claws down
        p + "crouch": {"loop": "hold_on_last_frame", "animation_length": 0.6, "bones": merge(
            {k: {"rotation": {"0.0": v["rotation"], "0.6": v["rotation"]}} for k, v in legs_pose(18, 26).items()},
            {"body": {"position": {"0.0": [0, 0, 0], "0.6": [0, -2.6, 0]}},
             "rightArm": {"rotation": {"0.0": [0, 0, 0], "0.6": [18, 0, 0]}},
             "leftArm": {"rotation": {"0.0": [0, 0, 0], "0.6": [18, 0, 0]}}})},
        p + "air": {"loop": True, "bones": merge(legs_pose(-34, -22), arms(-50, 20, -30), {"eyes": {"rotation": [12, 0, 0]}})},
        p + "land": {"loop": "hold_on_last_frame", "animation_length": 0.5, "bones": merge(
            {k: {"rotation": {"0.0": [0, 0, v["rotation"][2] * 1.4], "0.5": [0, 0, 0]}} for k, v in legs_pose(20, 0).items()},
            {"body": {"position": {"0.0": [0, -2.2, 0], "0.5": [0, 0, 0]}},
             "rightArm": {"rotation": {"0.0": [26, 0, 0], "0.5": [0, 0, 0]}},
             "leftArm": {"rotation": {"0.0": [26, 0, 0], "0.5": [0, 0, 0]}}})},
        # Summon: it beats its claws on the floor, calling up its crabs
        p + "summon": {"loop": True, "bones": {
            "rightArm": {"rotation": ["10 + math.sin(q.anim_time * 600) * 32", 10, 0]},
            "leftArm": {"rotation": ["10 + math.sin(q.anim_time * 600 + 180) * 32", -10, 0]},
            "body": {"position": [0, "-math.abs(math.sin(q.anim_time * 600)) * 0.6", 0]},
        }},
        # Shroom Rain: it rears up, claws to the roof, and the spores fly
        p + "rain": {"loop": True, "bones": merge(arms(-82, 14, -40, tremble=4), {
            "body": {"rotation": [-9, 0, 0], "position": [0, 0.8, 0]},
            "eyes": {"rotation": [-22, 0, 0]},
            "shrooms": {"scale": "1.08 + math.sin(q.anim_time * 700) * 0.06"},
        })},
        # the claw snap: the right claw drawn up and back, open, then down and shut
        p + "claw": {"loop": "hold_on_last_frame", "animation_length": 0.9, "bones": {
            "rightArm": {"rotation": {"0.0": [0, 0, 0], "0.35": [-55, 25, 0], "0.5": [14, -12, 0], "0.9": [0, 0, 0]}},
            "rightPincer": {"rotation": {"0.0": [0, 0, 0], "0.35": [-45, 0, 0], "0.47": [-45, 0, 0], "0.52": [4, 0, 0], "0.9": [0, 0, 0]}},
            "body": {"rotation": {"0.0": [0, 0, 0], "0.35": [-5, 8, 0], "0.5": [4, -6, 0], "0.9": [0, 0, 0]}},
        }},
        # the roar: reared up, claws spread high and wide, pincers gaping, eyes thrown back
        p + "roar": {"loop": True, "bones": merge(arms(-70, 45, -48, tremble=3), {
            "body": {"rotation": [-15, 0, 0], "position": ["math.sin(q.anim_time * 2600) * 0.1", 1.2, 0]},
            "eyes": {"rotation": [18, 0, 0]},
            "shrooms": {"scale": "1.1 + math.sin(q.anim_time * 1100) * 0.05"},
        })},
        # coming down from the roof: legs hanging, claws up
        p + "descend": {"loop": True, "bones": merge(legs_pose(-40, -14), arms(-60, 22, -20), {
            "body": {"rotation": [0, 0, "math.sin(q.anim_time * 200) * 3"]}})},
        # its death: it slumps, its legs curling in under it, claws dropping, its glow dimming
        p + "death": {"loop": "hold_on_last_frame", "animation_length": 2.5, "bones": merge(
            {k: {"rotation": {"0.0": [0, 0, 0], "1.6": [0, 0, v["rotation"][2]]}} for k, v in legs_pose(-55, -40).items()},
            {"body": {"position": {"0.0": [0, 0, 0], "1.0": [0, 1.0, 0], "2.0": [0, -3.0, 0]},
                      "rotation": {"0.0": [0, 0, 0], "1.0": [-12, 0, 0], "2.0": [6, 0, 22]}},
             "rightArm": {"rotation": {"0.0": [-60, 30, 0], "1.0": [-70, 30, 0], "2.0": [35, 10, 0]}},
             "leftArm": {"rotation": {"0.0": [-60, -30, 0], "1.0": [-70, -30, 0], "2.0": [35, -10, 0]}},
             "eyes": {"rotation": {"0.0": [0, 0, 0], "2.0": [55, 0, 0]}},
             "shrooms": {"scale": {"0.0": [1, 1, 1], "2.5": [0.85, 0.7, 0.85]}}})},
    }


def crabulon_controller():
    p = "controller.animation.zt.crabulon."
    anim = "q.property('zt:anim')"
    states = {"default": {"animations": ["idle", {"walk": "q.property('zt:moving') ? 1 : 0"}],
                          "transitions": [{name: "%s == %d" % (anim, k)} for name, k in BOSS.items()],
                          "blend_transition": 0.25}}
    for name, k in BOSS.items():
        states[name] = {"animations": [name] + (["idle"] if name in ("barrage", "rain", "summon") else []),
                        "transitions": [{"default": "%s == 0" % anim}] +
                                       [{other: "%s == %d" % (anim, j)} for other, j in BOSS.items() if other != name],
                        "blend_transition": 0.12 if name in ("land", "air") else 0.25}
    return {p + "main": {"initial_state": "default", "states": states}}


def totem_animations():
    # the Crab Totem rises off the altar, turning, and swells before it bursts in a blue flash
    return {"animation.zt.crab_totem.rise": {"loop": True, "bones": {"totem": {
        "position": [0, "math.min(q.life_time, 3.0) * 16", 0],
        "rotation": [0, "q.life_time * q.life_time * 60", 0],
        "scale": "1 + math.max(0, q.life_time - 2.5) * 1.6",
    }}}, "animation.zt.falling_shroom.spin": {"loop": True, "bones": {"shroom": {
        "rotation": ["math.sin(q.life_time * 400) * 8", "q.life_time * 200", 0]}}}}


def write(rel, data):
    path = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def main():
    write("animations/crabs.animation.json", {"format_version": "1.10.0", "animations": {
        **crab_animations(), **crabulon_animations(), **totem_animations()}})
    write("animation_controllers/crabs.animation_controllers.json",
          {"format_version": "1.10.0", "animation_controllers": {**crab_controllers(), **crabulon_controller()}})
    print("crab animations written")


if __name__ == "__main__":
    main()
