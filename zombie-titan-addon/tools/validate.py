"""Validates the packs' JSON against Mojang's official schemas (dev tool).

    git clone --depth 1 https://github.com/Mojang/bedrock-samples
    python3 tools/validate.py path/to/bedrock-samples/metadata/json_schemas

Also checks that every file parses, that textures/geometry/animations/sounds
referenced between files exist, and that manifests line up.
"""
import glob
import json
import os
import re
import sys

from jsonschema import Draft7Validator
from referencing import Registry, Resource

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BP = os.path.join(ROOT, "packs", "ZombieTitan_BP")
RP = os.path.join(ROOT, "packs", "ZombieTitan_RP")

problems = []


def load(path):
    s = open(path, encoding="utf-8").read()
    s = re.sub(r"(?m)^\s*//[^\n]*$", "", s)        # whole-line comments (allowed in UI / vanilla files)
    return json.loads(s)


def problem(msg):
    problems.append(msg)
    print("  PROBLEM:", msg)


def schema_registry(schema_dir):
    resources = []
    for p in glob.glob(os.path.join(schema_dir, "**", "*.json"), recursive=True):
        try:
            d = json.load(open(p))
        except Exception:
            continue
        if isinstance(d, dict) and "$id" in d:
            # $ids look like "/server/entity/1.26.50/ActorDocument.json"; give them a base URI
            uri = "https://schemas.local" + d["$id"]
            resources.append((uri, Resource.from_contents(d)))
    return Registry().with_resources(resources)


def validate(registry, schema_id, instance, label):
    v = Draft7Validator({"$ref": "https://schemas.local" + schema_id}, registry=registry)
    errs = sorted(v.iter_errors(instance), key=lambda e: list(e.path))
    for e in errs[:12]:
        problem(f"{label}: {'/'.join(map(str, e.path))}: {e.message[:200]}")
    return not errs


