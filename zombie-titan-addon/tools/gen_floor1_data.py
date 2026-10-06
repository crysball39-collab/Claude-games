"""Writes the Hotel's (Floor 1) behaviour and client files.

Behaviour: the hotel's furniture and fittings (closets to hide in, beds to hide under,
dressers and cabinets with drawers to search, couches, keys, flesh piles), its doors (the
elevator doors, the iron gates of doors 89-100, door 100's grey metal door and wide gate, the
elevator's folding gate), door 100's lever, breaker box, switches and live wire, the
Infirmary's herb, the Courtyard's angel, Jeff's shop (Jeff, El Goblino, Bob and the goods),
Rush and Screech, the breaker switches' boss bar; the items (the Lobby item, keys, lighter,
flashlight, crucifix, skeleton key, herb, breaker switch); and the blocks (lamps that can be
on, off or broken, invisible colliders under the furniture, wallpapers, windows, paintings,
crates, metal shelves, hospital walls and curtains, elevator panels, hazard stripes, exit
signs, and the scrolling walls of the elevator shaft).

Client: entity files and render controllers, item/terrain texture registrations, the shaft
walls' flipbook animations, block sounds.

    python3 tools/gen_floor1_data.py      (after gen_doors_data.py)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_data import (BLOCK_FORMAT, GUIDED_GLOW, boss_bar, client, digit_visibility, door_entity, dump, facing,  # noqa: E402
                            interact, prop_bool, prop_entity, prop_int, swing, usable_item)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")
ITEM_FORMAT = "1.21.90"
TEX = "textures/entity/hotel/"


def box(width, height):
    return {"minecraft:collision_box": {"width": width, "height": height}}


def comps(*parts):
    out = {}
    for p in parts:
        out.update(p)
    return out


# =============================================================================================
# behaviour: entities
# =============================================================================================
def entities():
    E = {}
    # furniture
    E["wardrobe"] = prop_entity("zt:wardrobe", ["zt_hiding_spot"], properties=facing({"zt:open": prop_bool(), "zt:style": prop_int(0, 2)}),
                                components=comps(box(1.1, 2.7), interact("action.interact.zt_hide")))
    E["hotel_bed"] = prop_entity("zt:hotel_bed", ["zt_hiding_spot"], properties=facing({"zt:style": prop_int(0, 1)}),
                                 components=comps(box(1.9, 0.7), interact("action.interact.zt_hide_bed")))
    E["dresser"] = prop_entity("zt:dresser", ["zt_drawers"], properties=facing({"zt:style": prop_int(0, 2), "zt:drawers": prop_int(0, 7)}),
                               components=comps(box(1.2, 1.02), interact("action.interact.zt_search")))
    E["cabinet"] = prop_entity("zt:cabinet", ["zt_drawers"], properties=facing({"zt:drawers": prop_int(0, 7)}),
                               components=comps(box(1.0, 2.0), interact("action.interact.zt_search")))
    E["couch"] = prop_entity("zt:couch", ["zt_furniture"], properties=facing({"zt:style": prop_int(0, 2)}))
    E["room_key"] = prop_entity("zt:room_key", ["zt_key"], properties=facing({"zt:style": prop_int(0, 2)}),
                                components=comps(box(0.5, 0.65), interact("action.interact.zt_take")))
    E["flesh_pile"] = prop_entity("zt:flesh_pile", ["zt_furniture"], properties=facing({"zt:style": prop_int(0, 2)}))
    # doors
    E["elevator_door"] = door_entity("zt:elevator_door")
    E["gate_door"] = door_entity("zt:gate_door", {"zt:number": prop_int(-2, 9999, -1)})
    E["metal_door"] = door_entity("zt:metal_door", {"zt:sign": prop_bool(), "zt:broken": prop_bool(), "zt:bang": prop_bool()})
    E["big_gate"] = door_entity("zt:big_gate", width=4.0, height=4.0)
    E["elevator_gate"] = door_entity("zt:elevator_gate", width=3.0, height=3.0)
    # door 100
    E["wall_lever"] = prop_entity("zt:wall_lever", ["zt_door100"], properties=facing({"zt:on": prop_bool()}),
                                  components=comps(box(0.55, 0.7), interact("action.interact.zt_pull")))
    E["breaker_box"] = prop_entity("zt:breaker_box", ["zt_door100"], properties=facing({
        "zt:open": prop_bool(), "zt:num": prop_int(0, 11), "zt:fill": prop_int(0, 2), "zt:ok": prop_bool(), "zt:slots": prop_int(0, 10)}),
        components=comps(box(0.36, 2.5), interact("action.interact.zt_use")))
    E["breaker_lever"] = prop_entity("zt:breaker_lever", ["zt_door100"], properties=facing({"zt:on": prop_bool(), "zt:n": prop_int(1, 10, 1)}),
                                     components=comps(box(0.3, 0.42), interact("action.interact.zt_flip")))
    E["switch_pickup"] = prop_entity("zt:switch_pickup", ["zt_door100"], properties=facing(),
                                     components=comps(box(0.45, 0.35), interact("action.interact.zt_take")))
    E["live_wire"] = prop_entity("zt:live_wire", ["zt_door100"], properties=facing())
    # the Infirmary, the Courtyard
    E["herb_plant"] = prop_entity("zt:herb_plant", ["zt_furniture"], properties=facing(),
                                  components=comps(box(0.55, 0.8), interact("action.interact.zt_take")))
    E["angel_statue"] = prop_entity("zt:angel_statue", ["zt_furniture"], properties=facing())
    # Jeff's shop
    E["jeff"] = prop_entity("zt:jeff", ["zt_shop"], properties=facing(), components=comps(box(1.2, 2.4), interact("action.interact.zt_shop")))
    E["el_goblino"] = prop_entity("zt:el_goblino", ["zt_shop"], properties=facing(),
                                  components=comps(box(0.7, 1.0), interact("action.interact.zt_shop")))
    E["bob"] = prop_entity("zt:bob", ["zt_shop"], properties=facing(), components=comps(box(0.8, 1.4), interact("action.interact.zt_talk")))
    E["shop_display"] = prop_entity("zt:shop_display", ["zt_shop"], properties=facing(),
                                    components=comps(box(0.9, 0.45), interact("action.interact.zt_shop")))
    # the hotel's creatures: steered by script, nothing touches them
    E["rush"] = prop_entity("zt:rush", ["zt_rush"], properties=facing({"zt:anim": prop_int(0, 1)}))
    E["screech"] = prop_entity("zt:screech", ["zt_screech"], properties=facing({"zt:anim": prop_int(0, 3)}))
    # the switches' meter
    E["switch_bar"] = boss_bar("zt:switch_bar", "Breaker Switches")
    return E


# =============================================================================================
# behaviour: items
# =============================================================================================
def durable(ident, icon, seconds, rarity="uncommon"):
    it = usable_item(ident, icon, category="none", rarity=rarity, cooldown=0.4)
    it["minecraft:item"]["components"]["minecraft:durability"] = {"max_durability": seconds,
                                                                  "damage_chance": {"min": 0, "max": 0}}
    return it


def stack_of(ident, icon, n):
    it = usable_item(ident, icon, category="none", rarity="uncommon", cooldown=0.4)
    it["minecraft:item"]["components"]["minecraft:max_stack_size"] = n
    return it


def items():
    I = {}
    I["doors_floor1"] = usable_item("zt:doors_floor1", "zt_doors_floor1", rarity="epic", cooldown=3.0)
    I["room_key"] = usable_item("zt:room_key", "zt_room_key", category="none", rarity="uncommon")
    I["electrical_key"] = usable_item("zt:electrical_key", "zt_electrical_key", category="none", rarity="uncommon")
    I["lighter"] = durable("zt:lighter", "zt_lighter", 60)
    I["flashlight"] = durable("zt:flashlight", "zt_flashlight", 120, rarity="rare")
    I["skeleton_key"] = durable("zt:skeleton_key", "zt_skeleton_key", 2, rarity="rare")
    I["crucifix"] = usable_item("zt:crucifix", "zt_crucifix", category="none", rarity="epic", glint=True)
    I["herb_of_viridis"] = usable_item("zt:herb_of_viridis", "zt_herb_of_viridis", category="none", rarity="rare")
    I["breaker_switch"] = stack_of("zt:breaker_switch", "zt_breaker_switch", 10)
    return I


ICONS = ["zt_doors_floor1", "zt_room_key", "zt_electrical_key", "zt_lighter", "zt_flashlight", "zt_skeleton_key", "zt_crucifix",
         "zt_herb_of_viridis", "zt_breaker_switch"]


# =============================================================================================
# behaviour: blocks
# =============================================================================================
# full blocks: (side texture, top texture, sound, map colour)
FULL = {
    "hotel_wallpaper_blue": ("zt_hotel_wallpaper_blue", "zt_hotel_wallpaper_blue", "wood", "#1e2a4a"),
    "hotel_wallpaper_torn": ("zt_hotel_wallpaper_torn", "zt_hotel_wallpaper_torn", "wood", "#4a2a24"),
    "hotel_window": ("zt_hotel_window", "zt_hotel_wood", "glass", "#2a2a3a"),
    "wooden_crate": ("zt_wooden_crate", "zt_wooden_crate_top", "wood", "#7a5a32"),
    "hospital_wall": ("zt_hospital_wall", "zt_hospital_wall", "stone", "#c8d4c8"),
    "hospital_floor": ("zt_hospital_floor", "zt_hospital_floor", "stone", "#b8b8b8"),
    "elevator_panel": ("zt_elevator_panel", "zt_elevator_panel", "metal", "#3a2a1a"),
    "hazard_stripes": ("zt_hazard_stripes", "zt_hazard_stripes", "metal", "#c8a020"),
    "shaft_wall": ("zt_shaft_wall", "zt_shaft_wall", "stone", "#3a3a3a"),
    "shaft_wall_fast": ("zt_shaft_wall_fast", "zt_shaft_wall_fast", "stone", "#3a3a3a"),
}


def full_block(name, category="construction"):
    side, top, _, color = FULL[name]
    inst = {"*": {"texture": side, "render_method": "opaque"}}
    if top != side:
        inst["up"] = {"texture": top, "render_method": "opaque"}
        inst["down"] = {"texture": top, "render_method": "opaque"}
    return {"format_version": BLOCK_FORMAT, "minecraft:block": {
        "description": {"identifier": "zt:" + name, "menu_category": {"category": category}},
        "components": {
            "minecraft:geometry": {"identifier": "minecraft:geometry.full_block"},
            "minecraft:material_instances": inst,
            "minecraft:destructible_by_mining": {"seconds_to_destroy": 1.5},
            "minecraft:destructible_by_explosion": {"explosion_resistance": 6},
            "minecraft:map_color": color,
        },
    }}


def collider(name, height):
    """An invisible block that only stops you walking through the furniture standing on it; your
    aim goes straight through it to the furniture (so you can tap a closet or a drawer)."""
    col = True if height >= 16 else {"origin": [-8, 0, -8], "size": [16, height, 16]}
    return {"format_version": BLOCK_FORMAT, "minecraft:block": {
        "description": {"identifier": "zt:" + name, "menu_category": {"category": "none"}},
        "components": {
            "minecraft:geometry": {"identifier": "minecraft:geometry.full_block"},
            "minecraft:material_instances": {"*": {"texture": "zt_invisible", "render_method": "alpha_test",
                                                   "ambient_occlusion": 0, "face_dimming": False}},
            "minecraft:collision_box": col,
            "minecraft:selection_box": False,
            "minecraft:light_dampening": 0,
            "minecraft:destructible_by_mining": False,
            "minecraft:destructible_by_explosion": False,
        },
    }}


CARDINAL = {"north": 0, "west": 90, "south": 180, "east": -90}


def turnable(perms):
    """Rotations for minecraft:cardinal_direction (the model's front, -z, faces that way)."""
    return perms + [{"condition": "q.block_state('minecraft:cardinal_direction') == '%s'" % k,
                     "components": {"minecraft:transformation": {"rotation": [0, v, 0]}}} for k, v in CARDINAL.items()]


def geo_block(name, geometry, texture, *, states=None, permutations=None, light=0, collision=False, selection=None,
              render="alpha_test", category="items", trait=False, sound_hardness=0.5):
    desc = {"identifier": "zt:" + name, "menu_category": {"category": category}}
    if states:
        desc["states"] = states
    if trait:
        desc["traits"] = {"minecraft:placement_direction": {"enabled_states": ["minecraft:cardinal_direction"]}}
    c = {
        "minecraft:geometry": {"identifier": geometry},
        "minecraft:material_instances": {"*": {"texture": texture, "render_method": render}},
        "minecraft:collision_box": collision,
        "minecraft:light_dampening": 0,
        "minecraft:destructible_by_mining": {"seconds_to_destroy": sound_hardness},
    }
    if selection is not None:
        c["minecraft:selection_box"] = selection
    if light:
        c["minecraft:light_emission"] = light
    body = {"description": desc, "components": c}
    if permutations:
        body["permutations"] = permutations
    return {"format_version": BLOCK_FORMAT, "minecraft:block": body}


def lamp_states(on_tex, off_tex, broken_tex):
    def tex(t):
        return {"minecraft:material_instances": {"*": {"texture": t, "render_method": "alpha_test"}}}
    return [
        {"condition": "q.block_state('zt:lit') == 0", "components": dict(tex(off_tex), **{"minecraft:light_emission": 0})},
        {"condition": "q.block_state('zt:lit') == 2", "components": dict(tex(broken_tex), **{"minecraft:light_emission": 0})},
    ]


PAINTINGS = ["zt_painting_0", "zt_painting_1", "zt_painting_2", "zt_key_rack", "zt_painting_torn", "zt_sign_jeff", "zt_sign_hotel"]


def blocks():
    out = {}
    for name in FULL:
        out[name] = full_block(name)
    out["collider"] = collider("collider", 16)
    out["collider_mid"] = collider("collider_mid", 12)
    out["collider_low"] = collider("collider_low", 9)
    lit = {"zt:lit": {"values": {"min": 0, "max": 2}}}
    out["ceiling_lamp"] = geo_block("ceiling_lamp", "geometry.zt.ceiling_lamp", "zt_lamp_on", states=lit, light=14,
                                    selection={"origin": [-4, 7, -4], "size": [8, 9, 8]},
                                    permutations=lamp_states("zt_lamp_on", "zt_lamp_off", "zt_lamp_broken"))
    out["wall_lamp"] = geo_block("wall_lamp", "geometry.zt.wall_lamp", "zt_sconce_on", states=lit, light=12, trait=True,
                                 selection={"origin": [-3, 3, 2], "size": [6, 10, 6]},
                                 permutations=turnable(lamp_states("zt_sconce_on", "zt_sconce_off", "zt_sconce_broken")))
    out["hotel_painting"] = geo_block(
        "hotel_painting", "geometry.zt.painting", PAINTINGS[0], states={"zt:art": {"values": {"min": 0, "max": len(PAINTINGS) - 1}}},
        trait=True, selection={"origin": [-7, 1, 6], "size": [14, 14, 2]}, render="opaque", category="items",
        permutations=turnable([{"condition": "q.block_state('zt:art') == %d" % i,
                                "components": {"minecraft:material_instances": {"*": {"texture": t, "render_method": "opaque"}}}}
                               for i, t in enumerate(PAINTINGS) if i > 0]))
    out["metal_shelf"] = geo_block("metal_shelf", "geometry.zt.metal_shelf", "zt_metal_shelf", collision=True, selection=False,
                                   render="alpha_test", category="construction", sound_hardness=1.5)
    out["hospital_curtain"] = geo_block("hospital_curtain", "geometry.zt.curtain", "zt_curtain", collision=True, trait=True,
                                        selection={"origin": [-8, 0, -1], "size": [16, 16, 2]}, render="alpha_test",
                                        permutations=turnable([]))
    out["exit_sign"] = geo_block("exit_sign", "geometry.zt.exit_sign", "zt_exit_sign", light=5, trait=True,
                                 selection={"origin": [-7, 5, 6], "size": [14, 6, 2]}, render="opaque", permutations=turnable([]))
    return out


# sound of each block, and the textures it needs registered (beyond its material instances)
BLOCK_SOUNDS = {"collider": "stone", "collider_mid": "stone", "collider_low": "stone", "ceiling_lamp": "lantern",
                "wall_lamp": "lantern", "hotel_painting": "wood", "metal_shelf": "metal", "hospital_curtain": "cloth",
                "exit_sign": "metal"}
EXTRA_TERRAIN = ["zt_invisible", "zt_lamp_on", "zt_lamp_off", "zt_lamp_broken", "zt_sconce_on", "zt_sconce_off", "zt_sconce_broken",
                 "zt_metal_shelf", "zt_curtain", "zt_exit_sign"] + PAINTINGS


# =============================================================================================
# client
# =============================================================================================
FACE = {"face": "animation.zt.prop.face"}


def ease(var, target, rate=12.0):
    """A pre-animation script: v.<var> eases toward `target` (frame-rate independent)."""
    return "v.%s = math.lerp(v.%s, %s, math.min(1.0, q.delta_time * %.1f));" % (var, var, target, rate)


DRAWER_OPEN = ["math.mod(math.floor(q.property('zt:drawers') / %d), 2)" % (1 << k) for k in range(3)]
DRAWERS = [ease("d%d" % k, DRAWER_OPEN[k]) for k in range(3)]
DRAWERS_INIT = ["v.d%d = %s;" % (k, DRAWER_OPEN[k]) for k in range(3)]
ON = "q.property('zt:on') ? 1.0 : 0.0"


def sw(opening, closing):
    """client() arguments for something that opens and shuts on zt:open (see swing())."""
    s = swing(opening, closing)
    return {"init": s["init"], "pre": s["pre"]}


def clients():
    out = {}
    skins = lambda name, n: {"%s_%d" % (name, i): TEX + "%s_%d" % (name, i) for i in range(n)}  # noqa: E731
    out["wardrobe"] = client(
        "zt:wardrobe", "geometry.zt.wardrobe", TEX + "wardrobe_0", material="entity_alphatest",
        extra_textures={k: v for k, v in skins("wardrobe", 3).items() if not k.endswith("_0")},
        animations=dict(FACE, swing="animation.zt.wardrobe.swing"),
        animate=["face", "swing"], rc=["controller.render.zt.wardrobe"], **sw(0.2, 0.25))
    out["hotel_bed"] = client("zt:hotel_bed", "geometry.zt.hotel_bed", TEX + "hotel_bed_0", material="entity_alphatest",
                              extra_textures={"hotel_bed_1": TEX + "hotel_bed_1"}, animations=FACE, animate=["face"],
                              rc=["controller.render.zt.hotel_bed"])
    out["dresser"] = client(
        "zt:dresser", "geometry.zt.dresser", TEX + "dresser", material="entity_alphatest",
        extra_textures={"nightstand": TEX + "nightstand", "desk": TEX + "desk"},
        extra_geometry={"nightstand": "geometry.zt.nightstand", "desk": "geometry.zt.desk"},
        animations=dict(FACE, drawers="animation.zt.drawers"), animate=["face", "drawers"], rc=["controller.render.zt.dresser"],
        pre=DRAWERS, init=DRAWERS_INIT)
    out["cabinet"] = client("zt:cabinet", "geometry.zt.cabinet", TEX + "cabinet", material="entity_alphatest",
                            animations=dict(FACE, drawers="animation.zt.drawers"), animate=["face", "drawers"], pre=DRAWERS,
                            init=DRAWERS_INIT)
    out["couch"] = client("zt:couch", "geometry.zt.couch", TEX + "couch_0", material="entity_alphatest",
                          extra_textures={"couch_1": TEX + "couch_1", "couch_2": TEX + "couch_2"}, animations=FACE, animate=["face"],
                          rc=["controller.render.zt.couch"])
    out["room_key"] = client("zt:room_key", "geometry.zt.room_key", TEX + "room_key", material="entity_alphatest",
                             extra_textures={"grey": TEX + "room_key_grey"},
                             animations=dict(FACE, spin="animation.zt.room_key.spin"), animate=["face", "spin"],
                             rc=["controller.render.zt.room_key"])
    out["flesh_pile"] = client("zt:flesh_pile", "geometry.zt.flesh_pile", TEX + "flesh_pile", material="entity_alphatest",
                               animations=FACE, animate=["face"], rc=["controller.render.zt.flesh_pile"])
    out["elevator_door"] = client(
        "zt:elevator_door", "geometry.zt.elevator_door", TEX + "elevator_door", material="entity_alphatest",
        animations=dict(FACE, swing="animation.zt.elevator_door.swing"), animate=["face", "swing"], **sw(1.0, 1.0))
    out["gate_door"] = client(
        "zt:gate_door", "geometry.zt.gate_door", TEX + "gate_door", material="entity_alphatest",
        animations=dict(FACE, swing="animation.zt.door.swing"),
        animate=["face", "swing"], rc=["controller.render.zt.gate_door"], **sw(0.6, 0.3))
    # door 100's metal door: shut, open, slammed (zt:bang) or torn off and flat on the floor (zt:broken)
    metal = swing(0.5, 0.25, "q.property('zt:open') && !q.property('zt:broken')")
    metal["init"].append("v.broken = q.property('zt:broken') ? 1.0 : 0.0;")
    metal["pre"].append("v.broken = math.clamp(v.broken + (q.property('zt:broken') ? q.delta_time / 0.6 : -1.0), 0.0, 1.0);")
    out["metal_door"] = client(
        "zt:metal_door", "geometry.zt.metal_door", TEX + "metal_door", material="entity_alphatest",
        animations=dict(FACE, swing="animation.zt.metal_door.swing", bang="animation.zt.metal_door.bang",
                        hit="controller.animation.zt.metal_door"),
        animate=["face", "swing", "hit"], rc=["controller.render.zt.metal_door"], init=metal["init"], pre=metal["pre"])
    out["big_gate"] = client(
        "zt:big_gate", "geometry.zt.big_gate", TEX + "big_gate", material="entity_alphatest",
        animations=dict(FACE, swing="animation.zt.big_gate.swing"), animate=["face", "swing"], **sw(3.0, 1.5))
    out["elevator_gate"] = client(
        "zt:elevator_gate", "geometry.zt.elevator_gate", TEX + "elevator_gate", material="entity_alphatest",
        animations=dict(FACE, swing="animation.zt.elevator_gate.swing"), animate=["face", "swing"], **sw(0.6, 0.45))
    out["wall_lever"] = client("zt:wall_lever", "geometry.zt.wall_lever", TEX + "wall_lever", material="entity_alphatest",
                               animations=dict(FACE, pull="animation.zt.wall_lever.pull"), animate=["face", "pull"],
                               pre=[ease("pull", ON, 5.0)], init=["v.pull = %s;" % ON])
    out["breaker_box"] = client(
        "zt:breaker_box", "geometry.zt.breaker_box", TEX + "breaker_box", material="entity_alphatest",
        extra_materials={"glow": "entity_emissive_alpha"},
        animations=dict(FACE, swing="animation.zt.breaker_box.swing"),
        animate=["face", "swing"], rc=["controller.render.zt.breaker_box"], **sw(0.5, 0.3))
    out["breaker_lever"] = client("zt:breaker_lever", "geometry.zt.breaker_lever", TEX + "breaker_lever", material="entity_alphatest",
                                  animations=dict(FACE, flip="animation.zt.breaker_lever.flip"), animate=["face", "flip"],
                                  pre=[ease("flip", ON, 25.0)], init=["v.flip = %s;" % ON])
    out["switch_pickup"] = client("zt:switch_pickup", "geometry.zt.switch_pickup", TEX + "breaker_lever", material="entity_alphatest",
                                  animations=FACE, animate=["face"])
    out["live_wire"] = client("zt:live_wire", "geometry.zt.live_wire", TEX + "live_wire", material="entity_alphatest",
                              animations=dict(FACE, sway="animation.zt.live_wire.sway"), animate=["face", "sway"])
    out["herb_plant"] = client("zt:herb_plant", "geometry.zt.herb_plant", TEX + "herb_plant", material="entity_alphatest",
                               extra_materials={"glow": "entity_emissive_alpha"},
                               animations=dict(FACE, sway="animation.zt.herb_plant.sway"), animate=["face", "sway"],
                               rc=["controller.render.zt.herb_plant"])
    out["angel_statue"] = client("zt:angel_statue", "geometry.zt.angel_statue", TEX + "angel_statue", material="entity_alphatest",
                                 animations=FACE, animate=["face"])
    out["jeff"] = client("zt:jeff", "geometry.zt.jeff", TEX + "jeff", animations=dict(FACE, idle="animation.zt.jeff.idle"),
                         animate=["face", "idle"])
    out["el_goblino"] = client("zt:el_goblino", "geometry.zt.el_goblino", TEX + "el_goblino", material="entity_alphatest",
                               animations=dict(FACE, idle="animation.zt.el_goblino.idle"), animate=["face", "idle"])
    out["bob"] = client("zt:bob", "geometry.zt.bob", TEX + "bob", material="entity_alphatest", animations=FACE, animate=["face"])
    out["shop_display"] = client("zt:shop_display", "geometry.zt.shop_display", TEX + "shop_display", material="entity_alphatest",
                                 animations=FACE, animate=["face"])
    out["rush"] = client("zt:rush", "geometry.zt.rush", TEX + "rush",
                         animations=dict(FACE, fly="animation.zt.rush.fly", sink="animation.zt.rush.sink",
                                         main="controller.animation.zt.rush"),
                         animate=["face", "main"])
    out["screech"] = client("zt:screech", "geometry.zt.screech", TEX + "screech",
                            animations=dict(FACE, lurk="animation.zt.screech.lurk", bite="animation.zt.screech.bite",
                                            flee="animation.zt.screech.flee", sink="animation.zt.screech.sink",
                                            main="controller.animation.zt.screech"),
                            animate=["face", "main"])
    out["switch_bar"] = client("zt:switch_bar", "geometry.zt.invisible", "textures/entity/doors/invisible", material="entity_alphatest")
    return out


def render_controllers(existing):
    rc = existing["render_controllers"]

    def by_style(name, textures, extra=None):
        c = {
            "arrays": {"textures": {"Array.skins": ["Texture." + t for t in textures]}},
            "geometry": "Geometry.default",
            "materials": [{"*": "Material.default"}],
            "textures": ["Array.skins[q.property('zt:style')]"],
        }
        c.update(extra or {})
        rc["controller.render.zt." + name] = c

    by_style("wardrobe", ["default", "wardrobe_1", "wardrobe_2"])
    by_style("hotel_bed", ["default", "hotel_bed_1"])
    by_style("couch", ["default", "couch_1", "couch_2"])
    rc["controller.render.zt.dresser"] = {
        "arrays": {"textures": {"Array.skins": ["Texture.default", "Texture.nightstand", "Texture.desk"]},
                   "geometries": {"Array.geos": ["Geometry.default", "Geometry.nightstand", "Geometry.desk"]}},
        "geometry": "Array.geos[q.property('zt:style')]",
        "materials": [{"*": "Material.default"}],
        "textures": ["Array.skins[q.property('zt:style')]"],
    }
    style = "q.property('zt:style')"
    # 0: a gold room key lying somewhere, 1: door 100's grey electrical key, 2: a room key on the reception's rack
    rc["controller.render.zt.room_key"] = {
        "arrays": {"textures": {"Array.skins": ["Texture.default", "Texture.grey"]}},
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}],
        "textures": ["Array.skins[%s == 1 ? 1 : 0]" % style],
        "part_visibility": [{"*": True}, {"flat": "%s != 2" % style}, {"hanging": "%s == 2" % style}],
    }
    rc["controller.render.zt.flesh_pile"] = {
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
        "part_visibility": [{"*": True}, {"lump_a": "%s != 1" % style}, {"lump_b": "%s != 2" % style}, {"lump_c": "%s != 0" % style}],
    }
    rc["controller.render.zt.gate_door"] = {
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
        "part_visibility": [{"*": True}, {"padlock": "q.property('zt:locked')"}, {"plate": "q.property('zt:number') > -2"}] +
        digit_visibility(),
        "overlay_color": GUIDED_GLOW,
    }
    rc["controller.render.zt.metal_door"] = {
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}], "textures": ["Texture.default"],
        "part_visibility": [{"*": True}, {"sign": "q.property('zt:sign')"}],
    }
    num = "q.property('zt:num')"
    fill = "q.property('zt:fill')"
    rc["controller.render.zt.herb_plant"] = {
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}, {"bud": "Material.glow"}], "textures": ["Texture.default"],
    }
    rc["controller.render.zt.breaker_box"] = {
        "geometry": "Geometry.default", "textures": ["Texture.default"],
        "materials": [{"*": "Material.default"}, {"num_*": "Material.glow"}, {"square*": "Material.glow"}, {"ok_light": "Material.glow"}],
        "part_visibility": [{"*": True}] + [{"num_%d" % n: "%s == %d" % (num, n)} for n in range(1, 11)] + [
            {"num_q": "%s == 11" % num}, {"square": "%s >= 1" % fill}, {"square_fill": "%s == 2" % fill},
            {"ok_light": "q.property('zt:ok')"}, {"screen_on": "%s > 0 || q.property('zt:ok')" % num}] +
        [{"sw_%d" % n: "q.property('zt:slots') >= %d" % n} for n in range(1, 11)],
    }
    return existing


