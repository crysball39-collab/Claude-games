"""Writes sounds/sound_definitions.json and sounds.json for the resource pack.

The titan's voice and footsteps are built from vanilla sound files played at
low pitch with a long hearing range, so no audio is shipped with the pack.
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")


def snd(names, pitch=1.0, volume=1.0):
    return [{"name": n, "pitch": pitch, "volume": volume} for n in names]


def event(sounds, category="hostile", min_d=24.0, max_d=128.0):
    return {"category": category, "min_distance": min_d, "max_distance": max_d, "sounds": sounds}


ZSAY = ["sounds/mob/zombie/say1", "sounds/mob/zombie/say2", "sounds/mob/zombie/say3"]
ZHURT = ["sounds/mob/zombie/hurt1", "sounds/mob/zombie/hurt2"]
RAV_ROAR = ["sounds/mob/ravager/roar1", "sounds/mob/ravager/roar2", "sounds/mob/ravager/roar3", "sounds/mob/ravager/roar4"]
WARDEN_ROAR = ["sounds/mob/warden/roar_1", "sounds/mob/warden/roar_2", "sounds/mob/warden/roar_3", "sounds/mob/warden/roar_4", "sounds/mob/warden/roar_5"]
WARDEN_STEP = ["sounds/mob/warden/step_1", "sounds/mob/warden/step_2", "sounds/mob/warden/step_3", "sounds/mob/warden/step_4"]
GOLEM_WALK = ["sounds/mob/irongolem/walk1", "sounds/mob/irongolem/walk2", "sounds/mob/irongolem/walk3", "sounds/mob/irongolem/walk4"]
EXPLODE = ["sounds/random/explode1", "sounds/random/explode2", "sounds/random/explode3", "sounds/random/explode4"]
WHIRL = ["sounds/mob/breeze/whirl1", "sounds/mob/breeze/whirl2", "sounds/mob/breeze/whirl3", "sounds/mob/breeze/whirl4", "sounds/mob/breeze/whirl5"]
THUNDER = ["sounds/ambient/weather/thunder1", "sounds/ambient/weather/thunder2", "sounds/ambient/weather/thunder3"]
STRONG = ["sounds/mob/player/attack/strong1", "sounds/mob/player/attack/strong2", "sounds/mob/player/attack/strong3",
          "sounds/mob/player/attack/strong4"]
SONIC_CHARGE = ["sounds/mob/warden/sonic_charge1", "sounds/mob/warden/sonic_charge2", "sounds/mob/warden/sonic_charge3",
                "sounds/mob/warden/sonic_charge4"]
SONIC_BOOM = ["sounds/mob/warden/sonic_boom1", "sounds/mob/warden/sonic_boom2", "sounds/mob/warden/sonic_boom3",
              "sounds/mob/warden/sonic_boom4"]
BEACON_POWER = ["sounds/block/beacon/power1", "sounds/block/beacon/power2", "sounds/block/beacon/power3"]
SKEL_SAY = ["sounds/mob/skeleton/say1", "sounds/mob/skeleton/say2", "sounds/mob/skeleton/say3"]
SKEL_HURT = ["sounds/mob/skeleton/hurt1", "sounds/mob/skeleton/hurt2", "sounds/mob/skeleton/hurt3", "sounds/mob/skeleton/hurt4"]
BONE_STEP = ["sounds/step/bone_block%d" % i for i in range(1, 6)]
BONE_DIG = ["sounds/dig/bone_block%d" % i for i in range(1, 6)]
RIPTIDE = ["sounds/item/trident/riptide_mono1", "sounds/item/trident/riptide_mono2", "sounds/item/trident/riptide_mono3"]
GLASS = ["sounds/random/glass1", "sounds/random/glass2", "sounds/random/glass3"]
CREEPER_SAY = ["sounds/mob/creeper/say1", "sounds/mob/creeper/say2", "sounds/mob/creeper/say3", "sounds/mob/creeper/say4"]
SLIME_BIG = ["sounds/mob/slime/big1", "sounds/mob/slime/big2", "sounds/mob/slime/big3", "sounds/mob/slime/big4"]
SLIME_SMALL = ["sounds/mob/slime/small1", "sounds/mob/slime/small2", "sounds/mob/slime/small3", "sounds/mob/slime/small4",
               "sounds/mob/slime/small5"]
MACE_GROUND = ["sounds/item/mace/smash_ground1", "sounds/item/mace/smash_ground2", "sounds/item/mace/smash_ground3",
               "sounds/item/mace/smash_ground4"]


def warden(*names):
    return ["sounds/mob/warden/" + n for n in names]


W_ROAR = warden("roar_1", "roar_2", "roar_3", "roar_4", "roar_5")
W_ANGRY = warden("listening_angry_1", "listening_angry_2", "listening_angry_3", "listening_angry_4", "listening_angry_5")
W_SNIFF = warden("sniff_1", "sniff_2", "sniff_3", "sniff_4")
W_HEART = warden("heartbeat_1", "heartbeat_2", "heartbeat_3", "heartbeat_4")
W_HIT = warden("attack_impact_1", "attack_impact_2")
CREAK_ATTACK = ["sounds/mob/creaking/attack1", "sounds/mob/creaking/attack2", "sounds/mob/creaking/attack3",
                "sounds/mob/creaking/attack4"]
CREAK_IDLE = ["sounds/mob/creaking/idle%d" % i for i in range(1, 7)]
HONEY_STEP = ["sounds/step/honey_block%d" % i for i in range(1, 6)]
WOOD_STEP = ["sounds/step/wood%d" % i for i in range(1, 7)]
DOOR_OPEN = ["sounds/block/wooden_door/open1", "sounds/block/wooden_door/open2"]
DOOR_CLOSE = ["sounds/block/wooden_door/close1", "sounds/block/wooden_door/close2", "sounds/block/wooden_door/close3"]
IRON_DOOR = ["sounds/block/iron_door/close1", "sounds/block/iron_door/close2", "sounds/block/iron_door/close3",
             "sounds/block/iron_door/close4"]
IRON_TRAP = ["sounds/block/iron_trapdoor/open1", "sounds/block/iron_trapdoor/open2", "sounds/block/iron_trapdoor/open3",
             "sounds/block/iron_trapdoor/open4"]
CHAIN = ["sounds/dig/chain1", "sounds/dig/chain2", "sounds/dig/chain3", "sounds/dig/chain4"]
PAGE = ["sounds/item/book/open_flip1", "sounds/item/book/open_flip2", "sounds/item/book/open_flip3"]
LANTERN_BREAK = ["sounds/block/lantern/break%d" % i for i in range(1, 7)]
SCREAM = ["sounds/mob/endermen/scream1", "sounds/mob/endermen/scream2", "sounds/mob/endermen/scream3",
          "sounds/mob/endermen/scream4"]
GHAST_SCREAM = ["sounds/mob/ghast/scream%d" % i for i in range(1, 6)]


def definitions():
    D = {
        "zt.titan.ambient": event(snd(ZSAY, 0.42, 1.0)),
        "zt.titan.hurt": event(snd(ZHURT, 0.45, 0.8), min_d=16.0, max_d=96.0),
        "zt.titan.death": event(snd(["sounds/mob/zombie/death"], 0.38, 1.0) + snd(RAV_ROAR[:2], 0.4, 1.0), max_d=192.0),
        "zt.titan.roar": event(snd(RAV_ROAR, 0.55, 1.0) + snd(WARDEN_ROAR, 0.62, 1.0), max_d=192.0),
        "zt.titan.step": event(snd(WARDEN_STEP, 0.5, 1.0) + snd(GOLEM_WALK, 0.38, 1.0), min_d=16.0, max_d=112.0),
        "zt.titan.slam": event(snd(EXPLODE, 0.55, 1.0) + snd(["sounds/item/mace/smash_ground_heavy"], 0.55, 1.0), max_d=160.0),
        "zt.titan.swing": event(snd(WHIRL, 0.45, 1.0), min_d=16.0, max_d=96.0),
        "zt.titan.clang": event(snd(["sounds/random/anvil_land"], 0.5, 1.0) + snd(["sounds/random/anvil_break"], 0.45, 1.0)),
        "zt.titan.block": event(snd(["sounds/random/anvil_land"], 1.2, 0.6), category="player", min_d=4.0, max_d=24.0),
        "zt.titan.quake": event(snd(THUNDER, 0.5, 0.7), category="weather", max_d=192.0),
        "zt.titan.summon": event(snd(["sounds/mob/evocation_illager/prepare_summon"], 0.6, 1.0), max_d=96.0),
        "zt.titan.spit": event(snd(["sounds/mob/llama/spit1", "sounds/mob/llama/spit2"], 0.4, 1.0) +
                               snd(["sounds/mob/ghast/fireball4"], 0.55, 1.0), max_d=128.0),
        "zt.titan.fall": event(snd(EXPLODE, 0.35, 1.0), max_d=256.0),
        "zt.titan.splat": event(snd(["sounds/mob/slime/big1", "sounds/mob/slime/big2", "sounds/mob/slime/big3",
                                     "sounds/mob/slime/big4"], 0.6, 1.0), min_d=12.0, max_d=64.0),
        "zt.df.punch": event(snd(STRONG, 0.8, 1.0) + snd(STRONG, 1.0, 1.0) + snd(STRONG, 1.2, 1.0),
                             category="player", min_d=4.0, max_d=32.0),
        "zt.df.beam_start": event(snd(SONIC_CHARGE, 1.25, 1.0), category="player", min_d=8.0, max_d=48.0),
        "zt.df.beam_loop": event(snd(SONIC_BOOM, 0.7, 0.6), category="player", min_d=8.0, max_d=64.0),
        "zt.df.switch": event(snd(BEACON_POWER, 1.6, 0.8), category="player", min_d=2.0, max_d=16.0),
        "zt.df.ready": event(snd(["sounds/random/orb"], 0.6, 0.6), category="player", min_d=2.0, max_d=8.0),
        # Skeleton Titan: vanilla skeleton, bow and bone block sounds played low
        "zt.skel.ambient": event(snd(SKEL_SAY, 0.45, 1.0)),
        "zt.skel.hurt": event(snd(SKEL_HURT, 0.5, 0.8), min_d=16.0, max_d=96.0),
        "zt.skel.death": event(snd(["sounds/mob/skeleton/death"], 0.4, 1.0) + snd(BONE_DIG, 0.45, 1.0), max_d=192.0),
        "zt.skel.step": event(snd(WARDEN_STEP, 0.5, 1.0) + snd(BONE_STEP, 0.45, 1.0), min_d=16.0, max_d=112.0),
        "zt.skel.bow": event(snd(["sounds/random/bow"], 0.45, 1.0), min_d=16.0, max_d=128.0),
        "zt.skel.draw": event(snd(["sounds/crossbow/loading_start"], 0.45, 1.0) +
                              snd(["sounds/crossbow/loading_middle1", "sounds/crossbow/loading_middle2"], 0.4, 1.0), max_d=96.0),
        "zt.skel.rattle": event(snd(BONE_DIG, 0.6, 1.0) + snd(SKEL_SAY, 0.5, 1.0), max_d=128.0),
        "zt.skel.roar": event(snd(SKEL_HURT, 0.35, 1.0) + snd(RAV_ROAR, 0.7, 1.0), max_d=192.0),
        "zt.skel.crack": event(snd(BONE_DIG, 0.4, 1.0) + snd(["sounds/random/break"], 0.5, 1.0), max_d=128.0),
        # Obsidian Sword dash and Growth Serum
        "zt.obsidian.dash": event(snd(RIPTIDE, 1.1, 1.0), category="player", min_d=4.0, max_d=32.0),
        "zt.serum.shatter": event(snd(GLASS, 0.8, 1.0), category="neutral", min_d=4.0, max_d=32.0),
        "zt.serum.grow": event(snd(["sounds/mob/zombie/unfect"], 0.5, 1.0) + snd(["sounds/mob/zombie/remedy"], 0.6, 1.0),
                               max_d=96.0),
        # Creeper Titan: vanilla creeper hisses and fuses played low, and explosions
        "zt.creeper.ambient": event(snd(CREEPER_SAY, 0.42, 1.0)),
        "zt.creeper.hurt": event(snd(CREEPER_SAY, 0.55, 0.8), min_d=16.0, max_d=96.0),
        "zt.creeper.death": event(snd(["sounds/mob/creeper/death"], 0.4, 1.0) + snd(RAV_ROAR[:2], 0.45, 1.0), max_d=192.0),
        "zt.creeper.hiss": event(snd(CREEPER_SAY, 0.32, 1.0) + snd(["sounds/random/fuse"], 0.4, 1.0), max_d=192.0),
        "zt.creeper.fuse": event(snd(["sounds/random/fuse"], 0.5, 1.0), min_d=32.0, max_d=192.0),
        "zt.creeper.pop": event(snd(EXPLODE, 0.75, 1.0), max_d=160.0),
        "zt.creeper.blast": event(snd(EXPLODE, 0.3, 1.0) + snd(THUNDER, 0.45, 1.0), category="hostile", min_d=64.0,
                                  max_d=320.0),
        "zt.creeper.thunder": event(snd(THUNDER, 0.8, 1.0), category="weather", min_d=32.0, max_d=192.0),
        # Gum Gum Fruit: rubbery slime squelches, bow twangs and punches
        "zt.gum.eat": event(snd(SLIME_BIG, 0.7, 1.0), category="player", min_d=4.0, max_d=24.0),
        "zt.gum.stretch": event(snd(["sounds/random/bow"], 0.5, 0.8) + snd(SLIME_SMALL, 0.55, 1.0), category="player",
                                min_d=4.0, max_d=40.0),
        "zt.gum.snap": event(snd(SLIME_SMALL, 1.5, 1.0), category="player", min_d=4.0, max_d=32.0),
        "zt.gum.punch": event(snd(STRONG, 0.7, 1.0) + snd(SLIME_BIG, 0.9, 0.6), category="player", min_d=4.0,
                              max_d=48.0),
        "zt.gum.gatling": event(snd(STRONG, 1.1, 0.8) + snd(STRONG, 1.3, 0.8), category="player", min_d=4.0, max_d=40.0),
        "zt.gum.stamp": event(snd(["sounds/item/mace/smash_ground_heavy"], 0.8, 1.0) + snd(EXPLODE, 0.9, 1.0),
                              category="player", min_d=8.0, max_d=96.0),
        "zt.gum.rocket": event(snd(["sounds/random/bow"], 0.4, 1.0) + snd(RIPTIDE, 1.3, 1.0), category="player",
                               min_d=4.0, max_d=48.0),
        "zt.gum.steam": event(snd(["sounds/random/fizz"], 0.7, 0.6), category="player", min_d=4.0, max_d=24.0),
        "zt.gum.gear2": event(snd(["sounds/random/fizz"], 0.5, 1.0) + snd(MACE_GROUND, 0.7, 1.0), category="player",
                              min_d=8.0, max_d=48.0),
        "zt.gum.sink": event(snd(["sounds/random/splash"], 0.6, 1.0), category="player", min_d=4.0, max_d=24.0),
        # The Figure: a blind, listening thing (warden sounds, lower and wetter) on creaking wood
        "zt.figure.ambient": event(snd(W_ANGRY, 0.75, 0.9) + snd(CREAK_IDLE, 0.55, 0.8), min_d=6.0, max_d=40.0),
        "zt.figure.roar": event(snd(W_ROAR, 0.78, 1.0) + snd(RAV_ROAR, 0.62, 0.9), min_d=16.0, max_d=96.0),
        "zt.figure.sniff": event(snd(W_SNIFF, 0.75, 1.0), min_d=4.0, max_d=28.0),
        "zt.figure.step": event(snd(WARDEN_STEP, 0.7, 0.7) + snd(WOOD_STEP, 0.5, 0.9), min_d=6.0, max_d=36.0),
        "zt.figure.kill": event(snd(W_HIT, 0.8, 1.0) + snd(CREAK_ATTACK, 0.6, 1.0), min_d=8.0, max_d=48.0),
        "zt.figure.heartbeat": event(snd(W_HEART, 1.0, 1.0), category="player", min_d=2.0, max_d=6.0),
        "zt.figure.heartbeat_fast": event(snd(W_HEART, 1.35, 1.0), category="player", min_d=2.0, max_d=6.0),
        # Seek: black slime
        "zt.seek.ambient": event(snd(SLIME_BIG, 0.5, 0.7) + snd(HONEY_STEP, 0.6, 0.8), min_d=6.0, max_d=32.0),
        "zt.seek.rise": event(snd(["sounds/mob/warden/emerge"], 1.15, 1.0) + snd(SLIME_BIG, 0.45, 1.0), min_d=16.0,
                              max_d=80.0),
        "zt.seek.roar": event(snd(SCREAM, 0.55, 1.0) + snd(GHAST_SCREAM, 0.5, 0.8), min_d=16.0, max_d=96.0),
        "zt.seek.step": event(snd(HONEY_STEP, 0.75, 1.0) + snd(SLIME_SMALL, 0.6, 0.6), min_d=6.0, max_d=32.0),
        "zt.seek.kill": event(snd(SLIME_BIG, 0.5, 1.0) + snd(CREAK_ATTACK, 0.5, 1.0), min_d=8.0, max_d=48.0),
        "zt.seek.hands": event(snd(GLASS, 0.85, 1.0) + snd(SLIME_BIG, 0.6, 0.8), min_d=8.0, max_d=48.0),
        "zt.seek.grab": event(snd(SLIME_BIG, 0.4, 1.0) + snd(GLASS, 0.6, 0.6), min_d=8.0, max_d=48.0),
        "zt.seek.chandelier": event(snd(["sounds/random/anvil_land"], 0.55, 0.8) + snd(GLASS, 0.7, 1.0) +
                                    snd(LANTERN_BREAK, 0.7, 1.0), min_d=12.0, max_d=64.0),
        "zt.seek.fire": event(snd(["sounds/fire/fire"], 0.9, 1.0), category="block", min_d=3.0, max_d=16.0),
        "zt.seek.slam": event(snd(DOOR_CLOSE, 0.55, 1.0) + snd(["sounds/random/anvil_land"], 0.4, 0.7), min_d=12.0,
                              max_d=64.0),
        # the hotel
        "zt.doors.open": event(snd(DOOR_OPEN, 0.62, 1.0), category="block", min_d=8.0, max_d=32.0),
        "zt.doors.close": event(snd(DOOR_CLOSE, 0.7, 1.0), category="block", min_d=8.0, max_d=32.0),
        "zt.doors.slam": event(snd(DOOR_CLOSE, 0.5, 1.0) + snd(["sounds/random/anvil_land"], 0.45, 0.5), category="block",
                               min_d=10.0, max_d=48.0),
        "zt.doors.locked": event(snd(IRON_DOOR, 1.5, 0.6) + snd(CHAIN, 1.0, 0.8), category="block", min_d=4.0,
                                 max_d=24.0),
        "zt.doors.padlock": event(snd(CHAIN, 1.2, 1.0), category="block", min_d=4.0, max_d=24.0),
        "zt.doors.unlock": event(snd(IRON_TRAP, 1.3, 1.0) + snd(["sounds/random/click"], 0.8, 1.0), category="block",
                                 min_d=6.0, max_d=32.0),
        "zt.doors.wrong": event(snd(["sounds/note/bass"], 0.5, 1.0) + snd(CHAIN, 0.8, 0.8), category="block", min_d=4.0,
                                max_d=24.0),
        "zt.doors.book": event(snd(PAGE, 1.0, 1.0), category="player", min_d=4.0, max_d=20.0),
        "zt.doors.shimmer": event(snd(["sounds/block/amethyst/shimmer"], 1.25, 0.5), category="block", min_d=2.0,
                                  max_d=10.0),
        "zt.doors.lamp": event(snd(GLASS, 0.9, 1.0) + snd(LANTERN_BREAK, 0.8, 1.0), category="block", min_d=12.0,
                               max_d=64.0),
        "zt.doors.guiding": event(snd(["sounds/block/amethyst/shimmer"], 0.8, 1.0) + snd(BEACON_POWER, 1.7, 0.4),
                                  category="player", min_d=4.0, max_d=16.0),
        "zt.doors.escape": event(snd(["sounds/random/levelup"], 0.9, 0.8) + snd(BEACON_POWER, 1.4, 0.6),
                                 category="player", min_d=4.0, max_d=16.0),
        "zt.doors.jumpscare": event(snd(SCREAM, 0.5, 1.0) + snd(W_ROAR, 0.9, 1.0), category="player", min_d=4.0,
                                    max_d=16.0),
        # the Seek chase's music (generated by gen_doors_audio.py)
        "zt.music.seek_chase": {"category": "music", "sounds": [{"name": "sounds/zt/seek_chase", "stream": True,
                                                                 "volume": 0.85}]},
    }
    return {"format_version": "1.20.20", "sound_definitions": D}


def entity_sounds():
    return {
        "entity_sounds": {
            "entities": {
                "zt:zombie_titan": {
                    "volume": 1.0,
                    "pitch": 1.0,
                    "events": {"ambient": "zt.titan.ambient", "hurt": "zt.titan.hurt", "death": "zt.titan.death"},
                },
                "zt:skeleton_titan": {
                    "volume": 1.0,
                    "pitch": 1.0,
                    "events": {"ambient": "zt.skel.ambient", "hurt": "zt.skel.hurt", "death": "zt.skel.death"},
                },
                "zt:skeleton_minion": {
                    "volume": 1.0,
                    "pitch": [0.8, 1.0],
                    "events": {
                        "ambient": "mob.skeleton.say",
                        "hurt": "mob.skeleton.hurt",
                        "death": "mob.skeleton.death",
                        "step": {"sound": "mob.skeleton.step", "volume": 0.15, "pitch": 1.0},
                    },
                },
                "zt:creeper_titan": {
                    "volume": 1.0,
                    "pitch": 1.0,
                    "events": {"ambient": "zt.creeper.ambient", "hurt": "zt.creeper.hurt", "death": "zt.creeper.death"},
                },
                "zt:creeper_minion": {
                    "volume": 1.0,
                    "pitch": [0.8, 1.2],
                    "events": {
                        "hurt": "mob.creeper.say",
                        "death": "mob.creeper.death",
                        "fuse": {"sound": "random.fuse", "volume": 1.0, "pitch": 0.5},
                    },
                },
                "zt:figure": {"volume": 1.0, "pitch": 1.0, "events": {"ambient": "zt.figure.ambient"}},
                "zt:seek": {"volume": 1.0, "pitch": 1.0, "events": {"ambient": "zt.seek.ambient"}},
                "zt:zombie_minion": {
                    "volume": 1.0,
                    "pitch": [0.8, 1.0],
                    "events": {
                        "ambient": "mob.zombie.say",
                        "hurt": "mob.zombie.hurt",
                        "death": "mob.zombie.death",
                        "step": {"sound": "mob.zombie.step", "volume": 0.15, "pitch": 1.0},
                    },
                },
            }
        }
    }


def main():
    os.makedirs(os.path.join(RP, "sounds"), exist_ok=True)
    with open(os.path.join(RP, "sounds", "sound_definitions.json"), "w") as f:
        json.dump(definitions(), f, indent="\t")
        f.write("\n")
    with open(os.path.join(RP, "sounds.json"), "w") as f:
        json.dump(entity_sounds(), f, indent="\t")
        f.write("\n")
    print("sounds written")


if __name__ == "__main__":
    main()
