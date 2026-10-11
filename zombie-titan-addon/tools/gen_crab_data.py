"""Writes the data of the Crabulon update (gen_crab_art.py draws its art, gen_crab_anims.py
animates it):

  Shroomy Crab   a neutral crab of the Glowshroom Biome: it lives in the small ponds of the
                 caverns (glowshroom.js digs them and brings crabs to them) and in the Shroom
                 Fortress. Hit one and it, and the crabs about it, fight back. It drops Shroom
                 Patches and Shroomy Crab Claws.
  Crabulon       the Shroom Fortress's boss: a crab ten blocks tall with 3000 health, summoned by
                 setting a Crab Totem (two Shroomy Crab Claws and four Shroom Patches) on the
                 Shroomed Altar; crabulon.js runs its summoning, its fight and its death (it drops
                 a Spore Scroll and a Shroomed Eye). Also its corpse, the totem rising off the
                 altar, and the mushrooms of its Shroom Rain.
  Fortress       the Shroom Fortress's blocks (fortress.js builds it beside some caverns):
                 Shroomed Brick, Shroomed Brick Wall, the Shroomed Altar (unbreakable; Crabulon
                 is summoned at it) and the Shroomy Crab spawner (a cage that brings out crabs
                 while a player is near, by its custom component zt:crab_spawner).

    python3 tools/gen_crab_data.py      (after gen_glowite_data.py)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_glowite_data import BLOCK_FORMAT, PICK, box, bs, cube, entry, geo, mat  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

ITEM_FORMAT = "1.21.90"
ENTITY_FORMAT = "1.21.90"


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


# =============================================================================
# The Shroomy Crab and what it drops
# =============================================================================
def crab_items():
    for ident, icon in (("zt:shroom_patch", "zt_shroom_patch"), ("zt:shroomy_crab_claw", "zt_shroomy_crab_claw")):
        dump(BP, "items/%s.json" % ident.split(":")[1], item(ident, {
            "minecraft:icon": icon,
            "minecraft:display_name": name_key(ident),
            "minecraft:max_stack_size": 64,
        }))


def crab():
    looting = {"function": "looting_enchant", "count": {"min": 0, "max": 1}}
    dump(BP, "loot_tables/entities/shroomy_crab.json", {"pools": [
        {"rolls": 1, "entries": [{"type": "item", "name": "zt:shroom_patch", "weight": 1, "functions": [
            {"function": "set_count", "count": {"min": 1, "max": 2}}, looting]}]},
        {"rolls": 1, "conditions": [{"condition": "random_chance_with_looting", "chance": 0.5, "looting_multiplier": 0.1}],
         "entries": [{"type": "item", "name": "zt:shroomy_crab_claw", "weight": 1}]},
    ]})
    components = {
        # "shroom": the Glowshroom Biome's own (its spore bullets pass them by)
        "minecraft:type_family": {"family": ["shroomy_crab", "shroom", "arthropod", "mob"]},
        "minecraft:health": {"value": 14, "max": 14},
        "minecraft:attack": {"damage": 3},
        "minecraft:movement": {"value": 0.25},
        "minecraft:underwater_movement": {"value": 0.15},
        "minecraft:collision_box": {"width": 0.8, "height": 0.55},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:nameable": {},
        "minecraft:follow_range": {"value": 16, "max": 16},
        # it walks the bottom of its pond: no swimming up, and it breathes water as well as air
        "minecraft:navigation.walk": {"can_path_over_water": False, "can_sink": True, "avoid_water": False,
                                      "is_amphibious": True, "can_pass_doors": True},
        "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
        "minecraft:despawn": {"despawn_from_distance": {}},
        "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 3 : 0"},
        "minecraft:loot": {"table": "loot_tables/entities/shroomy_crab.json"},
        "minecraft:hurt_on_condition": {"damage_conditions": [{"filters": {"test": "in_lava", "subject": "self"},
                                                               "cause": "lava", "damage_per_tick": 4}]},
        # neutral: it leaves you alone until you hurt it (or one of the crabs near it)
        "minecraft:behavior.hurt_by_target": {"priority": 1, "alert_same_type": True},
        "minecraft:behavior.melee_box_attack": {"priority": 2, "speed_multiplier": 1.3, "track_target": True},
        "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.8},
        "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 6},
        "minecraft:behavior.random_look_around": {"priority": 8},
    }
    groups = {
        # the crabs Crabulon calls up come for the players straight away
        "zt:hostile": {
            "minecraft:behavior.nearest_attackable_target": {"priority": 2, "must_see": False, "reselect_targets": True,
                                                             "within_radius": 32, "entity_types": [
                                                                 {"filters": is_family("player"), "max_dist": 40}]},
            "minecraft:follow_range": {"value": 40, "max": 40},
        },
    }
    dump(BP, "entities/shroomy_crab.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:shroomy_crab", "is_spawnable": True, "is_summonable": True,
                        "spawn_category": "creature"},
        "component_groups": groups,
        "components": components,
        "events": {"zt:make_hostile": {"add": {"component_groups": ["zt:hostile"]}}},
    }})


IMMUNE_CAUSES = ["fall", "fire", "fire_tick", "lava", "drowning", "suffocation", "falling_block", "freezing", "contact",
                 "stalactite", "stalagmite", "fly_into_wall", "temperature", "anvil"]
EFFECT_IMMUNITY = ["poison", "fatal_poison", "wither", "slowness", "weakness", "levitation", "blindness", "darkness",
                   "nausea", "mining_fatigue", "hunger", "slow_falling", "infested", "oozing", "weaving", "wind_charged"]


def bool_prop(sync=True):
    return {"type": "bool", "default": False, "client_sync": sync}


def inanimate(ident, seconds, families=("inanimate",)):
    """Something the script moves about: no gravity, no collisions, nothing hurts it, and it fades
    on its own if it's left behind."""
    return {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": ident, "is_spawnable": False, "is_summonable": True},
        "component_groups": {"zt:fade": {"minecraft:instant_despawn": {}}},
        "components": {
            "minecraft:type_family": {"family": list(families)},
            "minecraft:collision_box": {"width": 0.4, "height": 0.4},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
            "minecraft:timer": {"looping": False, "time": seconds, "time_down_event": {"event": "zt:fade"}},
        },
        "events": {"zt:fade": {"add": {"component_groups": ["zt:fade"]}}},
    }}


