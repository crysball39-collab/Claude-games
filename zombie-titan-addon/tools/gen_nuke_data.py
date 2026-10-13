"""Writes the data of the nukes and their fallout (gen_nuke_art.py and gen_radiation_art.py draw
the art, gen_nuke_anims.py animates it, gen_nuke_audio.py makes its sounds; nukes.js and
radiation.js run it all):
  Silos         the Nuke Silo (Little Boy and Fat Man) and the Missile Silo (the Doomsday
                Missile), placed from their items; tapped, one shows its controls: load, aim at
                any x y z, open the doors, activate
  Payloads      Little Boy, Fat Man and the Doomsday Missile: items, and the rocket that flies
  The blast     the mushroom cloud (each player sees their own, drawn nearer and smaller so it
                can be seen from thousands of blocks away), Ash, the smoke and dust
  Radiation     the Radiation Detector, the Hazmat suit (iron's protection; it keeps radiation
                off up to High), the Radiation Zombie (a zombie that died of radiation, risen:
                its hits and its spit carry radiation), and the haze of fallout

    python3 tools/gen_nuke_data.py      (after gen_crab_data.py)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_crab_data import billboard, particle  # noqa: E402
from gen_glowite_data import (SHOVEL, block, client_mob, entry, fade, full, loot, shaped,  # noqa: E402
                              shapeless)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
ITEM_FORMAT = "1.21.90"
ENTITY_FORMAT = "1.21.90"
SMOKE = "textures/particle/zt_nuke_smoke"


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def load(root, rel):
    with open(os.path.join(root, rel)) as f:
        return json.load(f)


def item(ident, components, category="items", group=None):
    desc = {"identifier": ident, "menu_category": {"category": category}}
    if group:
        desc["menu_category"]["group"] = group
    return {"format_version": ITEM_FORMAT, "minecraft:item": {"description": desc, "components": components}}


def name_key(ident):
    return {"value": "item.%s.name" % ident}


def is_family(value, subject="other"):
    return {"test": "is_family", "subject": subject, "value": value}


def k(name):
    return {"item": "minecraft:" + name}


# =============================================================================
# Items and recipes
# =============================================================================
PAYLOADS = {"zt:little_boy": "zt_little_boy", "zt:fat_man": "zt_fat_man", "zt:doomsday_missile": "zt_doomsday_missile"}
SILOS = {"zt:nuke_silo": "zt_nuke_silo", "zt:missile_silo": "zt_missile_silo"}
# name: (slot, enchant slot, protection, durability, attachable geometry, layer, parent_setup variable): iron's
HAZMAT = {
    "helmet": ("slot.armor.head", "armor_head", 2, 165, "helmet", 1, "helmet_layer_visible"),
    "chestplate": ("slot.armor.chest", "armor_torso", 6, 240, "chestplate", 1, "chest_layer_visible"),
    "leggings": ("slot.armor.legs", "armor_legs", 5, 225, "leggings", 2, "leg_layer_visible"),
    "boots": ("slot.armor.feet", "armor_feet", 2, 195, "boots", 1, "boot_layer_visible"),
}


def items():
    for ident, icon in PAYLOADS.items():
        dump(BP, "items/%s.json" % ident.split(":")[1], item(ident, {
            "minecraft:icon": icon, "minecraft:display_name": name_key(ident),
            "minecraft:max_stack_size": 1, "minecraft:rarity": "epic"}))
    for ident, icon in SILOS.items():
        dump(BP, "items/%s.json" % ident.split(":")[1], item(ident, {
            "minecraft:icon": icon, "minecraft:display_name": name_key(ident),
            "minecraft:max_stack_size": 1, "minecraft:rarity": "rare",
            "minecraft:entity_placer": {"entity": ident}}))
    dump(BP, "items/radiation_detector.json", item("zt:radiation_detector", {
        "minecraft:icon": "zt_radiation_detector", "minecraft:display_name": name_key("zt:radiation_detector"),
        "minecraft:max_stack_size": 1, "minecraft:hand_equipped": False,
        # (so a tap reaches the script on a phone too)
        "minecraft:use_modifiers": {"use_duration": 0.3, "movement_modifier": 1.0}}, "equipment", "minecraft:itemGroup.name.compasses"))
    for name, (slot, eslot, protection, durability, *_) in HAZMAT.items():
        ident = "zt:hazmat_" + name
        dump(BP, "items/hazmat_%s.json" % name, item(ident, {
            "minecraft:icon": "zt_hazmat_" + name,
            "minecraft:display_name": name_key(ident),
            "minecraft:max_stack_size": 1,
            "minecraft:wearable": {"slot": slot, "protection": protection},
            "minecraft:durability": {"max_durability": durability},
            "minecraft:enchantable": {"slot": eslot, "value": 9},
            "minecraft:repairable": {"repair_items": [
                {"items": ["minecraft:iron_ingot", "minecraft:yellow_wool"], "repair_amount": "query.max_durability * 0.25"},
                {"items": [ident], "repair_amount": "context.other->query.remaining_durability + 0.05 * context.other->query.max_durability"}]},
            "minecraft:tags": {"tags": ["minecraft:is_armor"]},
        }, "equipment", "minecraft:itemGroup.name." + name))
        generic, player = hazmat_attachables(name)
        dump(RP, "attachables/hazmat_%s.json" % name, generic)
        dump(RP, "attachables/hazmat_%s.player.json" % name, player)


def hazmat_attachables(name):
    """Two attachables per piece, like vanilla armor: one for mobs and armor stands, one fitted to the player."""
    _, _, _, _, geo, layer, var = HAZMAT[name]
    ident = "zt:hazmat_" + name
    textures = {"default": "textures/models/armor/zt_hazmat_%d" % layer, "enchanted": "textures/misc/enchanted_actor_glint"}
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


def recipes():
    R = {
        # a silo: a well of obsidian (or stone), iron, and a dispenser to fire it, wired with redstone
        "nuke_silo": shaped("zt:nuke_silo", ["ORO", "IDI", "OOO"],
                            {"O": k("obsidian"), "R": k("redstone_block"), "I": k("iron_block"), "D": k("dispenser")}, "zt:nuke_silo"),
        "missile_silo": shaped("zt:missile_silo", ["SRS", "IDI", "SSS"],
                               {"S": k("smooth_stone"), "R": k("redstone_block"), "I": k("iron_ingot"), "D": k("dispenser")},
                               "zt:missile_silo"),
        # the nukes: a Nether Star's power in a shell of iron and TNT (Fat Man takes two)
        "little_boy": shaped("zt:little_boy", ["ITI", "TNT", "ITI"],
                             {"I": k("iron_block"), "T": k("tnt"), "N": k("nether_star")}, "zt:little_boy"),
        "fat_man": shaped("zt:fat_man", ["INI", "TTT", "INI"],
                          {"I": k("iron_block"), "N": k("nether_star"), "T": k("tnt")}, "zt:fat_man"),
        "doomsday_missile": shaped("zt:doomsday_missile", [" I ", "TTT", "FRF"],
                                   {"I": k("iron_block"), "T": k("tnt"), "F": k("fire_charge"), "R": k("redstone_block")},
                                   "zt:doomsday_missile"),
        "radiation_detector": shaped("zt:radiation_detector", ["IGI", "IRI", "ICI"],
                                     {"I": k("iron_ingot"), "G": k("glass_pane"), "R": k("redstone"), "C": k("copper_ingot")},
                                     "zt:radiation_detector"),
        "hazmat_helmet": shaped("zt:hazmat_helmet", ["YIY", "YGY"],
                                {"Y": k("yellow_wool"), "I": k("iron_ingot"), "G": k("glass_pane")}, "zt:hazmat_helmet"),
        "hazmat_chestplate": shaped("zt:hazmat_chestplate", ["Y Y", "IYI", "YYY"],
                                    {"Y": k("yellow_wool"), "I": k("iron_ingot")}, "zt:hazmat_chestplate"),
        "hazmat_leggings": shaped("zt:hazmat_leggings", ["YIY", "Y Y", "Y Y"],
                                  {"Y": k("yellow_wool"), "I": k("iron_ingot")}, "zt:hazmat_leggings"),
        "hazmat_boots": shaped("zt:hazmat_boots", ["Y Y", "I I"], {"Y": k("yellow_wool"), "I": k("iron_ingot")}, "zt:hazmat_boots"),
        # ash is potash: it feeds plants
        "ash_to_bone_meal": shapeless("zt:ash_to_bone_meal", [{"item": "zt:ash"}] * 2, "minecraft:bone_meal"),
    }
    for name, r in R.items():
        dump(BP, "recipes/%s.json" % name, r)


def ash_block():
    block("zt:ash", {
        **full("zt_ash"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.5},
        "minecraft:destructible_by_explosion": {"explosion_resistance": 0.5},
        "minecraft:tags": [SHOVEL],
        "minecraft:map_color": "#55524f",
        "minecraft:loot": loot("ash", [{"rolls": 1, "entries": [entry("zt:ash")]}]),
    })


# =============================================================================
# Entities
# =============================================================================
def int_prop(lo, hi, default=0):
    return {"type": "int", "range": [lo, hi], "default": default, "client_sync": True}


def float_prop(lo, hi, default=0.0):
    return {"type": "float", "range": [lo, hi], "default": default, "client_sync": True}


def bool_prop(default=False):
    return {"type": "bool", "default": default, "client_sync": True}


UNHURT = {"triggers": [{"cause": "all", "deals_damage": "no"}]}


def drifting(families, seconds, collision=(0.4, 0.4)):
    """Something the script moves about: no gravity, no collisions, nothing hurts it, and it clears
    itself away if it's ever left behind."""
    return {
        "component_groups": {"zt:fade": {"minecraft:instant_despawn": {}}},
        "components": {
            "minecraft:type_family": {"family": list(families)},
            "minecraft:collision_box": {"width": collision[0], "height": collision[1]},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:damage_sensor": UNHURT,
            "minecraft:fire_immune": {},
            "minecraft:timer": {"looping": False, "time": seconds, "time_down_event": {"event": "zt:fade"}},
        },
        "events": {"zt:fade": {"add": {"component_groups": ["zt:fade"]}}},
    }


