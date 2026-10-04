"""Writes the Gum Gum Fruit's item and client files:

- the fruit (a food) and the ability items it gives: five moves, Gear 2,
  and the five Jet moves Gear 2 swaps in (hidden from the creative menu)
- an attachable that draws nothing in the hand, so the moves are thrown
  with bare fists
- the player's client entity, patched in place (it is vanilla's with two
  render controllers swapped in when needed) and the two controllers:
  the skin turns pink in Gear 2, and in first person the arms (and the
  Stamp's leg) are shown while a move is held so they can be seen stretching

The player patch is idempotent: it edits packs/ZombieTitan_RP/entity/player.entity.json,
a copy of the vanilla file from bedrock-samples 1.26.50.

    python3 tools/gen_gum_data.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
FORMAT = "1.21.90"

MOVES = ["pistol", "bazooka", "gatling", "stamp", "rocket"]
ABILITIES = ["zt:gum_" + m for m in MOVES] + ["zt:gum_gear2"] + ["zt:gum_jet_" + m for m in MOVES]
TAG = "zt:gum_ability"


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def icon_of(ident):
    return ident.replace("zt:", "zt_")


def fruit_item():
    return {"format_version": FORMAT, "minecraft:item": {
        "description": {"identifier": "zt:gum_gum_fruit", "menu_category": {"category": "nature"}},
        "components": {
            "minecraft:icon": "zt_gum_gum_fruit",
            "minecraft:display_name": {"value": "item.zt:gum_gum_fruit.name"},
            "minecraft:max_stack_size": 16,
            "minecraft:food": {"nutrition": 4, "saturation_modifier": 0.6, "can_always_eat": True},
            "minecraft:use_modifiers": {"use_duration": 1.6, "movement_modifier": 0.35},
            "minecraft:use_animation": "eat",
            "minecraft:rarity": "epic",
        },
    }}


def ability_item(ident):
    move = ident.replace("zt:gum_", "").replace("jet_", "")
    return {"format_version": FORMAT, "minecraft:item": {
        # only the fruit hands these out, so they stay out of the creative menu
        "description": {"identifier": ident, "menu_category": {"category": "none"}},
        "components": {
            "minecraft:icon": icon_of(ident),
            "minecraft:display_name": {"value": "item.%s.name" % ident},
            "minecraft:max_stack_size": 1,
            "minecraft:hand_equipped": True,
            "minecraft:can_destroy_in_creative": False,
            "minecraft:rarity": "epic" if ("jet" in ident or move == "gear2") else "rare",
            "minecraft:tags": {"tags": [TAG]},
            "minecraft:use_modifiers": {"use_duration": 0.25, "movement_modifier": 1.0},
            # Normal and Jet versions share a cooldown, so swapping in or out of Gear 2 can't skip it
            "minecraft:cooldown": {"category": "zt_gum_" + move, "duration": 0.25, "type": "use"},
        },
    }}


def bare_hands_attachable():
    """Draws nothing for any of the moves: Luffy fights barehanded."""
    return {"format_version": "1.10.0", "minecraft:attachable": {"description": {
        "identifier": "zt:gum_pistol.hands",
        "item": {ident: "query.owner_identifier == 'minecraft:player'" for ident in ABILITIES},
        "materials": {"default": "entity_alphatest"},
        "textures": {"default": "textures/items/zt_gum_pistol"},
        "geometry": {"default": "geometry.zt.empty"},
        "render_controllers": ["controller.render.zt.bare_hands"],
    }}}


def empty_geometry():
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.zt.empty", "texture_width": 16, "texture_height": 16,
                        "visible_bounds_width": 1, "visible_bounds_height": 1, "visible_bounds_offset": [0, 0, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]}],
    }]}


# ----------------------------------------------------------------------------- the player
GUM_HELD = "variable.zt_gum_held = query.equipped_item_any_tag('slot.weapon.mainhand', '%s');" % TAG
FIRST_PERSON = "variable.is_first_person && !query.is_spectator"
THIRD_PERSON = "!variable.is_first_person && !variable.map_face_icon && !query.is_spectator"
CONDITIONS = {
    "controller.render.player.first_person": FIRST_PERSON + " && !variable.zt_gum_held && !variable.zt_gear2",
    "controller.render.player.third_person": THIRD_PERSON + " && !variable.zt_gear2",
    "controller.render.zt.player.first_person": FIRST_PERSON + " && (variable.zt_gum_held || variable.zt_gear2)",
    "controller.render.zt.player.third_person": THIRD_PERSON + " && variable.zt_gear2",
}


def patch_player(path):
    with open(path) as f:
        player = json.load(f)
    desc = player["minecraft:client_entity"]["description"]
    pre = desc["scripts"]["pre_animation"]
    if GUM_HELD not in pre:
        pre.append(GUM_HELD)
    rcs = desc["render_controllers"]
    present = set()
    for entry in rcs:
        if isinstance(entry, dict):
            key = next(iter(entry))
            if key in CONDITIONS:
                entry[key] = CONDITIONS[key]
                present.add(key)
    for key in ("controller.render.zt.player.first_person", "controller.render.zt.player.third_person"):
        if key not in present:
            rcs.append({key: CONDITIONS[key]})
    return player


PINK = {
    "r": "variable.zt_gear2 ? 1.0 : this",
    "g": "variable.zt_gear2 ? 0.42 : this",
    "b": "variable.zt_gear2 ? 0.56 : this",
    "a": "variable.zt_gear2 ? 0.42 : this",
}
VANILLA_RIGHT_FP = "query.get_equipped_item_name(0, 1) == '' || query.get_equipped_item_name(0, 1) == 'filled_map'"
VANILLA_LEFT_FP = ("(query.get_equipped_item_name(0, 1) == 'filled_map' && query.get_equipped_item_name('off_hand') != 'shield')"
                   " || (query.get_equipped_item_name('off_hand') == 'filled_map' && !query.item_is_charged)"
                   " || (!query.item_is_charged && (variable.item_use_normalized > 0 && variable.item_use_normalized < 1.0))")


def player_render_controllers():
    right = "variable.zt_gum_held || " + VANILLA_RIGHT_FP
    left = "variable.zt_both_arms || (!variable.zt_gum_held && (%s))" % VANILLA_LEFT_FP
    first = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        "part_visibility": [
            {"*": False},
            {"rightArm": right}, {"rightSleeve": right},
            {"leftArm": left}, {"leftSleeve": left},
            {"rightLeg": "variable.zt_leg"}, {"rightPants": "variable.zt_leg"},
        ],
        "overlay_color": PINK,
    }
    third = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        "part_visibility": [
            {"*": True},
            {"helmet": "variable.helmet_layer_visible"},
            {"leftLegging": "variable.leg_layer_visible"}, {"rightLegging": "variable.leg_layer_visible"},
            {"leftBoot": "variable.boot_layer_visible"}, {"rightBoot": "variable.boot_layer_visible"},
            {"leftSock": "variable.boot_layer_visible && variable.leg_layer_visible"},
            {"rightSock": "variable.boot_layer_visible && variable.leg_layer_visible"},
            {"bodyArmor": "variable.chest_layer_visible"},
            {"leftArmArmor": "variable.chest_layer_visible"}, {"rightArmArmor": "variable.chest_layer_visible"},
            {"belt": "variable.chest_layer_visible && variable.leg_layer_visible"},
        ],
        "overlay_color": PINK,
    }
    bare = {"geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"]}
    return {"format_version": "1.8.0", "render_controllers": {
        "controller.render.zt.player.first_person": first,
        "controller.render.zt.player.third_person": third,
        "controller.render.zt.bare_hands": bare,
    }}


def main():
    dump(BP, "items/gum_gum_fruit.json", fruit_item())
    for ident in ABILITIES:
        dump(BP, "items/%s.json" % ident.replace("zt:", ""), ability_item(ident))
    dump(RP, "attachables/gum_hands.json", bare_hands_attachable())
    dump(RP, "models/entity/empty.geo.json", empty_geometry())
    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for ident in ["zt:gum_gum_fruit"] + ABILITIES:
        icons["texture_data"][icon_of(ident)] = {"textures": "textures/items/" + icon_of(ident)}
    dump(RP, "textures/item_texture.json", icons)
    player = os.path.join(RP, "entity", "player.entity.json")
    dump(RP, "entity/player.entity.json", patch_player(player))
    dump(RP, "render_controllers/zt_player.render_controllers.json", player_render_controllers())
    print("gum gum data written")


if __name__ == "__main__":
    main()