def crabulon():
    intro = {"test": "bool_property", "domain": "zt:intro", "value": True}
    triggers = [{"on_damage": {"filters": intro}, "deals_damage": "no"}]
    triggers += [{"cause": c, "deals_damage": "no"} for c in IMMUNE_CAUSES]
    # (its own crabs can't hurt it)
    triggers += [{"on_damage": {"filters": is_family("shroom")}, "deals_damage": "no"}]
    dump(BP, "entities/crabulon.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:crabulon", "is_spawnable": True, "is_summonable": True, "spawn_category": "monster",
                        "properties": {
                            "zt:anim": {"type": "int", "range": [0, 15], "default": 0, "client_sync": True},
                            "zt:moving": bool_prop(),
                            # below half its health it fights faster
                            "zt:enraged": bool_prop(),
                            # nothing hurts it while it's being summoned
                            "zt:intro": bool_prop(False),
                        }},
        "components": {
            "minecraft:type_family": {"family": ["crabulon", "shroom", "boss", "monster", "mob"]},
            "minecraft:health": {"value": 3000, "max": 3000},
            "minecraft:boss": {"name": "Crabulon", "should_darken_sky": False, "hud_range": 64},
            # its shell, nine blocks across: whichever way it faces, a hit on its shell lands
            "minecraft:collision_box": {"width": 9.0, "height": 6.0},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:fire_immune": {},
            "minecraft:movement": {"value": 0.0},
            "minecraft:movement.basic": {},
            "minecraft:persistent": {},
            "minecraft:nameable": {"allow_name_tag_renaming": False, "always_show": False},
            "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
            "minecraft:mob_effect_immunity": {"mob_effects": EFFECT_IMMUNITY},
            "minecraft:damage_sensor": {"triggers": triggers},
        },
        "events": {},
    }})
    dump(BP, "entities/crabulon_corpse.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:crabulon_corpse", "is_spawnable": False, "is_summonable": True},
        "components": {
            "minecraft:type_family": {"family": ["inanimate"]},
            "minecraft:health": {"value": 1, "max": 1},
            "minecraft:collision_box": {"width": 0.5, "height": 0.5},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:fire_immune": {},
            "minecraft:persistent": {},
            "minecraft:nameable": {"allow_name_tag_renaming": False},
            "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
        },
        "events": {},
    }})
    dump(BP, "entities/crab_totem_display.json", inanimate("zt:crab_totem_display", 12))
    dump(BP, "entities/falling_shroom.json", inanimate("zt:falling_shroom", 6, ("falling_shroom", "inanimate")))
    # the totem, and what Crabulon leaves when it dies
    dump(BP, "items/crab_totem.json", item("zt:crab_totem", {
        "minecraft:icon": "zt_crab_totem", "minecraft:display_name": name_key("zt:crab_totem"),
        "minecraft:max_stack_size": 1, "minecraft:rarity": "uncommon"}))
    dump(BP, "items/spore_scroll.json", item("zt:spore_scroll", {
        "minecraft:icon": "zt_spore_scroll", "minecraft:display_name": name_key("zt:spore_scroll"),
        "minecraft:max_stack_size": 16, "minecraft:rarity": "rare"}))
    dump(BP, "items/shroomed_eye.json", item("zt:shroomed_eye", {
        "minecraft:icon": "zt_shroomed_eye", "minecraft:display_name": name_key("zt:shroomed_eye"),
        "minecraft:max_stack_size": 16, "minecraft:rarity": "rare"}))
    dump(BP, "recipes/crab_totem.json", {"format_version": "1.20.10", "minecraft:recipe_shapeless": {
        "description": {"identifier": "zt:crab_totem"}, "tags": ["crafting_table"],
        "ingredients": [{"item": "zt:shroomy_crab_claw"}] * 2 + [{"item": "zt:shroom_patch"}] * 4,
        "unlock": [{"item": "zt:shroomy_crab_claw"}], "result": {"item": "zt:crab_totem", "count": 1}}})