def entities():
    for ident in SILOS:
        dump(BP, "entities/%s.json" % ident.split(":")[1], {"format_version": ENTITY_FORMAT, "minecraft:entity": {
            "description": {"identifier": ident, "is_spawnable": False, "is_summonable": True, "properties": {
                "zt:open": bool_prop(),
                "zt:payload": int_prop(0, 3),        # 0 empty, 1 Little Boy, 2 Fat Man, 3 the Doomsday Missile
                "zt:stage": int_prop(0, 1),          # 1: counting down to launch
            }},
            "components": {
                "minecraft:type_family": {"family": ["zt_silo", "inanimate"]},
                "minecraft:health": {"value": 100, "max": 100},
                "minecraft:collision_box": {"width": 3.0, "height": 2.4},
                "minecraft:physics": {},
                "minecraft:is_collidable": {},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:knockback_resistance": {"value": 1.0},
                "minecraft:damage_sensor": UNHURT,
                "minecraft:fire_immune": {},
                "minecraft:persistent": {},
                "minecraft:nameable": {"allow_name_tag_renaming": True},
                "minecraft:interact": {"interactions": [{
                    "on_interact": {"filters": is_family("player"), "event": "zt:use", "target": "self"},
                    "swing": True, "interact_text": "action.interact.zt_silo"}]},
            },
            "events": {"zt:use": {}},
        }})
    rocket = drifting(["nuke_rocket", "inanimate"], 120, (0.8, 2.2))
    dump(BP, "entities/nuke_rocket.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:nuke_rocket", "is_spawnable": False, "is_summonable": True, "properties": {
            "zt:kind": int_prop(0, 2),               # 0 Little Boy, 1 Fat Man, 2 the Doomsday Missile
            "zt:falling": bool_prop(),
        }},
        **rocket}})
    cloud = drifting(["mushroom_cloud", "inanimate"], 240, (0.1, 0.1))
    dump(BP, "entities/mushroom_cloud.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:mushroom_cloud", "is_spawnable": False, "is_summonable": True, "properties": {
            "zt:size": float_prop(0, 128, 1.0),      # times its four-block model
            "zt:age": float_prop(0, 1000),           # seconds
            "zt:lift": float_prop(0, 64),            # blocks it stands above its foot (out of the ground)
            "zt:visible": bool_prop(),               # nukes.js shows each player only their own
        }},
        **cloud}})
    dump(BP, "entities/radiation_spit.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:radiation_spit", "is_spawnable": False, "is_summonable": True},
        **drifting(["radiation_spit", "inanimate"], 6, (0.3, 0.3))}})
    radiation_zombie()


