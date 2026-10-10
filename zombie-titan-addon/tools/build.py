"""Builds dist/ZombieTitan.mcaddon from the two packs, and dist/PlayerAI_Bridge.mcpack (the
optional pack that lets Players chat through an AI, for dedicated servers).

    python3 tools/build.py              regenerate textures/animations/particles/sounds, then package
    python3 tools/build.py --no-gen     package the packs as they are

The .mcaddon is a zip with one folder per pack (ZombieTitan_BP/, ZombieTitan_RP/); the .mcpack
has its pack's files at the top. Entries are written in a fixed order with a fixed timestamp,
so rebuilding unchanged packs gives byte-identical files.
"""
import json
import os
import re
import subprocess
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PACKS = os.path.join(ROOT, "packs")
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "ZombieTitan.mcaddon")
PACK_DIRS = ("ZombieTitan_BP", "ZombieTitan_RP")
BRIDGE = "PlayerAI_Bridge_BP"
BRIDGE_OUT = os.path.join(DIST, "PlayerAI_Bridge.mcpack")
GENERATORS = (
    "gen_textures.py",
    "gen_models.py",  # skeleton geometry; gen_skeleton_art.py paints its UV layout
    "gen_skeleton_art.py",
    "gen_animations.py",
    "gen_skeleton_anims.py",
    "gen_particles.py",
    "gen_sounds.py",
    "gen_items_art.py",
    "gen_items_data.py",
    "gen_creeper_art.py",
    "gen_creeper_anims.py",
    "gen_creeper_data.py",
    "gen_spider_art.py",
    "gen_spider_anims.py",
    "gen_spider_data.py",  # after gen_creeper_data.py: both add to item_texture.json and the render controllers
    "gen_omegafish_art.py",
    "gen_omegafish_anims.py",
    "gen_omegafish_data.py",  # after gen_spider_data.py: it adds to the same files
    "gen_gum_art.py",
    "gen_gum_anims.py",
    "gen_gum_data.py",
    "gen_doors_art.py",
    "gen_hotel_art.py",
    "gen_doors_anims.py",
    "gen_doors_audio.py",
    "gen_doors_data.py",  # after gen_items_data.py: it adds to terrain_texture.json and blocks.json
    "gen_floor1_art.py",
    "gen_floor1_blocks.py",
    "gen_floor1_anims.py",
    "gen_floor1_audio.py",
    "gen_floor1_data.py",  # after gen_doors_data.py: it adds to the texture lists, blocks.json and the render controllers
    "gen_player_art.py",
    "gen_player_anims.py",
    "gen_player_data.py",  # after the others: it adds to item_texture.json and the render controllers
)
SKIP = re.compile(r"(^|/)(\.|__pycache__|Thumbs\.db$)")
STAMP = (2026, 1, 1, 0, 0, 0)


def generate():
    for g in GENERATORS:
        print("running", g)
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", g)], check=True, stdout=subprocess.DEVNULL)


def check_json(path):
    text = open(path, encoding="utf-8").read()
    # UI files may carry // comments, which Minecraft accepts
    json.loads(re.sub(r"(?m)^\s*//[^\n]*$", "", text))


def pack_files(pack, inside):
    """(name in the zip, path) for each file of a pack; `inside` puts them under the pack's folder."""
    base = os.path.join(PACKS, pack)
    if not os.path.isfile(os.path.join(base, "manifest.json")):
        sys.exit(f"{pack} has no manifest.json")
    files = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames.sort()
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            arc = os.path.relpath(path, PACKS if inside else base).replace(os.sep, "/")
            if SKIP.search(arc):
                continue
            if name.endswith(".json"):
                check_json(path)
            files.append((arc, path))
    return files


def write_zip(out, files):
    tmp = out + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for arc, path in files:
            info = zipfile.ZipInfo(arc, STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(path, "rb") as f:
                z.writestr(info, f.read())
    os.replace(tmp, out)
    print(f"wrote {os.path.relpath(out, ROOT)}: {len(files)} files, {os.path.getsize(out) // 1024} KB")


def package():
    os.makedirs(DIST, exist_ok=True)
    write_zip(OUT, [f for pack in PACK_DIRS for f in pack_files(pack, True)])
    write_zip(BRIDGE_OUT, pack_files(BRIDGE, False))


if __name__ == "__main__":
    if "--no-gen" not in sys.argv[1:]:
        generate()
    package()