CRABULON_ANIMS = ["idle", "walk", "barrage", "crouch", "air", "land", "summon", "rain", "claw", "roar", "descend"]


def crabulon_client():
    p = "animation.zt.crabulon."
    big = {"should_update_bones_and_effects_offscreen": "1.0", "should_update_effects_offscreen": "1.0"}
    dump(RP, "entity/crabulon.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:crabulon",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/zt_crabulon"},
        "geometry": {"default": "geometry.zt.crabulon"},
        "spawn_egg": {"base_color": "#1d4fae", "overlay_color": "#eef3ff"},
        "scripts": {"scale": "10.0", **big, "animate": ["controller"]},
        "animations": {**{n: p + n for n in CRABULON_ANIMS}, "controller": "controller.animation.zt.crabulon.main"},
        "render_controllers": ["controller.render.zt.crabulon"],
    }}})
    dump(RP, "entity/crabulon_corpse.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:crabulon_corpse",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/zt_crabulon"},
        "geometry": {"default": "geometry.zt.crabulon"},
        "scripts": {"scale": "10.0", **big, "animate": ["death"]},
        "animations": {"death": p + "death"},
        "render_controllers": ["controller.render.zt.glowite_default"],
    }}})
    dump(RP, "entity/crab_totem_display.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:crab_totem_display",
        "materials": {"default": "entity_alphatest"},
        "textures": {"default": "textures/entity/zt_crab_totem"},
        "geometry": {"default": "geometry.zt.crab_totem"},
        "scripts": {"scale": "1.4", "animate": ["rise"]},
        "animations": {"rise": "animation.zt.crab_totem.rise"},
        "render_controllers": ["controller.render.zt.glowite_default"],
    }}})
    dump(RP, "entity/falling_shroom.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:falling_shroom",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/zt_falling_shroom"},
        "geometry": {"default": "geometry.zt.falling_shroom"},
        "scripts": {"scale": "1.5", "animate": ["controller"]},
        "animations": {"spin": "animation.zt.falling_shroom.spin", "controller": "controller.animation.zt.spore_bullet"},
        "particle_effects": {"trail": "zt:spore_trail"},
        "render_controllers": ["controller.render.zt.glowite_default"],
    }}})
    # enraged, it pulses with a blue glow
    fury = "q.property('zt:enraged')"
    dump(RP, "render_controllers/crabulon.render_controllers.json", {"format_version": "1.8.0", "render_controllers": {
        "controller.render.zt.crabulon": {
            "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
            "overlay_color": {"r": "%s ? 0.35 : this" % fury, "g": "%s ? 0.8 : this" % fury, "b": "%s ? 1.0 : this" % fury,
                              "a": "%s ? (0.15 + math.max(0, math.sin(q.life_time * 240.0)) * 0.3) : this" % fury},
        },
    }})