def radiation_zombie():
    looting = {"function": "looting_enchant", "count": {"min": 0, "max": 1}}
    dump(BP, "loot_tables/entities/radiation_zombie.json", {"pools": [
        {"rolls": 1, "entries": [{"type": "item", "name": "minecraft:rotten_flesh", "weight": 1, "functions": [
            {"function": "set_count", "count": {"min": 0, "max": 2}}, looting]}]},
        {"rolls": 1, "conditions": [{"condition": "killed_by_player"}, {"condition": "random_chance_with_looting", "chance": 0.08,
                                                                       "looting_multiplier": 0.02}],
         "entries": [{"type": "item", "name": "minecraft:glowstone_dust", "weight": 1}]},
    ]})
    targets = {"priority": 2, "must_see": True, "reselect_targets": True, "within_radius": 25, "entity_types": [
        {"filters": {"any_of": [is_family("player"), is_family("irongolem"), is_family("snowgolem")]}, "max_dist": 35},
        {"filters": {"any_of": [is_family("villager"), is_family("wandering_trader")]}, "max_dist": 35, "must_see": False}]}
    components = {
        "minecraft:type_family": {"family": ["zombie", "radiation_zombie", "undead", "monster", "mob"]},
        "minecraft:health": {"value": 30, "max": 30},
        "minecraft:attack": {"damage": 4},
        "minecraft:movement": {"value": 0.24},
        "minecraft:collision_box": {"width": 0.6, "height": 1.9},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:nameable": {},
        "minecraft:follow_range": {"value": 35, "max": 35},
        # it glows hot: fire doesn't hurt it, nor does the sun burn it
        "minecraft:fire_immune": {},
        "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
        "minecraft:navigation.walk": {"can_path_over_water": True, "can_pass_doors": True, "can_open_doors": False,
                                      "avoid_water": True},
        "minecraft:despawn": {"despawn_from_distance": {}},
        "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 8 : 0"},
        "minecraft:loot": {"table": "loot_tables/entities/radiation_zombie.json"},
        "minecraft:conditional_bandwidth_optimization": {},
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.nearest_attackable_target": targets,
        "minecraft:behavior.melee_box_attack": {"priority": 3, "speed_multiplier": 1.0, "track_target": True},
        "minecraft:behavior.random_stroll": {"priority": 7, "speed_multiplier": 1.0},
        "minecraft:behavior.look_at_player": {"priority": 8, "look_distance": 8},
        "minecraft:behavior.random_look_around": {"priority": 9},
    }
    dump(BP, "entities/radiation_zombie.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:radiation_zombie", "is_spawnable": True, "is_summonable": True, "spawn_category": "monster"},
        "components": components, "events": {}}})


