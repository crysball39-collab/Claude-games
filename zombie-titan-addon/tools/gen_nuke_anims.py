"""Builds the animations of the nukes: the silo's hatch doors swinging open and shut and its
payload rising for launch; the rocket climbing and the bomb falling; the mushroom cloud's whole
life (the fireball, the stem rising, the cap rolling over and spreading, the ring of
condensation, the skirt of dust, and at last its drifting apart); the radiation spit's spin and
the Radiation Zombie's spit.

The silo's doors are hinged on the rim (gen_nuke_art.py): the right door opens with a negative Z,
the left with a positive one. The mushroom cloud is driven by the script: zt:age is how old it
is (seconds), zt:size how big (times its 4-block model) and zt:lift how far the entity stands
above where the cloud's foot should be.

    python3 tools/gen_nuke_anims.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

DOOR_TIME = 3.0          # nukes.js waits as long before it calls the doors open
DOOR_ANGLE = 110
RAISE_TIME = 2.5
RAISE = 12               # pixels the payload rises out of the silo (nukes.js launches from there)
CLOUD_FADE = (150, 180)  # seconds: the cloud drifts apart, then nukes.js removes it


def smooth(x):
    """Molang for smoothstep(clamp(x, 0, 1))."""
    c = "math.clamp(%s, 0, 1)" % x
    return "(%s * %s * (3 - 2 * %s))" % (c, c, c)


def silo_animations():
    p = "animation.zt.silo."
    opening = smooth("q.anim_time / %g" % DOOR_TIME)
    closing = "(1 - %s)" % opening
    return {
        p + "doors_open": {"animation_length": DOOR_TIME, "bones": {
            "door_r": {"rotation": [0, 0, "-%d * %s" % (DOOR_ANGLE, opening)]},
            "door_l": {"rotation": [0, 0, "%d * %s" % (DOOR_ANGLE, opening)]},
            # (the whole silo shudders as they start and stop)
            "silo": {"position": ["(q.anim_time < 0.3 || (q.anim_time > 2.8)) ? math.sin(q.anim_time * 4000) * 0.12 : 0", 0, 0]},
        }},
        p + "doors_opened": {"loop": True, "bones": {
            "door_r": {"rotation": [0, 0, -DOOR_ANGLE]},
            "door_l": {"rotation": [0, 0, DOOR_ANGLE]},
        }},
        p + "doors_close": {"animation_length": DOOR_TIME, "bones": {
            "door_r": {"rotation": [0, 0, "-%d * %s" % (DOOR_ANGLE, closing)]},
            "door_l": {"rotation": [0, 0, "%d * %s" % (DOOR_ANGLE, closing)]},
            "silo": {"position": ["(q.anim_time < 0.3 || (q.anim_time > 2.8)) ? math.sin(q.anim_time * 4000) * 0.12 : 0", 0, 0]},
        }},
        # armed: the payload rises to the rim, and shakes as the countdown runs out
        p + "raise": {"loop": "hold_on_last_frame", "animation_length": 12.0, "bones": {"payload": {"position": [
            "q.anim_time > 7 ? math.sin(q.anim_time * 3000) * 0.25 : 0",
            "%d * %s" % (RAISE, smooth("q.anim_time / %g" % RAISE_TIME)),
            "q.anim_time > 7 ? math.cos(q.anim_time * 2700) * 0.25 : 0"]}}},
    }


def silo_controllers():
    p = "controller.animation.zt.silo."
    is_open = "q.property('zt:open')"
    return {
        p + "doors": {"initial_state": "default", "states": {
            # (seen for the first time: as they are, without swinging)
            "default": {"transitions": [{"opened": is_open}, {"closed": "!" + is_open}]},
            "closed": {"transitions": [{"opening": is_open}]},
            "opening": {"animations": ["doors_open"],
                        "transitions": [{"closing": "!" + is_open}, {"opened": "q.all_animations_finished"}]},
            "opened": {"animations": ["doors_opened"], "transitions": [{"closing": "!" + is_open}]},
            "closing": {"animations": ["doors_close"],
                        "transitions": [{"opening": is_open}, {"closed": "q.all_animations_finished"}]},
        }},
        p + "stage": {"initial_state": "idle", "states": {
            "idle": {"transitions": [{"armed": "q.property('zt:stage') == 1"}]},
            "armed": {"animations": ["raise"], "transitions": [{"idle": "q.property('zt:stage') != 1"}]},
        }},
    }


def rocket_animations():
    p = "animation.zt.nuke_rocket."
    return {
        p + "flame": {"loop": True, "bones": {"flame": {"scale": [
            "0.9 + math.sin(q.life_time * 2400) * 0.15", "1.1 + math.sin(q.life_time * 1900) * 0.3",
            "0.9 + math.cos(q.life_time * 2600) * 0.15"]}}},
        p + "climb": {"loop": True, "bones": {"rocket": {"rotation": [
            "math.sin(q.life_time * 500) * 1.5", 0, "math.cos(q.life_time * 430) * 1.5"]}}},
        # nose down, wobbling and turning slowly as it falls
        p + "fall": {"loop": True, "bones": {"rocket": {"rotation": [
            "180 + math.sin(q.life_time * 300) * 4", "q.life_time * 120", "math.cos(q.life_time * 270) * 4"]}}},
    }


def rocket_controllers():
    """Climbing, and a missile diving, it trails fire and smoke from its nozzle; a bomb falls
    without them."""
    falling = "q.property('zt:falling')"
    missile = "q.property('zt:kind') == 2"
    trail = {"effect": "trail", "locator": "nozzle"}
    return {"controller.animation.zt.nuke_rocket.main": {"initial_state": "climb", "states": {
        "climb": {"animations": ["flame", "climb"], "particle_effects": [{"effect": "flame", "locator": "nozzle"}, trail],
                  "transitions": [{"dive": "%s && %s" % (falling, missile)}, {"fall": "%s && !%s" % (falling, missile)}]},
        # (nose down, its exhaust blows up)
        "dive": {"animations": ["flame", "fall"], "particle_effects": [{"effect": "flame_up", "locator": "nozzle"}, trail],
                 "transitions": [{"climb": "!" + falling}]},
        "fall": {"animations": ["fall"], "transitions": [{"climb": "!" + falling}]},
    }}}


def cloud_animations():
    a = "v.age"
    fade = "math.clamp((v.age - %d) / %d, 0, 1)" % (CLOUD_FADE[0], CLOUD_FADE[1] - CLOUD_FADE[0])
    later = "math.clamp((v.age - 14) / 106, 0, 1)"       # the slow spreading after the first rush
    stem_w = "(0.5 + 0.5 * math.clamp(v.age / 8, 0, 1) + 0.1 * %s) * (1 - 0.8 * %s)" % (later, fade)
    cap_s = "(0.3 + 0.7 * %s + 0.25 * %s)" % (smooth("v.age / 14"), later)
    skirt = "1.5 * %s" % smooth("(v.age - 1) / 14")
    ring = "math.clamp((v.age - 3) / 3, 0, 1) * (1 + (v.age - 3) * 0.03) * (1 - math.clamp((v.age - 14) / 6, 0, 1))"
    fire = "(v.age < 1.5 ? 0.3 + v.age / 1.5 * 1.2 : math.max(0, 1.5 - (v.age - 1.5) / 12.5 * 1.5))"
    return {"animation.zt.mushroom_cloud.grow": {"loop": True, "bones": {
        "base": {"position": [0, "-q.property('zt:lift') * 16", 0]},
        "cloud": {"scale": "q.property('zt:size')"},
        "fireball": {"position": [0, "math.min(%s * 3, 34)" % a, 0], "scale": fire,
                     "rotation": ["%s * 40" % a, "%s * 55" % a, 0]},
        "stem": {"scale": [stem_w, "math.clamp((v.age - 0.5) / 10, 0, 1)", stem_w]},
        "cap": {"position": [0, "-28 + 28 * %s" % smooth("v.age / 12"), 0],
                "rotation": [0, "%s * 3" % a, 0],
                "scale": ["%s * (1 + 0.5 * %s)" % (cap_s, fade), "%s * (1 - 0.7 * %s)" % (cap_s, fade),
                          "%s * (1 + 0.5 * %s)" % (cap_s, fade)]},
        "skirt": {"scale": [skirt, "(1 - 0.6 * math.clamp((v.age - 15) / 60, 0, 1)) * (1 - %s)" % fade, skirt]},
        "ring": {"scale": [ring, 1, ring]},
    }}}


def cloud_controllers():
    return {"controller.animation.zt.mushroom_cloud.main": {"initial_state": "default", "states": {
        "default": {"animations": ["grow"]}}}}


def radiation_animations():
    return {
        "animation.zt.radiation_spit.spin": {"loop": True, "bones": {"orb": {
            "rotation": ["q.life_time * 480", "q.life_time * 300", 0],
            "scale": "1 + math.sin(q.life_time * 1500) * 0.12"}}},
        # the Radiation Zombie's head goes back, then lunges forward as it spits
        "animation.zt.radiation_zombie.spit": {"animation_length": 0.6, "bones": {
            "head": {"rotation": {"0.0": [0, 0, 0], "0.3": [-35, 0, 0], "0.42": [25, 0, 0], "0.6": [0, 0, 0]}},
            "body": {"rotation": {"0.0": [0, 0, 0], "0.3": [-8, 0, 0], "0.42": [10, 0, 0], "0.6": [0, 0, 0]}},
        }},
    }


def write(rel, data):
    path = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def main():
    write("animations/nukes.animation.json", {"format_version": "1.10.0", "animations": {
        **silo_animations(), **rocket_animations(), **cloud_animations(), **radiation_animations()}})
    write("animation_controllers/nukes.animation_controllers.json", {"format_version": "1.10.0", "animation_controllers": {
        **silo_controllers(), **rocket_controllers(), **cloud_controllers()}})
    print("nuke animations written")


if __name__ == "__main__":
    main()