def crab_client():
    p = "animation.zt.shroomy_crab."
    dump(RP, "entity/shroomy_crab.entity.json", {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "zt:shroomy_crab",
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/zt_shroomy_crab"},
        "geometry": {"default": "geometry.zt.shroomy_crab"},
        "spawn_egg": {"base_color": "#2a64c8", "overlay_color": "#e6eefc"},
        "scripts": {"scale": "0.75", "animate": ["move", {"attack": "v.attack_time > 0"}]},
        "animations": {"idle": p + "idle", "walk": p + "walk", "sidle": p + "sidle", "attack": p + "attack",
                       "move": "controller.animation.zt.shroomy_crab.move"},
        "render_controllers": ["controller.render.zt.glowite_default"],
    }}})


# =============================================================================
# The Shroom Fortress's blocks
# =============================================================================
def block(ident, components, traits=None, permutations=None, category="construction", group=None):
    desc = {"identifier": ident, "menu_category": {"category": category}}
    if group:
        desc["menu_category"]["group"] = group
    if traits:
        desc["traits"] = traits
    b = {"description": desc, "components": components}
    if permutations:
        b["permutations"] = permutations
    dump(BP, "blocks/%s.json" % ident.split(":")[1], {"format_version": BLOCK_FORMAT, "minecraft:block": b})


def loot(name, pools):
    dump(BP, "loot_tables/blocks/%s.json" % name, {"pools": pools})
    return "loot_tables/blocks/%s.json" % name


def pickaxe_pool(name, n=1):
    """Drops `name` when mined with a pickaxe (with anything else, nothing: like stone bricks)."""
    return [{"rolls": 1, "conditions": [{"condition": "match_tool", "minecraft:match_tool_filter_any": ["minecraft:is_pickaxe"]}],
             "entries": [entry(name, n)]}]


def with_instance(c, name):
    """A cube whose faces all draw with the named material instance."""
    for f in c["uv"].values():
        f["material_instance"] = name
    return c


def fortress_models():
    geos = []
    # the wall: a post (left out where the wall runs straight through), and an arm each way it joins
    arms = {"north": ((-3, 0, -8), (6, 14, 8)), "south": ((-3, 0, 0), (6, 14, 8)),
            "east": ((0, 0, -3), (8, 14, 6)), "west": ((-8, 0, -3), (8, 14, 6))}
    geos.append(geo("geometry.zt.shroomed_brick_wall", [("post", [cube((-4, 0, -4), (8, 16, 8))])] +
                    [(d, [cube(o, sz)]) for d, (o, sz) in arms.items()]))
    # the altar: a base, a column, a top slab, and a claw at each corner
    geos.append(geo("geometry.zt.shroomed_altar", [("altar", [
        cube((-8, 0, -8), (16, 3, 16)), cube((-5, 3, -5), (10, 7, 10)), cube((-7, 10, -7), (14, 3, 14)),
        cube((-7, 13, -7), (2, 3, 2)), cube((5, 13, -7), (2, 3, 2)), cube((-7, 13, 5), (2, 3, 2)), cube((5, 13, 5), (2, 3, 2))])]))
    # the spawner: its cage, and a little crab in it
    crab = [with_instance(cube((-3, 5, -2.5), (6, 3, 5)), "crab"),
            with_instance(cube((-4.5, 5, -4.5), (2, 2, 2)), "crab"), with_instance(cube((2.5, 5, -4.5), (2, 2, 2)), "crab"),
            with_instance(cube((-5, 4, -1.5), (2, 1, 1)), "crab"), with_instance(cube((3, 4, -1.5), (2, 1, 1)), "crab"),
            with_instance(cube((-5, 4, 0.5), (2, 1, 1)), "crab"), with_instance(cube((3, 4, 0.5), (2, 1, 1)), "crab"),
            with_instance(cube((-2, 8, -2), (1, 2, 1)), "eye"), with_instance(cube((1, 8, -2), (1, 2, 1)), "eye")]
    geos.append(geo("geometry.zt.crab_spawner", [("cage", [cube((-8, 0, -8), (16, 16, 16))]), ("crab", crab)]))
    dump(RP, "models/blocks/fortress.geo.json", {"format_version": "1.21.0", "minecraft:geometry": geos})