# =============================================================================
# Client entities and render controllers
# =============================================================================
def client_files():
    s = "animation.zt.silo."
    for ident, tex in SILOS.items():
        name = ident.split(":")[1]
        dump(RP, "entity/%s.entity.json" % name, {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
            "identifier": ident,
            "materials": {"default": "entity_emissive_alpha"},
            "textures": {"default": "textures/entity/" + tex},
            "geometry": {"default": "geometry.zt." + name},
            "scripts": {"animate": ["doors", "stage"]},
            "animations": {"doors_open": s + "doors_open", "doors_opened": s + "doors_opened", "doors_close": s + "doors_close",
                           "raise": s + "raise", "doors": "controller.animation.zt.silo.doors",
                           "stage": "controller.animation.zt.silo.stage"},
            "render_controllers": ["controller.render.zt.silo"],
        }}})
    r = "animation.zt.nuke_rocket."
    dump(RP, "entity/nuke_rocket.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:nuke_rocket",
        "materials": {"default": "entity_emissive_alpha", "flame": "entity_beam_additive"},
        "textures": {"default": "textures/entity/zt_nuke_rocket"},
        "geometry": {"default": "geometry.zt.nuke_rocket"},
        # (as big as in the silo as it climbs out of it; the bomb that falls is drawn larger)
        "scripts": {"scale": "q.property('zt:falling') ? 1.6 : 1.0", "should_update_bones_and_effects_offscreen": "1.0",
                    "animate": ["controller"]},
        "animations": {"flame": r + "flame", "climb": r + "climb", "fall": r + "fall",
                       "controller": "controller.animation.zt.nuke_rocket.main"},
        "particle_effects": {"flame": "zt:rocket_flame", "flame_up": "zt:rocket_flame_up", "trail": "zt:rocket_trail"},
        "render_controllers": ["controller.render.zt.nuke_rocket"],
    }}})
    # the cloud's age comes from the script twice a second; between, it runs on by itself
    dump(RP, "entity/mushroom_cloud.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:mushroom_cloud",
        "materials": {"default": "entity_emissive_alpha", "fire": "entity_beam_additive"},
        "textures": {"default": "textures/entity/zt_mushroom_cloud"},
        "geometry": {"default": "geometry.zt.mushroom_cloud"},
        "scripts": {
            "pre_animation": [
                "v.sent = q.property('zt:age');",
                "v.since = (v.sent != v.last_sent) ? q.life_time : v.since;",
                "v.last_sent = v.sent;",
                "v.age = v.sent + math.clamp(q.life_time - v.since, 0, 0.75);",
            ],
            "should_update_bones_and_effects_offscreen": "1.0",
            "animate": ["controller"],
        },
        "animations": {"grow": "animation.zt.mushroom_cloud.grow", "controller": "controller.animation.zt.mushroom_cloud.main"},
        "render_controllers": ["controller.render.zt.mushroom_cloud"],
    }}})
    dump(RP, "entity/radiation_spit.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:radiation_spit",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/zt_radiation_spit"},
        "geometry": {"default": "geometry.zt.radiation_spit"},
        "scripts": {"animate": ["controller"]},
        "animations": {"spin": "animation.zt.radiation_spit.spin", "controller": "controller.animation.zt.spore_bullet"},
        "particle_effects": {"trail": "zt:radiation_trail"},
        "render_controllers": ["controller.render.zt.glowite_default"],
    }}})
    dump(RP, "entity/radiation_zombie.entity.json", client_mob(
        "zt:radiation_zombie", "zt_radiation_zombie", "geometry.zt.radiation_zombie", ("#2b3d1f", "#9dff3c"),
        {"zombie_attack_bare_hand": "animation.zombie.attack_bare_hand", "spit": "animation.zt.radiation_zombie.spit"},
        [{"zombie_attack_bare_hand": "controller.animation.zombie.attack_bare_hand"}]))
    payload = "q.property('zt:payload')"
    kind = "q.property('zt:kind')"
    dump(RP, "render_controllers/nukes.render_controllers.json", {"format_version": "1.8.0", "render_controllers": {
        "controller.render.zt.silo": {
            "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
            "part_visibility": [{"little_boy": "%s == 1" % payload}, {"fat_man": "%s == 2" % payload},
                                {"doomsday": "%s == 3" % payload},
                                # the warning lights: on while it's open, flashing while it counts down
                                {"lights": "q.property('zt:stage') == 1 ? math.mod(q.life_time * 4, 1) < 0.5 : q.property('zt:open')"}],
        },
        "controller.render.zt.nuke_rocket": {
            "geometry": "Geometry.default", "materials": [{"*": "Material.default"}, {"flame": "Material.flame"}],
            "textures": ["Texture.default"],
            "part_visibility": [{"little_boy": "%s == 0" % kind}, {"fat_man": "%s == 1" % kind}, {"doomsday": "%s == 2" % kind},
                                # a bomb falls without a flame; the missile dives on its
                                {"flame": "!q.property('zt:falling') || %s == 2" % kind}],
        },
        # the fire under the cap cools to grey as the cloud ages
        "controller.render.zt.mushroom_cloud": {
            "geometry": "Geometry.default", "materials": [{"*": "Material.default"}, {"fireball": "Material.fire"}],
            "textures": ["Texture.default"],
            "part_visibility": [{"*": "q.property('zt:visible')"}],
            "overlay_color": {"r": 0.42, "g": 0.4, "b": 0.38, "a": "math.clamp((v.age - 6) / 40, 0, 0.55)"},
        },
    }})


