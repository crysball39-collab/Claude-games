"""Builds the Skeleton Titan's animations and animation controller, the giant
arrow's flight animation and the skeleton minions' spell-casting controller.

Poses are written as absolute rotations (A(...)) and stored as deltas from the
skeleton's rest pose, using the same timeline builder as the Zombie Titan.
Timings follow the Java Titans mod (0.45) Skeleton Titan: stomps land on
ticks 60 and 104, the punch on 60, the swat on 24, the bow slam on 90, the
anti-air strikes on 12, and the volley looses arrows from tick 120 to 340.

    python3 tools/gen_skeleton_anims.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_animations import build_timeline, merge  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

SK_BONES = ["root", "hips", "spine", "chest", "head", "jaw", "rightArm", "rightForearm", "bow", "nockedArrow",
            "leftArm", "leftForearm", "rightLeg", "rightShin", "leftLeg", "leftShin"]

# the rest pose (absolute rotations): a slight stoop, bow held low at its side
SK_BASE = {
    "spine": [3, 0, 0],
    "chest": [4, 0, 0],
    "head": [-3, 0, 0],
    "rightArm": [-8, 0, 7],
    "rightForearm": [-30, 0, 0],
    "leftArm": [-4, 0, -6],
    "leftForearm": [-12, 0, 0],
}


def A(**kw):
    """A pose from absolute rotations (root_pos passes through), stored as deltas from SK_BASE."""
    pose = {}
    for k, v in kw.items():
        if k == "root_pos":
            pose[k] = v
        else:
            b = SK_BASE.get(k, [0, 0, 0])
            pose[k] = [v[0] - b[0], v[1] - b[1], v[2] - b[2]]
    return pose


def sk(frames, enrage_speed=2.0):
    return build_timeline(frames, enrage_speed=enrage_speed, bone_list=SK_BONES, base_pose=SK_BASE)


REST = A()


def titan_animations():
    X = {}
    X["animation.zt.skeleton.pose"] = {"loop": True, "bones": {b: {"rotation": v} for b, v in SK_BASE.items()}}
    X["animation.zt.skeleton.idle"] = {
        "loop": True,
        "animation_length": 4.0,
        "bones": {
            "chest": {"rotation": ["math.sin(q.anim_time * 90) * 1.2", 0, 0]},
            "head": {"rotation": ["math.sin(q.anim_time * 90 + 40) * 2", "math.sin(q.anim_time * 45) * 8", 0]},
            "jaw": {"rotation": ["math.max(0, math.sin(q.anim_time * 90)) * 4", 0, 0]},
            "rightArm": {"rotation": [0, 0, "math.cos(q.anim_time * 90) * 2"]},
            "leftArm": {"rotation": [0, 0, "-math.cos(q.anim_time * 90) * 2"]},
        },
    }
    ph = "q.anim_time * 112.5"
    X["animation.zt.skeleton.walk"] = {
        "loop": True,
        "animation_length": 3.2,
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 1.5 : 1.0)",
        "bones": {
            "root": {"position": [0, "-0.6 * math.abs(math.cos(%s))" % ph, 0]},
            "hips": {"rotation": [0, "math.cos(%s) * 5" % ph, "math.sin(%s) * 3" % ph]},
            "spine": {"rotation": [0, 0, "-math.sin(%s) * 2" % ph]},
            "chest": {"rotation": [0, "-math.cos(%s) * 6" % ph, 0]},
            "head": {"rotation": ["math.cos(%s * 2) * 2" % ph, "math.cos(%s) * 4" % ph, "math.sin(%s) * 3" % ph]},
            "jaw": {"rotation": ["math.abs(math.sin(%s * 2)) * 5" % ph, 0, 0]},
            "rightArm": {"rotation": ["math.cos(%s) * 12" % ph, 0, 0]},
            "leftArm": {"rotation": ["-math.cos(%s) * 12" % ph, 0, 0]},
            "rightLeg": {"rotation": ["-math.cos(%s) * 24" % ph, 0, 0]},
            "leftLeg": {"rotation": ["math.cos(%s) * 24" % ph, 0, 0]},
            "rightShin": {"rotation": ["math.max(0, -math.sin(%s)) * 40" % ph, 0, 0]},
            "leftShin": {"rotation": ["math.max(0, math.sin(%s)) * 40" % ph, 0, 0]},
        },
    }

    # --- 1 anti-air strike with the bow arm (30 ticks, hit @12) ---------------------------
    X["animation.zt.skeleton.anti_air"] = sk([
        (0.0, REST),
        (0.35, A(rightArm=[35, 0, 25], rightForearm=[-40, 0, 0], chest=[4, 25, 0], spine=[3, 10, 0], head=[-10, 15, 0],
                 root_pos=[0, -0.6, 0])),
        (0.6, A(rightArm=[-175, 0, -5], rightForearm=[-10, 0, 0], chest=[-14, -20, 0], spine=[-4, -8, 0],
                head=[-35, -10, 0], jaw=[22, 0, 0], leftArm=[20, 0, -25], root_pos=[0, 0.4, 0]), "linear"),
        (0.9, A(rightArm=[-165, 0, -5], rightForearm=[-14, 0, 0], chest=[-12, -16, 0], head=[-30, -8, 0], jaw=[16, 0, 0],
                leftArm=[15, 0, -20])),
        (1.5, REST),
    ])
    # --- 4 anti-air uppercut with the free hand (30 ticks, hit @12) -------------------------
    X["animation.zt.skeleton.anti_air2"] = sk([
        (0.0, REST),
        (0.35, A(leftArm=[40, 0, -20], leftForearm=[-70, 0, 0], chest=[4, -25, 0], spine=[3, -10, 0], head=[-10, -15, 0],
                 root_pos=[0, -0.6, 0])),
        (0.6, A(leftArm=[-170, 0, 8], leftForearm=[-20, 0, 0], chest=[-14, 22, 0], spine=[-4, 8, 0], head=[-35, 10, 0],
                jaw=[22, 0, 0], rightArm=[15, 0, 20], root_pos=[0, 0.4, 0]), "linear"),
        (0.9, A(leftArm=[-160, 0, 8], leftForearm=[-24, 0, 0], chest=[-12, 18, 0], head=[-30, 8, 0], jaw=[16, 0, 0],
                rightArm=[12, 0, 18])),
        (1.5, REST),
    ])
    # --- 2 swat: the free arm sweeps across (60 ticks, hit @24); a raised arm turns on Y -----------
    X["animation.zt.skeleton.swat"] = sk([
        (0.0, REST),
        (0.8, A(leftArm=[-85, -70, 0], leftForearm=[-15, 0, 0], chest=[2, -35, 0], spine=[2, -10, 0], head=[0, -20, 0],
                root_pos=[0, -0.5, 0])),
        (1.2, A(leftArm=[-88, 40, 0], leftForearm=[-5, 0, 0], chest=[6, 38, 0], spine=[4, 12, 0], head=[5, 20, 0],
                jaw=[15, 0, 0], root_pos=[0, -0.8, 0]), "linear"),
        (1.6, A(leftArm=[-80, 46, 0], chest=[5, 34, 0], spine=[3, 10, 0], head=[4, 16, 0], jaw=[10, 0, 0])),
        (3.0, REST),
    ])
    # --- 3 punch into the ground (140 ticks, hit @60) -----------------------------------------
    punched = A(leftArm=[-55, 0, 5], leftForearm=[-5, 0, 0], hips=[18, 0, 0], spine=[14, -10, 0], chest=[14, -15, 0],
                head=[10, 5, 0], jaw=[24, 0, 0], rightArm=[10, 0, 25], rightLeg=[-38, 0, 6], leftLeg=[-30, 0, -6],
                rightShin=[60, 0, 0], leftShin=[52, 0, 0], root_pos=[0, -3.2, 0])
    X["animation.zt.skeleton.punch"] = sk([
        (0.0, REST),
        (1.0, A(head=[15, 0, 0], spine=[6, 0, 0], chest=[6, 0, 0])),
        (2.25, A(leftArm=[-150, 0, -25], leftForearm=[-50, 0, 0], chest=[-10, 25, 0], spine=[-4, 10, 0], head=[-15, -10, 0],
                 jaw=[18, 0, 0], rightArm=[20, 0, 25], root_pos=[0, 0.4, 0])),
        (3.0, punched, "linear"),
        (4.0, merge(punched, A(leftArm=[-58, 0, 5], head=[12, 5, 0], jaw=[20, 0, 0]))),
        (5.5, A(hips=[8, 0, 0], spine=[6, 0, 0], chest=[6, 0, 0], leftArm=[-30, 0, -6], rightLeg=[-12, 0, 0],
                leftLeg=[-12, 0, 0], rightShin=[20, 0, 0], leftShin=[20, 0, 0], root_pos=[0, -1, 0])),
        (7.0, REST),
    ])
    # --- 5 arrow volley (400 ticks; arrows fly from tick 120 to 340) ---------------------------
    aim = dict(rightArm=[-90, 8, 0], rightForearm=[0, 0, 0], leftArm=[-95, 35, 0], chest=[2, 20, 0], spine=[2, 6, 0],
               head=[0, -15, 0], jaw=[6, 0, 0], rightLeg=[0, 0, 10], leftLeg=[0, 0, -10], root_pos=[0, -0.6, 0])
    X["animation.zt.skeleton.volley"] = sk([
        (0.0, REST),
        (1.0, A(rightArm=[-80, 8, 0], rightForearm=[-10, 0, 0], leftArm=[-60, 20, 0], leftForearm=[-40, 0, 0], chest=[2, 12, 0],
                head=[-4, -8, 0])),
        (2.0, A(leftForearm=[-30, 0, 0], **aim)),
        (3.0, A(leftForearm=[-85, 0, 0], **aim)),
        (17.0, A(leftForearm=[-85, 0, 0], **aim)),
        (17.4, A(**merge(aim, dict(leftArm=[-80, 10, 0], leftForearm=[-20, 0, 0], jaw=[12, 0, 0])))),
        (19.0, A(rightArm=[-40, 0, 8], rightForearm=[-30, 0, 0], leftArm=[-20, 0, -6])),
        (20.0, REST),
    ])
    # the string hand pumps and the bow arm recoils while arrows fly (played on top of the volley)
    X["animation.zt.skeleton.volley_draw"] = {
        "loop": "hold_on_last_frame",
        "animation_length": 20.0,
        "anim_time_update": "q.anim_time + q.delta_time * (q.property('zt:enraged') ? 2.0 : 1.0)",
        "bones": {
            "leftForearm": {"rotation": ["(q.anim_time > 6.0 && q.anim_time < 17.0) ? math.sin(q.anim_time * 2160) * 14 : 0", 0, 0]},
            "rightArm": {"rotation": ["(q.anim_time > 6.0 && q.anim_time < 17.0) ? math.sin(q.anim_time * 2160 + 90) * 2 : 0", 0, 0]},
        },
    }
    # --- 6 stomp (150 ticks, stomps @60 and @104) -----------------------------------------------
    lift_r = A(rightLeg=[-85, 0, 8], rightShin=[75, 0, 0], leftShin=[8, 0, 0], hips=[-6, 0, -4], spine=[-3, 0, 0],
               head=[10, 0, 0], jaw=[12, 0, 0], rightArm=[-30, 0, 50], leftArm=[-30, 0, -50], root_pos=[0, 0.4, 0])
    stomp_r = A(rightLeg=[-14, 0, 4], rightShin=[10, 0, 0], leftLeg=[6, 0, 0], leftShin=[12, 0, 0], hips=[6, 0, 2],
                spine=[5, 0, 0], chest=[8, 0, 0], head=[16, 0, 0], jaw=[26, 0, 0], rightArm=[-25, 0, 35],
                leftArm=[-25, 0, -35], root_pos=[0, -1.2, 0])
    lift_l = A(leftLeg=[-85, 0, -8], leftShin=[75, 0, 0], rightShin=[8, 0, 0], hips=[-6, 0, 4], spine=[-3, 0, 0],
               head=[10, 0, 0], jaw=[12, 0, 0], rightArm=[-30, 0, 50], leftArm=[-30, 0, -50], root_pos=[0, 0.4, 0])
    stomp_l = A(leftLeg=[-14, 0, -4], leftShin=[10, 0, 0], rightLeg=[6, 0, 0], rightShin=[12, 0, 0], hips=[6, 0, -2],
                spine=[5, 0, 0], chest=[8, 0, 0], head=[16, 0, 0], jaw=[26, 0, 0], rightArm=[-25, 0, 35],
                leftArm=[-25, 0, -35], root_pos=[0, -1.2, 0])
    X["animation.zt.skeleton.stomp"] = sk([
        (0.0, REST),
        (2.4, lift_r),
        (3.0, stomp_r, "linear"),
        (3.6, A(rightLeg=[-6, 0, 0], rightArm=[-10, 0, 15], leftArm=[-10, 0, -15], root_pos=[0, -0.3, 0])),
        (4.6, lift_l),
        (5.2, stomp_l, "linear"),
        (5.8, A(leftLeg=[-6, 0, 0], rightArm=[-10, 0, 15], leftArm=[-10, 0, -15], root_pos=[0, -0.3, 0])),
        (7.5, REST),
    ])
    # --- 7 bow slam (260 ticks, the bow lands @90) ------------------------------------------------
    raised = A(rightArm=[-175, 0, 10], rightForearm=[-25, 0, 0], leftArm=[-170, 0, -10], leftForearm=[-25, 0, 0],
               hips=[-6, 0, 0], spine=[-6, 0, 0], chest=[-12, 0, 0], head=[-22, 0, 0], jaw=[16, 0, 0], root_pos=[0, 0.5, 0])
    slammed = A(rightArm=[-45, 0, 6], rightForearm=[-5, 0, 0], leftArm=[-48, 0, -6], leftForearm=[-5, 0, 0], hips=[22, 0, 0],
                spine=[14, 0, 0], chest=[14, 0, 0], head=[8, 0, 0], jaw=[28, 0, 0], rightLeg=[-40, 0, 6],
                leftLeg=[-28, 0, -6], rightShin=[62, 0, 0], leftShin=[50, 0, 0], root_pos=[0, -3.6, 0])
    X["animation.zt.skeleton.slam"] = sk([
        (0.0, REST),
        (2.0, raised),
        (3.0, merge(raised, A(chest=[-14, 0, 0], jaw=[20, 0, 0], rightArm=[-178, 0, 10], leftArm=[-173, 0, -10]))),
        (4.2, merge(raised, A(chest=[-18, 0, 0], spine=[-9, 0, 0], jaw=[24, 0, 0], rightArm=[-185, 0, 10],
                              leftArm=[-180, 0, -10], rightForearm=[-35, 0, 0], leftForearm=[-35, 0, 0]))),
        (4.5, slammed, "linear"),
        (6.5, merge(slammed, A(head=[12, 0, 0], jaw=[22, 0, 0]))),
        (8.5, A(hips=[8, 0, 0], spine=[5, 0, 0], chest=[5, 0, 0], rightArm=[-25, 0, 8], leftArm=[-25, 0, -8],
                rightLeg=[-10, 0, 0], leftLeg=[-10, 0, 0], rightShin=[18, 0, 0], leftShin=[18, 0, 0], root_pos=[0, -1, 0])),
        (13.0, REST),
    ])
    # --- 8 stun: crashes onto its back, lies there for 22.5 s, climbs back up (540 ticks) --------------
    down = dict(hips=[-86, 0, 0], spine=[-4, 0, 0], chest=[-4, 0, 0], head=[8, 35, 0], jaw=[30, 0, 0],
                rightArm=[-10, 0, 80], leftArm=[-10, 0, -80], rightForearm=[-20, 0, 0], leftForearm=[-20, 0, 0],
                rightLeg=[-84, 0, 10], leftLeg=[-84, 0, -12], rightShin=[8, 0, 0], leftShin=[12, 0, 0], root_pos=[0, -10, 2])
    X["animation.zt.skeleton.stun"] = sk([
        (0.0, REST),
        (1.2, A(hips=[-22, 0, 8], spine=[-8, 0, 0], chest=[-10, 0, 0], head=[-30, 0, 15], jaw=[28, 0, 0], rightArm=[30, 0, 45],
                leftArm=[30, 0, -45], rightLeg=[-20, 0, 0], leftShin=[20, 0, 0], root_pos=[0, -0.5, 1])),
        (2.6, A(hips=[-50, 0, 4], spine=[-6, 0, 0], chest=[-6, 0, 0], head=[-10, 20, 0], jaw=[30, 0, 0], rightArm=[0, 0, 60],
                leftArm=[0, 0, -60], rightLeg=[-55, 0, 6], leftLeg=[-50, 0, -8], rightShin=[40, 0, 0], leftShin=[45, 0, 0],
                root_pos=[0, -6, 1.5])),
        (3.5, A(**down), "linear"),
        (3.8, A(**merge(down, dict(root_pos=[0, -9.4, 2])))),
        (4.1, A(**down)),
        (8.0, A(**merge(down, dict(head=[8, 25, 0], rightForearm=[-40, 0, 0])))),
        (12.0, A(**merge(down, dict(head=[10, 38, 0], jaw=[24, 0, 0])))),
        (16.0, A(**merge(down, dict(leftForearm=[-45, 0, 0], jaw=[34, 0, 0])))),
        (22.5, A(**down)),
        (24.0, A(hips=[-25, 0, 0], spine=[10, 0, 0], chest=[8, 0, 0], head=[10, 0, 0], jaw=[10, 0, 0], rightArm=[20, 0, 25],
                 leftArm=[20, 0, -25], rightLeg=[-75, 0, 8], leftLeg=[-75, 0, -8], rightShin=[95, 0, 0], leftShin=[95, 0, 0],
                 root_pos=[0, -7, 0])),
        (25.5, A(hips=[10, 0, 0], spine=[8, 0, 0], head=[5, 0, 0], rightLeg=[-45, 0, 4], leftLeg=[-45, 0, -4],
                 rightShin=[80, 0, 0], leftShin=[80, 0, 0], rightArm=[-20, 0, 20], leftArm=[-20, 0, -20], root_pos=[0, -3.5, 0])),
        (27.0, REST),
    ])
    # --- 11 awaken: rattling stretch after it has risen (60 ticks) ---------------------------------------
    stretch = dict(chest=[-18, 0, 0], spine=[-6, 0, 0], head=[-35, 0, 0], jaw=[38, 0, 0], rightArm=[-40, 0, 60],
                   leftArm=[-40, 0, -60], rightForearm=[-20, 0, 0], leftForearm=[-20, 0, 0], root_pos=[0, 0.5, 0])
    X["animation.zt.skeleton.awaken"] = sk([
        (0.0, REST),
        (0.8, A(**stretch)),
        (1.4, A(**merge(stretch, dict(jaw=[42, 0, 0], head=[-38, 0, 0])))),
        (2.0, A(**merge(stretch, dict(jaw=[34, 0, 0])))),
        (3.0, REST),
    ])
    # --- 13 birth: hunched and rattling while it grows --------------------------------------------------
    hunched = {"hips": [10, 0, 0], "spine": [15, 0, 0], "chest": [18, 0, 0], "head": [18, 0, 0], "jaw": [10, 0, 0],
               "rightArm": [-15, 0, 8], "leftArm": [-15, 0, -8], "rightForearm": [-20, 0, 0], "leftForearm": [-20, 0, 0],
               "rightLeg": [-16, 0, 0], "leftLeg": [-16, 0, 0], "rightShin": [30, 0, 0], "leftShin": [30, 0, 0]}
    birth_bones = {b: {"rotation": v} for b, v in hunched.items()}
    birth_bones["chest"]["rotation"] = ["18 + math.sin(q.anim_time * 90) * 3", 0, 0]
    birth_bones["jaw"]["rotation"] = ["10 + math.abs(math.sin(q.anim_time * 400)) * 8", 0, 0]
    birth_bones["head"]["rotation"] = ["18 + math.sin(q.anim_time * 45) * 4", "math.sin(q.anim_time * 30) * 10", 0]
    birth_bones["root"] = {"position": [0, -1.2, 0]}
    X["animation.zt.skeleton.birth"] = {"loop": True, "animation_length": 4.0, "bones": birth_bones}
    # --- 14 leap (50 ticks: crouch, launch @12, land @38) -------------------------------------------------
    X["animation.zt.skeleton.leap"] = sk([
        (0.0, REST),
        (0.6, A(rightLeg=[-50, 0, 0], leftLeg=[-50, 0, 0], rightShin=[90, 0, 0], leftShin=[90, 0, 0], hips=[20, 0, 0],
                spine=[10, 0, 0], rightArm=[60, 0, 15], leftArm=[60, 0, -15], root_pos=[0, -3.5, 0])),
        (0.75, A(rightLeg=[10, 0, 0], leftLeg=[10, 0, 0], rightShin=[5, 0, 0], leftShin=[5, 0, 0], chest=[-10, 0, 0],
                 jaw=[25, 0, 0], rightArm=[-70, 0, 20], leftArm=[-70, 0, -20], root_pos=[0, 0.5, 0]), "linear"),
        (1.3, A(rightLeg=[-40, 0, 0], leftLeg=[-40, 0, 0], rightShin=[60, 0, 0], leftShin=[60, 0, 0], jaw=[20, 0, 0],
                rightArm=[-40, 0, 30], leftArm=[-40, 0, -30])),
        (1.9, A(rightLeg=[-45, 0, 0], leftLeg=[-45, 0, 0], rightShin=[85, 0, 0], leftShin=[85, 0, 0], hips=[20, 0, 0],
                jaw=[34, 0, 0], rightArm=[40, 0, 20], leftArm=[40, 0, -20], root_pos=[0, -3, 0]), "linear"),
        (2.5, REST),
    ], enrage_speed=1.0)
    # --- death (corpse entity, 300 ticks): knees buckle @40, collapses @110, falls apart, sinks --------------
    kneel = dict(rightLeg=[-8, 0, 4], leftLeg=[-8, 0, -4], rightShin=[92, 0, 0], leftShin=[92, 0, 0], hips=[8, 0, 0],
                 spine=[10, 0, 0], chest=[12, 0, 0], head=[24, 0, 6], jaw=[26, 0, 0], rightArm=[2, 0, 12],
                 leftArm=[2, 0, -12], root_pos=[0, -6, 0])
    fallen = merge(kneel, dict(hips=[84, 0, 0], spine=[4, 0, 0], chest=[4, 0, 0], head=[10, 10, 0], jaw=[30, 0, 0],
                               rightArm=[-170, 0, 15], leftArm=[-170, 0, -15], rightForearm=[-5, 0, 0], leftForearm=[-5, 0, 0]))
    death = sk([
        (0.0, REST),
        (0.8, A(head=[-32, 0, 0], jaw=[38, 0, 0], chest=[-12, 0, 0], rightArm=[-50, 0, 55], leftArm=[-50, 0, -55],
                root_pos=[0, 0.4, 0])),
        (2.0, A(**kneel), "linear"),
        (3.5, A(**merge(kneel, dict(chest=[16, 0, 6], head=[28, 0, 12])))),
        (5.0, A(**merge(kneel, dict(chest=[18, 0, -4], head=[30, 0, -8], hips=[14, 0, 0])))),
        (5.5, A(**fallen), "linear"),
        (6.5, A(**fallen)),
        (13.0, A(**fallen)),
        (15.0, A(**merge(fallen, dict(root_pos=[0, -14, 0])))),
    ], enrage_speed=1.0)
    death.pop("anim_time_update")
    # the bones come apart after the fall: the skull rolls off, the arms and ribcage drop
    death["bones"]["head"]["position"] = {"5.60": [0, 0, 0], "7.00": {"post": [0, 4, -2.5], "lerp_mode": "catmullrom"}}
    death["bones"]["head"]["rotation"]["7.00"] = {"post": [40, 35, 90], "lerp_mode": "catmullrom"}
    death["bones"]["head"]["rotation"]["13.00"] = [40, 35, 90]
    death["bones"]["head"]["rotation"]["15.00"] = [40, 35, 90]
    for arm, side in (("rightArm", -1), ("leftArm", 1)):
        death["bones"][arm]["position"] = {"5.60": [0, 0, 0], "6.80": {"post": [side * 2.5, 0, -2], "lerp_mode": "catmullrom"}}
    death["bones"]["chest"]["position"] = {"5.60": [0, 0, 0], "6.60": {"post": [0, 0, -1.5], "lerp_mode": "catmullrom"}}
    X["animation.zt.skeleton.death"] = death
    return {"format_version": "1.8.0", "animations": X}


def titan_controller():
    attacks = {1: "anti_air", 2: "swat", 3: "punch", 4: "anti_air2", 5: "volley", 6: "stomp", 7: "slam", 8: "stun",
               11: "awaken", 14: "leap"}
    states = {
        "default": {
            "animations": ["pose", "idle"],
            "transitions": [{"birth": "q.property('zt:anim') == 13"}, {"walk": "q.property('zt:anim') == 0 && q.property('zt:moving')"}]
            + [{name: "q.property('zt:anim') == %d" % i} for i, name in attacks.items()],
            "blend_transition": 0.3,
        },
        "walk": {
            "animations": ["pose", "walk"],
            "transitions": [{"default": "q.property('zt:anim') != 0 || !q.property('zt:moving')"}],
            "blend_transition": 0.3,
        },
        "birth": {
            "animations": ["birth"],
            "transitions": [{"default": "q.property('zt:anim') != 13"}],
            "blend_transition": 0.6,
        },
    }
    for i, name in attacks.items():
        anims = [name] + (["volley_draw"] if name == "volley" else [])
        states[name] = {"animations": anims, "transitions": [{"default": "q.property('zt:anim') != %d" % i}],
                        "blend_transition": 0.25}
    return {
        "format_version": "1.10.0",
        "animation_controllers": {
            "controller.animation.zt.skeleton.main": {"initial_state": "default", "states": states},
            "controller.animation.zt.skeleton_minion.cast": {
                "initial_state": "default",
                "states": {
                    "default": {"transitions": [{"casting": "q.property('zt:casting')"}], "blend_transition": 0.2},
                    "casting": {"animations": ["cast"], "transitions": [{"default": "!q.property('zt:casting')"}],
                                "blend_transition": 0.2},
                },
            },
        },
    }


def arrow_animations():
    return {
        "format_version": "1.8.0",
        "animations": {
            # vanilla arrow layout: the head points +Z, turned to the flight direction
            "animation.zt.titan_arrow.move": {
                "loop": True,
                "bones": {"body": {"rotation": ["-q.target_x_rotation", "-q.target_y_rotation", 0]}},
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
    write("animations/skeleton_titan.animation.json", titan_animations())
    write("animations/titan_arrow.animation.json", arrow_animations())
    write("animation_controllers/skeleton_titan.animation_controllers.json", titan_controller())
    print("skeleton animations written")


if __name__ == "__main__":
    main()
