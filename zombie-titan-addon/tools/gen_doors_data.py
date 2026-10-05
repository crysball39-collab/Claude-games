"""Writes the Doors content's behaviour and client files.

Behaviour: the Figure (50,000 HP, blind, kills what it touches), Seek, the
two boss bars (the Figure's "how safe are you" meter and Seek's "how much of
the chase is left" bar), Seek's wall eyes and window hands, the hotel door,
the chandelier, the Library's book, paper and lamp, the Figure's lure, the
Door 50 / Door 30 items, the solution paper, the ten shape books, and the
hotel's building blocks. Client: entity files, render controllers, item and
terrain texture registrations.

A Figure or Seek spawned from an egg roams with vanilla AI (the zt:free
group); the ones the Library and the Seek chase spawn are steered by script
(zt:level: no gravity, no collisions, no goals).

    python3 tools/gen_doors_data.py      (after gen_items_data.py, which writes terrain_texture.json)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_art import PLATES  # noqa: E402
from gen_hotel_art import SHAPES  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
FORMAT = "1.21.90"
ITEM_FORMAT = "1.21.90"
BLOCK_FORMAT = "1.26.20"

ENV_CAUSES = ["fall", "fire", "fire_tick", "lava", "drowning", "suffocation", "freezing", "contact", "stalactite",
              "stalagmite", "fly_into_wall", "temperature", "magma", "anvil", "falling_block", "lightning", "wither",
              "magic"]


def dump(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")


def is_family(value, subject="other", operator=None):
    f = {"test": "is_family", "subject": subject, "value": value}
    if operator:
        f["operator"] = operator
    return f


def prop_bool():
    return {"type": "bool", "default": False, "client_sync": True}


def prop_int(lo, hi, default=0):
    return {"type": "int", "range": [lo, hi], "default": default, "client_sync": True}


def facing(props=None):
    """The way a prop faces, in world degrees. Its model is turned to it, whatever its body says."""
    out = {"zt:yaw": prop_int(-180, 180)}
    out.update(props or {})
    return out


INVULNERABLE = {"minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]}}


def interact(text):
    return {"minecraft:interact": {"interactions": [{
        "on_interact": {"filters": is_family("player"), "event": "zt:interacted", "target": "self"},
        "swing": True,
        "interact_text": text,
    }]}}


def prop_entity(ident, families, collision=(0.1, 0.1), properties=None, components=None, groups=None, events=None,
                health=1):
    """A scenery entity: invulnerable, weightless, never pushed, kept when the world saves."""
    comps = {
        "minecraft:type_family": {"family": families + ["zt_doors_prop", "inanimate"]},
        "minecraft:health": {"value": health, "max": health},
        "minecraft:collision_box": {"width": collision[0], "height": collision[1]},
        "minecraft:physics": {"has_gravity": False, "has_collision": False},
        "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
        "minecraft:knockback_resistance": {"value": 1.0},
        "minecraft:fire_immune": {},
        "minecraft:persistent": {},
        "minecraft:nameable": {"allow_name_tag_renaming": False},
        "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "suffocate_time": 0},
    }
    comps.update(INVULNERABLE)
    comps.update(components or {})
    desc = {"identifier": ident, "is_spawnable": False, "is_summonable": True}
    if properties:
        desc["properties"] = properties
    ev = {"zt:interacted": {}}
    ev.update(events or {})
    body = {"description": desc, "components": comps, "events": ev}
    if groups:
        body["component_groups"] = groups
    return {"format_version": FORMAT, "minecraft:entity": body}


# =============================================================================================
# behaviour: the Figure and Seek
# =============================================================================================
def figure():
    triggers = [{"cause": c, "deals_damage": "no"} for c in ENV_CAUSES]
    # its kin and the titans can't hurt it either
    triggers.append({"on_damage": {"filters": {"any_of": [is_family("zt_figure"), is_family("zt_seek")]}},
                     "deals_damage": "no"})
    return {"format_version": FORMAT, "minecraft:entity": {
        "description": {
            "identifier": "zt:figure",
            "is_spawnable": True,
            "is_summonable": True,
            "spawn_category": "monster",
            "properties": {
                "zt:gait": prop_int(0, 2),   # 0 still, 1 walk, 2 run
                "zt:act": prop_int(0, 4),    # 1 listen, 2 roar, 3 kill, 4 stumble
            },
        },
        "component_groups": {
            # in the Library the script walks it along its own paths
            "zt:level": {"minecraft:physics": {"has_gravity": False, "has_collision": False}},
            # from a spawn egg it roams, and the script points it at whatever it heard with a lure
            "zt:free": {
                "minecraft:physics": {},
                "minecraft:movement": {"value": 0.24},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_water": True, "avoid_damage_blocks": True,
                                              "can_open_doors": False, "can_pass_doors": True},
                "minecraft:attack": {"damage": 0},
                "minecraft:behavior.float": {"priority": 0},
                "minecraft:behavior.nearest_attackable_target": {
                    "priority": 1, "must_see": False, "reselect_targets": True, "within_radius": 48, "scan_interval": 2,
                    "entity_types": [{"filters": is_family("zt_figure_lure"), "max_dist": 48, "must_see": False}],
                },
                "minecraft:behavior.melee_attack": {"priority": 2, "speed_multiplier": 1.7, "track_target": True,
                                                    "require_complete_path": False, "reach_multiplier": 1.0},
                "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.6, "interval": 80},
            },
        },
        "components": {
            "minecraft:type_family": {"family": ["figure", "zt_figure", "monster", "mob"]},
            "minecraft:health": {"value": 50000, "max": 50000},
            "minecraft:collision_box": {"width": 0.8, "height": 2.7},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:fire_immune": {},
            "minecraft:persistent": {},
            "minecraft:nameable": {},
            "minecraft:follow_range": {"value": 64, "max": 64},
            "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "suffocate_time": 0},
            "minecraft:ambient_sound_interval": {"value": 7.0, "range": 6.0, "event_name": "ambient"},
            "minecraft:damage_sensor": {"triggers": triggers},
        },
        "events": {
            "minecraft:entity_spawned": {"add": {"component_groups": ["zt:free"]}},
            "zt:as_level": {"add": {"component_groups": ["zt:level"]}},
            "zt:as_free": {"remove": {"component_groups": ["zt:level"]}, "add": {"component_groups": ["zt:free"]}},
        },
    }}


def seek():
    return {"format_version": FORMAT, "minecraft:entity": {
        "description": {
            "identifier": "zt:seek",
            "is_spawnable": True,
            "is_summonable": True,
            "spawn_category": "monster",
            "properties": {"zt:anim": prop_int(0, 3)},  # 0 idle, 1 rise, 2 run, 3 kill
        },
        "component_groups": {
            "zt:level": {"minecraft:physics": {"has_gravity": False, "has_collision": False}},
            "zt:free": {
                "minecraft:physics": {},
                "minecraft:movement": {"value": 0.3},
                "minecraft:movement.basic": {},
                "minecraft:jump.static": {},
                "minecraft:navigation.walk": {"can_path_over_water": True, "avoid_water": True, "can_open_doors": True},
                "minecraft:attack": {"damage": 0},
                "minecraft:behavior.float": {"priority": 0},
                "minecraft:behavior.nearest_attackable_target": {
                    "priority": 1, "must_see": False, "reselect_targets": True, "within_radius": 40,
                    "entity_types": [{"filters": is_family("player"), "max_dist": 40}],
                },
                "minecraft:behavior.melee_attack": {"priority": 2, "speed_multiplier": 1.6, "track_target": True,
                                                    "require_complete_path": False},
                "minecraft:behavior.random_stroll": {"priority": 6, "speed_multiplier": 0.6},
                "minecraft:behavior.look_at_player": {"priority": 7, "look_distance": 16},
            },
        },
        "components": {
            "minecraft:type_family": {"family": ["seek", "zt_seek", "monster", "mob"]},
            "minecraft:health": {"value": 1000, "max": 1000},
            "minecraft:collision_box": {"width": 0.6, "height": 2.2},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:fire_immune": {},
            "minecraft:persistent": {},
            "minecraft:nameable": {},
            "minecraft:follow_range": {"value": 48, "max": 48},
            "minecraft:breathable": {"breathes_air": True, "breathes_water": True, "suffocate_time": 0},
            "minecraft:ambient_sound_interval": {"value": 6.0, "range": 6.0, "event_name": "ambient"},
            # nothing hurts Seek
            "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
        },
        "events": {
            "minecraft:entity_spawned": {"add": {"component_groups": ["zt:free"]}},
            "zt:as_level": {"add": {"component_groups": ["zt:level"]}},
            "zt:as_free": {"remove": {"component_groups": ["zt:level"]}, "add": {"component_groups": ["zt:free"]}},
        },
    }}


def boss_bar(ident, name):
    """An invisible marker that carries a boss bar; its health is the meter the script wants to show."""
    return prop_entity(ident, ["zt_doors_bar"], health=100, components={
        "minecraft:boss": {"name": name, "should_darken_sky": False, "hud_range": 6},
    })


def props():
    out = {}
    out["figure_bar"] = boss_bar("zt:figure_bar", "The Figure")
    out["seek_bar"] = boss_bar("zt:seek_bar", "Seek")
    out["figure_lure"] = prop_entity("zt:figure_lure", ["zt_figure_lure"])
    out["hotel_door"] = prop_entity(
        "zt:hotel_door", ["zt_hotel_door"],
        properties=facing({"zt:open": prop_bool(), "zt:locked": prop_bool(), "zt:guided": prop_bool(),
                           "zt:plate": prop_int(0, len(PLATES) - 1)}),
        # a locked door is something you can tap, to work its padlock
        groups={"zt:lockable": dict({"minecraft:collision_box": {"width": 1.6, "height": 3.0}},
                                    **interact("action.interact.zt_padlock"))},
        events={"zt:lock": {"add": {"component_groups": ["zt:lockable"]}},
                "zt:unlock": {"remove": {"component_groups": ["zt:lockable"]}}})
    out["library_book"] = prop_entity("zt:library_book", ["zt_library_book"], collision=(0.45, 0.65), properties=facing(),
                                      components=interact("action.interact.zt_take_book"))
    out["library_paper"] = prop_entity("zt:library_paper", ["zt_library_paper"], collision=(0.7, 0.2), properties=facing(),
                                       components=interact("action.interact.zt_take_paper"))
    out["library_lamp"] = prop_entity("zt:library_lamp", ["zt_library_lamp"], properties=facing({"zt:fallen": prop_bool()}))
    out["chandelier"] = prop_entity("zt:chandelier", ["zt_chandelier"], properties={"zt:state": prop_int(0, 2)})
    out["seek_hand"] = prop_entity("zt:seek_hand", ["zt_seek_hand"], properties=facing({"zt:anim": prop_int(0, 2)}))
    out["seek_eye"] = prop_entity(
        "zt:seek_eye", ["zt_seek_eye"],
        properties=facing({"zt:pair": prop_bool(),
                           "zt:size": {"type": "float", "range": [0.4, 2.0], "default": 1.0, "client_sync": True}}),
        components={
            # the eyes follow you around the room
            "minecraft:movement": {"value": 0.0},
            "minecraft:body_rotation_blocked": {},
            "minecraft:behavior.look_at_player": {"priority": 0, "look_distance": 24, "probability": 1.0,
                                                  "look_time": [20, 40], "angle_of_view_horizontal": 360,
                                                  "angle_of_view_vertical": 360},
        })
    return out


# =============================================================================================
# items and blocks
# =============================================================================================
def usable_item(ident, icon, category="items", rarity="common", cooldown=0.5, glint=False):
    comps = {
        "minecraft:icon": icon,
        "minecraft:display_name": {"value": "item.%s.name" % ident},
        "minecraft:max_stack_size": 1,
        "minecraft:can_destroy_in_creative": False,
        "minecraft:rarity": rarity,
        "minecraft:use_modifiers": {"use_duration": 0.25, "movement_modifier": 1.0},
        "minecraft:cooldown": {"category": ident.replace(":", "_"), "duration": cooldown, "type": "use"},
    }
    if glint:
        comps["minecraft:glint"] = True
    return {"format_version": ITEM_FORMAT, "minecraft:item": {
        "description": {"identifier": ident, "menu_category": {"category": category}},
        "components": comps,
    }}


BLOCKS = {
    # id: (side texture, top/bottom texture, sound, map colour)
    "hotel_wallpaper": ("zt_hotel_wallpaper", "zt_hotel_wallpaper", "wood", "#541a1e"),
    "hotel_wallpaper_green": ("zt_hotel_wallpaper_green", "zt_hotel_wallpaper_green", "wood", "#1e3828"),
    "hotel_wainscot": ("zt_hotel_wainscot", "zt_hotel_wood", "wood", "#46220c"),
    "hotel_floor": ("zt_hotel_floor", "zt_hotel_floor", "wood", "#5c2e1a"),
    "hotel_trim": ("zt_hotel_trim", "zt_hotel_wood", "wood", "#3e2012"),
    "hotel_ceiling": ("zt_hotel_ceiling", "zt_hotel_ceiling", "stone", "#362e28"),
    "library_shelf": ("zt_library_shelf", "zt_hotel_wood", "wood", "#3a1c0e"),
}


def hotel_block(name):
    side, top, _, color = BLOCKS[name]
    inst = {"*": {"texture": side, "render_method": "opaque"}}
    if top != side:
        inst["up"] = {"texture": top, "render_method": "opaque"}
        inst["down"] = {"texture": top, "render_method": "opaque"}
    return {"format_version": BLOCK_FORMAT, "minecraft:block": {
        "description": {"identifier": "zt:" + name, "menu_category": {"category": "construction"}},
        "components": {
            "minecraft:geometry": {"identifier": "minecraft:geometry.full_block"},
            "minecraft:material_instances": inst,
            "minecraft:destructible_by_mining": {"seconds_to_destroy": 1.5},
            "minecraft:destructible_by_explosion": {"explosion_resistance": 6},
            "minecraft:tags": ["minecraft:is_axe_item_destructible"],
            "minecraft:map_color": color,
        },
    }}


# =============================================================================================
# client files
# =============================================================================================
def client(ident, geometry, texture, material="entity_emissive_alpha", animations=None, animate=None, rc=None,
           egg=None, scale=None, extra_textures=None, extra_geometry=None, extra_materials=None):
    scripts = {}
    if scale:
        scripts["scale"] = scale
    if animate:
        scripts["animate"] = animate
    desc = {
        "identifier": ident,
        "materials": dict({"default": material}, **(extra_materials or {})),
        "textures": dict({"default": texture}, **(extra_textures or {})),
        "geometry": dict({"default": geometry}, **(extra_geometry or {})),
        "render_controllers": rc or ["controller.render.zt.default"],
    }
    if scripts:
        desc["scripts"] = scripts
    if animations:
        desc["animations"] = animations
    if egg:
        desc["spawn_egg"] = {"texture": egg}
    return {"format_version": "1.10.0", "minecraft:client_entity": {"description": desc}}


def clients():
    tex = "textures/entity/doors/"
    out = {}
    out["figure"] = client(
        "zt:figure", "geometry.zt.figure", tex + "figure", egg="zt_figure_egg", scale="0.9",
        animations={"base": "animation.zt.figure.base", "idle": "animation.zt.figure.idle",
                    "walk": "animation.zt.figure.walk", "run": "animation.zt.figure.run",
                    "listen": "animation.zt.figure.listen", "roar": "animation.zt.figure.roar",
                    "kill": "animation.zt.figure.kill", "stumble": "animation.zt.figure.stumble",
                    "gait": "controller.animation.zt.figure.gait", "act": "controller.animation.zt.figure.act"},
        animate=["base", "gait", "act"])
    out["seek"] = client(
        "zt:seek", "geometry.zt.seek", tex + "seek", egg="zt_seek_egg", extra_materials={"cutout": "entity_alphatest"},
        animations={"base": "animation.zt.seek.base", "idle": "animation.zt.seek.idle", "rise": "animation.zt.seek.rise",
                    "run": "animation.zt.seek.run", "kill": "animation.zt.seek.kill",
                    "main": "controller.animation.zt.seek.main"},
        animate=["base", "main"], rc=["controller.render.zt.seek"])
    out["seek_eye"] = client(
        "zt:seek_eye", "geometry.zt.seek_eye", tex + "seek_eye", material="entity_alphatest",
        scale="q.property('zt:size')", animations={"look": "animation.zt.seek_eye.look", "face": "animation.zt.prop.face"},
        animate=["face", "look"],
        rc=["controller.render.zt.seek_eye"])
    out["seek_hand"] = client(
        "zt:seek_hand", "geometry.zt.seek_hand", tex + "seek_hand",
        animations={"base": "animation.zt.hand.base", "burst": "animation.zt.hand.burst",
                    "grope": "animation.zt.hand.grope", "grab": "animation.zt.hand.grab",
                    "main": "controller.animation.zt.hand", "face": "animation.zt.prop.face"},
        animate=["face", "base", "main"])
    plates = {"plate_%s" % ("blank" if n is None else n): tex + "plates/plate_%s" % ("blank" if n is None else n)
              for n in PLATES}
    out["hotel_door"] = client(
        "zt:hotel_door", "geometry.zt.hotel_door", tex + "hotel_door", material="entity_alphatest",
        extra_textures=plates, extra_geometry={"plate": "geometry.zt.hotel_door_plate"},
        animations={"open": "animation.zt.door.open", "close": "animation.zt.door.close",
                    "main": "controller.animation.zt.door", "face": "animation.zt.prop.face"},
        animate=["face", "main"], rc=["controller.render.zt.hotel_door", "controller.render.zt.hotel_door_plate"])
    out["chandelier"] = client(
        "zt:chandelier", "geometry.zt.chandelier", tex + "chandelier",
        animations={"hang": "animation.zt.chandelier.hang", "fall": "animation.zt.chandelier.fall",
                    "fallen": "animation.zt.chandelier.fallen", "main": "controller.animation.zt.chandelier"},
        animate=["main"])
    out["library_book"] = client(
        "zt:library_book", "geometry.zt.library_book", tex + "library_book",
        animations={"idle": "animation.zt.library_book.idle", "face": "animation.zt.prop.face"},
        animate=["face", "idle"])
    out["library_paper"] = client("zt:library_paper", "geometry.zt.library_paper", tex + "library_paper",
                                  animations={"face": "animation.zt.prop.face"}, animate=["face"])
    out["library_lamp"] = client(
        "zt:library_lamp", "geometry.zt.library_lamp", tex + "library_lamp",
        animations={"fall": "animation.zt.library_lamp.fall", "main": "controller.animation.zt.library_lamp",
                    "face": "animation.zt.prop.face"},
        animate=["face", "main"])
    for name in ("figure_bar", "seek_bar", "figure_lure"):
        out[name] = client("zt:" + name, "geometry.zt.invisible", tex + "invisible", material="entity_alphatest")
    return out


def render_controllers(existing):
    rc = existing["render_controllers"]
    rc["controller.render.zt.default"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
    }
    rc["controller.render.zt.seek"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}, {"puddle": "Material.cutout"}],
        "textures": ["Texture.default"],
    }
    rc["controller.render.zt.seek_eye"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        "part_visibility": [{"*": True}, {"eye2": "q.property('zt:pair')"}, {"pupil2": "q.property('zt:pair')"}],
    }
    # the Guiding Light: a pulsing blue glow on the door to take
    guided = "q.property('zt:guided')"
    glow = {"r": 0.35, "g": 0.72, "b": 1.0, "a": "%s ? 0.28 + math.sin(q.life_time * 240.0) * 0.12 : 0.0" % guided}
    rc["controller.render.zt.hotel_door"] = {
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        "part_visibility": [{"*": True}, {"padlock": "q.property('zt:locked')"}],
        "overlay_color": glow,
    }
    names = ["Texture.plate_%s" % ("blank" if n is None else n) for n in PLATES]
    rc["controller.render.zt.hotel_door_plate"] = {
        "arrays": {"textures": {"Array.plates": names}},
        "geometry": "Geometry.plate",
        "materials": [{"*": "Material.default"}],
        "textures": ["Array.plates[q.property('zt:plate')]"],
        "overlay_color": glow,
    }
    return existing


def main():
    dump(BP, "entities/figure.json", figure())
    dump(BP, "entities/seek.json", seek())
    for name, data in props().items():
        dump(BP, "entities/%s.json" % name, data)
    for name, data in clients().items():
        dump(RP, "entity/%s.entity.json" % name, data)

    dump(BP, "items/door_50.json", usable_item("zt:door_50", "zt_door_50", rarity="epic", cooldown=3.0))
    dump(BP, "items/door_30.json", usable_item("zt:door_30", "zt_door_30", rarity="epic", cooldown=3.0))
    dump(BP, "items/solution_paper.json", usable_item("zt:solution_paper", "zt_solution_paper", category="none"))
    for shape in SHAPES:
        dump(BP, "items/book_%s.json" % shape, usable_item("zt:book_" + shape, "zt_book_" + shape, category="none",
                                                           rarity="uncommon"))
    for name in BLOCKS:
        dump(BP, "blocks/%s.json" % name, hotel_block(name))

    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for icon in ["zt_door_50", "zt_door_30", "zt_figure_egg", "zt_seek_egg", "zt_solution_paper"] + [
            "zt_book_" + s for s in SHAPES]:
        icons["texture_data"][icon] = {"textures": "textures/items/" + icon}
    dump(RP, "textures/item_texture.json", icons)

    path = os.path.join(RP, "textures", "terrain_texture.json")
    with open(path) as f:
        terrain = json.load(f)
    for side, top, _, _ in BLOCKS.values():
        for t in (side, top):
            terrain["texture_data"][t] = {"textures": "textures/blocks/" + t}
    dump(RP, "textures/terrain_texture.json", terrain)

    path = os.path.join(RP, "blocks.json")
    with open(path) as f:
        blocks = json.load(f)
    for name, (_, _, sound, _) in BLOCKS.items():
        blocks["zt:" + name] = {"sound": sound}
    dump(RP, "blocks.json", blocks)

    path = os.path.join(RP, "render_controllers", "zt.render_controllers.json")
    with open(path) as f:
        existing = json.load(f)
    dump(RP, "render_controllers/zt.render_controllers.json", render_controllers(existing))
    print("doors data written")


if __name__ == "__main__":
    main()