# =============================================================================
# Particles and the fallout's haze
# =============================================================================
def particles():
    life = "v.particle_age / v.particle_lifetime"
    P = {}

    def flame(ident, down):
        return particle(ident, "particles_add", {
            "minecraft:emitter_rate_steady": {"spawn_rate": 80, "max_particles": 60},
            "minecraft:emitter_lifetime_looping": {"active_time": 1},
            "minecraft:emitter_shape_disc": {"radius": 0.25, "plane_normal": "y", "direction": [0, -1 if down else 1, 0]},
            "minecraft:particle_lifetime_expression": {"max_lifetime": "0.2 + v.particle_random_1 * 0.2"},
            "minecraft:particle_initial_speed": "8 + v.particle_random_2 * 6",
            "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 4},
            "minecraft:particle_appearance_billboard": billboard("0.1 + 0.5 * (1 - %s)" % life),
            "minecraft:particle_appearance_tinting": {"color": {"gradient": {
                "0.0": [1, 1, 0.85, 1], "0.4": [1, 0.65, 0.2, 0.9], "1.0": [0.8, 0.2, 0.05, 0]}, "interpolant": life}},
        })
    # the rocket's exhaust: flame (down as it climbs, up as the missile dives) and a trail of smoke
    P["rocket_flame"] = flame("zt:rocket_flame", True)
    P["rocket_flame_up"] = flame("zt:rocket_flame_up", False)
    P["rocket_trail"] = particle("zt:rocket_trail", "particles_blend", {
        "minecraft:emitter_rate_steady": {"spawn_rate": 30, "max_particles": 180},
        "minecraft:emitter_lifetime_looping": {"active_time": 1},
        "minecraft:emitter_shape_sphere": {"radius": 0.3, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "3 + v.particle_random_1 * 2"},
        "minecraft:particle_initial_speed": "0.3 + v.particle_random_2 * 0.4",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.15, 0], "linear_drag_coefficient": 0.5},
        "minecraft:particle_appearance_billboard": billboard("0.6 + v.particle_age * 0.6"),
        "minecraft:particle_appearance_tinting": fade([0.85, 0.85, 0.85, 0.85], [0.6, 0.6, 0.6, 0.0]),
        "minecraft:particle_appearance_lighting": {},
    }, texture=SMOKE)
    # smoke billowing out of the silo as it launches
    P["launch_smoke"] = particle("zt:launch_smoke", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 14},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 1.2, "plane_normal": "y", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "3 + v.particle_random_1 * 2.5"},
        "minecraft:particle_initial_speed": "5 + v.particle_random_2 * 6",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.8, 0], "linear_drag_coefficient": 1.4},
        "minecraft:particle_appearance_billboard": billboard("1.2 + v.particle_age * 1.1"),
        "minecraft:particle_appearance_tinting": fade([0.92, 0.9, 0.88, 0.95], [0.7, 0.68, 0.66, 0.0]),
        "minecraft:particle_appearance_lighting": {},
    }, texture=SMOKE)
    # the smoke rolling out from the foot of the mushroom cloud (variable.scale: how much nearer
    # than it really is the player's cloud is drawn)
    P["nuke_smoke"] = particle("zt:nuke_smoke", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 18},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": "v.scale * 20", "plane_normal": "y", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "6 + v.particle_random_1 * 4"},
        "minecraft:particle_initial_speed": "v.scale * (10 + v.particle_random_2 * 14)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, "v.scale * 0.6", 0], "linear_drag_coefficient": 0.35},
        "minecraft:particle_appearance_billboard": billboard("v.scale * (14 + v.particle_age * 5)"),
        "minecraft:particle_appearance_tinting": fade([0.55, 0.5, 0.45, 0.9], [0.45, 0.42, 0.4, 0.0]),
        "minecraft:particle_appearance_lighting": {},
    }, texture=SMOKE)
    # the flash (variable.scale, as above)
    P["nuke_flash"] = particle("zt:nuke_flash", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 1.6},
        "minecraft:particle_appearance_billboard": billboard("v.scale * (40 + 140 * math.min(v.particle_age / 0.4, 1))"),
        "minecraft:particle_appearance_tinting": {"color": {"gradient": {
            "0.0": [1, 1, 1, 1], "0.3": [1, 0.95, 0.7, 1], "1.0": [1, 0.5, 0.1, 0]}, "interpolant": life}},
    })
    # dust thrown past a player as the shockwave goes by (variable.dx, dz: the way it's going)
    P["shock_dust"] = particle("zt:shock_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 50},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [8, 1, 8], "direction": ["v.dx", 0.15, "v.dz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1 + v.particle_random_1"},
        "minecraft:particle_initial_speed": "8 + v.particle_random_2 * 8",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.5},
        "minecraft:particle_appearance_billboard": billboard("0.5 + v.particle_age * 0.8"),
        "minecraft:particle_appearance_tinting": fade([0.6, 0.52, 0.42, 0.85], [0.5, 0.45, 0.4, 0.0]),
        "minecraft:particle_appearance_lighting": {},
    }, texture=SMOKE)
    # ash drifting down over the wasteland
    P["ash_fall"] = particle("zt:ash_fall", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 24},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [12, 3, 12], "direction": [0, -1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "6 + v.particle_random_1 * 3"},
        "minecraft:particle_initial_speed": "0.6 + v.particle_random_2 * 0.6",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [
            "math.sin(v.particle_age * 90 + v.particle_random_3 * 360) * 0.3", -0.05,
            "math.cos(v.particle_age * 70 + v.particle_random_4 * 360) * 0.3"], "linear_drag_coefficient": 0.2},
        "minecraft:particle_motion_collision": {"collision_radius": 0.05, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": billboard("0.07 + v.particle_random_3 * 0.07"),
        "minecraft:particle_appearance_tinting": {"color": [0.55, 0.53, 0.52, 0.95]},
        "minecraft:particle_appearance_lighting": {},
    })
    # green motes in the air where the radiation's strong (variable.level: 3 to 5)
    P["radiation_glow"] = particle("zt:radiation_glow", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": "v.level * 3 - 5"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [5, 2, 5], "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "2 + v.particle_random_1"},
        "minecraft:particle_initial_speed": 0.2,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.1, 0], "linear_drag_coefficient": 0.5},
        "minecraft:particle_appearance_billboard": billboard(
            "(0.06 + v.particle_random_3 * 0.08) * (0.6 + 0.4 * math.sin(v.particle_age * 400))"),
        "minecraft:particle_appearance_tinting": fade([0.5, 1.0, 0.3, 0.9], [0.3, 1.0, 0.2, 0.0]),
    })
    # the Radiation Zombie's spit: its trail, and the splash where it lands
    P["radiation_trail"] = particle("zt:radiation_trail", "particles_add", {
        "minecraft:emitter_rate_steady": {"spawn_rate": 40, "max_particles": 40},
        "minecraft:emitter_lifetime_looping": {"active_time": 1},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.4 + v.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": 0.2,
        "minecraft:particle_appearance_billboard": billboard("0.25 * (1 - %s)" % life),
        "minecraft:particle_appearance_tinting": fade([0.6, 1, 0.3, 1], [0.2, 0.8, 0.1, 0]),
    })
    P["radiation_splash"] = particle("zt:radiation_splash", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 30},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.3, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.5 + v.particle_random_1 * 0.4"},
        "minecraft:particle_initial_speed": "3 + v.particle_random_2 * 4",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -4, 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": billboard("0.22 * (1 - %s)" % life),
        "minecraft:particle_appearance_tinting": fade([0.7, 1, 0.35, 1], [0.2, 0.9, 0.1, 0]),
    })
    for name, p in P.items():
        dump(RP, "particles/%s.particle.json" % name, p)


