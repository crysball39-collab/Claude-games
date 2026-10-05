"""Writes the Spider Titan's behaviour and client files: the titan, the corpse
that rolls onto its back, and the spider minions (wall-climbing spiders that
fight for the titan, in the four Java minion tiers).

Java Titans mod (0.45) numbers: 10,000 HP, 90 attack damage, 28 blocks wide,
12,000 XP. Players can only hurt it while it is stunned: hits on its legs
knock it off balance (spider_titan.js counts them).

    python3 tools/gen_spider_data.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
FORMAT = "1.21.90"

IMMUNE_CAUSES = ["fall", "fire", "fire_tick", "lava", "drowning", "suffocation", "entity_explosion", "block_explosion",
                 "magic", "wither", "lightning", "anvil", "falling_block", "freezing", "contact", "stalactite",
                 "stalagmite", "fly_into_wall", "temperature"]
# spiders shrug off poison (Java: the Spider Titan can't be poisoned)
EFFECT_IMMUNITY = ["poison", "fatal_poison", "wither", "slowness", "weakness", "levitation", "blindness", "darkness",
                   "nausea", "mining_fatigue", "hunger", "instant_damage", "slow_falling", "infested", "oozing",
                   "weaving", "wind_charged"]


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def prop_bool(sync=True):
    return {"type": "bool", "default": False, "client_sync": sync}


def is_family(value, subject="other"):
    return {"test": "is_family", "subject": subject, "value": value}


def spider_titan():
    player_hits = {"all_of": [{"test": "bool_property", "domain": "zt:stunned", "value": False}, is_family("player")]}
    dark_fists = {"test": "has_equipment", "subject": "other", "domain": "hand", "value": "zt:dark_fists"}
    enraged = {"test": "bool_property", "domain": "zt:enraged", "value": True}
    triggers = [{"on_damage": {"filters": {"test": "bool_property", "domain": "zt:birth", "value": True}},
                 "deals_damage": "no"}]
    triggers += [{"cause": c, "deals_damage": "no"} for c in IMMUNE_CAUSES]
    triggers += [
        {"on_damage": {"filters": is_family("zt_ally")}, "deals_damage": "no"},
        # players only hurt it while it is stunned; the script counts their hits on its legs
        {"on_damage": {"filters": player_hits, "event": "zt:spider_block"}, "deals_damage": "no"},
        {"on_damage": {"filters": {"all_of": [enraged, is_family("player"), dark_fists]}}, "damage_multiplier": 2.5},
        {"on_damage": {"filters": {"all_of": [is_family("player"), dark_fists]}}, "damage_multiplier": 5.0},
        {"on_damage": {"filters": enraged}, "damage_multiplier": 0.5},
    ]
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:spider_titan",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "monster",
                "properties": {
                    "zt:anim": {"type": "int", "range": [0, 15], "default": 0, "client_sync": True},
                    "zt:moving": prop_bool(),
                    "zt:stunned": prop_bool(),
                    # low on health it flashes red and fights faster
                    "zt:enraged": prop_bool(),
                    "zt:birth": prop_bool(False),
                    "zt:grow": {"type": "float", "range": [0.0, 1.0], "default": 1.0, "client_sync": True},
                },
            },
            "component_groups": {"zt:small": {"minecraft:collision_box": {"width": 2.0, "height": 1.5}}},
            "components": {
                "minecraft:type_family": {"family": ["spider_titan", "titan", "zt_ally", "spider", "arthropod", "monster",
                                                     "mob"]},
                "minecraft:health": {"value": 10000, "max": 10000},
                "minecraft:boss": {"name": "Spider Titan", "should_darken_sky": False, "hud_range": 100},
                # wide and low: the body and the inner half of each leg
                "minecraft:collision_box": {"width": 18.0, "height": 12.0},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": {},
                "minecraft:movement": {"value": 0.0},
                "minecraft:movement.basic": {},
                "minecraft:persistent": {},
                "minecraft:nameable": {"allow_name_tag_renaming": False, "always_show": False},
                "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
                "minecraft:ambient_sound_interval": {"value": 8.0, "range": 8.0, "event_name": "ambient"},
                "minecraft:mob_effect_immunity": {"mob_effects": EFFECT_IMMUNITY},
                "minecraft:damage_sensor": {"triggers": triggers},
            },
            "events": {
                "zt:start_birth": {"add": {"component_groups": ["zt:small"]}},
                "zt:end_birth": {"remove": {"component_groups": ["zt:small"]}},
                "zt:spider_block": {},
            },
        },
    }


def spider_titan_corpse():
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {"identifier": "zt:spider_titan_corpse", "is_spawnable": False, "is_summonable": True},
            "components": {
                "minecraft:type_family": {"family": ["zt_ally", "inanimate"]},
                "minecraft:health": {"value": 1, "max": 1},
                "minecraft:collision_box": {"width": 0.5, "height": 0.5},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": {},
                "minecraft:persistent": {},
                "minecraft:nameable": {"allow_name_tag_renaming": False},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
            },
            "events": {},
        },
    }


def spider_minion():
    def tier(variant, hp, speed, damage, extra=None):
        g = {"minecraft:variant": {"value": variant}, "minecraft:health": {"value": hp, "max": hp},
             "minecraft:movement": {"value": speed}, "minecraft:attack": {"damage": damage}}
        g.update(extra or {})
        return g

    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:spider_minion",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "monster",
                "properties": {"zt:casting": prop_bool()},
            },
            "component_groups": {
                "zt:loyalist": tier(0, 20, 0.3, 3),
                "zt:priest": tier(1, 40, 0.28, 3),
                "zt:zealot": tier(2, 60, 0.38, 6),
                "zt:templar": tier(3, 120, 0.32, 8, {"minecraft:knockback_resistance": {"value": 0.6}}),
            },
            "components": {
                "minecraft:type_family": {"family": ["spider_minion", "zt_ally", "spider", "arthropod", "monster", "mob"]},
                "minecraft:variant": {"value": 0},
                "minecraft:health": {"value": 20, "max": 20},
                "minecraft:movement": {"value": 0.3},
                "minecraft:attack": {"damage": 3},
                "minecraft:collision_box": {"width": 1.4, "height": 0.9},
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:can_climb": {},
                "minecraft:nameable": {},
                "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0},
                "minecraft:navigation.climb": {"can_path_over_water": True},
                "minecraft:despawn": {"despawn_from_distance": {}},
                "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 8 : 0"},
                "minecraft:loot": {"table": "loot_tables/entities/spider_minion.json"},
                "minecraft:mob_effect_immunity": {"mob_effects": ["poison", "fatal_poison"]},
                "minecraft:damage_sensor": {"triggers": [
                    {"on_damage": {"filters": is_family("zt_ally")}, "deals_damage": "no"},
                    {"cause": "lightning", "deals_damage": "no"},
                    {"cause": "fall", "deals_damage": "no"},
                ]},
                "minecraft:behavior.float": {"priority": 0},
                "minecraft:behavior.hurt_by_target": {"priority": 1, "entity_types": [
                    {"filters": {"test": "is_family", "subject": "other", "operator": "!=", "value": "zt_ally"}}]},
                "minecraft:behavior.nearest_attackable_target": {
                    "priority": 2, "must_see": False, "reselect_targets": True, "within_radius": 32,
                    "entity_types": [
                        {"filters": is_family("player"), "max_dist": 40},
                        {"filters": {"any_of": [is_family("villager"), is_family("wandering_trader"),
                                                is_family("irongolem"), is_family("snowgolem")]}, "max_dist": 32},
                    ],
                },
                "minecraft:behavior.leap_at_target": {"priority": 4, "must_be_on_ground": False, "yd": 0.4},
                "minecraft:behavior.melee_attack": {"priority": 3, "speed_multiplier": 1.2, "track_target": True},
                "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.8},
                "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 8},
                "minecraft:behavior.random_look_around": {"priority": 7},
            },
            "events": {
                "minecraft:entity_spawned": {"randomize": [
                    {"weight": 60, "add": {"component_groups": ["zt:loyalist"]}},
                    {"weight": 20, "add": {"component_groups": ["zt:priest"]}},
                    {"weight": 15, "add": {"component_groups": ["zt:zealot"]}},
                    {"weight": 5, "add": {"component_groups": ["zt:templar"]}},
                ]},
                "zt:as_loyalist": {"add": {"component_groups": ["zt:loyalist"]}},
                "zt:as_priest": {"add": {"component_groups": ["zt:priest"]}},
                "zt:as_zealot": {"add": {"component_groups": ["zt:zealot"]}},
                "zt:as_templar": {"add": {"component_groups": ["zt:templar"]}},
            },
        },
    }


def spider_minion_loot():
    return {"pools": [
        {"rolls": 1, "entries": [{"type": "item", "name": "minecraft:string", "weight": 1, "functions": [
            {"function": "set_count", "count": {"min": 0, "max": 2}},
            {"function": "looting_enchant", "count": {"min": 0, "max": 1}},
        ]}]},
        {"rolls": 1, "conditions": [{"condition": "killed_by_player"}, {"condition": "random_chance_with_looting",
                                                                       "chance": 0.33, "looting_multiplier": 0.01}],
         "entries": [{"type": "item", "name": "minecraft:spider_eye", "weight": 1}]},
    ]}


# ------------------------------------------------------------------------------ client files
ANIMS = ["idle", "walk", "birth", "smash", "anti_air", "sweep", "web", "lightning", "clap", "stun", "awaken", "leap"]


def client_titan():
    animations = {name: "animation.zt.spider." + name for name in ANIMS}
    animations["controller"] = "controller.animation.zt.spider.main"
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:spider_titan",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/spider_titan/spider_titan"},
        "geometry": {"default": "geometry.zt.spider_titan"},
        "spawn_egg": {"texture": "zt_spider_titan_egg"},
        "scripts": {
            "scale": "1.0 + 15.0 * q.property('zt:grow')",
            "should_update_bones_and_effects_offscreen": "1.0",
            "should_update_effects_offscreen": "1.0",
            "animate": ["controller"],
        },
        "animations": animations,
        "render_controllers": ["controller.render.zt.spider_titan"],
    }}}


def client_corpse():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:spider_titan_corpse",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/spider_titan/spider_titan"},
        "geometry": {"default": "geometry.zt.spider_titan"},
        "scripts": {
            "scale": "16.0",
            "should_update_bones_and_effects_offscreen": "1.0",
            "should_update_effects_offscreen": "1.0",
            "animate": ["death"],
        },
        "animations": {"death": "animation.zt.spider.death"},
        "render_controllers": ["controller.render.zt.spider_titan_corpse"],
    }}}


def client_minion():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:spider_minion",
        "materials": {"default": "spider", "invisible": "spider_invisible"},
        "textures": {
            "loyalist": "textures/entity/spider_minion/loyalist",
            "priest": "textures/entity/spider_minion/priest",
            "zealot": "textures/entity/spider_minion/zealot",
            "templar": "textures/entity/spider_minion/templar",
        },
        "geometry": {"default": "geometry.spider.v1.8"},
        "spawn_egg": {"texture": "zt_spider_minion_egg"},
        "scripts": {"animate": ["move", "cast"]},
        "animations": {
            "default_leg_pose": "animation.spider.default_leg_pose",
            "look_at_target": "animation.spider.look_at_target",
            "walk": "animation.spider.walk",
            "move": "controller.animation.spider.move",
            "cast_wave": "animation.zt.spider_minion.cast",
            "cast": "controller.animation.zt.spider_minion.cast",
        },
        "render_controllers": ["controller.render.zt.spider_minion"],
    }}}


def render_controllers(existing):
    rc = existing["render_controllers"]
    fury = "q.property('zt:enraged')"
    rc["controller.render.zt.spider_titan"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        # low on health it flashes red with fury, like the Java Spider Titan
        "overlay_color": {
            "r": "%s ? 1.0 : this" % fury,
            "g": "%s ? 0.08 : this" % fury,
            "b": "%s ? 0.06 : this" % fury,
            "a": "%s ? (0.12 + math.max(0, math.sin(q.life_time * 360.0)) * 0.38) : this" % fury,
        },
    }
    rc["controller.render.zt.spider_titan_corpse"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
    }
    rc["controller.render.zt.spider_minion"] = {
        "arrays": {
            "textures": {"Array.skins": ["Texture.loyalist", "Texture.priest", "Texture.zealot", "Texture.templar"]},
            "materials": {"Array.materials": ["Material.default", "Material.invisible"]},
        },
        "geometry": "Geometry.default",
        "materials": [{"*": "Array.materials[q.is_invisible]"}],
        "textures": ["Array.skins[q.variant]"],
    }
    return existing


def main():
    dump(BP, "entities/spider_titan.json", spider_titan())
    dump(BP, "entities/spider_titan_corpse.json", spider_titan_corpse())
    dump(BP, "entities/spider_minion.json", spider_minion())
    dump(BP, "loot_tables/entities/spider_minion.json", spider_minion_loot())
    dump(RP, "entity/spider_titan.entity.json", client_titan())
    dump(RP, "entity/spider_titan_corpse.entity.json", client_corpse())
    dump(RP, "entity/spider_minion.entity.json", client_minion())
    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for egg in ("zt_spider_titan_egg", "zt_spider_minion_egg"):
        icons["texture_data"][egg] = {"textures": "textures/items/" + egg}
    dump(RP, "textures/item_texture.json", icons)
    path = os.path.join(RP, "render_controllers", "zt.render_controllers.json")
    with open(path) as f:
        existing = json.load(f)
    dump(RP, "render_controllers/zt.render_controllers.json", render_controllers(existing))
    print("spider data written")


if __name__ == "__main__":
    main()
