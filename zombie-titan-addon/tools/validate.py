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


def vanilla_ids(schema_dir):
    """Animation, controller and geometry ids from the vanilla resource pack in bedrock-samples."""
    rp = os.path.abspath(os.path.join(schema_dir, "..", "..", "resource_pack"))
    ids = set()
    if not os.path.isdir(rp):
        return None
    for p in glob.glob(os.path.join(rp, "animations", "*.json")):
        try:
            ids |= set(load(p).get("animations", {}).keys())
        except Exception:
            pass
    for p in glob.glob(os.path.join(rp, "animation_controllers", "*.json")):
        try:
            ids |= set(load(p).get("animation_controllers", {}).keys())
        except Exception:
            pass
    for p in glob.glob(os.path.join(rp, "render_controllers", "*.json")):
        try:
            ids |= set(load(p).get("render_controllers", {}).keys())
        except Exception:
            pass
    for p in glob.glob(os.path.join(rp, "models", "**", "*.json"), recursive=True):
        try:
            d = load(p)
        except Exception:
            continue
        for g in d.get("minecraft:geometry", []):
            ids.add(g["description"]["identifier"])
        ids |= {k.split(":")[0] for k in d if k.startswith("geometry.")}
    return ids


def duplicate_one_of(err):
    """Mojang's Block Descriptor schema lists the same alternative twice in a oneOf, so every
    object descriptor "is valid under each of" them. That is a schema bug, not a pack error."""
    if err.validator != "oneOf" or "is valid under each of" not in err.message:
        return False
    alts = [json.dumps(a, sort_keys=True) for a in err.validator_value]
    return len(set(alts)) < len(alts)