def fortress_blocks():
    fortress_models()
    bricks = {"minecraft:tags": [PICK, "minecraft:stone"], "minecraft:map_color": "#343c5e",
              "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
              "minecraft:destructible_by_explosion": {"explosion_resistance": 6}}
    block("zt:shroomed_bricks", {
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": {"*": mat("zt_shroomed_bricks")},
        "minecraft:loot": loot("shroomed_bricks", pickaxe_pool("zt:shroomed_bricks")),
        **bricks,
    })
    # the wall joins its neighbours through the connection trait, like the Glowshroom fence;
    # its post is left out where it runs straight through, as a vanilla wall's is
    conn = {d: bs("minecraft:connection_" + d) for d in ("north", "south", "east", "west")}
    straight = "(%s && %s && !%s && !%s) || (%s && %s && !%s && !%s)" % (
        conn["north"], conn["south"], conn["east"], conn["west"], conn["east"], conn["west"], conn["north"], conn["south"])
    reach = {"north": box((-3, 0, -8), (6, 24, 5)), "south": box((-3, 0, 3), (6, 24, 5)),
             "east": box((3, 0, -3), (5, 24, 6)), "west": box((-8, 0, -3), (5, 24, 6))}
    perms = []
    for mask in range(16):
        on = [d for i, d in enumerate(("north", "south", "east", "west")) if mask >> i & 1]
        cond = " && ".join((conn[d] if d in on else "!" + conn[d]) for d in ("north", "south", "east", "west"))
        xs = [-4, 4] + ([-8] if "west" in on else []) + ([8] if "east" in on else [])
        zs = [-4, 4] + ([-8] if "north" in on else []) + ([8] if "south" in on else [])
        perms.append({"condition": cond, "components": {
            "minecraft:collision_box": [box((-4, 0, -4), (8, 24, 8))] + [reach[d] for d in on],
            "minecraft:selection_box": box((min(xs), 0, min(zs)), (max(xs) - min(xs), 16, max(zs) - min(zs))),
        }})
    block("zt:shroomed_brick_wall", {
        "minecraft:geometry": {"identifier": "geometry.zt.shroomed_brick_wall",
                               "bone_visibility": {"post": "!(%s)" % straight, **conn}},
        "minecraft:material_instances": {"*": mat("zt_shroomed_bricks")},
        "minecraft:support": {"shape": "fence"},
        "minecraft:connection_rule": {"accepts_connections_from": "all"},
        "minecraft:loot": loot("shroomed_brick_wall", pickaxe_pool("zt:shroomed_brick_wall")),
        **bricks,
    }, traits={"minecraft:connection": {"enabled_states": ["minecraft:cardinal_connections"]}},
        permutations=perms, group="minecraft:itemGroup.name.walls")
    # the altar: unbreakable (but in creative), its runes glowing; fortress.js handles the totem
    block("zt:shroomed_altar", {
        "minecraft:geometry": "geometry.zt.shroomed_altar",
        "minecraft:material_instances": {"*": mat("zt_shroomed_altar_side"), "up": mat("zt_shroomed_altar_top"),
                                         "down": mat("zt_shroomed_bricks")},
        "minecraft:destructible_by_mining": False,
        "minecraft:destructible_by_explosion": False,
        "minecraft:light_emission": 7,
        "minecraft:map_color": "#3f7fd0",
        "minecraft:loot": loot("shroomed_altar", []),
        "zt:shroomed_altar": {},
    })
    # the spawner: a cage you can see into; while a player is near, crabs come out of it
    block("zt:shroomy_crab_spawner", {
        "minecraft:geometry": "geometry.zt.crab_spawner",
        "minecraft:material_instances": {"*": mat("zt_crab_spawner", "alpha_test"),
                                         "crab": mat("zt_crab_spawner_crab"), "eye": mat("zt_crab_spawner_eye")},
        "minecraft:light_dampening": 0,
        "minecraft:light_emission": 4,
        "minecraft:tags": [PICK],
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 5},
        "minecraft:destructible_by_explosion": {"explosion_resistance": 5},
        "minecraft:loot": loot("shroomy_crab_spawner", []),
        "minecraft:map_color": "#24304a",
        "minecraft:tick": {"interval_range": [10, 10], "looping": True},
        "zt:crab_spawner": {},
    }, category="items")
    dump(BP, "recipes/shroomed_brick_wall.json", {"format_version": "1.20.10", "minecraft:recipe_shaped": {
        "description": {"identifier": "zt:shroomed_brick_wall"}, "tags": ["crafting_table"],
        "pattern": ["###", "###"], "key": {"#": {"item": "zt:shroomed_bricks"}},
        "unlock": [{"item": "zt:shroomed_bricks"}], "result": {"item": "zt:shroomed_brick_wall", "count": 6}}})