# =============================================================================================
def main():
    for name, data in entities().items():
        dump(BP, "entities/%s.json" % name, data)
    for name, data in clients().items():
        dump(RP, "entity/%s.entity.json" % name, data)
    for name, data in items().items():
        dump(BP, "items/%s.json" % name, data)
    for name, data in blocks().items():
        dump(BP, "blocks/%s.json" % name, data)

    path = os.path.join(RP, "textures", "item_texture.json")
    with open(path) as f:
        icons = json.load(f)
    for icon in ICONS:
        icons["texture_data"][icon] = {"textures": "textures/items/" + icon}
    dump(RP, "textures/item_texture.json", icons)

    path = os.path.join(RP, "textures", "terrain_texture.json")
    with open(path) as f:
        terrain = json.load(f)
    for side, top, _, _ in FULL.values():
        for t in (side, top):
            terrain["texture_data"][t] = {"textures": "textures/blocks/" + t}
    for t in EXTRA_TERRAIN:
        terrain["texture_data"][t] = {"textures": "textures/blocks/" + t}
    dump(RP, "textures/terrain_texture.json", terrain)

    # the elevator shaft's walls slide up past the car as it goes down
    flip = [{"flipbook_texture": "textures/blocks/zt_shaft_wall", "atlas_tile": "zt_shaft_wall", "ticks_per_frame": 2,
             "frames": list(range(16))},
            {"flipbook_texture": "textures/blocks/zt_shaft_wall_fast", "atlas_tile": "zt_shaft_wall_fast", "ticks_per_frame": 1,
             "frames": list(range(8))}]
    with open(os.path.join(RP, "textures", "flipbook_textures.json"), "w") as f:
        json.dump(flip, f, indent="\t")
        f.write("\n")

    path = os.path.join(RP, "blocks.json")
    with open(path) as f:
        sounds = json.load(f)
    for name, (_, _, sound, _) in FULL.items():
        sounds["zt:" + name] = {"sound": sound}
    for name, sound in BLOCK_SOUNDS.items():
        sounds["zt:" + name] = {"sound": sound}
    dump(RP, "blocks.json", sounds)

    # dark rooms: a black fog a few blocks out, pushed back by a lighter, and farther by a flashlight
    for mode, start, end in (("room", 0.0, 7.0), ("lighter", 2.0, 13.0), ("flashlight", 4.0, 22.0)):
        dump(RP, "fogs/zt_dark_%s.json" % mode, {"format_version": "1.16.100", "minecraft:fog_settings": {
            "description": {"identifier": "zt:dark_" + mode},
            "distance": {"air": {"fog_start": start, "fog_end": end, "fog_color": "#000000", "render_distance_type": "fixed"}},
        }})

    path = os.path.join(RP, "render_controllers", "zt.render_controllers.json")
    with open(path) as f:
        existing = json.load(f)
    dump(RP, "render_controllers/zt.render_controllers.json", render_controllers(existing))
    print("floor 1 data written")


if __name__ == "__main__":
    main()
