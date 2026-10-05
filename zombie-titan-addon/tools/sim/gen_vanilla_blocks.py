#!/usr/bin/env python3
"""Writes tools/sim/vanilla-blocks.json: every vanilla block and the states it accepts, for a few
versions of Minecraft, so the simulator can refuse a block or state the real game would refuse.

The lists come from Mojang's bedrock-samples (metadata/vanilladata_modules/mojang-blocks.json).
The first version given is stored whole; the others as differences from it.

    python3 tools/sim/gen_vanilla_blocks.py 1.26.50=<mojang-blocks.json> 1.21.90=<mojang-blocks.json> ...

An older list is at https://raw.githubusercontent.com/Mojang/bedrock-samples/v1.21.90.3/metadata/vanilladata_modules/mojang-blocks.json
"""
import json
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vanilla-blocks.json")


def load(path):
    d = json.load(open(path))
    props = {p["name"]: [v["value"] for v in p["values"]] for p in d["block_properties"]}
    blocks = {b["name"]: sorted(p["name"] for p in b.get("properties", [])) for b in d["data_items"]}
    used = {p for names in blocks.values() for p in names}
    return {"props": {k: props[k] for k in sorted(used)}, "blocks": dict(sorted(blocks.items()))}


def main(args):
    if not args:
        args = ["1.26.50=/home/user/mojang/bedrock-samples/metadata/vanilladata_modules/mojang-blocks.json"]
    versions = []
    for a in args:
        name, path = a.split("=", 1)
        versions.append((name, load(path)))
    base_name, base = versions[0]
    out = {"base": base_name, "versions": {base_name: base}}
    for name, v in versions[1:]:
        out["versions"][name] = {
            "props": {k: vals for k, vals in v["props"].items() if base["props"].get(k) != vals},
            "blocks": {k: p for k, p in v["blocks"].items() if base["blocks"].get(k) != p},
            "removed": sorted(k for k in base["blocks"] if k not in v["blocks"]),
        }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=False)
        f.write("\n")
    for name, v in out["versions"].items():
        print(name, len(v["blocks"]), "blocks", "(whole)" if name == base_name else "(differences)")
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main(sys.argv[1:])
