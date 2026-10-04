"""Writes the custom particle effects used by the Zombie Titan add-on.

Script-spawned effects read Molang variables set through MolangVariableMap:
  v.dir      beam / barrage direction (unit vector)
  v.len      beam length in blocks
  v.radius   shockwave radius in blocks
  v.color    tint for the generic spark burst
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "packs", "ZombieTitan_RP", "particles")

GLOW = "textures/particle/zt_glow"
RING = "textures/particle/zt_ring"
SMOKE = "textures/particle/zt_smoke"
SPARK = "textures/particle/zt_spark"
FIST = "textures/particle/zt_fist"


def effect(ident, material, texture, components):
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": ident,
                "basic_render_parameters": {"material": material, "texture": texture},
            },
            "components": components,
        },
    }


def billboard(size, tex_w, tex_h, uv=(0, 0), uv_size=None, facing="lookat_xyz", flipbook=None):
    uvd = {"texture_width": tex_w, "texture_height": tex_h}
    if flipbook:
        uvd["flipbook"] = flipbook
    else:
        uvd["uv"] = list(uv)
        uvd["uv_size"] = list(uv_size or (tex_w, tex_h))
    return {"size": size, "facing_camera_mode": facing, "uv": uvd}


def gradient(stops):
    return {"color": {"gradient": stops, "interpolant": "v.particle_age / v.particle_lifetime"}}


SMOKE_FLIP = {"base_UV": [0, 0], "size_UV": [16, 16], "step_UV": [16, 0], "frames_per_second": 6,
              "max_frame": 4, "stretch_to_lifetime": True, "loop": False}


def effects():
    E = {}
    along = "v.particle_random_1 * v.len"
    # --- Dark Beam -------------------------------------------------------------
    E["dark_beam"] = effect("zt:dark_beam", "particles_blend", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": "math.min(120, v.len * 2.5)"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {
            "offset": ["v.dir.x * %s + (v.particle_random_2 - 0.5) * 1.1" % along,
                       "v.dir.y * %s + (v.particle_random_3 - 0.5) * 1.1" % along,
                       "v.dir.z * %s + (v.particle_random_4 - 0.5) * 1.1" % along],
            "direction": ["v.dir.x", "v.dir.y", "v.dir.z"],
        },
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.14 + v.particle_random_2 * 0.1"},
        "minecraft:particle_initial_speed": 3.0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": billboard(
            ["1.0 + v.particle_random_3 * 0.8", "1.0 + v.particle_random_3 * 0.8"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.16, 0.0, 0.26, 0.95], "0.5": [0.30, 0.02, 0.46, 0.85], "1.0": [0.04, 0.0, 0.07, 0.0]}),
    })
    E["dark_beam_core"] = effect("zt:dark_beam_core", "particles_add", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": "math.min(80, v.len * 1.6)"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {
            "offset": ["v.dir.x * %s + (v.particle_random_2 - 0.5) * 0.3" % along,
                       "v.dir.y * %s + (v.particle_random_3 - 0.5) * 0.3" % along,
                       "v.dir.z * %s + (v.particle_random_4 - 0.5) * 0.3" % along],
            "direction": ["v.dir.x", "v.dir.y", "v.dir.z"],
        },
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.1},
        "minecraft:particle_initial_speed": 6.0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": billboard(["0.55", "0.55"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [1.0, 0.45, 1.0, 1.0], "1.0": [0.5, 0.0, 0.8, 0.0]}),
    })
    E["dark_charge"] = effect("zt:dark_charge", "particles_add", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": 24},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 2.2, "surface_only": True, "direction": "inwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.45},
        "minecraft:particle_initial_speed": 4.5,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": billboard(["0.3", "0.3"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.4, 0.0, 0.7, 0.0], "0.3": [0.9, 0.4, 1.0, 1.0], "1.0": [1.0, 0.8, 1.0, 1.0]}),
    })
    E["dark_impact"] = effect("zt:dark_impact", "particles_blend", SMOKE, {
        "minecraft:emitter_rate_instant": {"num_particles": 6},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.8, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.5 + v.particle_random_1 * 0.4"},
        "minecraft:particle_initial_speed": "2 + v.particle_random_2 * 3",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3, "linear_acceleration": [0, 1.5, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["1.4 + v.particle_random_3", "1.4 + v.particle_random_3"], 64, 16, flipbook=SMOKE_FLIP),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.25, 0.05, 0.35, 0.9], "1.0": [0.05, 0.0, 0.08, 0.0]}),
    })
    E["dark_aura"] = effect("zt:dark_aura", "particles_blend", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": 2},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.18, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.5 + v.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": 0.15,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.5, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.12 * (1 - v.particle_age / v.particle_lifetime)", "0.12 * (1 - v.particle_age / v.particle_lifetime)"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.6, 0.2, 0.9, 0.9], "1.0": [0.1, 0.0, 0.2, 0.0]}),
    })
    # --- Barrage ------------------------------------------------------------------
    E["barrage_fists"] = effect("zt:barrage_fists", "particles_blend", FIST, {
        "minecraft:emitter_rate_instant": {"num_particles": 4},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {
            "offset": ["(v.particle_random_1 - 0.5) * 1.6", "(v.particle_random_2 - 0.5) * 1.1", "(v.particle_random_3 - 0.5) * 1.6"],
            "direction": ["v.dir.x", "v.dir.y", "v.dir.z"],
        },
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.16 + v.particle_random_4 * 0.08"},
        "minecraft:particle_initial_speed": "8 + v.particle_random_4 * 4",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 4},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.42 + v.particle_random_2 * 0.18", "0.42 + v.particle_random_2 * 0.18"], 16, 16),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [1, 1, 1, 0.0], "0.15": [1, 1, 1, 1.0], "0.75": [1, 1, 1, 0.9], "1.0": [1, 1, 1, 0.0]}),
    })
    # generic spark burst, tinted through v.color
    E["spark_burst"] = effect("zt:spark_burst", "particles_add", SPARK, {
        "minecraft:emitter_rate_instant": {"num_particles": 14},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.3, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.25 + v.particle_random_1 * 0.25"},
        "minecraft:particle_initial_speed": "4 + v.particle_random_2 * 6",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 5, "linear_acceleration": [0, -6, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.25 * (1 - v.particle_age / v.particle_lifetime)", "0.25 * (1 - v.particle_age / v.particle_lifetime)"], 16, 16),
        "minecraft:particle_appearance_tinting": {"color": ["v.color.r", "v.color.g", "v.color.b", 1.0]},
    })
    # --- Titan ground effects ----------------------------------------------------------
    E["shockwave"] = effect("zt:shockwave", "particles_blend", RING, {
        "minecraft:emitter_rate_instant": {"num_particles": 1},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [0, 0.15, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.7},
        "minecraft:particle_appearance_billboard": billboard(
            ["v.radius * 2 * math.sqrt(v.particle_age / v.particle_lifetime)",
             "v.radius * 2 * math.sqrt(v.particle_age / v.particle_lifetime)"], 64, 64, facing="emitter_transform_xz"),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.85, 0.78, 0.65, 0.95], "1.0": [0.55, 0.45, 0.35, 0.0]}),
    })
    E["shockwave_dust"] = effect("zt:shockwave_dust", "particles_blend", SMOKE, {
        "minecraft:emitter_rate_instant": {"num_particles": "math.clamp(v.radius * 3, 12, 110)"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"plane_normal": "y", "radius": "v.radius * 0.25", "surface_only": False,
                                         "direction": "outwards", "offset": [0, 0.5, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.6 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "v.radius * (1.4 + v.particle_random_2 * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.2, "linear_acceleration": [0, 1.2, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["1.6 + v.particle_random_3 * 1.6", "1.6 + v.particle_random_3 * 1.6"], 64, 16, flipbook=SMOKE_FLIP),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.55, 0.46, 0.36, 0.85], "1.0": [0.45, 0.4, 0.34, 0.0]}),
    })
    E["footstep"] = effect("zt:footstep", "particles_blend", SMOKE, {
        "minecraft:emitter_rate_instant": {"num_particles": 22},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"plane_normal": "y", "radius": 3.5, "surface_only": True,
                                         "direction": "outwards", "offset": [0, 0.3, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.8 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "2 + v.particle_random_2 * 3",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.5, "linear_acceleration": [0, 1.0, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["1.5 + v.particle_random_3 * 1.2", "1.5 + v.particle_random_3 * 1.2"], 64, 16, flipbook=SMOKE_FLIP),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.5, 0.42, 0.33, 0.8], "1.0": [0.42, 0.38, 0.32, 0.0]}),
    })
    E["rumble"] = effect("zt:rumble", "particles_blend", SMOKE, {
        "minecraft:emitter_rate_instant": {"num_particles": 18},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"plane_normal": "y", "radius": "math.max(2, v.radius)", "surface_only": False,
                                         "direction": [0, 1, 0], "offset": [0, 0.2, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "1.0 + v.particle_random_1"},
        "minecraft:particle_initial_speed": "1 + v.particle_random_2 * 4",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.0, "linear_acceleration": [0, -2.5, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["1.0 + v.particle_random_3 * 1.5", "1.0 + v.particle_random_3 * 1.5"], 64, 16, flipbook=SMOKE_FLIP),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.42, 0.33, 0.22, 0.9], "1.0": [0.35, 0.3, 0.25, 0.0]}),
    })
    E["minion_summon"] = effect("zt:minion_summon", "particles_add", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": 26},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"plane_normal": "y", "radius": 0.9, "surface_only": True, "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.6 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "1.5 + v.particle_random_2 * 3",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.0},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.35 * (1 - v.particle_age / v.particle_lifetime)", "0.35 * (1 - v.particle_age / v.particle_lifetime)"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.4, 1.0, 0.3, 1.0], "1.0": [0.1, 0.5, 0.1, 0.0]}),
    })
    # --- Proto balls -------------------------------------------------------------------
    E["proto_trail"] = effect("zt:proto_trail", "particles_add", GLOW, {
        "minecraft:emitter_rate_steady": {"spawn_rate": 30, "max_particles": 60},
        "minecraft:emitter_lifetime_looping": {"active_time": 1},
        "minecraft:emitter_shape_sphere": {"radius": 0.6, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 0.6},
        "minecraft:particle_initial_speed": 0.3,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -1, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.9 * (1 - v.particle_age / v.particle_lifetime)", "0.9 * (1 - v.particle_age / v.particle_lifetime)"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.6, 1.0, 0.3, 1.0], "1.0": [0.1, 0.4, 0.05, 0.0]}),
    })
    E["proto_burst"] = effect("zt:proto_burst", "particles_blend", SMOKE, {
        "minecraft:emitter_rate_instant": {"num_particles": 30},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 1.0, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.6 + v.particle_random_1 * 0.5"},
        "minecraft:particle_initial_speed": "5 + v.particle_random_2 * 5",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.5, "linear_acceleration": [0, -4, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["1.2 + v.particle_random_3", "1.2 + v.particle_random_3"], 64, 16, flipbook=SMOKE_FLIP),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.4, 0.9, 0.2, 0.95], "1.0": [0.15, 0.35, 0.1, 0.0]}),
    })
    # --- Skeleton Titan: bone chips flying off a hit ---------------------------------------
    E["bone_dust"] = effect("zt:bone_dust", "particles_alpha", SPARK, {
        "minecraft:emitter_rate_instant": {"num_particles": 24},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 1.2, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.8 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "4 + v.particle_random_2 * 6",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.2, "linear_acceleration": [0, -14, 0]},
        "minecraft:particle_motion_collision": {"collision_radius": 0.1, "coefficient_of_restitution": 0.3},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.3 + v.particle_random_3 * 0.3", "0.3 + v.particle_random_3 * 0.3"], 16, 16),
        "minecraft:particle_appearance_tinting": {"color": [0.93, 0.91, 0.84, 1.0]},
    })
    # --- Obsidian Sword dash: a dark purple streak behind the player ------------------------
    E["dash_trail"] = effect("zt:dash_trail", "particles_add", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": 10},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.5, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.35 + v.particle_random_1 * 0.3"},
        "minecraft:particle_initial_speed": 0.4,
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.0},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.6 * (1 - v.particle_age / v.particle_lifetime)", "0.6 * (1 - v.particle_age / v.particle_lifetime)"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.62, 0.3, 1.0, 1.0], "1.0": [0.15, 0.03, 0.3, 0.0]}),
    })
    # --- Growth Serum: the bottle shatters in a glowing splash, then a swirl climbs the mob -----
    E["serum_splash"] = effect("zt:serum_splash", "particles_add", GLOW, {
        "minecraft:emitter_rate_instant": {"num_particles": 40},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": 0.4, "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.5 + v.particle_random_1 * 0.6"},
        "minecraft:particle_initial_speed": "3 + v.particle_random_2 * 4",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.0, "linear_acceleration": [0, -6, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.45 * (1 - v.particle_age / v.particle_lifetime)", "0.45 * (1 - v.particle_age / v.particle_lifetime)"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.75, 1.0, 0.35, 1.0], "0.5": [0.7, 0.3, 1.0, 0.9], "1.0": [0.3, 0.1, 0.5, 0.0]}),
    })
    E["serum_swirl"] = effect("zt:serum_swirl", "particles_add", GLOW, {
        "minecraft:emitter_rate_steady": {"spawn_rate": 60, "max_particles": 160},
        "minecraft:emitter_lifetime_once": {"active_time": 2.5},
        "minecraft:emitter_shape_point": {"offset": [
            "math.cos(v.emitter_age * 720) * (1.2 + v.emitter_age)", "v.emitter_age * 2.4",
            "math.sin(v.emitter_age * 720) * (1.2 + v.emitter_age)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": 1.0},
        "minecraft:particle_initial_speed": 0.2,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.5, 0]},
        "minecraft:particle_appearance_billboard": billboard(
            ["0.5 * (1 - v.particle_age / v.particle_lifetime)", "0.5 * (1 - v.particle_age / v.particle_lifetime)"], 32, 32),
        "minecraft:particle_appearance_tinting": gradient({
            "0.0": [0.6, 1.0, 0.3, 1.0], "1.0": [0.6, 0.2, 1.0, 0.0]}),
    })
    return E


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, data in effects().items():
        with open(os.path.join(OUT, name + ".particle.json"), "w") as f:
            json.dump(data, f, indent="\t")
            f.write("\n")
    print("particles written:", len(effects()))


if __name__ == "__main__":
    main()