# =============================================================================
# Particles
# =============================================================================
def particle(ident, material, components, texture="textures/particle/zt_glow"):
    return {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": ident, "basic_render_parameters": {"material": material, "texture": texture}},
        "components": components}}


def billboard(size, uv_size=32, facing="lookat_xyz"):
    return {"size": [size, size], "facing_camera_mode": facing,
            "uv": {"texture_width": uv_size, "texture_height": uv_size, "uv": [0, 0], "uv_size": [uv_size, uv_size]}}


def fade(c0, c1):
    return {"color": {"gradient": {"0.0": c0, "1.0": c1}, "interpolant": "v.particle_age / v.particle_lifetime"}}


def particles():
    shrink = "0.%s * (1 - v.particle_age / v.particle_lifetime)"
    P = {}
    # the red ring on the floor where one of Crabulon's mushrooms will land (variable.size: its radius)
    P["warning_ring"] = particle("zt:warning_ring", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.45},
        "minecraft:particle_appearance_billboard": {
            "size": ["v.size", "v.size"], "facing_camera_mode": "emitter_transform_xz",
            "uv": {"texture_width": 64, "texture_height": 64, "uv": [0, 0], "uv_size": [64, 64]}},
        "minecraft:particle_appearance_tinting": {"color": {"gradient": {
            "0.0": [1, 0.2, 0.15, 0.4], "0.3": [1, 0.25, 0.2, 0.95], "1.0": [1, 0.2, 0.15, 0.6]},
            "interpolant": "v.particle_age / v.particle_lifetime"}},
    }, texture="textures/particle/zt_warning_ring")
    # the ring of a shockwave running out over the floor (variable.size: how far it runs)
    P["shock_ring"] = particle("zt:shock_ring", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.8},
        "minecraft:particle_appearance_billboard": {
            "size": ["v.size * v.particle_age / v.particle_lifetime", "v.size * v.particle_age / v.particle_lifetime"],
            "facing_camera_mode": "emitter_transform_xz",
            "uv": {"texture_width": 64, "texture_height": 64, "uv": [0, 0], "uv_size": [64, 64]}},
        "minecraft:particle_appearance_tinting": fade([0.6, 0.95, 1.0, 1.0], [0.2, 0.5, 1.0, 0.0]),
    }, texture="textures/particle/zt_shock_ring")
    # the Crab Totem's blue flash
    P["totem_flash"] = particle("zt:totem_flash", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 60},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.4, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.6 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "6 + v.particle_random_2 * 8",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.5},
        "minecraft:particle_appearance_billboard": billboard(shrink % "6"),
        "minecraft:particle_appearance_tinting": fade([0.8, 1.0, 1.0, 1.0], [0.1, 0.4, 1.0, 0.0]),
    })
    # dust and spores falling from the roof as Crabulon comes down, and off it when it lands
    P["roof_dust"] = particle("zt:roof_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 30},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [5, 0.5, 5], "direction": [0, -1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1.2 + v.particle_random_1"},
        "minecraft:particle_initial_speed": "1 + v.particle_random_2 * 2",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -6, 0], "linear_drag_coefficient": 0.6},
        "minecraft:particle_appearance_billboard": billboard("0.15 + v.particle_random_3 * 0.15"),
        "minecraft:particle_appearance_tinting": fade([0.45, 0.5, 0.65, 1.0], [0.3, 0.35, 0.5, 0.0]),
    })
    P["slam_dust"] = particle("zt:slam_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 40},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 3, "direction": "outwards", "plane_normal": "y"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.8 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "5 + v.particle_random_2 * 5",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.5, 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": billboard("0.4 + v.particle_random_3 * 0.4"),
        "minecraft:particle_appearance_tinting": fade([0.5, 0.55, 0.7, 0.9], [0.4, 0.45, 0.6, 0.0]),
    })
    # blue flames licking up inside a crab spawner's cage
    P["spawner_flame"] = particle("zt:spawner_flame", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 5},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [0.4, 0.4, 0.4], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.4 + v.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": "0.3 + v.particle_random_2 * 0.3",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.8, 0]},
        "minecraft:particle_appearance_billboard": billboard(shrink % "16"),
        "minecraft:particle_appearance_tinting": fade([0.5, 0.9, 1.0, 1.0], [0.1, 0.3, 0.9, 0.0]),
    })
    for name, data in P.items():
        dump(RP, "particles/%s.particle.json" % name, data)


