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
SPIDER_SAY = ["sounds/mob/spider/say1", "sounds/mob/spider/say2", "sounds/mob/spider/say3", "sounds/mob/spider/say4"]
SPIDER_STEP = ["sounds/mob/spider/step1", "sounds/mob/spider/step2", "sounds/mob/spider/step3", "sounds/mob/spider/step4"]
LLAMA_SPIT = ["sounds/mob/llama/spit1", "sounds/mob/llama/spit2"]
WEB_BREAK = ["sounds/block/web/break1", "sounds/block/web/break2", "sounds/block/web/break3"]
SILVER_SAY = ["sounds/mob/silverfish/say1", "sounds/mob/silverfish/say2", "sounds/mob/silverfish/say3", "sounds/mob/silverfish/say4"]
SILVER_HIT = ["sounds/mob/silverfish/hit1", "sounds/mob/silverfish/hit2", "sounds/mob/silverfish/hit3"]
SILVER_STEP = ["sounds/mob/silverfish/step1", "sounds/mob/silverfish/step2", "sounds/mob/silverfish/step3",
               "sounds/mob/silverfish/step4"]
DIG_STONE = ["sounds/dig/stone1", "sounds/dig/stone2", "sounds/dig/stone3", "sounds/dig/stone4"]
DIG_GRAVEL = ["sounds/dig/gravel1", "sounds/dig/gravel2", "sounds/dig/gravel3", "sounds/dig/gravel4"]
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
IRON_OPEN = ["sounds/block/iron_door/open%d" % i for i in range(1, 5)]
GATE_OPEN = ["sounds/block/fence_gate/open1", "sounds/block/fence_gate/open2"]
GATE_CLOSE = ["sounds/block/fence_gate/close1", "sounds/block/fence_gate/close2"]
COPPER_DOOR = ["sounds/block/copper_door/toggle%d" % i for i in range(1, 4)]
BARREL_OPEN = ["sounds/block/barrel/open1", "sounds/block/barrel/open2"]
WHISPER = ["sounds/ambient/nether/soulsand_valley/whisper%d" % i for i in range(1, 9)]
CLOTH = ["sounds/step/cloth%d" % i for i in range(1, 5)]
LEATHER = ["sounds/armor/equip_leather%d" % i for i in range(1, 7)]
EQUIP_CHAIN = ["sounds/armor/equip_chain%d" % i for i in range(1, 7)]
EQUIP_GOLD = ["sounds/armor/equip_gold%d" % i for i in range(1, 7)]
EQUIP_IRON = ["sounds/armor/equip_iron%d" % i for i in range(1, 7)]
EAT = ["sounds/random/eat1", "sounds/random/eat2", "sounds/random/eat3"]
BELL = ["sounds/block/bell/bell_use01", "sounds/block/bell/bell_use02"]
WITCH = ["sounds/mob/witch/ambient%d" % i for i in range(1, 6)]
VEX_CHARGE = ["sounds/mob/vex/charge1", "sounds/mob/vex/charge2", "sounds/mob/vex/charge3"]
SCRAPE = ["sounds/item/axe/scrape1", "sounds/item/axe/scrape2", "sounds/item/axe/scrape3"]
AIR = ["sounds/mob/breeze/idle_air%d" % i for i in range(1, 5)]
DEBRIS = ["sounds/ambient/nether/basalt_deltas/long_debris1", "sounds/ambient/nether/basalt_deltas/long_debris2"]
BASALT_CLICK = ["sounds/ambient/nether/basalt_deltas/click%d" % i for i in range(1, 9)]
SHATTER = ["sounds/block/decorated_pot/shatter%d" % i for i in range(1, 6)]
HIT = ["sounds/damage/hit1", "sounds/damage/hit2", "sounds/damage/hit3"]


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
        # Spider Titan: vanilla spider hisses and steps played low, with a llama's spit for its web
        "zt.spider.ambient": event(snd(SPIDER_SAY, 0.45, 1.0)),
        "zt.spider.hurt": event(snd(SPIDER_SAY, 0.62, 1.0), min_d=16.0, max_d=96.0),
        "zt.spider.death": event(snd(["sounds/mob/spider/death"], 0.4, 1.0) + snd(RAV_ROAR[:2], 0.5, 0.8), max_d=192.0),
        "zt.spider.step": event(snd(SPIDER_STEP, 0.45, 1.0) + snd(WARDEN_STEP, 0.7, 0.6), min_d=16.0, max_d=96.0),
        "zt.spider.hiss": event(snd(SPIDER_SAY, 0.32, 1.0), min_d=32.0, max_d=160.0),
        "zt.spider.roar": event(snd(SPIDER_SAY, 0.36, 1.0) + snd(RAV_ROAR, 0.55, 0.8), min_d=32.0, max_d=192.0),
        "zt.spider.web": event(snd(LLAMA_SPIT, 0.45, 1.0) + snd(WEB_BREAK, 0.55, 1.0), min_d=16.0, max_d=128.0),
        "zt.spider.web_hit": event(snd(WEB_BREAK, 0.75, 1.0) + snd(SLIME_SMALL, 0.6, 0.8), min_d=8.0, max_d=64.0),
        # Omegafish: vanilla silverfish chirps and skitters played low, rock grinding as it burrows
        "zt.omega.ambient": event(snd(SILVER_SAY, 0.4, 1.0)),
        "zt.omega.hurt": event(snd(SILVER_HIT, 0.5, 1.0), min_d=16.0, max_d=96.0),
        "zt.omega.death": event(snd(["sounds/mob/silverfish/kill"], 0.35, 1.0) + snd(RAV_ROAR[:2], 0.6, 0.7), max_d=192.0),
        "zt.omega.step": event(snd(SILVER_STEP, 0.5, 1.0) + snd(WARDEN_STEP, 0.9, 0.4), min_d=16.0, max_d=96.0),
        "zt.omega.hiss": event(snd(SILVER_SAY, 0.3, 1.0), min_d=32.0, max_d=160.0),
        "zt.omega.roar": event(snd(SILVER_SAY, 0.33, 1.0) + snd(RAV_ROAR, 0.6, 0.7), min_d=32.0, max_d=192.0),
        "zt.omega.dig": event(snd(DIG_STONE, 0.5, 1.0) + snd(DIG_GRAVEL, 0.45, 1.0), min_d=16.0, max_d=96.0),
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
    D.update(hotel_definitions())
    return {"format_version": "1.20.20", "sound_definitions": D}


