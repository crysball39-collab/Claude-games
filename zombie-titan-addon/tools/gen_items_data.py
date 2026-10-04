"""Writes the item data for the Obsidian set and the Growth Serum: the Compact
Obsidian block (and its loot table), the obsidian sword, tools and armor, the
Growth Serum and its thrown bottle, their crafting recipes, the armor
attachables, and the texture/sound registrations they need.

Obsidian gear is a step above netherite: the sword hits for 15 and dashes
(script: obsidian.js), tools dig faster and last longer, and the armor matches
netherite's protection with more durability plus a full-set bonus (Resistance I).
Everything is crafted from Compact Obsidian (9 obsidian), never plain obsidian.
The Growth Serum (8 glass around dragon's breath) is thrown like a splash
potion; serum.js turns the zombie or skeleton it hits into its titan.

    python3 tools/gen_items_data.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

BLOCK = "zt:compact_obsidian"
FORMAT = "1.21.90"
BLOCK_FORMAT = "1.26.20"  # the minecraft:tags block component needs 1.26.20 or later

TOOL_DURABILITY = 2500          # netherite: 2031
DIG_SPEED = 10                  # netherite: 9

# name: (damage, enchant slot, item tags, digger block tag or None, creative group, recipe pattern)
TOOLS = {
    "sword": (15, "sword", ["minecraft:is_sword"], None, "sword", ["X", "X", "S"]),
    "pickaxe": (9, "pickaxe", ["minecraft:is_pickaxe", "minecraft:digger"], "minecraft:is_pickaxe_item_destructible",
                "pickaxe", ["XXX", " S ", " S "]),
    "axe": (12, "axe", ["minecraft:is_axe", "minecraft:digger"], "minecraft:is_axe_item_destructible", "axe",
            ["XX", "XS", " S"]),
    "shovel": (8, "shovel", ["minecraft:is_shovel", "minecraft:digger"], "minecraft:is_shovel_item_destructible", "shovel",
               ["X", "S", "S"]),
    "hoe": (7, "hoe", ["minecraft:is_hoe", "minecraft:digger"], "minecraft:is_hoe_item_destructible", "hoe",
            ["XX", " S", " S"]),
}

# name: (equipment slot, enchant slot, protection, durability, attachable geometry, layer, parent_setup variable, pattern)
ARMOR = {
    "helmet": ("slot.armor.head", "armor_head", 3, 510, "helmet", 1, "helmet_layer_visible", ["XXX", "X X"]),
    "chestplate": ("slot.armor.chest", "armor_torso", 8, 740, "chestplate", 1, "chest_layer_visible", ["X X", "XXX", "XXX"]),
    "leggings": ("slot.armor.legs", "armor_legs", 6, 695, "leggings", 2, "leg_layer_visible", ["XXX", "X X", "X X"]),
    "boots": ("slot.armor.feet", "armor_feet", 3, 600, "boots", 1, "boot_layer_visible", ["X X", "X X"]),
}


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def repairable(ident, amount="query.max_durability * 0.25"):
    return {"repair_items": [
        {"items": [BLOCK], "repair_amount": amount},
        {"items": [ident], "repair_amount": "context.other->query.remaining_durability + 0.05 * context.other->query.max_durability"},
    ]}


def tool_item(name):
    damage, slot, tags, dig_tag, group, _ = TOOLS[name]
    ident = "zt:obsidian_" + name
    c = {
        "minecraft:icon": "zt_obsidian_" + name,
        "minecraft:display_name": {"value": "item.%s.name" % ident},
        "minecraft:max_stack_size": 1,
        "minecraft:hand_equipped": True,
        "minecraft:damage": damage,
        "minecraft:durability": {"max_durability": TOOL_DURABILITY},
        "minecraft:enchantable": {"slot": slot, "value": 15},
        "minecraft:repairable": repairable(ident),
        "minecraft:tags": {"tags": tags + ["minecraft:is_tool", "minecraft:netherite_tier"]},
        "minecraft:fire_resistant": {"value": True},
        "minecraft:rarity": "rare",
    }
    if dig_tag:
        c["minecraft:digger"] = {"use_efficiency": True, "destroy_speeds": [
            {"block": {"tags": "query.any_tag('%s')" % dig_tag}, "speed": DIG_SPEED}]}
    if name == "sword":
        # tap-and-hold (use) launches the player forward; obsidian.js does the dash
        c["minecraft:use_modifiers"] = {"use_duration": 0.5, "movement_modifier": 1.0}
        c["minecraft:cooldown"] = {"category": "zt_obsidian_dash", "duration": 1.5, "type": "use"}
    return {"format_version": FORMAT, "minecraft:item": {
        "description": {"identifier": ident, "menu_category": {"category": "equipment", "group": "minecraft:itemGroup.name." + group}},
        "components": c,
    }}


def armor_item(name):
    slot, eslot, protection, durability, *_ = ARMOR[name]
    ident = "zt:obsidian_" + name
    return {"format_version": FORMAT, "minecraft:item": {
        "description": {"identifier": ident, "menu_category": {"category": "equipment", "group": "minecraft:itemGroup.name." + name}},
        "components": {
            "minecraft:icon": "zt_obsidian_" + name,
            "minecraft:display_name": {"value": "item.%s.name" % ident},
            "minecraft:max_stack_size": 1,
            "minecraft:wearable": {"slot": slot, "protection": protection},
            "minecraft:durability": {"max_durability": durability},
            "minecraft:enchantable": {"slot": eslot, "value": 15},
            "minecraft:repairable": repairable(ident),
            "minecraft:tags": {"tags": ["minecraft:is_armor", "minecraft:netherite_tier"]},
            "minecraft:fire_resistant": {"value": True},
            "minecraft:rarity": "rare",
        },
    }}


def attachables(name):
    """Two attachables per piece, like vanilla armor: one for mobs and armor stands, one fitted to the player."""
    _, _, _, _, geo, layer, var, _ = ARMOR[name]
    ident = "zt:obsidian_" + name
    textures = {"default": "textures/models/armor/zt_obsidian_%d" % layer, "enchanted": "textures/misc/enchanted_actor_glint"}
    materials = {"default": "armor", "enchanted": "armor_enchanted"}
    generic = {"format_version": "1.8.0", "minecraft:attachable": {"description": {
        "identifier": ident,
        "materials": materials,
        "textures": textures,
        "geometry": {"default": "geometry.humanoid.armor." + geo},
        "scripts": {"parent_setup": "variable.%s = 0.0;" % var},
        "render_controllers": ["controller.render.armor"],
    }}}
    player = {"format_version": "1.10.0", "minecraft:attachable": {"description": {
        "identifier": ident + ".player",
        "item": {ident: "query.owner_identifier == 'minecraft:player'"},
        "materials": materials,
        "textures": textures,
        "geometry": {"default": "geometry.player.armor." + geo},
        "scripts": {"parent_setup": "variable.%s = 0.0;" % var, "animate": ["offset"]},
        "animations": {"offset": "animation.armor.%s.offset" % geo},
        "render_controllers": ["controller.render.armor"],
    }}}
    return generic, player


def shaped(ident, pattern, key, result, count=1):
    return {"format_version": "1.20.10", "minecraft:recipe_shaped": {
        "description": {"identifier": ident},
        "tags": ["crafting_table"],
        "pattern": pattern,
        "key": key,
        "unlock": [{"item": BLOCK}],
        "result": {"item": result, "count": count},
    }}


def main():
    # ---- the block: 1.5x obsidian's hardness (50) and 3x its blast resistance (1200);
    #      only a diamond-tier (or better) pickaxe gets it back, like obsidian
    dump(BP, "blocks/compact_obsidian.json", {"format_version": BLOCK_FORMAT, "minecraft:block": {
        "description": {"identifier": BLOCK, "menu_category": {"category": "construction"}},
        "components": {
            "minecraft:geometry": {"identifier": "minecraft:geometry.full_block"},
            "minecraft:material_instances": {"*": {"texture": "zt_compact_obsidian", "render_method": "opaque"}},
            "minecraft:destructible_by_mining": {"seconds_to_destroy": 75},
            "minecraft:destructible_by_explosion": {"explosion_resistance": 3600},
            "minecraft:tags": ["minecraft:is_pickaxe_item_destructible", "minecraft:diamond_tier_destructible"],
            "minecraft:map_color": "#1b1026",
            "minecraft:loot": "loot_tables/blocks/compact_obsidian.json",
        },
    }})
    dump(BP, "loot_tables/blocks/compact_obsidian.json", {"pools": [{
        "rolls": 1,
        "conditions": [{
            "condition": "match_tool",
            "minecraft:match_tool_filter_all": ["minecraft:is_pickaxe"],
            "minecraft:match_tool_filter_any": ["minecraft:diamond_tier", "minecraft:netherite_tier"],
        }],
        "entries": [{"type": "item", "name": BLOCK}],
    }]})
    # compact obsidian unlocks with obsidian, the gear with compact obsidian
    rec = shaped(BLOCK, ["OOO", "OOO", "OOO"], {"O": {"item": "minecraft:obsidian"}}, BLOCK)
    rec["minecraft:recipe_shaped"]["unlock"] = [{"item": "minecraft:obsidian"}]
    dump(BP, "recipes/compact_obsidian.json", rec)
    dump(BP, "recipes/compact_obsidian_to_obsidian.json", {"format_version": "1.20.10", "minecraft:recipe_shapeless": {
        "description": {"identifier": "zt:compact_obsidian_to_obsidian"},
        "tags": ["crafting_table"],
        "ingredients": [{"item": BLOCK}],
        "unlock": [{"item": BLOCK}],
        "result": {"item": "minecraft:obsidian", "count": 9},
    }})

    key = {"X": {"item": BLOCK}, "S": {"item": "minecraft:stick"}}
    for name in TOOLS:
        ident = "zt:obsidian_" + name
        dump(BP, "items/obsidian_%s.json" % name, tool_item(name))
        pattern = TOOLS[name][5]
        k = {c: key[c] for c in "XS" if any(c in row for row in pattern)}
        dump(BP, "recipes/obsidian_%s.json" % name, shaped(ident, pattern, k, ident))
    for name in ARMOR:
        ident = "zt:obsidian_" + name
        dump(BP, "items/obsidian_%s.json" % name, armor_item(name))
        dump(BP, "recipes/obsidian_%s.json" % name, shaped(ident, ARMOR[name][7], {"X": key["X"]}, ident))
        generic, player = attachables(name)
        dump(RP, "attachables/obsidian_%s.json" % name, generic)
        dump(RP, "attachables/obsidian_%s.player.json" % name, player)

    # ---- Growth Serum: thrown like a splash potion, a bit further
    dump(BP, "items/growth_serum.json", {"format_version": FORMAT, "minecraft:item": {
        "description": {"identifier": "zt:growth_serum", "menu_category": {"category": "items"}},
        "components": {
            "minecraft:icon": "zt_growth_serum",
            "minecraft:display_name": {"value": "item.zt:growth_serum.name"},
            "minecraft:max_stack_size": 16,
            "minecraft:throwable": {"do_swing_animation": True, "launch_power_scale": 1.0, "max_launch_power": 1.0},
            "minecraft:projectile": {"projectile_entity": "zt:growth_serum"},
            "minecraft:rarity": "epic",
            "minecraft:glint": True,
        },
    }})
    dump(BP, "entities/growth_serum.json", {"format_version": FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:growth_serum", "is_spawnable": False, "is_summonable": True},
        "components": {
            "minecraft:type_family": {"family": ["projectile", "growth_serum"]},
            "minecraft:collision_box": {"width": 0.25, "height": 0.25},
            "minecraft:physics": {},
            "minecraft:projectile": {
                "angle_offset": -20.0,
                "power": 0.75,
                "gravity": 0.05,
                "hit_sound": "glass",
                "on_hit": {"remove_on_hit": {}},
            },
        },
        "events": {},
    }})
    dump(RP, "entity/growth_serum.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:growth_serum",
        "materials": {"default": "snowball"},
        "textures": {"default": "textures/items/zt_growth_serum"},
        "geometry": {"default": "geometry.item_sprite"},
        "render_controllers": ["controller.render.item_sprite"],
        "animations": {"flying": "animation.actor.billboard"},
        "scripts": {"animate": ["flying"]},
    }}})
    dump(BP, "recipes/growth_serum.json", {"format_version": "1.20.10", "minecraft:recipe_shaped": {
        "description": {"identifier": "zt:growth_serum"},
        "tags": ["crafting_table"],
        "pattern": ["GGG", "GDG", "GGG"],
        "key": {"G": {"item": "minecraft:glass"}, "D": {"item": "minecraft:dragon_breath"}},
        "unlock": [{"item": "minecraft:dragon_breath"}],
        "result": {"item": "zt:growth_serum"},
    }})

    # ---- texture and sound registrations
    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for name in list(TOOLS) + list(ARMOR):
        icons["texture_data"]["zt_obsidian_" + name] = {"textures": "textures/items/zt_obsidian_" + name}
    icons["texture_data"]["zt_growth_serum"] = {"textures": "textures/items/zt_growth_serum"}
    dump(RP, "textures/item_texture.json", icons)
    dump(RP, "textures/terrain_texture.json", {
        "resource_pack_name": "zombie_titan",
        "texture_name": "atlas.terrain",
        "padding": 8,
        "num_mip_levels": 4,
        "texture_data": {"zt_compact_obsidian": {"textures": "textures/blocks/zt_compact_obsidian"}},
    })
    dump(RP, "blocks.json", {"format_version": "1.21.40", BLOCK: {"sound": "stone"}})
    print("item data written")


if __name__ == "__main__":
    main()
