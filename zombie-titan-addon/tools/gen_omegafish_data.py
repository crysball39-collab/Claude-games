"""Writes the Omegafish's behaviour and client files: the titan, the corpse that writhes and flops
onto its back, and the silverfish minions (in the four Java minion ranks).

Java Titans mod (0.45) Omegafish: 8,000 HP, "Lesser Titan" armour, Head Butt (50), Tail Swipe
(50-200), Lightning Shot (50 and burning), Tail Smash (400), Body Slam (500), random explosions at
your feet below a quarter of its health, and it burrows to reach a target much faster; the mod's
own tip is to "shoot him with arrows until he flops over, then attack him". Players can only hurt
it while it lies flopped on its back (omegafish.js counts the arrows).

    python3 tools/gen_omegafish_data.py      (after gen_spider_data.py)
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
FORMAT = "1.21.90"
HP = 8000

IMMUNE_CAUSES = ["fall", "fire", "fire_tick", "lava", "drowning", "suffocation", "entity_explosion", "block_explosion",
                 "magic", "wither", "lightning", "anvil", "falling_block", "freezing", "contact", "stalactite",
                 "stalagmite", "fly_into_wall", "temperature"]
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


def omegafish():
    player_hits = {"all_of": [{"test": "bool_property", "domain": "zt:stunned", "value": False}, is_family("player")]}
    dark_fists = {"test": "has_equipment", "subject": "other", "domain": "hand", "value": "zt:dark_fists"}
    enraged = {"test": "bool_property", "domain": "zt:enraged", "value": True}
    triggers = [{"on_damage": {"filters": {"test": "bool_property", "domain": "zt:birth", "value": True}},
                 "deals_damage": "no"},
                # nothing reaches it while it tunnels underground
                {"on_damage": {"filters": {"test": "bool_property", "domain": "zt:burrowed", "value": True}},
                 "deals_damage": "no"}]
    triggers += [{"cause": c, "deals_damage": "no"} for c in IMMUNE_CAUSES]
    triggers += [
        {"on_damage": {"filters": is_family("zt_ally")}, "deals_damage": "no"},
        # players only hurt it while it lies on its back; the script counts the arrows that flip it
        {"on_damage": {"filters": player_hits, "event": "zt:omegafish_block"}, "deals_damage": "no"},
        {"on_damage": {"filters": {"all_of": [enraged, is_family("player"), dark_fists]}}, "damage_multiplier": 2.5},
        {"on_damage": {"filters": {"all_of": [is_family("player"), dark_fists]}}, "damage_multiplier": 5.0},
        {"on_damage": {"filters": enraged}, "damage_multiplier": 0.5},
    ]
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:omegafish",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "monster",
                "properties": {
                    "zt:anim": {"type": "int", "range": [0, 15], "default": 0, "client_sync": True},
                    "zt:moving": prop_bool(),
                    "zt:stunned": prop_bool(),
                    # low on health it glows white (and explosions burst at its enemies' feet)
                    "zt:enraged": prop_bool(),
                    "zt:birth": prop_bool(False),
                    "zt:burrowed": prop_bool(False),
                    "zt:grow": {"type": "float", "range": [0.0, 1.0], "default": 1.0, "client_sync": True},
                },
            },
            "component_groups": {"zt:small": {"minecraft:collision_box": {"width": 1.5, "height": 1.0}}},
            "components": {
                "minecraft:type_family": {"family": ["omegafish", "titan", "zt_ally", "silverfish", "arthropod", "monster", "mob"]},
                "minecraft:health": {"value": HP, "max": HP},
                "minecraft:boss": {"name": "Omegafish", "should_darken_sky": False, "hud_range": 100},
                # most of its 19-block body, whichever way it faces (a collision box doesn't turn): arrows
                # anywhere along its back land
                "minecraft:collision_box": {"width": 14.0, "height": 8.0},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": {},
                "minecraft:movement": {"value": 0.0},
                "minecraft:movement.basic": {},
                "minecraft:persistent": {},
                "minecraft:nameable": {"allow_name_tag_renaming": False, "always_show": False},
                "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
                "minecraft:ambient_sound_interval": {"value": 6.0, "range": 6.0, "event_name": "ambient"},
                "minecraft:mob_effect_immunity": {"mob_effects": EFFECT_IMMUNITY},
                "minecraft:damage_sensor": {"triggers": triggers},
            },
            "events": {
                "zt:start_birth": {"add": {"component_groups": ["zt:small"]}},
                "zt:end_birth": {"remove": {"component_groups": ["zt:small"]}},
                "zt:omegafish_block": {},
            },
        },
    }


def corpse():
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {"identifier": "zt:omegafish_corpse", "is_spawnable": False, "is_summonable": True},
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


def minion():
    def tier(variant, hp, speed, damage, extra=None):
        g = {"minecraft:variant": {"value": variant}, "minecraft:health": {"value": hp, "max": hp},
             "minecraft:movement": {"value": speed}, "minecraft:attack": {"damage": damage}}
        g.update(extra or {})
        return g

    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:silverfish_minion",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "monster",
                "properties": {"zt:casting": prop_bool()},
            },
            "component_groups": {
                "zt:loyalist": tier(0, 16, 0.3, 2),
                "zt:priest": tier(1, 30, 0.28, 2),
                "zt:zealot": tier(2, 40, 0.4, 5),
                "zt:templar": tier(3, 80, 0.32, 6, {"minecraft:knockback_resistance": {"value": 0.6}}),
            },
            "components": {
                "minecraft:type_family": {"family": ["silverfish_minion", "zt_ally", "silverfish", "arthropod", "monster", "mob"]},
                "minecraft:variant": {"value": 0},
                "minecraft:health": {"value": 16, "max": 16},
                "minecraft:movement": {"value": 0.3},
                "minecraft:attack": {"damage": 2},
                "minecraft:collision_box": {"width": 0.6, "height": 0.4},
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:nameable": {},
                "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0},
                "minecraft:navigation.walk": {"can_path_over_water": True},
                "minecraft:despawn": {"despawn_from_distance": {}},
                "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 5 : 0"},
                "minecraft:loot": {"table": "loot_tables/entities/silverfish_minion.json"},
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
                "minecraft:behavior.melee_attack": {"priority": 3, "speed_multiplier": 1.3, "track_target": True},
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


def minion_loot():
    return {"pools": [
        {"rolls": 1, "conditions": [{"condition": "killed_by_player"}, {"condition": "random_chance_with_looting",
                                                                       "chance": 0.2, "looting_multiplier": 0.05}],
         "entries": [{"type": "item", "name": "minecraft:cobblestone", "weight": 3,
                      "functions": [{"function": "set_count", "count": {"min": 1, "max": 2}}]},
                     {"type": "item", "name": "minecraft:iron_nugget", "weight": 1,
                      "functions": [{"function": "set_count", "count": {"min": 1, "max": 3}}]}]},
    ]}


# ------------------------------------------------------------------------------ client files
ANIMS = ["idle", "walk", "birth", "headbutt", "tail_swipe", "lightning", "tail_smash", "body_slam", "stun", "burrow",
         "erupt", "awaken"]


def client_titan():
    animations = {name: "animation.zt.omegafish." + name for name in ANIMS}
    animations["controller"] = "controller.animation.zt.omegafish.main"
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:omegafish",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/omegafish/omegafish"},
        "geometry": {"default": "geometry.zt.omegafish"},
        "spawn_egg": {"texture": "zt_omegafish_egg"},
        "scripts": {
            "scale": "1.0 + 15.0 * q.property('zt:grow')",
            "should_update_bones_and_effects_offscreen": "1.0",
            "should_update_effects_offscreen": "1.0",
            "animate": ["controller"],
        },
        "animations": animations,
        "render_controllers": ["controller.render.zt.omegafish"],
    }}}


def client_corpse():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:omegafish_corpse",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/omegafish/omegafish"},
        "geometry": {"default": "geometry.zt.omegafish"},
        "scripts": {
            "scale": "16.0",
            "should_update_bones_and_effects_offscreen": "1.0",
            "should_update_effects_offscreen": "1.0",
            "animate": ["death"],
        },
        "animations": {"death": "animation.zt.omegafish.death"},
        "render_controllers": ["controller.render.zt.omegafish_corpse"],
    }}}


def client_minion():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:silverfish_minion",
        "materials": {"default": "silverfish", "body_layer": "silverfish_layers"},
        "textures": {rank: "textures/entity/silverfish_minion/" + rank for rank in ("loyalist", "priest", "zealot", "templar")},
        "geometry": {"default": "geometry.silverfish"},
        "spawn_egg": {"texture": "zt_silverfish_minion_egg"},
        "scripts": {"animate": ["move", "cast"]},
        # the vanilla silverfish controller only ever plays "move", so the wiggle runs directly
        "animations": {
            "move": "animation.silverfish.move",
            "cast_rear": "animation.zt.silverfish_minion.cast",
            "cast": "controller.animation.zt.silverfish_minion.cast",
        },
        "render_controllers": ["controller.render.zt.silverfish_minion"],
    }}}


def render_controllers(existing):
    rc = existing["render_controllers"]
    fury = "q.property('zt:enraged')"
    rc["controller.render.zt.omegafish"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        # low on health it glows white, pulsing (the Java Omegafish turns white when it's nearly dead)
        "overlay_color": {
            "r": "%s ? 1.0 : this" % fury,
            "g": "%s ? 1.0 : this" % fury,
            "b": "%s ? 1.0 : this" % fury,
            "a": "%s ? (0.25 + math.max(0, math.sin(q.life_time * 300.0)) * 0.35) : this" % fury,
        },
    }
    rc["controller.render.zt.omegafish_corpse"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
    }
    rc["controller.render.zt.silverfish_minion"] = {
        "arrays": {"textures": {"Array.skins": ["Texture.loyalist", "Texture.priest", "Texture.zealot", "Texture.templar"]}},
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}, {"bodyLayer_*": "Material.body_layer"}],
        "textures": ["Array.skins[q.variant]"],
    }
    return existing


def main():
    dump(BP, "entities/omegafish.json", omegafish())
    dump(BP, "entities/omegafish_corpse.json", corpse())
    dump(BP, "entities/silverfish_minion.json", minion())
    dump(BP, "loot_tables/entities/silverfish_minion.json", minion_loot())
    dump(RP, "entity/omegafish.entity.json", client_titan())
    dump(RP, "entity/omegafish_corpse.entity.json", client_corpse())
    dump(RP, "entity/silverfish_minion.entity.json", client_minion())
    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for egg in ("zt_omegafish_egg", "zt_silverfish_minion_egg"):
        icons["texture_data"][egg] = {"textures": "textures/items/" + egg}
    dump(RP, "textures/item_texture.json", icons)
    path = os.path.join(RP, "render_controllers", "zt.render_controllers.json")
    with open(path) as f:
        existing = json.load(f)
    dump(RP, "render_controllers/zt.render_controllers.json", render_controllers(existing))
    print("omegafish data written")


if __name__ == "__main__":
    main()