def main():
    # 1. everything parses
    for pack in (BP, RP):
        for p in glob.glob(os.path.join(pack, "**", "*.json"), recursive=True):
            try:
                load(p)
            except Exception as e:
                problem(f"{os.path.relpath(p, ROOT)} does not parse: {e}")

    if len(sys.argv) > 1:
        reg = schema_registry(sys.argv[1])
        print("schema check")
        for p in sorted(glob.glob(os.path.join(BP, "entities", "*.json"))):
            d = load(p)
            body = d["minecraft:entity"]
            ok = validate(reg, "/server/entity/1.21.90/ActorDocument.json", body, os.path.basename(p))
            print("  entity", os.path.basename(p), "ok" if ok else "")
        for p in sorted(glob.glob(os.path.join(BP, "items", "*.json"))):
            d = load(p)
            ok = validate(reg, "/server/item/1.26.30/ItemDocument.json", d["minecraft:item"], os.path.basename(p))
            print("  item", os.path.basename(p), "ok" if ok else "")
        for p in sorted(glob.glob(os.path.join(RP, "particles", "*.json"))):
            d = load(p)
            ok = validate(reg, "/client/particles/1.21.10/Particle%20Effect%20Data.json", d["particle_effect"], os.path.basename(p))
            print("  particle", os.path.basename(p), "ok" if ok else "")

    print("cross references")
    # textures referenced by client entities, render setup and UI
    def tex_exists(ref):
        return any(os.path.exists(os.path.join(RP, ref + ext)) for ext in (".png", ".tga"))

    geos = set()
    for p in glob.glob(os.path.join(RP, "models", "entity", "*.json")):
        for g in load(p)["minecraft:geometry"]:
            geos.add(g["description"]["identifier"])
    anims = set()
    for p in glob.glob(os.path.join(RP, "animations", "*.json")):
        anims |= set(load(p)["animations"].keys())
    ctrls = set()
    for p in glob.glob(os.path.join(RP, "animation_controllers", "*.json")):
        ctrls |= set(load(p)["animation_controllers"].keys())
    rcs = set()
    for p in glob.glob(os.path.join(RP, "render_controllers", "*.json")):
        rcs |= set(load(p)["render_controllers"].keys())
    items_tex = load(os.path.join(RP, "textures", "item_texture.json"))["texture_data"]
    for k, v in items_tex.items():
        if not tex_exists(v["textures"]):
            problem(f"item texture {k} -> {v['textures']} missing")
    bp_ids = {}
    for p in glob.glob(os.path.join(BP, "entities", "*.json")):
        d = load(p)["minecraft:entity"]["description"]
        bp_ids[d["identifier"]] = d
    for p in glob.glob(os.path.join(RP, "entity", "*.json")):
        d = load(p)["minecraft:client_entity"]["description"]
        ident = d["identifier"]
        if ident not in bp_ids:
            problem(f"client entity {ident} has no behaviour entity")
        for t in d.get("textures", {}).values():
            if not tex_exists(t):
                problem(f"{ident}: texture {t} missing")
        for g in d.get("geometry", {}).values():
            if g not in geos:
                problem(f"{ident}: geometry {g} missing")
        for name, a in d.get("animations", {}).items():
            if a not in anims and a not in ctrls:
                problem(f"{ident}: animation {a} missing")
        for rc in d.get("render_controllers", []):
            if isinstance(rc, str) and rc not in rcs:
                problem(f"{ident}: render controller {rc} missing")
        egg = d.get("spawn_egg", {}).get("texture")
        if egg and egg not in items_tex:
            problem(f"{ident}: spawn egg texture {egg} missing from item_texture.json")
        # properties used by molang must exist on the behaviour entity
        used = set()
        for p2 in glob.glob(os.path.join(RP, "**", "*.json"), recursive=True):
            pass
        bp_props = set(bp_ids.get(ident, {}).get("properties", {}).keys())
        text = json.dumps(d)
        for prop in re.findall(r"q(?:uery)?\.property\('([^']+)'\)", text):
            if prop not in bp_props:
                problem(f"{ident}: uses property {prop} it does not define")
    # every property referenced by animation controllers / render controllers on the titan exists
    titan_props = set(bp_ids["zt:zombie_titan"]["properties"].keys())
    for folder in ("animation_controllers", "render_controllers", "animations"):
        for p in glob.glob(os.path.join(RP, folder, "*.json")):
            for prop in re.findall(r"q(?:uery)?\.property\('([^']+)'\)", open(p).read()):
                known = titan_props | set(bp_ids["zt:zombie_minion"]["properties"].keys())
                if prop not in known:
                    problem(f"{os.path.basename(p)} uses unknown property {prop}")
    # particle textures
    for p in glob.glob(os.path.join(RP, "particles", "*.json")):
        t = load(p)["particle_effect"]["description"]["basic_render_parameters"]["texture"]
        if not tex_exists(t):
            problem(f"{os.path.basename(p)}: texture {t} missing")
    # UI textures
    ui = open(os.path.join(RP, "ui", "hud_screen.json")).read()
    for t in re.findall(r'"texture":\s*"([^"]+)"', ui):
        if not tex_exists(t):
            problem(f"hud_screen.json: texture {t} missing")
    # the titan bar only replaces boss bars whose name contains the HUD's marker text, and a
    # custom entity's bar is labelled "Unknown" unless minecraft:boss names it
    boss = load(os.path.join(BP, "entities", "zombie_titan.json"))["minecraft:entity"]["components"]["minecraft:boss"]
    markers = set(re.findall(r"#bossName - '([^']+)'", ui))
    if not markers:
        problem("hud_screen.json: no boss name test found")
    for marker in markers:
        if marker not in boss.get("name", ""):
            problem(f"titan boss name {boss.get('name')!r} lacks {marker!r}, so the custom boss bar never shows")
    # sounds used by scripts / entities exist
    sdefs = load(os.path.join(RP, "sounds", "sound_definitions.json"))["sound_definitions"]
    scripts = "".join(open(p).read() for p in glob.glob(os.path.join(BP, "scripts", "*.js")))
    vanilla_ok = {"random.anvil_break", "random.explode", "mob.evocation_illager.cast_spell"}
    for sid in set(re.findall(r'"(zt\.[a-z_.]+)"', scripts)):
        if sid not in sdefs:
            problem(f"script plays undefined sound {sid}")
    # particles used by scripts exist
    pids = {load(p)["particle_effect"]["description"]["identifier"] for p in glob.glob(os.path.join(RP, "particles", "*.json"))}
    for pid in set(re.findall(r'"(zt:[a-z_]+)"', scripts)):
        if pid.startswith("zt:") and pid not in pids and pid not in bp_ids and pid not in ("zt:dark_fists",):
            if not pid.startswith("zt:as_") and pid not in ("zt:start_birth", "zt:end_birth", "zt:natural_spawns",
                                                            "zt:anim", "zt:moving", "zt:armed", "zt:enraged",
                                                            "zt:birth", "zt:grow", "zt:casting", "zt:looted",
                                                            "zt:df_mode", "zt:natural_spawns", "zt:last_natural_spawn"):
                problem(f"script references unknown id {pid}")
    # manifests
    bpm = load(os.path.join(BP, "manifest.json"))
    rpm = load(os.path.join(RP, "manifest.json"))
    dep = [d for d in bpm["dependencies"] if "uuid" in d]
    if not dep or dep[0]["uuid"] != rpm["header"]["uuid"]:
        problem("BP does not depend on the RP uuid")
    elif dep[0]["version"] != rpm["header"]["version"]:
        problem(f"BP depends on RP version {dep[0]['version']}, but the RP is {rpm['header']['version']}")
    uuids = [bpm["header"]["uuid"], rpm["header"]["uuid"]] + [m["uuid"] for m in bpm["modules"] + rpm["modules"]]
    if len(set(uuids)) != len(uuids):
        problem("duplicate uuids in manifests")
    print()
    print("ALL GOOD" if not problems else f"{len(problems)} problems")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