FOGS = {
    # inside the ash zone: thick, grey-brown, ash in the air
    "nuclear_ash": ("zt:nuclear_ash", "#5d5650", (6.0, 80.0)),
    # where the radiation's High or worse: a sickly green-grey haze
    "nuclear_haze": ("zt:nuclear_haze", "#6c7660", (24.0, 150.0)),
}


def fogs():
    for name, (ident, color, (start, end)) in FOGS.items():
        dump(RP, "fogs/%s.json" % name, {"format_version": "1.16.100", "minecraft:fog_settings": {
            "description": {"identifier": ident},
            "distance": {
                "air": {"fog_start": start, "fog_end": end, "fog_color": color, "render_distance_type": "fixed"},
                "weather": {"fog_start": start * 0.7, "fog_end": end * 0.75, "fog_color": color, "render_distance_type": "fixed"},
            },
        }})


# =============================================================================
# Sounds, textures and names
# =============================================================================
def own(name, volume=1.0):
    return [{"name": "sounds/zt/" + name, "volume": volume, "pitch": 1.0}]


def event(sounds, category, min_d, max_d):
    return {"category": category, "min_distance": min_d, "max_distance": max_d, "sounds": sounds}


SOUNDS = {
    "zt.nuke.siren": event(own("nuke_siren"), "block", 16.0, 128.0),
    "zt.nuke.beep": event(own("nuke_beep"), "block", 4.0, 32.0),
    "zt.silo.doors": event(own("silo_doors"), "block", 6.0, 40.0),
    "zt.nuke.launch": event(own("nuke_launch"), "block", 24.0, 192.0),
    # (these are played to each player where they stand, as loud as their distance makes them)
    "zt.nuke.whistle": event(own("nuke_whistle"), "weather", 4.0, 64.0),
    "zt.nuke.blast": event(own("nuke_blast"), "weather", 4.0, 64.0),
    "zt.nuke.rumble": event(own("nuke_rumble"), "weather", 4.0, 64.0),
    **{"zt.geiger.%d" % n: event(own("geiger_%d" % n, 0.7), "player", 2.0, 8.0) for n in range(1, 6)},
    "zt.radiation_zombie.spit": event(
        [{"name": "sounds/mob/llama/spit1", "volume": 1.0, "pitch": 0.6}, {"name": "sounds/mob/llama/spit2", "volume": 1.0, "pitch": 0.55}],
        "hostile", 6.0, 24.0),
}
ITEM_ICONS = ["zt_little_boy", "zt_fat_man", "zt_doomsday_missile", "zt_nuke_silo", "zt_missile_silo", "zt_radiation_detector",
              "zt_hazmat_helmet", "zt_hazmat_chestplate", "zt_hazmat_leggings", "zt_hazmat_boots"]
