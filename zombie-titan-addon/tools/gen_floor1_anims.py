"""Builds the Hotel's (Floor 1) animations and animation controllers.

Script-driven properties pick the state: zt:open (closets, the elevator doors, the gates,
the breaker box's door: played through controller.animation.zt.door), zt:drawers (a bitmask
of open drawers, eased by the client entity's v.d0..v.d2), a lever's zt:on (eased by v.pull /
v.flip), the metal door's zt:bang and zt:broken, Rush's zt:anim (0 flying, 1 dragged into the
floor) and Screech's zt:anim (0 lurking, 1 biting, 2 fleeing, 3 dragged into the floor).

Rotation conventions: -X swings a hanging limb forward, +X tilts an upright part forward,
+Y turns right (it swings a door hinged on its -X edge out to the front), and positions use
the geometry's axes (-Z is the front).

    python3 tools/gen_floor1_anims.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_anims import P, keys, write  # noqa: E402

T = "q.anim_time"
L = "q.life_time"


def hold(length, bones):
    return {"loop": "hold_on_last_frame", "animation_length": length, "bones": bones}


def loop(bones, length=None):
    a = {"loop": True, "bones": bones}
    if length:
        a["animation_length"] = length
    return a


# =============================================================================================
# furniture
# =============================================================================================
def furniture():
    A = {}
    # closets: the two doors swing out, and back
    A["animation.zt.wardrobe.open"] = hold(0.3, {
        "door_l": {"rotation": keys([(0.0, [0, 0, 0]), (0.22, [0, 112, 0]), (0.3, [0, 105, 0])])},
        "door_r": {"rotation": keys([(0.0, [0, 0, 0]), (0.22, [0, -112, 0]), (0.3, [0, -105, 0])])}})
    A["animation.zt.wardrobe.close"] = hold(0.25, {
        "door_l": {"rotation": keys([(0.0, [0, 105, 0]), (0.2, [0, -2, 0]), (0.25, [0, 0, 0])])},
        "door_r": {"rotation": keys([(0.0, [0, -105, 0]), (0.2, [0, 2, 0]), (0.25, [0, 0, 0])])}})
    # drawers slide out to the front (v.dN eases between 0 and 1 in the client entity)
    A["animation.zt.drawers"] = loop({"d%d" % k: {"position": [0, 0, "-v.d%d * 7.0" % k]} for k in range(3)})
    # a key lying somewhere turns slowly, catching the light; one on the rack hangs still
    A["animation.zt.room_key.spin"] = loop({"flat": {
        "rotation": [0, "%s * 40.0" % L, 0], "position": [0, "0.3 + math.sin(%s * 120.0) * 0.3" % L, 0]}})
    return A


# =============================================================================================
# doors and gates
# =============================================================================================
def doors():
    A = {}
    # the lobby's elevators: two brass panels slide apart into the walls
    A["animation.zt.elevator_door.open"] = hold(1.0, {
        "left": {"position": keys([(0.0, [0, 0, 0]), (1.0, [-15, 0, 0])])},
        "right": {"position": keys([(0.0, [0, 0, 0]), (1.0, [15, 0, 0])])}})
    A["animation.zt.elevator_door.close"] = hold(1.0, {
        "left": {"position": keys([(0.0, [-15, 0, 0]), (1.0, [0, 0, 0])])},
        "right": {"position": keys([(0.0, [15, 0, 0]), (1.0, [0, 0, 0])])}})
    # door 100's wide grey gate grinds apart, slowly
    A["animation.zt.big_gate.open"] = hold(3.0, {
        "left": {"position": keys([(0.0, [0, 0, 0]), (0.4, [-1, 0, 0]), (3.0, [-44, 0, 0])])},
        "right": {"position": keys([(0.0, [0, 0, 0]), (0.4, [1, 0, 0]), (3.0, [44, 0, 0])])}})
    A["animation.zt.big_gate.close"] = hold(1.5, {
        "left": {"position": keys([(0.0, [-44, 0, 0]), (1.5, [0, 0, 0])])},
        "right": {"position": keys([(0.0, [44, 0, 0]), (1.5, [0, 0, 0])])}})
    # the elevator's folding lattice gate concertinas to the sides (scaled about its outer edges)
    A["animation.zt.elevator_gate.open"] = hold(0.6, {
        "left": {"scale": keys([(0.0, [1, 1, 1]), (0.6, [0.12, 1, 1])])},
        "right": {"scale": keys([(0.0, [1, 1, 1]), (0.6, [0.12, 1, 1])])}})
    A["animation.zt.elevator_gate.close"] = hold(0.45, {
        "left": {"scale": keys([(0.0, [0.12, 1, 1]), (0.45, [1, 1, 1])])},
        "right": {"scale": keys([(0.0, [0.12, 1, 1]), (0.45, [1, 1, 1])])}})
    # the High Voltage room's metal door: the Figure slams into it (it bulges in), and on the third
    # time it tears off and falls flat into the room
    A["animation.zt.metal_door.bang"] = hold(0.3, {
        "hinge": {"rotation": keys([(0.0, [0, 0, 0]), (0.06, [-3, -4, 1]), (0.16, [1, 1.5, 0]), (0.3, [0, 0, 0])]),
                  "position": keys([(0.0, [0, 0, 0]), (0.06, [0, 0, 1.4]), (0.16, [0, 0, -0.3]), (0.3, [0, 0, 0])])}})
    A["animation.zt.metal_door.broken"] = hold(0.7, {
        "hinge": {"rotation": keys([(0.0, [0, 0, 0]), (0.25, [-50, 8, 6]), (0.55, [-92, 10, 4]), (0.62, [-86, 10, 4]),
                                    (0.7, [-90, 10, 4])]),
                  "position": keys([(0.0, [0, 0, 0]), (0.25, [0, 3, 6]), (0.55, [0, 1, 10]), (0.7, [0, 1, 10])])}})
    # the breaker box's door
    A["animation.zt.breaker_box.open"] = hold(0.5, {
        "door": {"rotation": keys([(0.0, [0, 0, 0]), (0.4, [0, 118, 0]), (0.5, [0, 112, 0])])}})
    A["animation.zt.breaker_box.close"] = hold(0.3, {
        "door": {"rotation": keys([(0.0, [0, 112, 0]), (0.3, [0, 0, 0])])}})
    return A


# =============================================================================================
# door 100's lever, switches and wire; the herb
# =============================================================================================
def fittings():
    A = {}
    # the big lever: up and out from the wall, pulled down (v.pull eases 0 -> 1)
    A["animation.zt.wall_lever.pull"] = loop({"handle": {"rotation": ["v.pull * 120.0", 0, 0]}})
    # a breaker switch: tipped down when off, up when on (v.flip eases between the two)
    A["animation.zt.breaker_lever.flip"] = loop({"handle": {"rotation": ["35.0 - v.flip * 70.0", 0, 0]}})
    # the live wire sways from the pipe, its frayed end twitching
    A["animation.zt.live_wire.sway"] = loop({
        "c1": {"rotation": ["math.sin(%s * 50.0) * 3.0" % L, 0, "math.cos(%s * 40.0) * 2.0" % L]},
        "c2": {"rotation": ["math.sin(%s * 50.0 + 40.0) * 4.0" % L, 0, "math.cos(%s * 40.0 + 30.0) * 3.0" % L]},
        "c3": {"rotation": ["math.sin(%s * 50.0 + 80.0) * 6.0 + math.sin(%s * 1700.0) * 2.0" % (L, L), 0,
                            "math.cos(%s * 40.0 + 60.0) * 5.0 + math.cos(%s * 1300.0) * 2.0" % (L, L)]}})
    # the herb's leaves stir; its bud glows and swells a little
    A["animation.zt.herb_plant.sway"] = loop({
        "leaves": {"rotation": ["math.sin(%s * 60.0) * 3.0" % L, "%s * 6.0" % L, "math.cos(%s * 50.0) * 3.0" % L]},
        "bud": {"scale": "1.0 + math.sin(%s * 140.0) * 0.12" % L}})
    return A


# =============================================================================================
# Jeff and El Goblino
# =============================================================================================
def shop():
    A = {}
    bones = {
        "body": {"position": [0, "math.sin(%s * 90.0) * 0.5" % T, 0], "rotation": [0, "math.sin(%s * 45.0) * 3.0" % T, 0]},
        # it blinks now and then
        "eyes": {"scale": [1, "math.mod(%s, 4.0) < 0.12 ? 0.1 : 1.0" % T, 1]},
        "pupils": {"position": ["math.sin(%s * 45.0) * 0.4" % T, 0, 0]},
    }
    for k in range(6):
        ph = k * 60
        bones["t%d_0" % k] = {"rotation": ["math.sin(%s * 90.0 + %d) * 6.0" % (T, ph), 0, "math.cos(%s * 90.0 + %d) * 5.0" % (T, ph)]}
        bones["t%d_1" % k] = {"rotation": ["math.sin(%s * 90.0 + %d) * 9.0" % (T, ph + 40), 0, 0]}
        bones["t%d_2" % k] = {"rotation": ["math.sin(%s * 90.0 + %d) * 12.0" % (T, ph + 80), 0, 0]}
    A["animation.zt.jeff.idle"] = loop(bones, 4.0)
    A["animation.zt.el_goblino.idle"] = loop({
        "body": {"position": [0, "math.abs(math.sin(%s * 180.0)) * 0.6" % T, 0]},
        "head": {"rotation": ["math.sin(%s * 90.0) * 4.0" % T, "math.sin(%s * 45.0) * 10.0" % T, "math.sin(%s * 90.0) * 5.0" % T]},
        "ear_r": {"rotation": [0, 0, "math.max(0.0, math.sin(%s * 360.0) - 0.7) * 30.0" % T]},
        "ear_l": {"rotation": [0, 0, "-math.max(0.0, math.sin(%s * 360.0 + 120.0) - 0.7) * 30.0" % T]},
        # he waves you over
        "arm_r": {"rotation": ["-60.0 - math.sin(%s * 360.0) * 15.0" % T, 0, "-20.0 + math.sin(%s * 360.0) * 20.0" % T]},
        "arm_l": {"rotation": ["math.sin(%s * 180.0) * 5.0" % T, 0, 0]},
    }, 4.0)
    return A


# =============================================================================================
# Rush and Screech
# =============================================================================================
def creatures():
    A = {}
    # Rush: a boiling cloud of smoke round a face that won't stop shaking
    A["animation.zt.rush.fly"] = loop({
        "cloud": {"rotation": [0, 0, "math.sin(%s * 400.0) * 4.0" % L],
                  "scale": ["1.0 + math.sin(%s * 700.0) * 0.06" % L, "1.0 + math.cos(%s * 650.0) * 0.06" % L, 1]},
        "face": {"position": ["math.sin(%s * 2300.0) * 0.6" % L, "math.cos(%s * 1900.0) * 0.6" % L, 0]},
        "pupils": {"position": ["math.sin(%s * 3100.0) * 0.5" % L, "math.sin(%s * 2700.0) * 0.5" % L, 0]},
    })
    # dragged down into the floor by the Guiding Light's chains, thrashing
    A["animation.zt.rush.sink"] = hold(2.4, {
        "cloud": {"position": keys([(0.0, [0, 0, 0]), (0.4, [0, 2, 0]), (2.4, [0, -44, 0])]),
                  "rotation": ["math.sin(%s * 2000.0) * 8.0" % L, 0, "math.cos(%s * 1700.0) * 10.0" % L]},
        "face": {"position": ["math.sin(%s * 4000.0) * 1.2" % L, "math.cos(%s * 3500.0) * 1.2" % L, 0]},
    })
    tent = {}
    for k in range(6):
        ph = k * 60
        tent["t%d" % k] = {"rotation": ["math.sin(%s * 200.0 + %d) * 14.0" % (L, ph), 0, "math.cos(%s * 160.0 + %d) * 10.0" % (L, ph)]}
        tent["t%d_b" % k] = {"rotation": ["math.sin(%s * 200.0 + %d) * 20.0" % (L, ph + 60), 0, 0]}
    # Screech: hangs in the dark, bobbing, tentacles writhing
    A["animation.zt.screech.lurk"] = loop(dict(tent, body={
        "position": ["math.sin(%s * 70.0) * 0.6" % L, "math.sin(%s * 110.0) * 1.0" % L, 0],
        "rotation": [0, "math.sin(%s * 50.0) * 12.0" % L, "math.sin(%s * 80.0) * 6.0" % L]}))
    # too slow: it lunges and bites
    A["animation.zt.screech.bite"] = hold(0.5, dict(tent, body={
        "position": keys([(0.0, [0, 0, 0]), (0.12, [0, 1, -9]), (0.3, [0, 0, -7]), (0.5, [0, 0, 0])]),
        "scale": keys([(0.0, [1, 1, 1]), (0.12, [1.3, 1.3, 1.3]), (0.5, [1, 1, 1])])},
        jaw={"rotation": keys([(0.0, [0, 0, 0]), (0.08, [45, 0, 0]), (0.18, [0, 0, 0]), (0.5, [0, 0, 0])])}))
    # seen: it shrieks and darts away
    A["animation.zt.screech.flee"] = hold(0.5, dict(tent, body={
        "position": keys([(0.0, [0, 0, 0]), (0.1, [0, 1, -2]), (0.5, [0, 4, 14])]),
        "rotation": keys([(0.0, [0, 0, 0]), (0.5, [0, 220, 0])]),
        "scale": keys([(0.0, [1, 1, 1]), (0.1, [1.2, 1.2, 1.2]), (0.5, [0, 0, 0])])},
        jaw={"rotation": [40, 0, 0]}))
    A["animation.zt.screech.sink"] = hold(1.4, dict(tent, body={
        "position": keys([(0.0, [0, 0, 0]), (1.4, [0, -34, 0])]),
        "rotation": ["math.sin(%s * 2200.0) * 10.0" % L, 0, "math.cos(%s * 1900.0) * 10.0" % L]}))
    return A


def controllers():
    is_open, bang, broken = P("zt:open"), P("zt:bang"), P("zt:broken")
    anim = P("zt:anim")
    return {"format_version": "1.10.0", "animation_controllers": {
        "controller.animation.zt.metal_door": {"initial_state": "closed", "states": {
            "closed": {"transitions": [{"broken": broken}, {"opening": is_open}, {"bang": bang}]},
            "bang": {"animations": ["bang"], "transitions": [{"broken": broken}, {"opening": is_open},
                                                             {"closed": "!%s && q.all_animations_finished" % bang}]},
            "opening": {"animations": ["open"], "transitions": [{"broken": broken}, {"closing": "!" + is_open}]},
            "closing": {"animations": ["close"], "transitions": [{"broken": broken}, {"opening": is_open},
                                                                 {"closed": "q.all_animations_finished"}]},
            "broken": {"animations": ["broken"], "transitions": [{"closed": "!" + broken}]},
        }},
        "controller.animation.zt.rush": {"initial_state": "fly", "states": {
            "fly": {"animations": ["fly"], "transitions": [{"sink": "%s == 1" % anim}]},
            "sink": {"animations": ["sink"], "transitions": [{"fly": "%s == 0" % anim}]},
        }},
        "controller.animation.zt.screech": {"initial_state": "lurk", "states": {
            "lurk": {"animations": ["lurk"], "transitions": [{"bite": "%s == 1" % anim}, {"flee": "%s == 2" % anim},
                                                             {"sink": "%s == 3" % anim}]},
            "bite": {"animations": ["bite"], "transitions": [{"lurk": "%s == 0" % anim}, {"flee": "%s == 2" % anim},
                                                             {"sink": "%s == 3" % anim}]},
            "flee": {"animations": ["flee"], "transitions": [{"lurk": "%s == 0" % anim}]},
            "sink": {"animations": ["sink"], "transitions": [{"lurk": "%s == 0" % anim}]},
        }},
    }}


def main():
    A = {}
    for part in (furniture(), doors(), fittings(), shop(), creatures()):
        A.update(part)
    write("animations/hotel.animation.json", {"format_version": "1.8.0", "animations": A})
    write("animation_controllers/hotel.animation_controllers.json", controllers())
    print("floor 1 animations written")


if __name__ == "__main__":
    main()