# =============================================================================
# Registrations: icons, textures, sounds, names
# =============================================================================
ITEM_ICONS = ["zt_shroom_patch", "zt_shroomy_crab_claw", "zt_crab_totem", "zt_spore_scroll", "zt_shroomed_eye"]
BLOCK_TEXTURES = ["zt_shroomed_bricks", "zt_shroomed_altar_side", "zt_shroomed_altar_top", "zt_crab_spawner",
                  "zt_crab_spawner_crab", "zt_crab_spawner_eye"]
BLOCK_SOUNDS = {"zt:shroomed_bricks": "deepslate_bricks", "zt:shroomed_brick_wall": "deepslate_bricks",
                "zt:shroomed_altar": "deepslate_bricks", "zt:shroomy_crab_spawner": "trial_spawner"}
NAMES = {
    "tile.zt:shroomed_bricks.name": "Shroomed Brick",
    "tile.zt:shroomed_brick_wall.name": "Shroomed Brick Wall",
    "tile.zt:shroomed_altar.name": "Shroomed Altar",
    "tile.zt:shroomy_crab_spawner.name": "Shroomy Crab Spawner",
    "entity.zt:shroomy_crab.name": "Shroomy Crab",
    "item.spawn_egg.entity.zt:shroomy_crab.name": "Spawn Shroomy Crab",
    "item.zt:shroom_patch.name": "Shroom Patch",
    "item.zt:shroomy_crab_claw.name": "Shroomy Crab Claw",
    "entity.zt:crabulon.name": "Crabulon",
    "item.spawn_egg.entity.zt:crabulon.name": "Spawn Crabulon",
    "entity.zt:crabulon_corpse.name": "Crabulon",
    "entity.zt:crab_totem_display.name": "Crab Totem",
    "entity.zt:falling_shroom.name": "Falling Shroom",
    "item.zt:crab_totem.name": "Crab Totem",
    "item.zt:spore_scroll.name": "Spore Scroll",
    "item.zt:shroomed_eye.name": "Shroomed Eye",
}


def registrations():
    icons = load(RP, "textures/item_texture.json")
    for k in ITEM_ICONS:
        icons["texture_data"][k] = {"textures": "textures/items/" + k}
    dump(RP, "textures/item_texture.json", icons)
    terrain = load(RP, "textures/terrain_texture.json")
    for k in BLOCK_TEXTURES:
        terrain["texture_data"][k] = {"textures": "textures/blocks/" + k}
    dump(RP, "textures/terrain_texture.json", terrain)
    sounds = load(RP, "blocks.json")
    for k, v in BLOCK_SOUNDS.items():
        sounds[k] = {"sound": v}
    dump(RP, "blocks.json", sounds)
    ent = load(RP, "sounds.json")
    ents = ent["entity_sounds"]["entities"]
    ents["zt:shroomy_crab"] = {"volume": 0.8, "pitch": [1.3, 1.6], "events": {
        "ambient": "mob.armadillo.ambient", "hurt": "mob.armadillo.hurt", "death": "mob.armadillo.death",
        "step": {"sound": "mob.armadillo.step", "volume": 0.2, "pitch": 1.6}}}
    ents["zt:crabulon"] = {"volume": 2.0, "pitch": [0.45, 0.6], "events": {
        "ambient": "mob.ravager.ambient", "hurt": "mob.ravager.hurt", "death": "mob.ravager.death",
        "step": {"sound": "mob.ravager.step", "volume": 0.8, "pitch": 0.6}}}
    dump(RP, "sounds.json", ent)
    # names, in a marked section of each language file (rewritten each run)
    for lang in ("en_US", "en_GB"):
        path = os.path.join(RP, "texts", lang + ".lang")
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        if "## crabulon begin" in lines:
            a, b = lines.index("## crabulon begin"), lines.index("## crabulon end")
            lines = lines[:a] + lines[b + 1:]
        while lines and lines[-1] == "":
            lines.pop()
        lines += ["## crabulon begin"] + ["%s=%s" % kv for kv in NAMES.items()] + ["## crabulon end", ""]
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))


def main():
    crab_items()
    crab()
    crab_client()
    crabulon()
    crabulon_client()
    fortress_blocks()
    particles()
    registrations()
    print("crab data written")


if __name__ == "__main__":
    main()