NAMES = {
    "item.zt:little_boy.name": "Little Boy",
    "item.zt:fat_man.name": "Fat Man",
    "item.zt:doomsday_missile.name": "Doomsday Missile",
    "item.zt:nuke_silo.name": "Nuke Silo",
    "item.zt:missile_silo.name": "Missile Silo",
    "entity.zt:nuke_silo.name": "Nuke Silo",
    "entity.zt:missile_silo.name": "Missile Silo",
    "action.interact.zt_silo": "Controls",
    "entity.zt:nuke_rocket.name": "Nuke",
    "entity.zt:mushroom_cloud.name": "Mushroom Cloud",
    "tile.zt:ash.name": "Ash",
    "item.zt:radiation_detector.name": "Radiation Detector",
    "item.zt:hazmat_helmet.name": "Hazmat Helmet",
    "item.zt:hazmat_chestplate.name": "Hazmat Chestplate",
    "item.zt:hazmat_leggings.name": "Hazmat Leggings",
    "item.zt:hazmat_boots.name": "Hazmat Boots",
    "entity.zt:radiation_zombie.name": "Radiation Zombie",
    "item.spawn_egg.entity.zt:radiation_zombie.name": "Spawn Radiation Zombie",
    "entity.zt:radiation_spit.name": "Radiation Spit",
}


