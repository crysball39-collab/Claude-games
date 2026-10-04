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
