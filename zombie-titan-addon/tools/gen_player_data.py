"""Writes the Player's behaviour and client files: the Player (a mob that lives like a Minecraft
player: player.js runs it), its spawn egg, and the Player API item (a control panel for the
Players, and where you type in an AI's key).

A Player is player-sized (0.6 x 1.8), has 20 health, 15 seconds of air, a 36-slot inventory and
the usual armour and hand slots, and counts as a player for mobs (its family includes "player",
so zombies, skeletons and creepers hunt it). It has no AI goals of its own: the scripts walk it,
turn its head, swing its arms, and decide everything it does.

    python3 tools/gen_player_data.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
FORMAT = "1.21.90"
SKINS = 16


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def prop_int(lo, hi, sync=True):
    return {"type": "int", "range": [lo, hi], "default": lo, "client_sync": sync}


def prop_float(lo, hi, sync=True):
    return {"type": "float", "range": [lo, hi], "default": 0.0, "client_sync": sync}


def player():
    blocking = {"test": "bool_property", "domain": "zt:blocking", "value": True}
    # a raised shield stops blows, arrows and blasts (the script plays the clang and wears the shield)
    shield = [{"cause": c, "on_damage": {"filters": blocking, "event": "zt:shield_block"}, "deals_damage": "no"}
              for c in ("entity_attack", "projectile", "entity_explosion")]
    return {
        "format_version": FORMAT,
        "minecraft:entity": {
            "description": {
                "identifier": "zt:player",
                "is_spawnable": True,
                "is_summonable": True,
                "spawn_category": "creature",
                "properties": {
                    "zt:skin": prop_int(0, SKINS - 1),
                    # 0 standing, 1 sneaking, 2 swimming, 3 asleep in a bed, 4 sitting
                    "zt:pose": prop_int(0, 4),
                    # 0 nothing, 1 eating or drinking, 2 drawing a bow, 3 shield up, 4 working at a table,
                    # 5 throwing, 6 stopping to think, 7 waving
                    "zt:use": prop_int(0, 7),
                    # counts up each arm swing (a hit, a block mined or placed)
                    "zt:swing": prop_int(0, 7),
                    # where its head looks: pitch, and yaw from its body
                    "zt:look_x": prop_float(-90.0, 90.0),
                    "zt:look_y": prop_float(-90.0, 90.0),
                    "zt:blocking": {"type": "bool", "default": False, "client_sync": False},
                },
            },
            "components": {
                "minecraft:type_family": {"family": ["player", "zt_player", "mob"]},
                "minecraft:health": {"value": 20, "max": 20},
                "minecraft:attack": {"damage": 1},
                "minecraft:collision_box": {"width": 0.6, "height": 1.8},
                "minecraft:physics": {},
                "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
                "minecraft:movement": {"value": 0.1},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:can_climb": {},
                "minecraft:variable_max_auto_step": {"base_value": 0.5625, "jump_prevented_value": 0.5625},
                "minecraft:breathable": {"total_supply": 15, "suffocate_time": -1, "breathes_air": True,
                                         "breathes_water": False, "generates_bubbles": True},
                "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
                "minecraft:persistent": {},
                # a player's 36 slots (the hotbar is 0-8); armour and hands are its equipment slots
                "minecraft:inventory": {"container_type": "inventory", "inventory_size": 36, "private": True},
                "minecraft:damage_sensor": {"triggers": shield},
                "minecraft:interact": {"interactions": [{
                    "on_interact": {"filters": {"test": "is_family", "subject": "other", "value": "player"},
                                    "event": "zt:player_tap", "target": "self"},
                    "swing": True,
                    "interact_text": "action.interact.zt_player",
                }]},
                "minecraft:conditional_bandwidth_optimization": {},
            },
            "events": {"zt:player_tap": {}, "zt:shield_block": {}},
        },
    }


def player_api_item():
    return {"format_version": FORMAT, "minecraft:item": {
        "description": {"identifier": "zt:player_api", "menu_category": {"category": "items"}},
        "components": {
            "minecraft:icon": "zt_player_api",
            "minecraft:display_name": {"value": "item.zt:player_api.name"},
            "minecraft:max_stack_size": 1,
            "minecraft:can_destroy_in_creative": False,
            "minecraft:rarity": "rare",
            "minecraft:use_modifiers": {"use_duration": 0.25, "movement_modifier": 1.0},
            "minecraft:cooldown": {"category": "zt_player_api", "duration": 0.5, "type": "use"},
        },
    }}


def player_api_recipe():
    return {"format_version": "1.20.10", "minecraft:recipe_shaped": {
        "description": {"identifier": "zt:player_api"},
        "tags": ["crafting_table"],
        "pattern": [" G ", "RBR", " R "],
        "key": {"G": {"item": "minecraft:glass_pane"}, "R": {"item": "minecraft:redstone"}, "B": {"item": "minecraft:book"}},
        "unlock": [{"item": "minecraft:redstone"}],
        "result": {"item": "zt:player_api"},
    }}


# ------------------------------------------------------------------------------ client files
ANIMS = ["base", "look", "walk", "sneak", "swim", "sleep", "sit", "swing", "eat", "bow", "shield", "work", "throw", "think",
         "wave", "hold"]


def client_player():
    animations = {name: "animation.zt.player." + name for name in ANIMS}
    use = "q.property('zt:use')"
    pose = "q.property('zt:pose')"
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:player",
        "materials": {"default": "entity_alphatest"},
        "textures": {"skin_%d" % i: "textures/entity/zt_player/skin_%d" % i for i in range(SKINS)},
        "geometry": {"default": "geometry.zt.player"},
        "spawn_egg": {"texture": "zt_player_egg"},
        "enable_attachables": True,
        "scripts": {
            "scale": "0.9375",
            "initialize": [
                "v.look_x = 0.0;", "v.look_y = 0.0;", "v.swing_t = 1.0;", "v.last_swing = q.property('zt:swing');",
            ],
            "pre_animation": [
                # the head turns smoothly toward where the script says it looks
                "v.look_x = math.lerp(v.look_x, q.property('zt:look_x'), 0.35);",
                "v.look_y = math.lerp(v.look_y, q.property('zt:look_y'), 0.35);",
                # an arm swing starts each time the swing counter changes
                "v.swing_t = (q.property('zt:swing') != v.last_swing) ? 0.0 : v.swing_t + q.delta_time;",
                "v.last_swing = q.property('zt:swing');",
                "v.swing_p = math.clamp(v.swing_t / 0.3, 0.0, 1.0);",
                # the player walk cycle (as for real players)
                "v.tcos0 = math.cos(q.modified_distance_moved * 38.17) * math.min(q.modified_move_speed, 1.0) * 57.3;",
            ],
            "animate": [
                "base", "look", "hold",
                {"walk": "%s == 0 || %s == 1" % (pose, pose)},
                {"sneak": "%s == 1" % pose},
                {"swim": "%s == 2" % pose},
                {"sleep": "%s == 3" % pose},
                {"sit": "%s == 4" % pose},
                {"swing": "v.swing_t < 0.3"},
                {"eat": "%s == 1" % use},
                {"bow": "%s == 2" % use},
                {"shield": "%s == 3" % use},
                {"work": "%s == 4" % use},
                {"throw": "%s == 5" % use},
                {"think": "%s == 6" % use},
                {"wave": "%s == 7" % use},
            ],
        },
        "animations": animations,
        "render_controllers": ["controller.render.zt.player"],
    }}}


def render_controllers(existing):
    rc = existing["render_controllers"]
    rc["controller.render.zt.player"] = {
        "arrays": {"textures": {"Array.skins": ["Texture.skin_%d" % i for i in range(SKINS)]}},
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Array.skins[q.property('zt:skin')]"],
    }
    return existing


def main():
    dump(BP, "entities/zt_player.json", player())
    dump(BP, "items/player_api.json", player_api_item())
    dump(BP, "recipes/player_api.json", player_api_recipe())
    dump(RP, "entity/zt_player.entity.json", client_player())
    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for icon in ("zt_player_egg", "zt_player_api"):
        icons["texture_data"][icon] = {"textures": "textures/items/" + icon}
    dump(RP, "textures/item_texture.json", icons)
    path = os.path.join(RP, "render_controllers", "zt.render_controllers.json")
    with open(path) as f:
        existing = json.load(f)
    dump(RP, "render_controllers/zt.render_controllers.json", render_controllers(existing))
    print("player data written")


if __name__ == "__main__":
    main()