def registrations():
    icons = load(RP, "textures/item_texture.json")
    for name in ITEM_ICONS:
        icons["texture_data"][name] = {"textures": "textures/items/" + name}
    dump(RP, "textures/item_texture.json", icons)
    terrain = load(RP, "textures/terrain_texture.json")
    terrain["texture_data"]["zt_ash"] = {"textures": "textures/blocks/zt_ash"}
    dump(RP, "textures/terrain_texture.json", terrain)
    blocks = load(RP, "blocks.json")
    blocks["zt:ash"] = {"sound": "sand"}
    dump(RP, "blocks.json", blocks)
    defs = load(RP, "sounds/sound_definitions.json")
    defs["sound_definitions"].update(SOUNDS)
    dump(RP, "sounds/sound_definitions.json", defs)
    ent = load(RP, "sounds.json")
    ent["entity_sounds"]["entities"]["zt:radiation_zombie"] = {"volume": 1.0, "pitch": [0.6, 0.75], "events": {
        "ambient": "mob.zombie.say", "hurt": "mob.zombie.hurt", "death": "mob.zombie.death",
        "step": {"sound": "mob.zombie.step", "volume": 0.15, "pitch": 0.8}}}
    dump(RP, "sounds.json", ent)
    for lang in ("en_US", "en_GB"):
        path = os.path.join(RP, "texts", lang + ".lang")
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        if "## nukes begin" in lines:
            a, b = lines.index("## nukes begin"), lines.index("## nukes end")
            lines = lines[:a] + lines[b + 1:]
        while lines and lines[-1] == "":
            lines.pop()
        lines += ["## nukes begin"] + ["%s=%s" % kv for kv in NAMES.items()] + ["## nukes end", ""]
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))


def main():
    items()
    recipes()
    ash_block()
    entities()
    client_files()
    particles()
    fogs()
    registrations()
    print("nuke data written")


if __name__ == "__main__":
    main()
