"""Writes the Creeper Titan's behaviour and client files: the titan, the corpse
that swells up and blows, and the creeper minions (vanilla creepers that
fight for the titan, in the four Java minion tiers).

Java Titans mod (0.45) numbers: 25,000 HP, 26 blocks tall, 50,000 XP; players
can only hurt it while it is stunned, and explosions and lightning never hurt it.

    python3 tools/gen_creeper_data.py
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


def creeper_titan():
    player_hits = {"all_of": [{"test": "bool_property", "domain": "zt:stunned", "value": False}, is_family("player")]}
    dark_fists = {"test": "has_equipment", "subject": "other", "domain": "hand", "value": "zt:dark_fists"}
    enraged = {"test": "bool_property", "domain": "zt:enraged", "value": True}
    triggers = [{"on_damage": {"filters": {"test": "bool_property", "domain": "zt:birth", "value": True}},
                 "deals_damage": "no"}]
    triggers += [{"cause": c, "deals_damage": "no"} for c in IMMUNE_CAUSES]
    triggers += [
        {"on_damage": {"filters": is_family("zt_ally")}, "deals_damage": "no"},
        # players only hurt it while it is stunned; the script tells them how to stun it
        {"on_damage": {"filters": player_hits, "event": "zt:creeper_block"}, "deals_damage": "no"},
        {"cause": "projectile", "on_damage": {"filters": enraged}, "deals_damage": "no"},
        {"on_damage": {"filters": {"all_of": [enraged, is_family("player"), dark_fists]}}, "damage_multiplier": 2.5},
        {"on_damage": {"filters": {"all_of": [is_family("player"), dark_fists]}}, "damage_multiplier": 5.0},
        {"on_damage": {"filters": enraged}, "damage_multiplier": 0.5},
    ]
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:creeper_titan",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "monster",
                "properties": {
                    "zt:anim": {"type": "int", "range": [0, 15], "default": 0, "client_sync": True},
                    "zt:moving": prop_bool(),
                    "zt:stunned": prop_bool(),
                    # charged: the Creeper Titan's enraged phase
                    "zt:enraged": prop_bool(),
                    "zt:birth": prop_bool(False),
                    "zt:grow": {"type": "float", "range": [0.0, 1.0], "default": 1.0, "client_sync": True},
                },
            },
            "component_groups": {"zt:small": {"minecraft:collision_box": {"width": 2.0, "height": 5.0}}},
            "components": {
                "minecraft:type_family": {"family": ["creeper_titan", "titan", "zt_ally", "creeper", "monster", "mob"]},
                "minecraft:health": {"value": 25000, "max": 25000},
                "minecraft:boss": {"name": "Creeper Titan", "should_darken_sky": False, "hud_range": 100},
                "minecraft:collision_box": {"width": 8.0, "height": 26.0},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:fire_immune": {},
                "minecraft:movement": {"value": 0.0},
                "minecraft:movement.basic": {},
                "minecraft:persistent": {},
                "minecraft:nameable": {"allow_name_tag_renaming": False, "always_show": False},
                "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
                "minecraft:ambient_sound_interval": {"value": 9.0, "range": 9.0, "event_name": "ambient"},
                "minecraft:mob_effect_immunity": {"mob_effects": EFFECT_IMMUNITY},
                "minecraft:damage_sensor": {"triggers": triggers},
            },
            "events": {
                "zt:start_birth": {"add": {"component_groups": ["zt:small"]}},
                "zt:end_birth": {"remove": {"component_groups": ["zt:small"]}},
                "zt:creeper_block": {},
            },
        },
    }


def creeper_titan_corpse():
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:creeper_titan_corpse",
                "is_spawnable": False,
                "is_summonable": True,
                "properties": {
                    # 0..1 while the fuse burns: the corpse swells and flashes faster and faster
                    "zt:fuse": {"type": "float", "range": [0.0, 1.0], "default": 0.0, "client_sync": True},
                    "zt:enraged": prop_bool(),
                },
            },
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


def creeper_minion():
    def explode(power):
        return {"minecraft:explode": {"causes_fire": False, "fuse_lit": True, "power": power,
                                      "destroy_affected_by_griefing": True, "fuse_length": 1.5}}

    def tier(variant, hp, speed, extra=None):
        g = {"minecraft:variant": {"value": variant}, "minecraft:health": {"value": hp, "max": hp},
             "minecraft:movement": {"value": speed}}
        g.update(extra or {})
        return g

    charged = {"test": "has_component", "value": "minecraft:is_charged"}
    not_charged = {"test": "has_component", "operator": "!=", "value": "minecraft:is_charged"}
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:creeper_minion",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "monster",
                "properties": {"zt:casting": prop_bool()},
            },
            "component_groups": {
                "zt:loyalist": tier(0, 30, 0.25),
                "zt:priest": tier(1, 40, 0.23),
                "zt:zealot": tier(2, 50, 0.32),
                # templars come charged: their blast is twice as big
                "zt:templar": tier(3, 120, 0.27, {"minecraft:knockback_resistance": {"value": 0.6}}),
                "minecraft:charged_creeper": {"minecraft:is_charged": {}},
                "minecraft:exploding": explode(3),
                "minecraft:charged_exploding": explode(6),
            },
            "components": {
                "minecraft:type_family": {"family": ["creeper_minion", "zt_ally", "creeper", "monster", "mob"]},
                "minecraft:variant": {"value": 0},
                "minecraft:health": {"value": 30, "max": 30},
                "minecraft:movement": {"value": 0.25},
                "minecraft:attack": {"damage": 3},
                "minecraft:collision_box": {"width": 0.6, "height": 1.8},
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:can_climb": {},
                "minecraft:nameable": {},
                "minecraft:breathable": {"total_supply": 15, "suffocate_time": 0},
                "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_water": True},
                "minecraft:despawn": {"despawn_from_distance": {}},
                "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 8 : 0"},
                "minecraft:loot": {"table": "loot_tables/entities/creeper_minion.json"},
                "minecraft:damage_sensor": {"triggers": [
                    {"on_damage": {"filters": is_family("zt_ally")}, "deals_damage": "no"},
                    {"cause": "lightning", "on_damage": {"event": "minecraft:become_charged"}, "deals_damage": "no"},
                    {"cause": "fall", "deals_damage": "no"},
                ]},
                "minecraft:behavior.float": {"priority": 0},
                "minecraft:behavior.swell": {"priority": 2, "start_distance": 2.5, "stop_distance": 6},
                "minecraft:behavior.melee_attack": {"priority": 4, "speed_multiplier": 1.25, "reach_multiplier": 0},
                "minecraft:behavior.random_stroll": {"priority": 5, "speed_multiplier": 1},
                "minecraft:behavior.look_at_player": {"priority": 6, "look_distance": 8},
                "minecraft:behavior.random_look_around": {"priority": 6},
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
                "minecraft:target_nearby_sensor": {
                    "inside_range": 2.5, "outside_range": 6, "must_see": True,
                    "on_inside_range": {"event": "minecraft:start_exploding", "target": "self"},
                    "on_outside_range": {"event": "minecraft:stop_exploding", "target": "self"},
                    "on_vision_lost_inside_range": {"event": "minecraft:stop_exploding", "target": "self"},
                },
                "minecraft:on_target_escape": {"event": "minecraft:stop_exploding", "target": "self"},
            },
            "events": {
                "minecraft:entity_spawned": {"randomize": [
                    {"weight": 60, "add": {"component_groups": ["zt:loyalist"]}},
                    {"weight": 20, "add": {"component_groups": ["zt:priest"]}},
                    {"weight": 15, "add": {"component_groups": ["zt:zealot"]}},
                    {"weight": 5, "add": {"component_groups": ["zt:templar", "minecraft:charged_creeper"]}},
                ]},
                "zt:as_loyalist": {"add": {"component_groups": ["zt:loyalist"]}},
                "zt:as_priest": {"add": {"component_groups": ["zt:priest"]}},
                "zt:as_zealot": {"add": {"component_groups": ["zt:zealot"]}},
                "zt:as_templar": {"add": {"component_groups": ["zt:templar", "minecraft:charged_creeper"]}},
                "minecraft:become_charged": {"add": {"component_groups": ["minecraft:charged_creeper"]},
                                             "remove": {"component_groups": ["minecraft:exploding"]}},
                "minecraft:start_exploding": {"sequence": [
                    {"filters": not_charged, "add": {"component_groups": ["minecraft:exploding"]}},
                    {"filters": charged, "add": {"component_groups": ["minecraft:charged_exploding"]}},
                ]},
                "minecraft:stop_exploding": {"remove": {"component_groups": ["minecraft:exploding",
                                                                             "minecraft:charged_exploding"]}},
            },
        },
    }


def creeper_minion_loot():
    return {"pools": [{"rolls": 1, "entries": [{"type": "item", "name": "minecraft:gunpowder", "weight": 1, "functions": [
        {"function": "set_count", "count": {"min": 0, "max": 3}},
        {"function": "looting_enchant", "count": {"min": 0, "max": 1}},
    ]}]}]}


# ------------------------------------------------------------------------------ client files
def client_titan():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:creeper_titan",
        "materials": {"default": "entity_emissive_alpha", "charged": "charged_creeper"},
        "textures": {"default": "textures/entity/creeper_titan/creeper_titan",
                     "charged": "textures/entity/creeper/creeper_armor"},
        "geometry": {"default": "geometry.zt.creeper_titan", "charged": "geometry.zt.creeper_titan.charged"},
        "spawn_egg": {"texture": "zt_creeper_titan_egg"},
        "scripts": {
            "scale": "1.0 + 15.0 * q.property('zt:grow')",
            "should_update_bones_and_effects_offscreen": "1.0",
            "should_update_effects_offscreen": "1.0",
            "animate": ["controller"],
        },
        "animations": {
            "pose": "animation.zt.creeper.pose",
            "idle": "animation.zt.creeper.idle",
            "walk": "animation.zt.creeper.walk",
            "birth": "animation.zt.creeper.birth",
            "head_slam": "animation.zt.creeper.head_slam",
            "stomp": "animation.zt.creeper.stomp",
            "body_slam": "animation.zt.creeper.body_slam",
            "anti_air": "animation.zt.creeper.anti_air",
            "kick": "animation.zt.creeper.kick",
            "tnt": "animation.zt.creeper.tnt",
            "thunder": "animation.zt.creeper.thunder",
            "stun": "animation.zt.creeper.stun",
            "awaken": "animation.zt.creeper.awaken",
            "leap": "animation.zt.creeper.leap",
            "controller": "controller.animation.zt.creeper.main",
        },
        "render_controllers": ["controller.render.zt.creeper_titan",
                               {"controller.render.zt.creeper_titan_charged": "q.property('zt:enraged')"}],
    }}}


def client_corpse():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:creeper_titan_corpse",
        "materials": {"default": "entity_emissive_alpha", "charged": "charged_creeper"},
        "textures": {"default": "textures/entity/creeper_titan/creeper_titan",
                     "charged": "textures/entity/creeper/creeper_armor"},
        "geometry": {"default": "geometry.zt.creeper_titan", "charged": "geometry.zt.creeper_titan.charged"},
        "scripts": {
            "scale": "16.0",
            "should_update_bones_and_effects_offscreen": "1.0",
            "should_update_effects_offscreen": "1.0",
            "animate": ["death", "swell"],
        },
        "animations": {"death": "animation.zt.creeper.death", "swell": "animation.zt.creeper.swell"},
        "render_controllers": ["controller.render.zt.creeper_titan_corpse",
                               {"controller.render.zt.creeper_titan_charged":
                                "q.property('zt:enraged') && q.property('zt:fuse') < 1.0"}],
    }}}


def client_minion():
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:creeper_minion",
        "materials": {"default": "creeper", "charged": "charged_creeper"},
        "textures": {
            "loyalist": "textures/entity/creeper_minion/loyalist",
            "priest": "textures/entity/creeper_minion/priest",
            "zealot": "textures/entity/creeper_minion/zealot",
            "templar": "textures/entity/creeper_minion/templar",
            "charged": "textures/entity/creeper/creeper_armor",
        },
        "geometry": {"default": "geometry.creeper.v1.8", "charged": "geometry.creeper.charged.v1.8"},
        "spawn_egg": {"texture": "zt_creeper_minion_egg"},
        "scripts": {
            "pre_animation": [
                "variable.wobble = Math.sin(query.swell_amount * 5730) * query.swell_amount * 0.01 + 1.0;",
                "variable.swelling_scale1 = (Math.pow(Math.clamp(query.swell_amount, 0.0, 1.0), 4.0) * 0.4 + 1.0) * variable.wobble;",
                "variable.swelling_scale2 = (Math.pow(Math.clamp(query.swell_amount, 0.0, 1.0), 4.0) * 0.1 + 1.0) / variable.wobble;",
                "variable.leg_rot = Math.cos(query.modified_distance_moved * 38.17326) * 80.22 * query.modified_move_speed;",
                "variable.flash = Math.mod(Math.Round(query.swell_amount * 10.0), 2.0);",
            ],
            "animate": ["creeper_head_controller", "creeper_legs_controller", "creeper_swelling_controller", "cast"],
        },
        "animations": {
            "creeper_head": "animation.common.look_at_target",
            "creeper_legs": "animation.creeper.legs",
            "creeper_swelling": "animation.creeper.swelling",
            "creeper_head_controller": "controller.animation.creeper.head",
            "creeper_legs_controller": "controller.animation.creeper.legs",
            "creeper_swelling_controller": "controller.animation.creeper.swelling",
            "cast_bob": "animation.zt.creeper_minion.cast",
            "cast": "controller.animation.zt.creeper_minion.cast",
        },
        "render_controllers": ["controller.render.zt.creeper_minion",
                               {"controller.render.creeper_armor": "query.is_powered"}],
    }}}


def render_controllers(existing):
    rc = existing["render_controllers"]
    flash = "math.mod(math.floor(math.pow(q.property('zt:fuse'), 2) * 44.0), 2) == 1"
    charged_tint = "q.property('zt:enraged')"
    rc["controller.render.zt.creeper_titan"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        # charged: a faint electric-blue pulse under the swirling shell
        "overlay_color": {
            "r": "%s ? 0.45 : this" % charged_tint,
            "g": "%s ? 0.75 : this" % charged_tint,
            "b": "%s ? 1.0 : this" % charged_tint,
            "a": "%s ? (0.1 + math.sin(q.life_time * 300.0) * 0.06) : this" % charged_tint,
        },
    }
    rc["controller.render.zt.creeper_titan_charged"] = {
        "geometry": "Geometry.charged",
        "materials": [{"*": "Material.charged"}],
        "textures": ["Texture.charged"],
        "overlay_color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0},
        "uv_anim": {"offset": ["(math.floor(q.life_time * 20.0) + q.frame_alpha) * 0.01",
                               "(math.floor(q.life_time * 20.0) + q.frame_alpha) * 0.01"],
                    "scale": [1.0, 1.0]},
        "light_color_multiplier": 0.5,
        "ignore_lighting": True,
    }
    rc["controller.render.zt.creeper_titan_corpse"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        # gone in the blast
        "part_visibility": [{"*": "q.property('zt:fuse') < 1.0"}],
        # the fuse: white flashes that come faster and faster, like a creeper about to blow
        "overlay_color": {
            "r": "%s ? 1.0 : this" % flash,
            "g": "%s ? 1.0 : this" % flash,
            "b": "%s ? 1.0 : this" % flash,
            "a": "%s ? 0.6 : this" % flash,
        },
    }
    rc["controller.render.zt.creeper_minion"] = {
        "arrays": {"textures": {"Array.skins": ["Texture.loyalist", "Texture.priest", "Texture.zealot", "Texture.templar"]}},
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Array.skins[q.variant]"],
        "overlay_color": {
            "r": "((variable.flash == 0.0) || (query.swelling_dir < 0.0)) ? this : 1.0",
            "g": "((variable.flash == 0.0) || (query.swelling_dir < 0.0)) ? this : 1.0",
            "b": "((variable.flash == 0.0) || (query.swelling_dir < 0.0)) ? this : 1.0",
            "a": "((variable.flash == 0.0) || (query.swelling_dir < 0.0)) ? this : 0.5",
        },
    }
    return existing


def minion_cast_files():
    """A creeper has no arms to raise: casting minions bob their heads instead."""
    anim = {"format_version": "1.8.0", "animations": {"animation.zt.creeper_minion.cast": {
        "loop": True,
        "animation_length": 0.5,
        "bones": {"head": {"rotation": ["-20 + math.sin(q.anim_time * 720) * 10", 0, 0]}},
    }}}
    ctrl = {"format_version": "1.10.0", "animation_controllers": {"controller.animation.zt.creeper_minion.cast": {
        "initial_state": "default",
        "states": {
            "default": {"transitions": [{"casting": "q.property('zt:casting')"}], "blend_transition": 0.2},
            "casting": {"animations": ["cast_bob"], "transitions": [{"default": "!q.property('zt:casting')"}],
                        "blend_transition": 0.2},
        },
    }}}
    return anim, ctrl


def main():
    dump(BP, "entities/creeper_titan.json", creeper_titan())
    dump(BP, "entities/creeper_titan_corpse.json", creeper_titan_corpse())
    dump(BP, "entities/creeper_minion.json", creeper_minion())
    dump(BP, "loot_tables/entities/creeper_minion.json", creeper_minion_loot())
    dump(RP, "entity/creeper_titan.entity.json", client_titan())
    dump(RP, "entity/creeper_titan_corpse.entity.json", client_corpse())
    dump(RP, "entity/creeper_minion.entity.json", client_minion())
    anim, ctrl = minion_cast_files()
    dump(RP, "animations/creeper_minion.animation.json", anim)
    dump(RP, "animation_controllers/creeper_minion.animation_controllers.json", ctrl)
    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for egg in ("zt_creeper_titan_egg", "zt_creeper_minion_egg"):
        icons["texture_data"][egg] = {"textures": "textures/items/" + egg}
    dump(RP, "textures/item_texture.json", icons)
    path = os.path.join(RP, "render_controllers", "zt.render_controllers.json")
    with open(path) as f:
        existing = json.load(f)
    dump(RP, "render_controllers/zt.render_controllers.json", render_controllers(existing))
    print("creeper data written")


if __name__ == "__main__":
    main()