def hotel_definitions():
    """The Hotel (Floor 1): the Lobby's elevators, doors and gates, drawers and closets, Rush,
    Screech, Hide, Jeff's shop, door 100's lever, breaker box and the Figure's last chase."""
    blk, plr, hos = "block", "player", "hostile"
    return {
        # the elevators
        "zt.elevator.open": event(snd(["sounds/tile/piston/out"], 0.5, 0.8) + snd(COPPER_DOOR, 0.6, 0.6), category=blk,
                                  min_d=6.0, max_d=32.0),
        "zt.elevator.close": event(snd(["sounds/tile/piston/in"], 0.5, 0.8) + snd(COPPER_DOOR, 0.55, 0.6), category=blk,
                                   min_d=6.0, max_d=32.0),
        "zt.elevator.ding": event(snd(["sounds/note/bell"], 1.19, 0.9), category=blk, min_d=6.0, max_d=32.0),
        "zt.elevator.hum": event(snd(["sounds/minecart/inside"], 0.55, 0.7), category=blk, min_d=4.0, max_d=16.0),
        "zt.elevator.gate": event(snd(IRON_OPEN, 0.8, 0.8) + snd(CHAIN, 1.1, 1.0), category=blk, min_d=6.0, max_d=32.0),
        "zt.elevator.cable": event(snd(["sounds/random/break"], 0.5, 1.0) + snd(CHAIN, 0.6, 1.0), category=blk, min_d=8.0,
                                   max_d=48.0),
        "zt.elevator.alarm": event(snd(BELL, 1.5, 0.8), category=blk, min_d=8.0, max_d=48.0),
        "zt.elevator.fall": event(snd(SCRAPE, 0.5, 1.0) + snd(WHIRL, 0.6, 1.0), category=plr, min_d=4.0, max_d=16.0),
        "zt.elevator.crash": event(snd(EXPLODE, 0.6, 1.0) + snd(["sounds/random/anvil_land"], 0.5, 1.0) + snd(GLASS, 0.7, 0.8),
                                   category=plr, min_d=4.0, max_d=16.0),
        # doors and gates
        "zt.gate.open": event(snd(GATE_OPEN, 0.6, 1.0) + snd(IRON_OPEN, 0.7, 0.6), category=blk, min_d=8.0, max_d=32.0),
        "zt.gate.close": event(snd(GATE_CLOSE, 0.6, 1.0) + snd(IRON_DOOR, 0.7, 0.6), category=blk, min_d=8.0, max_d=32.0),
        "zt.big_gate.open": event(snd(["sounds/tile/piston/out"], 0.35, 1.0) + snd(["sounds/block/vault/open_shutter"], 0.6, 1.0),
                                  category=blk, min_d=16.0, max_d=64.0),
        "zt.metal_door.open": event(snd(IRON_OPEN, 0.8, 1.0), category=blk, min_d=8.0, max_d=32.0),
        "zt.metal_door.close": event(snd(IRON_DOOR, 0.8, 1.0), category=blk, min_d=8.0, max_d=32.0),
        "zt.door.burst": event(snd(EXPLODE, 1.2, 0.8) + snd(IRON_DOOR, 0.5, 1.0) + snd(["sounds/random/anvil_land"], 0.6, 1.0),
                               category=hos, min_d=16.0, max_d=64.0),
        "zt.window.crash": event(snd(GLASS, 0.8, 1.0) + snd(SHATTER, 0.6, 1.0), category=hos, min_d=16.0, max_d=64.0),
        # the Figure at door 100
        "zt.figure.bang": event(snd(["sounds/random/anvil_land"], 0.5, 1.0) + snd(IRON_DOOR, 0.45, 1.0) + snd(W_HIT, 0.8, 0.8),
                                category=hos, min_d=16.0, max_d=64.0),
        "zt.figure.bang_gate": event(snd(IRON_DOOR, 0.6, 1.0) + snd(CHAIN, 0.8, 1.0) + snd(["sounds/random/anvil_land"], 0.7, 0.7),
                                     category=hos, min_d=16.0, max_d=64.0),
        "zt.figure.bump": event(snd(["sounds/random/anvil_land"], 0.4, 1.0) + snd(["sounds/damage/fallbig"], 0.6, 1.0),
                                category=hos, min_d=16.0, max_d=64.0),
        "zt.figure.land": event(snd(["sounds/random/anvil_land"], 0.45, 1.0) + snd(["sounds/item/mace/smash_ground_heavy"], 0.7, 1.0),
                                category=hos, min_d=16.0, max_d=64.0),
        "zt.fire.whoosh": event(snd(["sounds/mob/ghast/fireball4"], 0.6, 1.0) + snd(["sounds/fire/ignite"], 0.6, 1.0), category=blk,
                                min_d=12.0, max_d=48.0),
        "zt.wire.spark": event(snd(["sounds/random/fizz"], 1.8, 0.8) + snd(BASALT_CLICK, 1.5, 1.0), category=blk, min_d=6.0,
                               max_d=32.0),
        # door 100's lever and breaker box
        "zt.lever.pull": event(snd(["sounds/random/click"], 0.5, 1.0) + snd(IRON_TRAP, 0.6, 1.0), category=blk, min_d=8.0,
                               max_d=32.0),
        "zt.breaker.open": event(snd(IRON_TRAP, 1.0, 1.0), category=blk, min_d=6.0, max_d=24.0),
        "zt.breaker.insert": event(snd(["sounds/random/click"], 0.9, 1.0) + snd(["sounds/block/vault/insert"], 1.2, 1.0), category=blk,
                                   min_d=6.0, max_d=24.0),
        "zt.breaker.pickup": event(snd(EQUIP_IRON, 1.4, 1.0), category=plr, min_d=4.0, max_d=16.0),
        "zt.breaker.click": event(snd(["sounds/random/click"], 1.4, 1.0), category=blk, min_d=4.0, max_d=16.0),
        "zt.breaker.beep": event(snd(["sounds/note/bit"], 1.5, 0.8), category=blk, min_d=6.0, max_d=24.0),
        "zt.breaker.correct": event(snd(["sounds/note/bit"], 2.0, 0.8) + snd(["sounds/random/orb"], 1.4, 0.8), category=blk,
                                    min_d=6.0, max_d=24.0),
        "zt.breaker.power": event(snd(BEACON_POWER, 0.7, 1.0) + snd(["sounds/block/conduit/activate"], 0.8, 1.0), category=blk,
                                  min_d=16.0, max_d=64.0),
        # hiding, searching, picking things up
        "zt.closet.enter": event(snd(DOOR_CLOSE, 1.15, 0.8), category=plr, min_d=4.0, max_d=16.0),
        "zt.closet.exit": event(snd(DOOR_OPEN, 1.1, 0.8), category=plr, min_d=4.0, max_d=16.0),
        "zt.bed.enter": event(snd(CLOTH, 0.8, 1.0) + snd(LEATHER, 0.8, 0.8), category=plr, min_d=4.0, max_d=16.0),
        "zt.drawer.open": event(snd(BARREL_OPEN, 1.25, 0.7), category=blk, min_d=4.0, max_d=16.0),
        "zt.key.pickup": event(snd(["sounds/random/pop"], 1.5, 0.6) + snd(EQUIP_CHAIN, 1.4, 1.0), category=plr, min_d=4.0, max_d=16.0),
        "zt.gold.pickup": event(snd(["sounds/random/orb"], 1.2, 0.7) + snd(EQUIP_GOLD, 1.6, 1.0), category=plr, min_d=4.0, max_d=16.0),
        "zt.item.pickup": event(snd(["sounds/random/pop"], 1.1, 0.8), category=plr, min_d=4.0, max_d=16.0),
        "zt.item.break": event(snd(["sounds/random/break"], 1.0, 1.0), category=plr, min_d=4.0, max_d=16.0),
        "zt.lighter.flick": event(snd(["sounds/fire/ignite"], 1.4, 0.8), category=plr, min_d=4.0, max_d=16.0),
        "zt.lighter.close": event(snd(["sounds/random/click"], 1.6, 0.7), category=plr, min_d=4.0, max_d=16.0),
        "zt.flashlight.click": event(snd(["sounds/random/click"], 1.8, 0.6), category=plr, min_d=4.0, max_d=16.0),
        "zt.herb.eat": event(snd(EAT, 1.1, 1.0) + snd(["sounds/random/burp"], 1.2, 0.4), category=plr, min_d=4.0, max_d=16.0),
        "zt.crucifix.chains": event(snd(CHAIN, 0.6, 1.0) + snd(["sounds/block/amethyst/shimmer"], 0.8, 1.0) +
                                    snd(BEACON_POWER, 1.7, 0.5), category=plr, min_d=8.0, max_d=48.0),
        # Hide
        "zt.hide.whisper": event(snd(WHISPER, 0.7, 1.0), category=hos, min_d=2.0, max_d=8.0),
        "zt.hide.kick": event(snd(DOOR_OPEN, 0.7, 1.0) + snd(HIT, 0.8, 1.0) + snd(SCREAM, 0.6, 0.5), category=hos, min_d=4.0,
                              max_d=24.0),
        # Rush
        # (its approach and its roar going past are made by gen_floor1_audio.py)
        "zt.rush.approach": event([{"name": "sounds/zt/rush_approach", "volume": 1.0, "pitch": 1.0}], category=hos, min_d=4.0,
                                  max_d=16.0),
        "zt.rush.pass": event([{"name": "sounds/zt/rush_pass", "volume": 1.0, "pitch": 1.0}], category=hos, min_d=4.0, max_d=16.0),
        "zt.rush.flicker": event(snd(["sounds/block/copper_bulb/turn_on"], 1.5, 0.8) + snd(["sounds/random/click"], 2.0, 0.6),
                                 category=blk, min_d=8.0, max_d=48.0),
        "zt.rush.gone": event(snd(WHIRL, 0.4, 0.6), category=hos, min_d=16.0, max_d=96.0),
        "zt.rush.kill": event(snd(EXPLODE, 0.8, 1.0) + snd(SCREAM, 0.6, 1.0) + snd(RAV_ROAR, 1.3, 1.0), category=hos, min_d=8.0,
                              max_d=48.0),
        "zt.rush.thunder": event(snd(THUNDER, 1.0, 1.0), category="weather", min_d=32.0, max_d=192.0),
        "zt.rush.banished": event(snd(["sounds/block/beacon/deactivate"], 0.8, 1.0) + snd(CHAIN, 0.6, 1.0), category=hos, min_d=16.0,
                                  max_d=64.0),
        "zt.lights.break": event(snd(GLASS, 1.2, 1.0) + snd(LANTERN_BREAK, 1.0, 1.0), category=blk, min_d=8.0, max_d=48.0),
        # Screech (its "psst" is made by gen_floor1_audio.py)
        "zt.screech.psst": event([{"name": "sounds/zt/psst", "volume": 1.0, "pitch": 1.0}], category=hos, min_d=2.0, max_d=12.0),
        "zt.screech.scream": event(snd(VEX_CHARGE, 1.3, 1.0) + snd(SCREAM, 1.4, 0.6), category=hos, min_d=4.0, max_d=24.0),
        "zt.screech.bite": event(snd(["sounds/mob/evocation_illager/fangs"], 1.2, 1.0) + snd(STRONG, 1.4, 1.0) +
                                 snd(SLIME_SMALL, 0.8, 0.6), category=hos, min_d=4.0, max_d=24.0),
        # Jeff's shop
        "zt.shop.bell": event(snd(["sounds/note/bell"], 1.5, 0.7) + snd(["sounds/note/bell"], 1.78, 0.7), category=blk, min_d=6.0,
                              max_d=24.0),
        "zt.shop.buy": event(snd(["sounds/random/orb"], 1.0, 0.8) + snd(EQUIP_GOLD, 1.2, 1.0), category=plr, min_d=4.0, max_d=16.0),
        "zt.goblino.laugh": event(snd(WITCH, 1.5, 1.0), category="neutral", min_d=6.0, max_d=24.0),
        "zt.bob.rattle": event(snd(SKEL_SAY, 1.2, 0.8) + snd(BONE_DIG, 1.0, 0.8), category="neutral", min_d=6.0, max_d=24.0),
        # music (made by gen_floor1_audio.py)
        "zt.music.elevator": {"category": "music", "sounds": [{"name": "sounds/zt/elevator_music", "stream": True, "volume": 0.8}]},
        "zt.music.door100": {"category": "music", "sounds": [{"name": "sounds/zt/door100_chase", "stream": True, "volume": 0.9}]},
    }


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
                "zt:spider_titan": {
                    "volume": 1.0,
                    "pitch": 1.0,
                    "events": {"ambient": "zt.spider.ambient", "hurt": "zt.spider.hurt", "death": "zt.spider.death"},
                },
                "zt:spider_minion": {
                    "volume": 1.0,
                    "pitch": [0.8, 1.2],
                    "events": {
                        "ambient": "mob.spider.say",
                        "hurt": "mob.spider.say",
                        "death": "mob.spider.death",
                        "step": {"sound": "mob.spider.step", "volume": 0.35, "pitch": 1.0},
                    },
                },
                "zt:omegafish": {
                    "volume": 1.0,
                    "pitch": 1.0,
                    "events": {"ambient": "zt.omega.ambient", "hurt": "zt.omega.hurt", "death": "zt.omega.death"},
                },
                "zt:silverfish_minion": {
                    "volume": 1.0,
                    "pitch": [0.8, 1.1],
                    "events": {
                        "ambient": "mob.silverfish.say",
                        "hurt": "mob.silverfish.hit",
                        "death": "mob.silverfish.kill",
                        "step": {"sound": "mob.silverfish.step", "volume": 0.35, "pitch": 1.0},
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