def validate(registry, schema_id, instance, label):
    v = Draft7Validator({"$ref": "https://schemas.local" + schema_id}, registry=registry)
    errs = [e for e in v.iter_errors(instance) if not duplicate_one_of(e)]
    errs.sort(key=lambda e: list(e.path))
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
        for p in sorted(glob.glob(os.path.join(BP, "blocks", "*.json"))):
            d = load(p)
            ok = validate(reg, "/server/block/1.26.20/Blocks.json", d["minecraft:block"], os.path.basename(p))
            print("  block", os.path.basename(p), "ok" if ok else "")
        for p in sorted(glob.glob(os.path.join(RP, "particles", "*.json"))):
            d = load(p)
            ok = validate(reg, "/client/particles/1.21.10/Particle%20Effect%20Data.json", d["particle_effect"], os.path.basename(p))
            print("  particle", os.path.basename(p), "ok" if ok else "")

    print("cross references")
    vanilla = vanilla_ids(sys.argv[1]) if len(sys.argv) > 1 else None

    def known_vanilla(ref):
        # without bedrock-samples, anything outside our zt namespace is taken to be vanilla
        return ref in vanilla if vanilla is not None else ".zt." not in ref
    # textures referenced by client entities, render setup and UI (ours, or vanilla ones such as the
    # charged-creeper swirl when bedrock-samples is at hand)
    vanilla_rp = os.path.abspath(os.path.join(sys.argv[1], "..", "..", "resource_pack")) if len(sys.argv) > 1 else None

    ours = ("/zt", "zombie_titan", "skeleton_titan", "creeper_titan", "_minion", "titan_arrow", "proto_ball")

    def tex_exists(ref):
        roots = [RP] + ([vanilla_rp] if vanilla_rp and not ref.startswith("textures/ui/zt") else [])
        if any(os.path.exists(os.path.join(root, ref + ext)) for root in roots for ext in (".png", ".tga")):
            return True
        # without bedrock-samples a vanilla texture (the player's skin, the charged-creeper swirl) can't be checked
        return not vanilla_rp and not any(o in ref for o in ours)

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
        if ident not in bp_ids and not ident.startswith("minecraft:"):
            problem(f"client entity {ident} has no behaviour entity")
        for t in d.get("textures", {}).values():
            if not tex_exists(t):
                problem(f"{ident}: texture {t} missing")
        for g in d.get("geometry", {}).values():
            if g not in geos and not known_vanilla(g):
                problem(f"{ident}: geometry {g} missing")
        for name, a in d.get("animations", {}).items():
            # (an overridden vanilla entity, like the player, also names engine-internal animations)
            if a not in anims and a not in ctrls and not known_vanilla(a) and not ident.startswith("minecraft:"):
                problem(f"{ident}: animation {a} missing")
        for entry in d.get("animation_controllers", []):
            for a in entry.values():
                if a not in ctrls and not known_vanilla(a):
                    problem(f"{ident}: animation controller {a} missing")
        for rc in d.get("render_controllers", []):
            if isinstance(rc, str) and rc not in rcs and not known_vanilla(rc):
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
    # every property referenced by animation controllers / render controllers exists on some entity
    all_props = set()
    for d in bp_ids.values():
        all_props |= set(d.get("properties", {}).keys())
    for folder in ("animation_controllers", "render_controllers", "animations"):
        for p in glob.glob(os.path.join(RP, folder, "*.json")):
            for prop in re.findall(r"q(?:uery)?\.property\('([^']+)'\)", open(p).read()):
                if prop not in all_props:
                    problem(f"{os.path.basename(p)} uses unknown property {prop}")
    # animations: keyframes, channel shapes and balanced Molang
    def molang_ok(expr):
        if not isinstance(expr, str):
            return True
        depth = 0
        for ch in expr:
            depth += {"(": 1, ")": -1}.get(ch, 0)
            if depth < 0:
                return False
        bare = expr.replace("??", "")      # (the null-coalescing operator)
        return depth == 0 and bare.count("?") <= bare.count(":")

    def channel_ok(ch):
        if isinstance(ch, list):
            return len(ch) == 3 and all(isinstance(v, (int, float)) or molang_ok(v) for v in ch)
        if isinstance(ch, (int, float, str)):
            return molang_ok(ch)
        if isinstance(ch, dict):
            for k, v in ch.items():
                try:
                    float(k)
                except ValueError:
                    return False
                if isinstance(v, dict):
                    if not all(channel_ok(v[x]) for x in ("pre", "post") if x in v):
                        return False
                elif not channel_ok(v):
                    return False
            return True
        return False

    for p in glob.glob(os.path.join(RP, "animations", "*.json")):
        for name, a in load(p)["animations"].items():
            for bone, chans in a.get("bones", {}).items():
                for cname, ch in chans.items():
                    if cname in ("rotation", "position", "scale") and not channel_ok(ch):
                        problem(f"{os.path.basename(p)}: {name} {bone}.{cname} is malformed")
            for t, v in a.get("timeline", {}).items():
                float(t)
                for line in (v if isinstance(v, list) else [v]):
                    if not molang_ok(line) or not line.strip().endswith(";"):
                        problem(f"{os.path.basename(p)}: {name} timeline {t} is malformed")
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
    # each titan bar only replaces boss bars whose name contains its marker text, and a custom
    # entity's bar is labelled "Unknown" unless minecraft:boss names it
    markers = set(re.findall(r"#bossName - '([^']+)'", ui))
    if not markers:
        problem("hud_screen.json: no boss name test found")
    boss_names = {}
    for p in glob.glob(os.path.join(BP, "entities", "*.json")):
        ent = load(p)["minecraft:entity"]
        if "minecraft:boss" in ent["components"]:
            boss_names[ent["description"]["identifier"]] = ent["components"]["minecraft:boss"].get("name", "")
    for ident, name in boss_names.items():
        hits = [m for m in markers if m in name]
        if len(hits) != 1:
            problem(f"{ident}: boss name {name!r} matches {len(hits)} titan bars in hud_screen.json (needs exactly 1)")
    for m in markers:
        if not any(m in n for n in boss_names.values()):
            problem(f"hud_screen.json tests for {m!r} but no boss is named that")
    # sounds used by scripts / entities exist
    sdefs = load(os.path.join(RP, "sounds", "sound_definitions.json"))["sound_definitions"]
    scripts = "".join(open(p).read() for p in glob.glob(os.path.join(BP, "scripts", "*.js")))
    vanilla_ok = {"random.anvil_break", "random.explode", "mob.evocation_illager.cast_spell"}
    for sid in set(re.findall(r'"(zt\.[a-z_.]+)"', scripts)):
        if sid not in sdefs:
            problem(f"script plays undefined sound {sid}")
    # custom blocks
    block_ids = set()
    for p in glob.glob(os.path.join(BP, "blocks", "*.json")):
        block_ids.add(load(p)["minecraft:block"]["description"]["identifier"])
    # items, recipes, blocks, attachables and loot tables point at things that exist
    item_ids = set()
    for p in glob.glob(os.path.join(BP, "items", "*.json")):
        it = load(p)["minecraft:item"]
        item_ids.add(it["description"]["identifier"])
        icon = it["components"].get("minecraft:icon")
        icon = icon if isinstance(icon, str) else (icon or {}).get("textures", {}).get("default")
        if icon and icon not in items_tex:
            problem(f"{os.path.basename(p)}: icon {icon} missing from item_texture.json")
    # particles, entities, items, blocks, entity events and dynamic properties used by scripts exist
    pids = {load(p)["particle_effect"]["description"]["identifier"] for p in glob.glob(os.path.join(RP, "particles", "*.json"))}
    events = set()
    for p in glob.glob(os.path.join(BP, "entities", "*.json")):
        events |= set(load(p)["minecraft:entity"].get("events", {}).keys())
    dynamic = {"zt:run", "zt:keep", "zt:gap", "zt:fake", "zt:doors_mode", "zt:doors_death"}
    for pid in set(re.findall(r'"(zt:[a-z_]*[a-z])"', scripts)):  # (ids built from a prefix like "zt:gum_" skipped)
        if pid.startswith("zt:") and pid not in pids and pid not in bp_ids and pid not in item_ids:
            if not pid.startswith("zt:as_") and pid not in ("zt:start_birth", "zt:end_birth", "zt:natural_spawns",
                                                            "zt:looted", "zt:df_mode", "zt:last_natural_spawn", "zt:gum_gum",
                                                            ) and pid not in all_props and pid not in block_ids \
                    and pid not in events and pid not in dynamic:
                problem(f"script references unknown id {pid}")
    ours = item_ids | block_ids | {d for d in bp_ids}
    for p in glob.glob(os.path.join(BP, "recipes", "*.json")):
        text = open(p).read()
        for ref in set(re.findall(r'"(zt:[a-z_]+)"', text)):
            r = load(p)
            ident = next(iter(v for k, v in r.items() if k.startswith("minecraft:recipe")))["description"]["identifier"]
            if ref != ident and ref not in ours:
                problem(f"{os.path.basename(p)}: unknown item {ref}")
            if ref == ident and ref not in ours and not ref.endswith("_to_obsidian"):
                problem(f"{os.path.basename(p)}: recipe {ref} has no matching item")
    terrain = {}
    tp = os.path.join(RP, "textures", "terrain_texture.json")
    if os.path.exists(tp):
        terrain = load(tp)["texture_data"]
        for k, v in terrain.items():
            if not tex_exists(v["textures"]):
                problem(f"terrain texture {k} -> {v['textures']} missing")
    for p in glob.glob(os.path.join(BP, "blocks", "*.json")):
        block = load(p)
        comps = block["minecraft:block"]["components"]
        # block tags moved into minecraft:tags in format 1.26.20; older formats don't know it
        if "minecraft:tags" in comps and tuple(map(int, block["format_version"].split("."))) < (1, 26, 20):
            problem(f"{os.path.basename(p)}: minecraft:tags needs format_version 1.26.20 or later")
        for inst in comps.get("minecraft:material_instances", {}).values():
            if inst.get("texture") and inst["texture"] not in terrain:
                problem(f"{os.path.basename(p)}: texture {inst['texture']} missing from terrain_texture.json")
        loot = comps.get("minecraft:loot")
        if loot and not os.path.exists(os.path.join(BP, loot)):
            problem(f"{os.path.basename(p)}: loot table {loot} missing")
    for p in glob.glob(os.path.join(BP, "entities", "*.json")):
        comps = load(p)["minecraft:entity"]
        text = json.dumps(comps)
        for table in set(re.findall(r'"(loot_tables/[^"]+)"', text)):
            if not os.path.exists(os.path.join(BP, table)):
                problem(f"{os.path.basename(p)}: {table} missing")
    for p in glob.glob(os.path.join(RP, "attachables", "*.json")):
        d = load(p)["minecraft:attachable"]["description"]
        for t in d.get("textures", {}).values():
            if not t.startswith("textures/misc/") and not tex_exists(t):
                problem(f"{os.path.basename(p)}: texture {t} missing")
        for it in list(d.get("item", {}).keys()) + [d["identifier"].split(".")[0]]:
            if it.startswith("zt:") and it not in item_ids:
                problem(f"{os.path.basename(p)}: attaches to unknown item {it}")
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
