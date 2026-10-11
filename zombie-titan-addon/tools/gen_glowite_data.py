"""Writes the data of the Glowite update (gen_glowite_art.py draws its art):

  Glowite      a blue glowing ore below y -30, rarer than ancient debris. It drops Glowing
               Particles (glowite.js, by the pickaxe used: diamond or better, Fortune, Silk
               Touch); 4 of them and 4 diamonds make a Raw Glowite Ingot, which smelts into a
               Glowite Ingot in a blast furnace only (in a plain furnace it blows up). Ingots
               upgrade netherite gear into Glowite gear at a crafting table; raw and plain
               Glowite blocks store them.
  Glowshroom   the blocks of the Glowshroom Biome (glowshroom.js builds its caverns): maroon
               dirt, spore grass and its plants, spore mushrooms, the striped Glowshroom logs
               and their Mushed Spore Cap, Glowshroom planks with stairs, slab, fence, fence
               gate, door, trapdoor, button and pressure plate (the planks count as planks, so
               they make sticks, crafting tables and wooden tools).
  Spores       spore seeds, the four-stage spore crop and its Shroom Berries.
  Mobs         the Shroom Zombie and Shroom Skeleton, and the glowing spore bullets they fire
               (and the friendly ones Shroomy fires: shroom.js).

Blocks use their own geometry (models/blocks/glowshroom.geo.json) and custom components that
glowshroom.js registers: zt:spore_grass, zt:spore_crop, zt:slab, zt:door, zt:trapdoor,
zt:fence_gate, zt:button, zt:pressure_plate, zt:glowshroom_heart (hoes and bone meal are
handled when a player uses them, so the soil stays an ordinary block to build on).

    python3 tools/gen_glowite_data.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

ITEM_FORMAT = "1.21.90"
ENTITY_FORMAT = "1.21.90"
BLOCK_FORMAT = "1.26.20"   # minecraft:tags and the connection trait
DOOR_FORMAT = "1.26.40"    # the minecraft:multi_block trait leaves experiments in 1.26.40

INGOT = "zt:glowite_ingot"
TOOL_DURABILITY = 2800           # netherite: 2031
DIG_SPEED = 10                   # netherite: 9
# name: (extra damage, enchant slot, item tags, digger block tag or None, creative group)
TOOLS = {
    "sword": (9, "sword", ["minecraft:is_sword"], None, "sword"),
    "pickaxe": (7, "pickaxe", ["minecraft:is_pickaxe", "minecraft:digger"], "minecraft:is_pickaxe_item_destructible", "pickaxe"),
    "axe": (8, "axe", ["minecraft:is_axe", "minecraft:digger"], "minecraft:is_axe_item_destructible", "axe"),
    "shovel": (6, "shovel", ["minecraft:is_shovel", "minecraft:digger"], "minecraft:is_shovel_item_destructible", "shovel"),
    "hoe": (6, "hoe", ["minecraft:is_hoe", "minecraft:digger"], "minecraft:is_hoe_item_destructible", "hoe"),
}
# name: (equipment slot, enchant slot, protection, durability, attachable geometry, layer, parent_setup variable)
# (netherite: protection 3/8/6/3, durability 407/592/555/481; toughness and knockback resistance
# are glowite.js's: Bedrock armor items have neither)
ARMOR = {
    "helmet": ("slot.armor.head", "armor_head", 4, 500, "helmet", 1, "helmet_layer_visible"),
    "chestplate": ("slot.armor.chest", "armor_torso", 9, 730, "chestplate", 1, "chest_layer_visible"),
    "leggings": ("slot.armor.legs", "armor_legs", 6, 680, "leggings", 2, "leg_layer_visible"),
    "boots": ("slot.armor.feet", "armor_feet", 3, 590, "boots", 1, "boot_layer_visible"),
}

PLANKS = "zt:glowshroom_planks"
DIRS = {"north": 0, "west": 90, "south": 180, "east": 270}
FACES = ("north", "south", "east", "west", "up", "down")


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def load(root, rel):
    with open(os.path.join(root, rel)) as f:
        return json.load(f)


# =============================================================================
# Glowite: materials, tools, armor
# =============================================================================
def repairable(ident):
    return {"repair_items": [
        {"items": [INGOT], "repair_amount": "query.max_durability * 0.25"},
        {"items": [ident], "repair_amount": "context.other->query.remaining_durability + 0.05 * context.other->query.max_durability"},
    ]}


def item(ident, components, category="items", group=None):
    desc = {"identifier": ident, "menu_category": {"category": category}}
    if group:
        desc["menu_category"]["group"] = group
    return {"format_version": ITEM_FORMAT, "minecraft:item": {"description": desc, "components": components}}


def name_key(ident):
    return {"value": "item.%s.name" % ident}


def tool_item(name):
    damage, slot, tags, dig_tag, group = TOOLS[name]
    ident = "zt:glowite_" + name
    c = {
        "minecraft:icon": "zt_glowite_" + name,
        "minecraft:display_name": name_key(ident),
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
    return item(ident, c, "equipment", "minecraft:itemGroup.name." + group)


def armor_item(name):
    slot, eslot, protection, durability, *_ = ARMOR[name]
    ident = "zt:glowite_" + name
    return item(ident, {
        "minecraft:icon": "zt_glowite_" + name,
        "minecraft:display_name": name_key(ident),
        "minecraft:max_stack_size": 1,
        "minecraft:wearable": {"slot": slot, "protection": protection},
        "minecraft:durability": {"max_durability": durability},
        "minecraft:enchantable": {"slot": eslot, "value": 15},
        "minecraft:repairable": repairable(ident),
        "minecraft:tags": {"tags": ["minecraft:is_armor", "minecraft:netherite_tier"]},
        "minecraft:fire_resistant": {"value": True},
        "minecraft:rarity": "rare",
    }, "equipment", "minecraft:itemGroup.name." + name)


def attachables(name):
    """Two attachables per piece, like vanilla armor: one for mobs and armor stands, one fitted to the player."""
    _, _, _, _, geo, layer, var = ARMOR[name]
    ident = "zt:glowite_" + name
    textures = {"default": "textures/models/armor/zt_glowite_%d" % layer, "enchanted": "textures/misc/enchanted_actor_glint"}
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


def shaped(ident, pattern, key, result, count=1, unlock=None, group=None):
    r = {"description": {"identifier": ident}, "tags": ["crafting_table"], "pattern": pattern, "key": key,
         "unlock": [{"item": unlock}] if unlock else [{"item": next(iter(key.values()))["item"]}],
         "result": {"item": result, "count": count}}
    if group:
        r["group"] = group
    return {"format_version": "1.20.10", "minecraft:recipe_shaped": r}


def shapeless(ident, ingredients, result, count=1, unlock=None):
    return {"format_version": "1.20.10", "minecraft:recipe_shapeless": {
        "description": {"identifier": ident},
        "tags": ["crafting_table"],
        "ingredients": ingredients,
        "unlock": [{"item": unlock or ingredients[0]["item"]}],
        "result": {"item": result, "count": count},
    }}


def furnace(ident, tags, inp, outp):
    return {"format_version": "1.20.10", "minecraft:recipe_furnace": {
        "description": {"identifier": ident},
        "unlock": [{"item": inp}],
        "tags": tags,
        "input": inp,
        "output": outp,
    }}


def glowite_items():
    dump(BP, "items/glowing_particles.json", item("zt:glowing_particles", {
        "minecraft:icon": "zt_glowing_particles",
        "minecraft:display_name": name_key("zt:glowing_particles"),
        "minecraft:max_stack_size": 64,
        "minecraft:rarity": "uncommon",
        "minecraft:glint": True,
    }))
    dump(BP, "items/raw_glowite.json", item("zt:raw_glowite", {
        "minecraft:icon": "zt_raw_glowite",
        "minecraft:display_name": name_key("zt:raw_glowite"),
        "minecraft:max_stack_size": 64,
        "minecraft:rarity": "rare",
        "minecraft:fire_resistant": {"value": True},
    }))
    dump(BP, "items/glowite_ingot.json", item(INGOT, {
        "minecraft:icon": "zt_glowite_ingot",
        "minecraft:display_name": name_key(INGOT),
        "minecraft:max_stack_size": 64,
        "minecraft:rarity": "rare",
        "minecraft:fire_resistant": {"value": True},
    }))
    for name in TOOLS:
        dump(BP, "items/glowite_%s.json" % name, tool_item(name))
    for name in ARMOR:
        dump(BP, "items/glowite_%s.json" % name, armor_item(name))
        generic, player = attachables(name)
        dump(RP, "attachables/glowite_%s.json" % name, generic)
        dump(RP, "attachables/glowite_%s.player.json" % name, player)

    # 4 Glowing Particles and 4 diamonds make a Raw Glowite Ingot (as netherite: 4 scrap, 4 gold)
    dump(BP, "recipes/raw_glowite.json", shapeless("zt:raw_glowite",
        [{"item": "zt:glowing_particles", "count": 4}, {"item": "minecraft:diamond", "count": 4}], "zt:raw_glowite",
        unlock="zt:glowing_particles"))
    # a blast furnace smelts it; a plain furnace takes it too, and glowite.js blows that furnace up
    # (if it ever finished, all that would be left is a pinch of particles)
    dump(BP, "recipes/glowite_ingot_blasting.json", furnace("zt:glowite_ingot_blasting", ["blast_furnace"], "zt:raw_glowite", INGOT))
    dump(BP, "recipes/raw_glowite_furnace.json", furnace("zt:raw_glowite_furnace", ["furnace"], "zt:raw_glowite", "zt:glowing_particles"))
    # storage blocks
    for block_id, unit in (("zt:raw_glowite_block", "zt:raw_glowite"), ("zt:glowite_block", INGOT)):
        short = block_id.split(":")[1]
        dump(BP, "recipes/%s.json" % short, shaped(block_id, ["###", "###", "###"], {"#": {"item": unit}}, block_id))
        dump(BP, "recipes/%s_from_block.json" % unit.split(":")[1], shapeless(unit + "_from_block", [{"item": block_id}], unit, 9))
    # netherite gear and a Glowite Ingot make the Glowite piece (the smithing table only takes
    # netherite ingots as its upgrade material, so it's done at a crafting table)
    for name in list(TOOLS) + list(ARMOR):
        ident = "zt:glowite_" + name
        dump(BP, "recipes/glowite_%s.json" % name, shapeless(ident,
            [{"item": "minecraft:netherite_" + name}, {"item": INGOT}], ident, unlock=INGOT))


# =============================================================================
# Blocks
# =============================================================================
def mat(texture, method="opaque", **extra):
    m = {"texture": texture, "render_method": method}
    m.update(extra)
    return m


def full(texture, method="opaque"):
    return {"minecraft:geometry": "minecraft:geometry.full_block",
            "minecraft:material_instances": {"*": mat(texture, method)}}


def block(ident, components, states=None, traits=None, permutations=None, category="nature", group=None,
          fmt=BLOCK_FORMAT):
    desc = {"identifier": ident, "menu_category": {"category": category}}
    if group:
        desc["menu_category"]["group"] = group
    if states:
        desc["states"] = states
    if traits:
        desc["traits"] = traits
    b = {"description": desc, "components": components}
    if permutations:
        b["permutations"] = permutations
    dump(BP, "blocks/%s.json" % ident.split(":")[1], {"format_version": fmt, "minecraft:block": b})


def loot(name, pools):
    dump(BP, "loot_tables/blocks/%s.json" % name, {"pools": pools})
    return "loot_tables/blocks/%s.json" % name


def entry(name, lo=1, hi=None):
    e = {"type": "item", "name": name, "weight": 1}
    if hi is not None or lo != 1:
        e["functions"] = [{"function": "set_count", "count": {"min": lo, "max": hi if hi is not None else lo}}]
    return e


def diamond_pick_pool(name):
    """Drops `name` when mined with a diamond-tier (or better) pickaxe, like a netherite block."""
    return [{"rolls": 1, "conditions": [{
        "condition": "match_tool",
        "minecraft:match_tool_filter_all": ["minecraft:is_pickaxe"],
        "minecraft:match_tool_filter_any": ["minecraft:diamond_tier", "minecraft:netherite_tier"],
    }], "entries": [entry(name)]}]


def state(n):
    """An int state 0..n-1 (booleans are 0/1)."""
    return {"values": {"min": 0, "max": n - 1}}


def bs(name):
    return "q.block_state('%s')" % name


def rotations():
    """Permutations turning a block to its cardinal direction (the model faces north)."""
    return [{"condition": "%s == '%s'" % (bs("minecraft:cardinal_direction"), d),
             "components": {"minecraft:transformation": {"rotation": [0, r, 0]}}} for d, r in DIRS.items()]


def box(origin, size):
    return {"origin": [round(v, 3) for v in origin], "size": [round(v, 3) for v in size]}


AXE = "minecraft:is_axe_item_destructible"
SHOVEL = "minecraft:is_shovel_item_destructible"
PICK = "minecraft:is_pickaxe_item_destructible"
WOOD_FLAMMABLE = {"catch_chance_modifier": 5, "destroy_chance_modifier": 20}


def glowite_blocks():
    # Glowite Ore: as tough as ancient debris; glowite.js decides the drops
    block("zt:glowite_ore", {
        **full("zt_glowite_ore"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 30},
        "minecraft:destructible_by_explosion": {"explosion_resistance": 1200},
        "minecraft:light_emission": 7,
        "minecraft:map_color": "#2f6fb0",
        "minecraft:tags": [PICK, "minecraft:diamond_tier_destructible"],
        "minecraft:loot": loot("glowite_ore", []),
    }, group="minecraft:itemGroup.name.ore")
    block("zt:raw_glowite_block", {
        **full("zt_raw_glowite_block"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 8},
        "minecraft:destructible_by_explosion": {"explosion_resistance": 600},
        "minecraft:light_emission": 6,
        "minecraft:map_color": "#2a70c0",
        "minecraft:tags": [PICK, "minecraft:diamond_tier_destructible"],
        "minecraft:loot": loot("raw_glowite_block", diamond_pick_pool("zt:raw_glowite_block")),
    }, category="construction")
    block("zt:glowite_block", {
        **full("zt_glowite_block"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 50},
        "minecraft:destructible_by_explosion": {"explosion_resistance": 1200},
        "minecraft:light_emission": 12,
        "minecraft:map_color": "#3aa0f0",
        "minecraft:tags": [PICK, "minecraft:diamond_tier_destructible"],
        "minecraft:loot": loot("glowite_block", diamond_pick_pool("zt:glowite_block")),
    }, category="construction")
    # the hidden heart of a Glowshroom cavern: glowshroom.js finds it, grows the cavern round it
    # and takes it away; it looks (and digs) like the deepslate it sits in
    block("zt:glowshroom_heart", {
        **full("zt_glowshroom_heart"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 3},
        "minecraft:tags": [PICK],
        "minecraft:map_color": "#3a3a42",
        "minecraft:loot": loot("glowshroom_heart", []),
        "minecraft:tick": {"interval_range": [10, 40], "looping": True},
        "zt:glowshroom_heart": {},
    }, category="none")


def glowshroom_ground():
    block("zt:maroon_dirt", {
        **full("zt_maroon_dirt"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.5},
        "minecraft:tags": [SHOVEL, "minecraft:dirt"],
        "minecraft:map_color": "#6e2430",
    })
    block("zt:spore_grass", {
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": {
            "*": mat("zt_spore_grass_side"),
            "up": mat("zt_spore_grass_top"),
            "down": mat("zt_maroon_dirt"),
        },
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.6},
        "minecraft:light_emission": 4,
        "minecraft:tags": [SHOVEL, "minecraft:dirt", "minecraft:grass"],
        "minecraft:map_color": "#2a78d0",
        "minecraft:loot": loot("spore_grass", [{"rolls": 1, "entries": [entry("zt:maroon_dirt")]}]),
        "zt:spore_grass": {},
    })
    on_soil = {"conditions": [{"allowed_faces": ["up"], "block_filter": [
        "zt:spore_grass", "zt:maroon_dirt", "minecraft:grass_block", "minecraft:dirt", "minecraft:moss_block",
        "minecraft:farmland", "minecraft:mycelium", "minecraft:podzol", "minecraft:rooted_dirt"]}]}
    plant = {"minecraft:collision_box": False, "minecraft:light_dampening": 0, "minecraft:replaceable": {},
             "minecraft:destructible_by_mining": {"seconds_to_destroy": 0},
             "minecraft:flammable": {"catch_chance_modifier": 60, "destroy_chance_modifier": 100}}
    block("zt:spore_grass_plant", {
        "minecraft:geometry": "minecraft:geometry.cross",
        "minecraft:material_instances": {"*": mat("zt_spore_grass_plant", "alpha_test", face_dimming=False, ambient_occlusion=0)},
        "minecraft:selection_box": box((-6, 0, -6), (12, 12, 12)),
        "minecraft:light_emission": 5,
        "minecraft:placement_filter": on_soil,
        "minecraft:map_color": "#3aa0f0",
        "minecraft:loot": loot("spore_grass_plant", []),
        **plant,
    }, group="minecraft:itemGroup.name.grass")
    # spore mushrooms: bone meal grows one into a giant spore tree (glowshroom.js)
    block("zt:spore_mushroom", {
        "minecraft:geometry": "minecraft:geometry.cross",
        "minecraft:material_instances": {"*": mat("zt_spore_mushroom", "alpha_test", face_dimming=False, ambient_occlusion=0)},
        "minecraft:selection_box": box((-4, 0, -4), (8, 10, 8)),
        "minecraft:collision_box": False,
        "minecraft:light_dampening": 0,
        "minecraft:light_emission": 7,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0},
        "minecraft:placement_filter": {"conditions": [{"allowed_faces": ["up"]}]},
        "minecraft:flower_pottable": {},
        "minecraft:map_color": "#3b3492",
    }, group="minecraft:itemGroup.name.mushroom")
    # the trunk: a pillar like a log, white and dark white stripes
    block("zt:glowshroom_log", {
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": {"*": mat("zt_glowshroom_log"), "up": mat("zt_glowshroom_log_top"),
                                         "down": mat("zt_glowshroom_log_top")},
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
        "minecraft:tags": [AXE, "minecraft:log", "minecraft:wood"],
        "minecraft:flammable": WOOD_FLAMMABLE,
        "minecraft:map_color": "#e6e6e2",
    }, traits={"minecraft:placement_position": {"enabled_states": ["minecraft:block_face"]}}, permutations=[
        {"condition": "%s == 'north' || %s == 'south'" % (bs("minecraft:block_face"), bs("minecraft:block_face")),
         "components": {"minecraft:transformation": {"rotation": [90, 0, 0]}}},
        {"condition": "%s == 'east' || %s == 'west'" % (bs("minecraft:block_face"), bs("minecraft:block_face")),
         "components": {"minecraft:transformation": {"rotation": [0, 0, 90]}}},
    ], group="minecraft:itemGroup.name.log")
    block("zt:mushed_spore_cap", {
        **full("zt_mushed_spore_cap"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.3},
        "minecraft:light_emission": 10,
        "minecraft:tags": [AXE],
        "minecraft:flammable": WOOD_FLAMMABLE,
        "minecraft:map_color": "#3b3492",
    }, group="minecraft:itemGroup.name.mushroom")


# ---- block models ------------------------------------------------------------------------
def face_uv(origin, size, face):
    """The part of a 16x16 block texture a face covers (as if the texture were projected onto it)."""
    x0, y0, z0 = origin
    w, h, d = size
    x1, y1, z1 = x0 + w, y0 + h, z0 + d
    if face == "north":
        return [8 - x1, 16 - y1], [w, h]
    if face == "south":
        return [x0 + 8, 16 - y1], [w, h]
    if face == "east":
        return [8 - z1, 16 - y1], [d, h]
    if face == "west":
        return [z0 + 8, 16 - y1], [d, h]
    return [x0 + 8, z0 + 8], [w, d]


def cube(origin, size, faces=FACES, uv=None):
    """A cube whose faces show the matching part of the block texture (or a fixed region: uv)."""
    out = {}
    for f in faces:
        if uv and f in uv:
            o, s = uv[f]
        else:
            o, s = face_uv(origin, size, f)
        out[f] = {"uv": [round(v, 3) for v in o], "uv_size": [round(v, 3) for v in s]}
    return {"origin": [round(v, 3) for v in origin], "size": [round(v, 3) for v in size], "uv": out}


def geo(ident, bones):
    return {"description": {"identifier": ident, "texture_width": 16, "texture_height": 16,
                            "visible_bounds_width": 2, "visible_bounds_height": 2.5, "visible_bounds_offset": [0, 0.75, 0]},
            "bones": [{"name": n, "pivot": [0, 0, 0], "cubes": cubes} for n, cubes in bones]}


QUARTERS = {"nw": (-8, -8), "ne": (0, -8), "sw": (-8, 0), "se": (0, 0)}
# which upper quarters a stair shows (it faces north: its high side is the north half)
CORNERS = {
    "none": ("nw", "ne"),
    "outer_left": ("nw",),
    "outer_right": ("ne",),
    "inner_left": ("nw", "ne", "sw"),
    "inner_right": ("nw", "ne", "se"),
}


def models():
    geos = []
    # stairs: a slab and up to three quarter blocks, for both halves (upside-down stairs mirror it)
    bones = [("slab_lo", [cube((-8, 0, -8), (16, 8, 16))]), ("slab_hi", [cube((-8, 8, -8), (16, 8, 16))])]
    for q, (x, z) in QUARTERS.items():
        bones.append(("%s_hi" % q, [cube((x, 8, z), (8, 8, 8))]))
        bones.append(("%s_lo" % q, [cube((x, 0, z), (8, 8, 8))]))
    geos.append(geo("geometry.zt.glowshroom_stairs", bones))
    geos.append(geo("geometry.zt.glowshroom_slab", [("lower", [cube((-8, 0, -8), (16, 8, 16))]),
                                                    ("upper", [cube((-8, 8, -8), (16, 8, 16))])]))
    # fence: a post and two rails each way it connects
    arms = {
        "north": [((-1, 6, -8), (2, 3, 6)), ((-1, 12, -8), (2, 3, 6))],
        "south": [((-1, 6, 2), (2, 3, 6)), ((-1, 12, 2), (2, 3, 6))],
        "east": [((2, 6, -1), (6, 3, 2)), ((2, 12, -1), (6, 3, 2))],
        "west": [((-8, 6, -1), (6, 3, 2)), ((-8, 12, -1), (6, 3, 2))],
    }
    geos.append(geo("geometry.zt.glowshroom_fence", [("post", [cube((-2, 0, -2), (4, 16, 4))])] +
                    [(d, [cube(o, s) for o, s in parts]) for d, parts in arms.items()]))
    # fence gate (spans east-west when it faces north): posts, closed rails, rails swung either way
    gate_closed = [cube((-6, 6, -1), (12, 3, 2)), cube((-6, 12, -1), (12, 3, 2)), cube((-1, 9, -1), (2, 3, 2))]
    swing_n = [cube((-8, 6, -7), (2, 3, 6)), cube((-8, 12, -7), (2, 3, 6)), cube((6, 6, -7), (2, 3, 6)), cube((6, 12, -7), (2, 3, 6))]
    swing_s = [cube((-8, 6, 1), (2, 3, 6)), cube((-8, 12, 1), (2, 3, 6)), cube((6, 6, 1), (2, 3, 6)), cube((6, 12, 1), (2, 3, 6))]
    geos.append(geo("geometry.zt.glowshroom_fence_gate", [
        ("posts", [cube((-8, 5, -1), (2, 11, 2)), cube((6, 5, -1), (2, 11, 2))]),
        ("closed", gate_closed), ("open_n", swing_n), ("open_s", swing_s)]))
    # door: a 3-pixel panel on the side it was placed from; open, it swings against its hinge side
    full_face = {"north": ([0, 0], [16, 16]), "south": ([16, 0], [-16, 16])}
    edge = {f: ([13, 0], [3, 16]) for f in ("east", "west")}
    edge.update({f: ([0, 13], [16, 3]) for f in ("up", "down")})
    side_face = {"east": ([0, 0], [16, 16]), "west": ([16, 0], [-16, 16])}
    side_edge = {f: ([13, 0], [3, 16]) for f in ("north", "south")}
    side_edge.update({f: ([13, 0], [3, 16]) for f in ("up", "down")})
    geos.append(geo("geometry.zt.glowshroom_door", [
        ("closed", [cube((-8, 0, 5), (16, 16, 3), uv={**full_face, **edge})]),
        ("open_l", [cube((-8, 0, -8), (3, 16, 16), uv={**side_face, **side_edge})]),
        ("open_r", [cube((5, 0, -8), (3, 16, 16), uv={**side_face, **side_edge})]),
    ]))
    geos.append(geo("geometry.zt.glowshroom_trapdoor", [
        ("bottom", [cube((-8, 0, -8), (16, 3, 16))]),
        ("top", [cube((-8, 13, -8), (16, 3, 16))]),
        ("open", [cube((-8, 0, 5), (16, 16, 3), uv={"north": ([0, 0], [16, 16]), "south": ([0, 0], [16, 16])})]),
    ]))
    bones = []
    for f, (o, s, op, sp) in BUTTONS.items():
        bones.append(("%s_up" % f, [cube(o, s)]))
        bones.append(("%s_down" % f, [cube(op, sp)]))
    geos.append(geo("geometry.zt.glowshroom_button", bones))
    geos.append(geo("geometry.zt.glowshroom_pressure_plate", [("up", [cube((-7, 0, -7), (14, 1, 14))]),
                                                               ("down", [cube((-7, 0, -7), (14, 0.5, 14))])]))
    # the crop: four planes in a # like vanilla crops
    planes = [cube((-8, 0, -4), (16, 16, 0), faces=("north", "south"), uv={"north": ([0, 0], [16, 16]), "south": ([0, 0], [16, 16])}),
              cube((-8, 0, 4), (16, 16, 0), faces=("north", "south"), uv={"north": ([0, 0], [16, 16]), "south": ([0, 0], [16, 16])}),
              cube((-4, 0, -8), (0, 16, 16), faces=("east", "west"), uv={"east": ([0, 0], [16, 16]), "west": ([0, 0], [16, 16])}),
              cube((4, 0, -8), (0, 16, 16), faces=("east", "west"), uv={"east": ([0, 0], [16, 16]), "west": ([0, 0], [16, 16])})]
    geos.append(geo("geometry.zt.spore_crop", [("crop", planes)]))
    dump(RP, "models/blocks/glowshroom.geo.json", {"format_version": "1.21.0", "minecraft:geometry": geos})


# a button's box by the face it was put on (the block it hangs on is the other way): up, pressed
BUTTONS = {
    "up": ((-3, 0, -2), (6, 2, 4), (-3, 0, -2), (6, 1, 4)),
    "down": ((-3, 14, -2), (6, 2, 4), (-3, 15, -2), (6, 1, 4)),
    "north": ((-3, 6, 6), (6, 4, 2), (-3, 6, 7), (6, 4, 1)),
    "south": ((-3, 6, -8), (6, 4, 2), (-3, 6, -8), (6, 4, 1)),
    "east": ((-8, 6, -3), (2, 4, 6), (-8, 6, -3), (1, 4, 6)),
    "west": ((6, 6, -3), (2, 4, 6), (7, 6, -3), (1, 4, 6)),
}
OPPOSITE = {"up": "down", "down": "up", "north": "south", "south": "north", "east": "west", "west": "east"}


def wood_set():
    planks_mat = {"*": mat("zt_glowshroom_planks")}
    wood = {"minecraft:tags": [AXE, "minecraft:wood"], "minecraft:flammable": WOOD_FLAMMABLE, "minecraft:map_color": "#c8cad6"}
    block(PLANKS, {
        **full("zt_glowshroom_planks"),
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
        **wood,
    }, category="construction", group="minecraft:itemGroup.name.planks")

    # stairs: corners join up like vanilla stairs (the corner state), and they turn upside down
    half = bs("minecraft:vertical_half")
    corner = bs("minecraft:corner")
    vis = {"slab_lo": "%s == 'bottom'" % half, "slab_hi": "%s == 'top'" % half}
    for q in QUARTERS:
        shown = [c for c, qs in CORNERS.items() if q in qs]
        cond = " || ".join("%s == '%s'" % (corner, c) for c in shown)
        vis["%s_hi" % q] = "%s == 'bottom' && (%s)" % (half, cond)
        vis["%s_lo" % q] = "%s == 'top' && (%s)" % (half, cond)
    perms = rotations()
    for h in ("bottom", "top"):
        slab_y, step_y = (0, 8) if h == "bottom" else (8, 0)
        for c, qs in CORNERS.items():
            boxes = [box((-8, slab_y, -8), (16, 8, 16))] + [box((QUARTERS[q][0], step_y, QUARTERS[q][1]), (8, 8, 8)) for q in qs]
            perms.append({"condition": "%s == '%s' && %s == '%s'" % (half, h, corner, c),
                          "components": {"minecraft:collision_box": boxes}})
    block("zt:glowshroom_stairs", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_stairs", "bone_visibility": vis},
        "minecraft:material_instances": planks_mat,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
        "minecraft:support": {"shape": "stair"},
        **wood,
    }, traits={
        "minecraft:placement_direction": {"enabled_states": ["minecraft:corner_and_cardinal_direction"]},
        "minecraft:placement_position": {"enabled_states": ["minecraft:vertical_half"]},
    }, permutations=perms, category="construction", group="minecraft:itemGroup.name.stairs")

    # slab: a second slab put on it makes it a double (zt:slab in glowshroom.js)
    dbl = bs("zt:double")
    block("zt:glowshroom_slab", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_slab", "bone_visibility": {
            "lower": "%s == 'bottom' || %s == 1" % (half, dbl), "upper": "%s == 'top' || %s == 1" % (half, dbl)}},
        "minecraft:material_instances": planks_mat,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
        "minecraft:collision_box": box((-8, 0, -8), (16, 8, 16)),
        "minecraft:selection_box": box((-8, 0, -8), (16, 8, 16)),
        "zt:slab": {},
        **wood,
    }, states={"zt:double": state(2)}, traits={
        "minecraft:placement_position": {"enabled_states": ["minecraft:vertical_half"]},
    }, permutations=[
        {"condition": "%s == 'top' && %s == 0" % (half, dbl), "components": {
            "minecraft:collision_box": box((-8, 8, -8), (16, 8, 16)), "minecraft:selection_box": box((-8, 8, -8), (16, 8, 16))}},
        {"condition": "%s == 1" % dbl, "components": {
            "minecraft:collision_box": True, "minecraft:selection_box": True,
            "minecraft:loot": loot("glowshroom_slab_double", [{"rolls": 1, "entries": [entry("zt:glowshroom_slab", 2)]}])}},
    ], category="construction", group="minecraft:itemGroup.name.slab")

    # fence: joins its neighbours through the connection trait ("only_fences" would only let
    # vanilla fences join it, not its own kind); 1.5 blocks tall, too high to jump
    conn = {d: bs("minecraft:connection_" + d) for d in ("north", "south", "east", "west")}
    reach = {"north": box((-2, 0, -8), (4, 24, 6)), "south": box((-2, 0, 2), (4, 24, 6)),
             "east": box((2, 0, -2), (6, 24, 4)), "west": box((-8, 0, -2), (6, 24, 4))}
    perms = []
    for mask in range(16):
        on = [d for i, d in enumerate(("north", "south", "east", "west")) if mask >> i & 1]
        cond = " && ".join((conn[d] if d in on else "!" + conn[d]) for d in ("north", "south", "east", "west"))
        xs = [-2, 2] + ([-8] if "west" in on else []) + ([8] if "east" in on else [])
        zs = [-2, 2] + ([-8] if "north" in on else []) + ([8] if "south" in on else [])
        perms.append({"condition": cond, "components": {
            "minecraft:collision_box": [box((-2, 0, -2), (4, 24, 4))] + [reach[d] for d in on],
            "minecraft:selection_box": box((min(xs), 0, min(zs)), (max(xs) - min(xs), 16, max(zs) - min(zs))),
        }})
    block("zt:glowshroom_fence", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_fence", "bone_visibility": {d: conn[d] for d in conn}},
        "minecraft:material_instances": planks_mat,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
        "minecraft:support": {"shape": "fence"},
        "minecraft:connection_rule": {"accepts_connections_from": "all"},
        **wood,
    }, traits={"minecraft:connection": {"enabled_states": ["minecraft:cardinal_connections"]}},
        permutations=perms, category="construction", group="minecraft:itemGroup.name.fence")

    # fence gate: opens (away from whoever opens it) and closes with a tap or redstone
    opened = bs("zt:open")
    swing = bs("zt:swing")
    block("zt:glowshroom_fence_gate", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_fence_gate", "bone_visibility": {
            "posts": "1", "closed": "%s == 0" % opened, "open_n": "%s == 1 && %s == 0" % (opened, swing),
            "open_s": "%s == 1 && %s == 1" % (opened, swing)}},
        "minecraft:material_instances": planks_mat,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 2},
        "minecraft:collision_box": box((-8, 0, -1.5), (16, 24, 3)),
        "minecraft:selection_box": box((-8, 0, -1.5), (16, 16, 3)),
        "minecraft:connection_rule": {"accepts_connections_from": "all"},
        "minecraft:redstone_consumer": {"min_power": 1},
        "zt:fence_gate": {},
        **wood,
    }, states={"zt:open": state(2), "zt:swing": state(2)},
        traits={"minecraft:placement_direction": {"enabled_states": ["minecraft:cardinal_direction"]}},
        permutations=rotations() + [{"condition": "%s == 1" % opened, "components": {
            "minecraft:collision_box": False, "minecraft:selection_box": box((-8, 0, -7), (16, 16, 14))}}],
        category="construction", group="minecraft:itemGroup.name.fenceGate")

    # door: two parts (the multi_block trait places and breaks both); opens with a tap or redstone
    hinge = bs("zt:hinge_right")
    part = bs("minecraft:multi_block_part")
    door_boxes = {(0, 0): box((-8, 0, 5), (16, 16, 3)), (0, 1): box((-8, 0, 5), (16, 16, 3)),
                  (1, 0): box((-8, 0, -8), (3, 16, 16)), (1, 1): box((5, 0, -8), (3, 16, 16))}
    perms = rotations()
    for (o, h), b in door_boxes.items():
        perms.append({"condition": "%s == %d && %s == %d" % (opened, o, hinge, h),
                      "components": {"minecraft:collision_box": b, "minecraft:selection_box": b}})
    perms.append({"condition": "%s == 1" % part, "components": {
        "minecraft:material_instances": {"*": mat("zt_glowshroom_door_top", "alpha_test")},
        "minecraft:loot": loot("glowshroom_door_top", [])}})
    block("zt:glowshroom_door", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_door", "bone_visibility": {
            "closed": "%s == 0" % opened, "open_l": "%s == 1 && %s == 0" % (opened, hinge),
            "open_r": "%s == 1 && %s == 1" % (opened, hinge)}},
        "minecraft:material_instances": {"*": mat("zt_glowshroom_door_bottom", "alpha_test")},
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 3},
        "minecraft:collision_box": door_boxes[(0, 0)],
        "minecraft:selection_box": door_boxes[(0, 0)],
        "minecraft:light_dampening": 0,
        "minecraft:redstone_consumer": {"min_power": 1},
        "zt:door": {},
        **wood,
    }, states={"zt:open": state(2), "zt:hinge_right": state(2)}, traits={
        "minecraft:placement_direction": {"enabled_states": ["minecraft:cardinal_direction"]},
        "minecraft:multi_block": {"enabled_states": ["minecraft:multi_block_part"], "parts": 2, "direction": "up"},
    }, permutations=perms, category="construction", group="minecraft:itemGroup.name.door", fmt=DOOR_FORMAT)

    tbox = {(0, "bottom"): box((-8, 0, -8), (16, 3, 16)), (0, "top"): box((-8, 13, -8), (16, 3, 16)),
            (1, "bottom"): box((-8, 0, 5), (16, 16, 3)), (1, "top"): box((-8, 0, 5), (16, 16, 3))}
    perms = rotations()
    for (o, h), b in tbox.items():
        perms.append({"condition": "%s == %d && %s == '%s'" % (opened, o, half, h),
                      "components": {"minecraft:collision_box": b, "minecraft:selection_box": b}})
    block("zt:glowshroom_trapdoor", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_trapdoor", "bone_visibility": {
            "bottom": "%s == 0 && %s == 'bottom'" % (opened, half), "top": "%s == 0 && %s == 'top'" % (opened, half),
            "open": "%s == 1" % opened}},
        "minecraft:material_instances": {"*": mat("zt_glowshroom_trapdoor", "alpha_test")},
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 3},
        "minecraft:collision_box": tbox[(0, "bottom")],
        "minecraft:selection_box": tbox[(0, "bottom")],
        "minecraft:light_dampening": 0,
        "minecraft:redstone_consumer": {"min_power": 1},
        "zt:trapdoor": {},
        **wood,
    }, states={"zt:open": state(2)}, traits={
        "minecraft:placement_direction": {"enabled_states": ["minecraft:cardinal_direction"]},
        "minecraft:placement_position": {"enabled_states": ["minecraft:vertical_half"]},
    }, permutations=perms, category="construction", group="minecraft:itemGroup.name.trapdoor")

    # button: on any face; a tap powers it for a second and a half
    face = bs("minecraft:block_face")
    pressed = bs("zt:pressed")
    vis = {}
    perms = []
    for f, (o, s, _, _) in BUTTONS.items():
        vis["%s_up" % f] = "%s == '%s' && %s == 0" % (face, f, pressed)
        vis["%s_down" % f] = "%s == '%s' && %s == 1" % (face, f, pressed)
        perms.append({"condition": "%s == '%s'" % (face, f), "components": {"minecraft:selection_box": box(o, s)}})
        perms.append({"condition": "%s == '%s' && %s == 1" % (face, f, pressed), "components": {
            "minecraft:redstone_producer": {"power": 15, "strongly_powered_face": OPPOSITE[f]}}})
    perms.append({"condition": "%s == 1" % pressed, "components": {"minecraft:tick": {"interval_range": [30, 30], "looping": False}}})
    block("zt:glowshroom_button", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_button", "bone_visibility": vis},
        "minecraft:material_instances": planks_mat,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.5},
        "minecraft:collision_box": False,
        "minecraft:selection_box": box(*BUTTONS["up"][:2]),
        "minecraft:light_dampening": 0,
        "zt:button": {},
        "minecraft:tags": [AXE, "minecraft:wood"],
        "minecraft:map_color": "#c8cad6",
    }, states={"zt:pressed": state(2)}, traits={"minecraft:placement_position": {"enabled_states": ["minecraft:block_face"]}},
        permutations=perms, category="construction", group="minecraft:itemGroup.name.buttons")

    # pressure plate: whatever stands on it powers it
    block("zt:glowshroom_pressure_plate", {
        "minecraft:geometry": {"identifier": "geometry.zt.glowshroom_pressure_plate", "bone_visibility": {
            "up": "%s == 0" % pressed, "down": "%s == 1" % pressed}},
        "minecraft:material_instances": planks_mat,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.5},
        "minecraft:collision_box": box((-7, 0, -7), (14, 1, 14)),
        "minecraft:selection_box": box((-7, 0, -7), (14, 1, 14)),
        "minecraft:light_dampening": 0,
        "minecraft:placement_filter": {"conditions": [{"allowed_faces": ["up"]}]},
        "zt:pressure_plate": {},
        "minecraft:tags": [AXE, "minecraft:wood"],
        "minecraft:map_color": "#c8cad6",
    }, states={"zt:pressed": state(2)}, permutations=[
        {"condition": "%s == 1" % pressed, "components": {
            "minecraft:redstone_producer": {"power": 15, "strongly_powered_face": "down"},
            "minecraft:tick": {"interval_range": [10, 10], "looping": True}}},
    ], category="construction", group="minecraft:itemGroup.name.pressurePlate")

    # items that stand for blocks: planks and logs count as planks and logs in vanilla recipes
    # (sticks, crafting tables, wooden tools, chests...) and burn; the door has an icon of its own
    for ident, extra in ((PLANKS, {"minecraft:tags": {"tags": ["minecraft:planks"]}, "minecraft:fuel": {"duration": 15}}),
                         ("zt:glowshroom_log", {"minecraft:tags": {"tags": ["minecraft:logs", "minecraft:logs_that_burn"]}, "minecraft:fuel": {"duration": 15}}),
                         ("zt:glowshroom_door", {"minecraft:icon": "zt_glowshroom_door", "minecraft:max_stack_size": 64})):
        short = ident.split(":")[1]
        group = {"zt:glowshroom_planks": "planks", "zt:glowshroom_log": "log", "zt:glowshroom_door": "door"}[ident]
        dump(BP, "items/%s.json" % short, item(ident, {
            "minecraft:block_placer": {"block": ident, "replace_block_item": True},
            "minecraft:display_name": {"value": "tile.%s.name" % ident},
            **extra,
        }, "construction" if ident != "zt:glowshroom_log" else "nature", "minecraft:itemGroup.name." + group))

    # recipes
    P = {"item": PLANKS}
    S = {"item": "minecraft:stick"}
    dump(BP, "recipes/glowshroom_planks.json", shaped(PLANKS, ["#"], {"#": {"item": "zt:glowshroom_log"}}, PLANKS, 4, group="planks"))
    dump(BP, "recipes/glowshroom_stairs.json", shaped("zt:glowshroom_stairs", ["#  ", "## ", "###"], {"#": P}, "zt:glowshroom_stairs", 4, group="wooden_stairs"))
    dump(BP, "recipes/glowshroom_slab.json", shaped("zt:glowshroom_slab", ["###"], {"#": P}, "zt:glowshroom_slab", 6, group="wooden_slab"))
    dump(BP, "recipes/glowshroom_fence.json", shaped("zt:glowshroom_fence", ["W#W", "W#W"], {"#": S, "W": P}, "zt:glowshroom_fence", 3, unlock=PLANKS))
    dump(BP, "recipes/glowshroom_fence_gate.json", shaped("zt:glowshroom_fence_gate", ["#W#", "#W#"], {"#": S, "W": P}, "zt:glowshroom_fence_gate", unlock=PLANKS))
    dump(BP, "recipes/glowshroom_door.json", shaped("zt:glowshroom_door", ["##", "##", "##"], {"#": P}, "zt:glowshroom_door", 3, group="wooden_door"))
    dump(BP, "recipes/glowshroom_trapdoor.json", shaped("zt:glowshroom_trapdoor", ["###", "###"], {"#": P}, "zt:glowshroom_trapdoor", 2, group="wooden_trap_door"))
    dump(BP, "recipes/glowshroom_button.json", shaped("zt:glowshroom_button", ["#"], {"#": P}, "zt:glowshroom_button"))
    dump(BP, "recipes/glowshroom_pressure_plate.json", shaped("zt:glowshroom_pressure_plate", ["##"], {"#": P}, "zt:glowshroom_pressure_plate"))
    dump(BP, "recipes/glowshroom_log_charcoal.json", furnace("zt:glowshroom_log_charcoal", ["furnace"], "zt:glowshroom_log", "minecraft:charcoal"))


def crop():
    """The spore crop: four stages, each a little taller and brighter; ripe, it gives Shroom Berries."""
    growth = bs("zt:growth")
    perms = []
    for s in range(4):
        comps = {"minecraft:material_instances": {"*": mat("zt_spore_crop_%d" % s, "alpha_test", face_dimming=False, ambient_occlusion=0)},
                 "minecraft:selection_box": box((-8, 0, -8), (16, [3, 6, 9, 13][s], 16)),
                 "minecraft:light_emission": [3, 4, 6, 9][s]}
        if s == 3:
            comps["minecraft:loot"] = loot("spore_crop_ripe", [
                {"rolls": 1, "entries": [entry("zt:shroom_berries", 2, 4)]},
                {"rolls": 1, "entries": [entry("zt:spore_seeds", 1, 2)]}])
        perms.append({"condition": "%s == %d" % (growth, s), "components": comps})
    block("zt:spore_crop", {
        "minecraft:geometry": "geometry.zt.spore_crop",
        "minecraft:material_instances": {"*": mat("zt_spore_crop_0", "alpha_test", face_dimming=False, ambient_occlusion=0)},
        "minecraft:collision_box": False,
        "minecraft:selection_box": box((-8, 0, -8), (16, 3, 16)),
        "minecraft:light_dampening": 0,
        "minecraft:light_emission": 3,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": 0},
        "minecraft:placement_filter": {"conditions": [{"allowed_faces": ["up"], "block_filter": [
            "minecraft:farmland", "minecraft:dirt", "zt:maroon_dirt", "zt:spore_grass"]}]},
        "minecraft:loot": loot("spore_crop_young", [{"rolls": 1, "entries": [entry("zt:spore_seeds")]}]),
        "minecraft:tags": ["minecraft:crop"],
        "zt:spore_crop": {},
    }, states={"zt:growth": state(4)}, permutations=perms, category="none")
    dump(BP, "items/spore_seeds.json", item("zt:spore_seeds", {
        "minecraft:icon": "zt_spore_seeds",
        "minecraft:display_name": name_key("zt:spore_seeds"),
        "minecraft:max_stack_size": 64,
        "minecraft:block_placer": {"block": "zt:spore_crop", "use_on": ["minecraft:farmland", "zt:maroon_dirt", "zt:spore_grass"]},
        "minecraft:compostable": {"composting_chance": 30},
    }, "nature", "minecraft:itemGroup.name.seed"))
    # Shroom Berries: shroom.js gives Regeneration II for 5 seconds and Shroomy for 20
    dump(BP, "items/shroom_berries.json", item("zt:shroom_berries", {
        "minecraft:icon": "zt_shroom_berries",
        "minecraft:display_name": name_key("zt:shroom_berries"),
        "minecraft:max_stack_size": 64,
        "minecraft:food": {"nutrition": 4, "saturation_modifier": 0.6, "can_always_eat": True},
        "minecraft:use_animation": "eat",
        "minecraft:use_modifiers": {"use_duration": 1.6, "movement_modifier": 0.35},
        "minecraft:compostable": {"composting_chance": 65},
        "minecraft:rarity": "uncommon",
    }, "items", "minecraft:itemGroup.name.miscFood"))


# =============================================================================
# World generation: the ore, and the hearts the Glowshroom caverns grow from
# =============================================================================
DEEP_STONE = ["minecraft:deepslate", "minecraft:tuff", "minecraft:stone"]
HEART_Y = -36          # glowshroom.js looks for hearts here (at a chunk's corner, or its middle)


def worldgen():
    dump(BP, "features/glowite_ore_feature.json", {"format_version": "1.13.0", "minecraft:ore_feature": {
        "description": {"identifier": "zt:glowite_ore_feature"},
        "count": 3,
        "replace_rules": [{"places_block": "zt:glowite_ore", "may_replace": DEEP_STONE}],
    }})
    # rarer than ancient debris: a small vein in 2 chunks of 5, only below y -30
    dump(BP, "feature_rules/overworld_underground_glowite_ore.json", {"format_version": "1.13.0", "minecraft:feature_rules": {
        "description": {"identifier": "zt:overworld_underground_glowite_ore", "places_feature": "zt:glowite_ore_feature"},
        "conditions": {"placement_pass": "underground_pass", "minecraft:biome_filter": [
            {"test": "has_biome_tag", "operator": "==", "value": "overworld"}]},
        "distribution": {
            "iterations": 1,
            "scatter_chance": {"numerator": 2, "denominator": 5},
            "x": {"distribution": "uniform", "extent": [0, 15]},
            "y": {"distribution": "uniform", "extent": [-63, -30]},
            "z": {"distribution": "uniform", "extent": [0, 15]},
        },
    }})
    dump(BP, "features/glowshroom_heart_feature.json", {"format_version": "1.13.0", "minecraft:single_block_feature": {
        "description": {"identifier": "zt:glowshroom_heart_feature"},
        "places_block": "zt:glowshroom_heart",
        "enforce_placement_rules": False,
        "enforce_survivability_rules": False,
        "may_replace": DEEP_STONE + ["minecraft:air", "minecraft:water", "minecraft:lava", "minecraft:gravel",
                                     "minecraft:dirt", "minecraft:andesite", "minecraft:diorite", "minecraft:granite",
                                     "minecraft:deepslate_coal_ore", "minecraft:deepslate_iron_ore", "minecraft:deepslate_copper_ore",
                                     "minecraft:deepslate_gold_ore", "minecraft:deepslate_redstone_ore", "minecraft:deepslate_lapis_ore",
                                     "minecraft:deepslate_diamond_ore", "minecraft:calcite", "minecraft:smooth_basalt"],
    }})
    # a cavern in about one chunk of forty
    dump(BP, "feature_rules/overworld_glowshroom_heart.json", {"format_version": "1.13.0", "minecraft:feature_rules": {
        "description": {"identifier": "zt:overworld_glowshroom_heart", "places_feature": "zt:glowshroom_heart_feature"},
        "conditions": {"placement_pass": "underground_pass", "minecraft:biome_filter": [
            {"test": "has_biome_tag", "operator": "==", "value": "overworld"}]},
        "distribution": {
            "iterations": 1,
            "scatter_chance": {"numerator": 1, "denominator": 40},
            "x": 0,
            "y": HEART_Y,
            "z": 0,
        },
    }})


# =============================================================================
# The Shroom Zombie, the Shroom Skeleton and the spore bullets
# =============================================================================
TARGETS = {"priority": 2, "must_see": True, "reselect_targets": True, "within_radius": 25, "entity_types": [
    {"filters": {"any_of": [{"test": "is_family", "subject": "other", "value": "player"},
                            {"test": "is_family", "subject": "other", "value": "irongolem"},
                            {"test": "is_family", "subject": "other", "value": "snowgolem"}]}, "max_dist": 35}]}


def mob_common(health, loot_table, families):
    return {
        "minecraft:type_family": {"family": families + ["shroom", "undead", "monster", "mob"]},
        "minecraft:health": {"value": health, "max": health},
        "minecraft:movement": {"value": 0.23},
        "minecraft:collision_box": {"width": 0.6, "height": 1.9},
        "minecraft:physics": {},
        "minecraft:pushable": {"is_pushable": True, "is_pushable_by_piston": True},
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:can_climb": {},
        "minecraft:nameable": {},
        "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "total_supply": 15, "suffocate_time": 0},
        "minecraft:navigation.walk": {"can_path_over_water": True, "can_pass_doors": True, "avoid_water": True, "is_amphibious": True},
        "minecraft:despawn": {"despawn_from_distance": {}},
        "minecraft:experience_reward": {"on_death": "query.last_hit_by_player ? 7 : 0"},
        "minecraft:loot": {"table": loot_table},
        "minecraft:hurt_on_condition": {"damage_conditions": [{"filters": {"test": "in_lava", "subject": "self"},
                                                               "cause": "lava", "damage_per_tick": 4}]},
        "minecraft:behavior.float": {"priority": 0},
        "minecraft:behavior.hurt_by_target": {"priority": 1},
        "minecraft:behavior.nearest_attackable_target": TARGETS,
        "minecraft:behavior.random_stroll": {"priority": 7, "speed_multiplier": 1.0},
        "minecraft:behavior.look_at_player": {"priority": 8, "look_distance": 8},
        "minecraft:behavior.random_look_around": {"priority": 9},
    }


def bullet(ident, damage):
    """A glowing spore bullet: flies straight (no gravity), fades after five seconds."""
    on_hit = {"remove_on_hit": {}}
    if damage:
        on_hit = {"impact_damage": {"damage": damage, "knockback": True, "destroy_on_hit": True}, "remove_on_hit": {}}
    return {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": ident, "is_spawnable": False, "is_summonable": True},
        "component_groups": {"zt:fade": {"minecraft:instant_despawn": {}}},
        "components": {
            "minecraft:type_family": {"family": ["projectile", "spore_bullet"]},
            "minecraft:collision_box": {"width": 0.3, "height": 0.3},
            "minecraft:physics": {},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": True},
            "minecraft:projectile": {
                "on_hit": on_hit,
                "power": 1.3,
                "gravity": 0.0,
                "inertia": 1.0,
                "liquid_inertia": 1.0,
                "anchor": 1,
                "offset": [0, -0.1, 0],
                "uncertainty_base": 4,
                "uncertainty_multiplier": 2,
            },
            "minecraft:timer": {"looping": False, "time": 5, "time_down_event": {"event": "zt:fade"}},
        },
        "events": {"zt:fade": {"add": {"component_groups": ["zt:fade"]}}},
    }}


def mobs():
    zombie = mob_common(24, "loot_tables/entities/shroom_zombie.json", ["zombie", "shroom_zombie"])
    zombie.update({
        "minecraft:attack": {"damage": 4},
        "minecraft:behavior.melee_box_attack": {"priority": 3, "speed_multiplier": 1.0, "track_target": True},
    })
    dump(BP, "entities/shroom_zombie.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:shroom_zombie", "is_spawnable": True, "is_summonable": True, "spawn_category": "monster"},
        "components": zombie, "events": {}}})
    skeleton = mob_common(22, "loot_tables/entities/shroom_skeleton.json", ["skeleton", "shroom_skeleton"])
    skeleton.update({
        "minecraft:movement": {"value": 0.25},
        "minecraft:shooter": {"def": "zt:spore_bullet"},
        "minecraft:equipment": {"table": "loot_tables/entities/shroom_skeleton_gear.json"},
        "minecraft:behavior.ranged_attack": {"priority": 3, "attack_interval": {"min": 1.5, "max": 2.5},
                                             "attack_range": {"min": 0.0, "max": 16.0}},
    })
    dump(BP, "entities/shroom_skeleton.json", {"format_version": ENTITY_FORMAT, "minecraft:entity": {
        "description": {"identifier": "zt:shroom_skeleton", "is_spawnable": True, "is_summonable": True, "spawn_category": "monster"},
        "components": skeleton, "events": {}}})
    dump(BP, "entities/spore_bullet.json", bullet("zt:spore_bullet", 4))
    dump(BP, "entities/shroomy_bullet.json", bullet("zt:shroomy_bullet", 0))

    looting = {"function": "looting_enchant", "count": {"min": 0, "max": 1}}

    def drop(name, lo, hi):
        return {"rolls": 1, "entries": [{"type": "item", "name": name, "weight": 1, "functions": [
            {"function": "set_count", "count": {"min": lo, "max": hi}}, looting]}]}
    dump(BP, "loot_tables/entities/shroom_zombie.json", {"pools": [
        drop("minecraft:rotten_flesh", 0, 2), drop("zt:spore_seeds", 1, 2)]})
    dump(BP, "loot_tables/entities/shroom_skeleton.json", {"pools": [
        drop("minecraft:bone", 0, 2), drop("minecraft:arrow", 0, 2), drop("zt:spore_seeds", 1, 2)]})
    dump(BP, "loot_tables/entities/shroom_skeleton_gear.json", {"pools": [
        {"rolls": 1, "entries": [{"type": "item", "name": "minecraft:bow", "weight": 1}]}]})


HUMANOID_SCRIPTS = {"pre_animation": [
    "variable.tcos0 = (Math.cos(query.modified_distance_moved * 38.17) * query.modified_move_speed / variable.gliding_speed_value) * 57.3;",
    "variable.riding_y_offset_with_respect_to_player = 0.5;",
    "variable.riding_y_offset_on_vehicle_where_other_entites_can_stand = query.is_riding_any_entity_of_type('minecraft:minecart', 'minecraft:boat', 'minecraft:chest_boat') ? -3.0 : 0.0;",
    "variable.riding_y_offset = variable.riding_y_offset_with_respect_to_player + variable.riding_y_offset_on_vehicle_where_other_entites_can_stand;",
]}
HUMANOID_ANIMS = {
    "look_at_target_default": "animation.humanoid.look_at_target.default",
    "look_at_target_gliding": "animation.humanoid.look_at_target.gliding",
    "look_at_target_swimming": "animation.humanoid.look_at_target.swimming",
    "move": "animation.humanoid.move",
    "riding.arms": "animation.humanoid.riding.arms",
    "riding.legs": "animation.humanoid.riding.legs",
    "riding.body": "animation.humanoid.riding.body",
    "holding": "animation.humanoid.holding",
    "brandish_spear": "animation.humanoid.brandish_spear",
    "charging": "animation.humanoid.charging",
    "attack.rotations": "animation.humanoid.attack.rotations",
    "sneaking": "animation.humanoid.sneaking",
    "bob": "animation.humanoid.bob",
    "damage_nearby_mobs": "animation.humanoid.damage_nearby_mobs",
    "bow_and_arrow": "animation.humanoid.bow_and_arrow",
    "swimming": "animation.zombie.swimming",
    "use_item_progress": "animation.humanoid.use_item_progress",
}
HUMANOID_CONTROLLERS = [
    {"look_at_target": "controller.animation.humanoid.look_at_target"},
    {"move": "controller.animation.humanoid.move"},
    {"riding": "controller.animation.humanoid.riding"},
    {"holding": "controller.animation.humanoid.holding"},
    {"brandish_spear": "controller.animation.humanoid.brandish_spear"},
    {"charging": "controller.animation.humanoid.charging"},
    {"attack": "controller.animation.humanoid.attack"},
    {"sneaking": "controller.animation.humanoid.sneaking"},
    {"bob": "controller.animation.humanoid.bob"},
    {"damage_nearby_mobs": "controller.animation.humanoid.damage_nearby_mobs"},
    {"bow_and_arrow": "controller.animation.humanoid.bow_and_arrow"},
    {"swimming": "controller.animation.zombie.swimming"},
    {"use_item_progress": "controller.animation.humanoid.use_item_progress"},
]


def client_mob(ident, tex, geo_id, egg, extra_anims, extra_controllers):
    return {"format_version": "1.8.0", "minecraft:client_entity": {"description": {
        "identifier": ident,
        "materials": {"default": "entity_emissive_alpha"},
        "textures": {"default": "textures/entity/" + tex},
        "geometry": {"default": geo_id},
        "spawn_egg": {"base_color": egg[0], "overlay_color": egg[1]},
        "scripts": HUMANOID_SCRIPTS,
        "animations": {**HUMANOID_ANIMS, **extra_anims},
        "animation_controllers": HUMANOID_CONTROLLERS + extra_controllers,
        "render_controllers": ["controller.render.zt.glowite_default"],
        "enable_attachables": True,
    }}}


def client_files():
    dump(RP, "entity/shroom_zombie.entity.json", client_mob(
        "zt:shroom_zombie", "zt_shroom_zombie", "geometry.zt.shroom_zombie", ("#1f4f6b", "#6fe3ff"),
        {"zombie_attack_bare_hand": "animation.zombie.attack_bare_hand"},
        [{"zombie_attack_bare_hand": "controller.animation.zombie.attack_bare_hand"}]))
    dump(RP, "entity/shroom_skeleton.entity.json", client_mob(
        "zt:shroom_skeleton", "zt_shroom_skeleton", "geometry.zt.shroom_skeleton", ("#c9ccd6", "#3fb6ff"),
        {"skeleton_attack": "animation.skeleton.attack"},
        [{"skeleton_attack": "controller.animation.skeleton.attack"}]))
    for ident in ("zt:spore_bullet", "zt:shroomy_bullet"):
        dump(RP, "entity/%s.entity.json" % ident.split(":")[1], {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
            "identifier": ident,
            "materials": {"default": "entity_emissive_alpha"},
            "textures": {"default": "textures/entity/zt_spore_bullet"},
            "geometry": {"default": "geometry.zt.spore_bullet"},
            "scripts": {"animate": ["controller"]},
            "animations": {"spin": "animation.zt.spore_bullet.spin", "controller": "controller.animation.zt.spore_bullet"},
            "particle_effects": {"trail": "zt:spore_trail"},
            "render_controllers": ["controller.render.zt.glowite_default"],
        }}})
    dump(RP, "animations/glowite.animation.json", {"format_version": "1.10.0", "animations": {
        "animation.zt.spore_bullet.spin": {"loop": True, "bones": {"orb": {"rotation": ["q.life_time * 540", "q.life_time * 360", 0]}}},
    }})
    dump(RP, "animation_controllers/glowite.animation_controllers.json", {"format_version": "1.10.0", "animation_controllers": {
        "controller.animation.zt.spore_bullet": {"initial_state": "default", "states": {"default": {
            "animations": ["spin"], "particle_effects": [{"effect": "trail"}]}}},
    }})
    dump(RP, "render_controllers/glowite.render_controllers.json", {"format_version": "1.8.0", "render_controllers": {
        "controller.render.zt.glowite_default": {"geometry": "Geometry.default", "materials": [{"*": "Material.default"}],
                                                 "textures": ["Texture.default"]},
    }})


def particle(ident, material, components):
    return {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": ident, "basic_render_parameters": {"material": material, "texture": "textures/particle/zt_glow"}},
        "components": components}}


def billboard(size):
    return {"size": [size, size], "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 32, "texture_height": 32, "uv": [0, 0], "uv_size": [32, 32]}}


def fade(c0, c1):
    return {"color": {"gradient": {"0.0": c0, "1.0": c1}, "interpolant": "v.particle_age / v.particle_lifetime"}}


def particles():
    shrink = "0.%s * (1 - v.particle_age / v.particle_lifetime)"
    P = {}
    # behind a flying spore bullet
    P["spore_trail"] = particle("zt:spore_trail", "particles_add", {
        "minecraft:emitter_rate_steady": {"spawn_rate": 24, "max_particles": 40},
        "minecraft:emitter_lifetime_looping": {"active_time": 1},
        "minecraft:emitter_shape_sphere": {"radius": 0.12, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.35},
        "minecraft:particle_initial_speed": 0.2,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": billboard(shrink % "35"),
        "minecraft:particle_appearance_tinting": fade([0.55, 0.95, 1.0, 1.0], [0.1, 0.35, 0.9, 0.0]),
    })
    # a bullet bursting, a spore crop growing, a berry eaten
    P["spore_pop"] = particle("zt:spore_pop", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 12},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.25, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.4 + v.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": "1.5 + v.particle_random_2 * 2",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": billboard(shrink % "3"),
        "minecraft:particle_appearance_tinting": fade([0.7, 1.0, 1.0, 1.0], [0.1, 0.4, 1.0, 0.0]),
    })
    # one of Shroomy's orbiting bullets (drawn every tick where it is)
    P["shroomy_orb"] = particle("zt:shroomy_orb", "particles_add", {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.12},
        "minecraft:particle_appearance_billboard": billboard("0.32"),
        "minecraft:particle_appearance_tinting": fade([0.75, 1.0, 1.0, 1.0], [0.3, 0.7, 1.0, 0.6]),
    })
    # spores drifting in a Glowshroom cavern
    P["spore_dust"] = particle("zt:spore_dust", "particles_blend", {
        "minecraft:emitter_rate_instant": {"num_particles": 6},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_box": {"half_dimensions": [6, 3, 6], "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "3 + v.particle_random_1 * 2"},
        "minecraft:particle_initial_speed": 0.05,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.04, 0], "linear_drag_coefficient": 0.5},
        "minecraft:particle_appearance_billboard": billboard("0.08 + v.particle_random_2 * 0.06"),
        "minecraft:particle_appearance_tinting": {"color": {"gradient": {
            "0.0": [0.4, 0.9, 1.0, 0.0], "0.2": [0.5, 0.95, 1.0, 0.9], "0.8": [0.3, 0.7, 1.0, 0.8], "1.0": [0.2, 0.5, 1.0, 0.0]},
            "interpolant": "v.particle_age / v.particle_lifetime"}},
    })
    for name, data in P.items():
        dump(RP, "particles/%s.particle.json" % name, data)


# =============================================================================
# Registrations: textures, block sounds, entity sounds, names
# =============================================================================
BLOCK_TEXTURES = ["zt_glowite_ore", "zt_raw_glowite_block", "zt_glowite_block", "zt_glowshroom_heart", "zt_maroon_dirt",
                  "zt_spore_grass_top", "zt_spore_grass_side", "zt_spore_grass_plant", "zt_spore_mushroom",
                  "zt_glowshroom_log", "zt_glowshroom_log_top", "zt_mushed_spore_cap", "zt_glowshroom_planks",
                  "zt_glowshroom_door_bottom", "zt_glowshroom_door_top", "zt_glowshroom_trapdoor"] + \
                 ["zt_spore_crop_%d" % s for s in range(4)]
ITEM_ICONS = ["zt_glowing_particles", "zt_raw_glowite", "zt_glowite_ingot", "zt_spore_seeds", "zt_shroom_berries",
              "zt_glowshroom_door"] + ["zt_glowite_" + n for n in list(TOOLS) + list(ARMOR)]
BLOCK_SOUNDS = {
    "zt:glowite_ore": "deepslate", "zt:raw_glowite_block": "stone", "zt:glowite_block": "netherite",
    "zt:glowshroom_heart": "deepslate", "zt:maroon_dirt": "gravel", "zt:spore_grass": "grass",
    "zt:spore_grass_plant": "grass", "zt:spore_mushroom": "fungus", "zt:glowshroom_log": "stem",
    "zt:mushed_spore_cap": "wart_block", "zt:spore_crop": "grass",
    PLANKS: "wood", "zt:glowshroom_stairs": "wood", "zt:glowshroom_slab": "wood", "zt:glowshroom_fence": "wood",
    "zt:glowshroom_fence_gate": "wood", "zt:glowshroom_door": "wood", "zt:glowshroom_trapdoor": "wood",
    "zt:glowshroom_button": "wood", "zt:glowshroom_pressure_plate": "wood",
}
NAMES = {
    "tile.zt:glowite_ore.name": "Glowite Ore",
    "tile.zt:raw_glowite_block.name": "Block of Raw Glowite",
    "tile.zt:glowite_block.name": "Block of Glowite",
    "tile.zt:glowshroom_heart.name": "Deepslate",
    "tile.zt:maroon_dirt.name": "Maroon Dirt",
    "tile.zt:spore_grass.name": "Spore Grass",
    "tile.zt:spore_grass_plant.name": "Spore Grass Plant",
    "tile.zt:spore_mushroom.name": "Spore Mushroom",
    "tile.zt:glowshroom_log.name": "Glowshroom Log",
    "tile.zt:mushed_spore_cap.name": "Mushed Spore Cap",
    "tile.zt:glowshroom_planks.name": "Glowshroom Planks",
    "tile.zt:glowshroom_stairs.name": "Glowshroom Stairs",
    "tile.zt:glowshroom_slab.name": "Glowshroom Slab",
    "tile.zt:glowshroom_fence.name": "Glowshroom Fence",
    "tile.zt:glowshroom_fence_gate.name": "Glowshroom Fence Gate",
    "tile.zt:glowshroom_door.name": "Glowshroom Door",
    "tile.zt:glowshroom_trapdoor.name": "Glowshroom Trapdoor",
    "tile.zt:glowshroom_button.name": "Glowshroom Button",
    "tile.zt:glowshroom_pressure_plate.name": "Glowshroom Pressure Plate",
    "tile.zt:spore_crop.name": "Spore Crop",
    "item.zt:glowing_particles.name": "Glowing Particles",
    "item.zt:raw_glowite.name": "Raw Glowite Ingot",
    "item.zt:glowite_ingot.name": "Glowite Ingot",
    "item.zt:spore_seeds.name": "Spore Seeds",
    "item.zt:shroom_berries.name": "Shroom Berries",
    "entity.zt:shroom_zombie.name": "Shroom Zombie",
    "entity.zt:shroom_skeleton.name": "Shroom Skeleton",
    "entity.zt:spore_bullet.name": "Spore Bullet",
    "entity.zt:shroomy_bullet.name": "Shroomy Bullet",
    "item.spawn_egg.entity.zt:shroom_zombie.name": "Spawn Shroom Zombie",
    "item.spawn_egg.entity.zt:shroom_skeleton.name": "Spawn Shroom Skeleton",
}
for _n in list(TOOLS) + list(ARMOR):
    NAMES["item.zt:glowite_%s.name" % _n] = "Glowite " + _n.capitalize()


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
    ents["zt:shroom_zombie"] = {"volume": 1.0, "pitch": [0.7, 0.9], "events": {
        "ambient": "mob.zombie.say", "hurt": "mob.zombie.hurt", "death": "mob.zombie.death",
        "step": {"sound": "mob.zombie.step", "volume": 0.15, "pitch": 1.0}}}
    ents["zt:shroom_skeleton"] = {"volume": 1.0, "pitch": [0.8, 1.0], "events": {
        "ambient": "mob.skeleton.say", "hurt": "mob.skeleton.hurt", "death": "mob.skeleton.death",
        "step": {"sound": "mob.skeleton.step", "volume": 0.15, "pitch": 1.0}, "shoot": "random.bow"}}
    dump(RP, "sounds.json", ent)
    # names, in a marked section of each language file (rewritten each run)
    for lang in ("en_US", "en_GB"):
        path = os.path.join(RP, "texts", lang + ".lang")
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        if "## glowite begin" in lines:
            a, b = lines.index("## glowite begin"), lines.index("## glowite end")
            lines = lines[:a] + lines[b + 1:]
        while lines and lines[-1] == "":
            lines.pop()
        lines += ["## glowite begin"] + ["%s=%s" % kv for kv in NAMES.items()] + ["## glowite end", ""]
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))


def main():
    glowite_items()
    glowite_blocks()
    glowshroom_ground()
    models()
    wood_set()
    crop()
    worldgen()
    mobs()
    client_files()
    particles()
    registrations()
    print("glowite data written")


if __name__ == "__main__":
    main()
