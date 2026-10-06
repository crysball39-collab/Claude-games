"""Builds the Omegafish's animations and animation controller.

Its body is a chain of segments (gen_omegafish_art.py): seg2 in the middle, seg1 and the head
in front, seg3, seg4, seg5 and the tail behind. A wave runs down it as it slithers. Rotation
conventions: +X turns a segment's front end down, so it lowers the head (front chain) and lifts
the tail (rear chain); +Y turns it right; positions use the
geometry's axes (-Z is the front) and, rendered 16x, one unit is one block.

Timings (ticks) match omegafish.js: the head butt lands on 14, the tail swipe on 20, the
lightning shot on 45, the tail smash on 38 and the body slam on 52; flopped on its back it lies
for 20 seconds; a burrow dives in a second and holds it underground until it erupts.

    python3 tools/gen_omegafish_anims.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

FRONT = ["seg1", "head"]
BACK = ["seg3", "seg4", "seg5", "tail"]
LEGS = ["leg_%s_%s" % (s, side) for s in ("seg1", "seg2", "seg3") for side in ("r", "l")]
BONES = ["root", "seg2"] + FRONT + BACK + ["mandibles", "antennae", "prongs"] + LEGS
T = "q.anim_time"


def r(v):
    return round(v, 3)


def add(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            cur = out.get(k, [0, 0, 0])
            out[k] = [cur[i] + v[i] for i in range(3)]
    return out


def pose(rear=0, head=0, tail=0, curl=0, swing=0, y=0, z=0, roll=0, jaws=0):
    """rear < 0 lifts the front half (seg1 and the head), head tips the head (< 0 up), tail > 0 lifts the
    back half, curl bends the whole rear chain sideways, swing bends the front sideways,
    y/z move the whole body, roll turns it over (180 = on its back), jaws open the mandibles."""
    p = {"seg1": [rear, swing, 0], "head": [head + rear * 0.4, swing * 0.8, 0], "root_pos": [0, y, z], "root": [0, 0, roll],
         "mandibles": [0, 0, 0]}
    for i, b in enumerate(BACK):
        p[b] = [tail * (0.5 + 0.25 * i), curl * (0.6 + 0.3 * i), 0]
    if jaws:
        p["mandibles"] = [-jaws, 0, 0]
    return p


REST = {}


def timeline(frames, speed=2.0, loop="hold_on_last_frame"):
    """frames: (seconds, pose[, 'linear']) -> an animation (catmull-rom between keys)."""
    bones = {}
    for bone in BONES:
        rot_used = any(bone in f[1] for f in frames)
        pos_used = any((bone + "_pos") in f[1] for f in frames)
        if not rot_used and not pos_used:
            continue
        rot, pos = {}, {}
        for f in frames:
            t, p = f[0], f[1]
            smooth = len(f) < 3
            key = "%.2f" % t
            if rot_used:
                v = [r(x) for x in p.get(bone, [0, 0, 0])]
                rot[key] = {"post": v, "lerp_mode": "catmullrom"} if smooth else v
            if pos_used:
                v = [r(x) for x in p.get(bone + "_pos", [0, 0, 0])]
                pos[key] = {"post": v, "lerp_mode": "catmullrom"} if smooth else v
        entry = {}
        if rot_used:
            entry["rotation"] = rot
        if pos_used:
            entry["position"] = pos
        bones[bone] = entry
    a = {"loop": loop, "animation_length": frames[-1][0], "bones": bones}
    if speed:
        a["anim_time_update"] = "q.anim_time + q.delta_time * (q.property('zt:enraged') ? %.1f : 1.0)" % speed
    return a


def wave(period, amp, phase_step=40.0, legs_amp=0.0):
    """A wave running from the head down to the tail (the way a silverfish slithers)."""
    w = 360.0 / period
    chain = ["head", "seg1", "seg2"] + BACK
    bones = {}
    for i, b in enumerate(chain):
        a = amp * (0.6 + 0.12 * i)
        bones[b] = {"rotation": [0, "math.sin(%s * %.1f - %.1f) * %.2f" % (T, w, i * phase_step, a), 0]}
    bones["antennae"] = {"rotation": ["math.sin(%s * %.1f) * 6.0" % (T, w * 2), "math.sin(%s * %.1f + 60) * 8.0" % (T, w), 0]}
    bones["prongs"] = {"rotation": [0, "math.sin(%s * %.1f - 260) * 10.0" % (T, w), 0]}
    if legs_amp:
        for j, leg in enumerate(LEGS):
            ph = (j // 2) * 120 + (j % 2) * 180
            bones[leg] = {"rotation": ["math.sin(%s * %.1f + %d) * %.1f" % (T, w * 2, ph, legs_amp), 0, 0]}
    return bones


def animations():
    X = {}
    X["animation.zt.omegafish.idle"] = {"loop": True, "animation_length": 4.0, "bones": dict(
        wave(4.0, 3.0), mandibles={"rotation": ["-math.max(0, math.sin(%s * 180.0)) * 14.0" % T, 0, 0]},
        root={"position": [0, "math.sin(%s * 90.0) * 0.08" % T, 0]})}
    X["animation.zt.omegafish.walk"] = {"loop": True, "animation_length": 1.0,
                                       "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 1.6 : 1.0)",
                                       "bones": dict(wave(1.0, 9.0, 55.0, legs_amp=28.0),
                                                     root={"position": [0, "math.abs(math.sin(%s * 360.0)) * 0.12" % T, 0]})}
    # growing out of the ground: it rears its head, looking around, twitching
    X["animation.zt.omegafish.birth"] = {"loop": True, "animation_length": 4.0, "bones": dict(
        wave(2.0, 6.0, 60.0, legs_amp=20.0),
        seg1={"rotation": ["-14 + math.sin(%s * 90.0) * 6.0" % T, "math.sin(%s * 45.0) * 14.0" % T, 0]},
        head={"rotation": ["-8 + math.sin(%s * 180.0) * 6.0" % T, "math.sin(%s * 90.0) * 18.0" % T, 0]})}
    # 3 head butt (30 ticks, lands on 14)
    X["animation.zt.omegafish.headbutt"] = timeline([
        (0.0, REST),
        (0.5, pose(rear=-18, head=-14, z=1.6, jaws=10)),
        (0.7, pose(rear=8, head=16, z=-3.2), "linear"),
        (0.95, pose(rear=6, head=12, z=-2.6)),
        (1.5, REST),
    ])
    # 4 tail swipe (40 ticks, lands on 20): the tail winds round one way, then lashes across
    X["animation.zt.omegafish.tail_swipe"] = timeline([
        (0.0, REST),
        (0.6, pose(curl=34, tail=6, swing=-10)),
        (1.0, pose(curl=-46, tail=4, swing=12), "linear"),
        (1.3, pose(curl=-40, swing=10)),
        (2.0, REST),
    ])
    # 5 lightning shot (70 ticks, strikes on 45): it rears up, quivering, then thrusts its head forward
    up = pose(rear=-34, head=-22, y=0.4, jaws=18)
    X["animation.zt.omegafish.lightning"] = timeline([
        (0.0, REST),
        (1.0, up),
        (1.4, add(up, {"head": [0, 10, 0]})),
        (1.8, add(up, {"head": [0, -10, 0]})),
        (2.1, add(up, {"head": [-6, 6, 0]})),
        (2.25, pose(rear=6, head=18, z=-1.0, jaws=22), "linear"),
        (2.7, pose(rear=4, head=10)),
        (3.5, REST),
    ])
    # 6 tail smash (60 ticks, lands on 38): the tail curls up over its back and slams down
    raised = pose(tail=58, rear=6, head=8)
    X["animation.zt.omegafish.tail_smash"] = timeline([
        (0.0, REST),
        (1.4, raised),
        (1.8, add(raised, {"tail": [12, 0, 0]})),
        (1.9, pose(tail=-22, rear=-4, y=-0.2), "linear"),
        (2.2, pose(tail=-16, rear=-2)),
        (3.0, REST),
    ])
    # 7 body slam (80 ticks, lands on 52): the whole front half rears high, then crashes down
    rear = pose(rear=-58, head=-12, tail=-12, y=0.8, z=1.0, jaws=20)
    X["animation.zt.omegafish.body_slam"] = timeline([
        (0.0, REST),
        (2.0, rear),
        (2.4, add(rear, {"seg1": [-6, 0, 0], "root_pos": [0, 0.4, 0]})),
        (2.6, pose(rear=14, head=18, tail=6, y=-0.4, z=-1.6), "linear"),
        (3.0, pose(rear=8, head=10, z=-1.2)),
        (4.0, REST),
    ])
    # 8 stunned: it flops over onto its back, legs kicking, and rights itself after 20 s
    on_back = add(pose(roll=180, y=5.0, curl=10), {"head": [-20, 0, 0], "tail": [-20, 0, 0]})
    kick = {leg: [40, 0, 0] for leg in LEGS}
    stun = timeline([
        (0.0, REST),
        (0.4, pose(roll=60, y=2.4, curl=-20)),
        (0.8, on_back, "linear"),
        (1.0, add(on_back, {"root_pos": [0, 0.5, 0]})),
        (1.2, on_back),
        (3.0, add(on_back, kick)),
        (5.0, on_back),
        (8.0, add(on_back, kick, pose(curl=-24))),
        (11.0, add(on_back, pose(curl=16))),
        (14.0, add(on_back, kick)),
        (17.0, add(on_back, pose(curl=-12))),
        (18.8, on_back),
        (19.4, pose(roll=90, y=3.0)),
        (20.0, REST),
    ])
    X["animation.zt.omegafish.stun"] = stun
    # 9 burrow: it noses down into the ground and is gone (held there until it erupts)
    X["animation.zt.omegafish.burrow"] = timeline([
        (0.0, REST),
        (0.3, pose(rear=-16, head=-10, jaws=12)),
        (0.7, pose(rear=30, head=26, tail=20, y=-3.0, z=-1.0), "linear"),
        (1.0, pose(rear=30, head=26, tail=30, y=-9.0, z=-2.0), "linear"),
    ])
    # 10 erupt: it bursts up out of the ground, rearing, and drops back down
    X["animation.zt.omegafish.erupt"] = timeline([
        (0.0, pose(rear=-40, head=-20, tail=-30, y=-9.0)),
        (0.3, pose(rear=-52, head=-26, tail=10, y=2.0, jaws=24), "linear"),
        (0.7, pose(rear=-30, head=-16, y=0.8, jaws=10)),
        (1.1, pose(rear=6, head=8, y=-0.2)),
        (1.5, REST),
    ])
    # 11 awaken: rears up and hisses
    X["animation.zt.omegafish.awaken"] = timeline([
        (0.0, REST),
        (0.8, pose(rear=-38, head=-24, jaws=24, tail=10)),
        (1.4, add(pose(rear=-40, head=-26, jaws=26, tail=12), {"head": [0, 12, 0]})),
        (2.0, add(pose(rear=-40, head=-26, jaws=26, tail=12), {"head": [0, -12, 0]})),
        (3.0, REST),
    ])
    # the corpse: it writhes, curls up, flops onto its back, twitches, and is still
    curled = pose(curl=40, swing=-30, tail=10, rear=6)
    dead = add(pose(roll=180, y=5.0, curl=34, swing=-24), {leg: [60, 0, 0] for leg in LEGS})
    death = timeline([
        (0.0, REST),
        (0.6, pose(rear=-40, head=-24, jaws=28)),
        (1.2, pose(curl=-30, swing=24, rear=-10)),
        (1.8, pose(curl=30, swing=-24, rear=-6)),
        (2.4, pose(curl=-20, swing=20)),
        (3.4, curled),
        (4.4, add(curled, pose(roll=70, y=2.4)), "linear"),
        (5.0, dead, "linear"),
        (5.2, add(dead, {"root_pos": [0, 0.6, 0]})),
        (5.5, dead),
        (7.0, add(dead, {leg: [-30, 0, 0] for leg in LEGS[::2]})),
        (8.5, dead),
        (10.0, add(dead, {leg: [-20, 0, 0] for leg in LEGS[1::2]})),
        (11.5, dead),
        (15.0, dead),
    ], speed=None)
    X["animation.zt.omegafish.death"] = death
    return {"format_version": "1.8.0", "animations": X}


ATTACKS = {3: "headbutt", 4: "tail_swipe", 5: "lightning", 6: "tail_smash", 7: "body_slam", 8: "stun", 9: "burrow",
           10: "erupt", 11: "awaken"}


def controller():
    anim = "q.property('zt:anim')"
    states = {
        "default": {
            "animations": ["idle"],
            "transitions": [{"birth": "%s == 13" % anim}, {"walk": "%s == 0 && q.property('zt:moving')" % anim}]
            + [{name: "%s == %d" % (anim, i)} for i, name in ATTACKS.items()],
            "blend_transition": 0.3,
        },
        "walk": {
            "animations": ["walk"],
            "transitions": [{"default": "%s != 0 || !q.property('zt:moving')" % anim}],
            "blend_transition": 0.3,
        },
        "birth": {"animations": ["birth"], "transitions": [{"default": "%s != 13" % anim}], "blend_transition": 0.6},
    }
    for i, name in ATTACKS.items():
        # (underground to erupting is instant: it must not blend up through the ground)
        blend = 0.0 if name in ("burrow", "erupt") else 0.25
        first = [{"erupt": "%s == 10" % anim}] if name == "burrow" else []
        states[name] = {"animations": [name], "transitions": first + [{"default": "%s != %d" % (anim, i)}],
                        "blend_transition": blend}
    return {"format_version": "1.10.0", "animation_controllers": {
        "controller.animation.zt.omegafish.main": {"initial_state": "default", "states": states}}}


def minion_cast():
    """A casting silverfish minion rears up, its head quivering."""
    anim = {"format_version": "1.8.0", "animations": {"animation.zt.silverfish_minion.cast": {
        "loop": True, "animation_length": 0.5,
        "bones": {"bodyPart_0": {"rotation": ["-30 + math.sin(q.anim_time * 1440) * 6", 0, 0]},
                  "bodyPart_1": {"rotation": ["-20", 0, 0]}},
    }}}
    ctrl = {"format_version": "1.10.0", "animation_controllers": {"controller.animation.zt.silverfish_minion.cast": {
        "initial_state": "default",
        "states": {
            "default": {"transitions": [{"casting": "q.property('zt:casting')"}], "blend_transition": 0.2},
            "casting": {"animations": ["cast_rear"], "transitions": [{"default": "!q.property('zt:casting')"}], "blend_transition": 0.2},
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
    write("animations/omegafish.animation.json", animations())
    write("animation_controllers/omegafish.animation_controllers.json", controller())
    anim, ctrl = minion_cast()
    write("animations/silverfish_minion.animation.json", anim)
    write("animation_controllers/silverfish_minion.animation_controllers.json", ctrl)
    print("omegafish animations written")


if __name__ == "__main__":
    main()
