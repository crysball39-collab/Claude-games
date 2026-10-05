"""Tiny helper for writing Bedrock geometry with box UV (used by the Doors generators).

A Geo collects named texture parts (box-UV regions packed into the atlas in
the order they are declared), bones and cubes, and writes the
"minecraft:geometry" JSON. Painters look the regions up again with faces().
"""
import math

from texlib import box_faces, scaled


def r4(v):
    return round(float(v), 4)


class Geo:
    def __init__(self, ident, tex_w, tex_h, bounds_w, bounds_h, bounds_offset=(0, 0, 0)):
        self.ident = ident
        self.tw, self.th = tex_w, tex_h
        self.bounds = (bounds_w, bounds_h, list(bounds_offset))
        self.parts = {}
        self.bones = []
        self._x = self._y = self._row = 0

    # -- texture parts ------------------------------------------------------------------------
    def part(self, name, w, h, d):
        """Reserve a box-UV region for a w x h x d cube (shared by every cube that uses `name`)."""
        if name in self.parts:
            if self.parts[name][1] != (w, h, d):
                raise ValueError(f"part {name} declared twice with different sizes")
            return
        rw, rh = math.ceil(2 * d + 2 * w), math.ceil(d + h)
        if self._x + rw > self.tw:
            self._x, self._y, self._row = 0, self._y + self._row, 0
        if self._y + rh > self.th or rw > self.tw:
            raise ValueError(f"{self.ident}: no room for part {name} ({rw} x {rh})")
        self.parts[name] = ((self._x, self._y), (w, h, d))
        self._x += rw
        self._row = max(self._row, rh)

    def faces(self, name, s=1):
        (u, v), (w, h, d) = self.parts[name]
        return {k: scaled(rr, s) for k, rr in box_faces(u, v, w, h, d).items()}

    # -- bones --------------------------------------------------------------------------------
    def cube(self, part, origin, rotation=None, pivot=None, inflate=0.0, mirror=False):
        (u, v), size = self.parts[part]
        c = {"origin": [r4(x) for x in origin], "size": [r4(x) for x in size], "uv": [u, v]}
        if rotation is not None:
            c["rotation"] = [r4(x) for x in rotation]
            c["pivot"] = [r4(x) for x in (pivot if pivot is not None else origin)]
        if inflate:
            c["inflate"] = inflate
        if mirror:
            c["mirror"] = True
        return c

    def bone(self, name, parent=None, pivot=(0, 0, 0), rotation=None, cubes=(), mirror=False):
        b = {"name": name, "pivot": [r4(x) for x in pivot]}
        if parent:
            b["parent"] = parent
        if rotation is not None:
            b["rotation"] = [r4(x) for x in rotation]
        if mirror:
            b["mirror"] = True
        if cubes:
            b["cubes"] = list(cubes)
        self.bones.append(b)
        return b

    def json(self):
        w, h, off = self.bounds
        return {
            "description": {
                "identifier": self.ident,
                "texture_width": self.tw,
                "texture_height": self.th,
                "visible_bounds_width": w,
                "visible_bounds_height": h,
                "visible_bounds_offset": off,
            },
            "bones": self.bones,
        }


def geometry_file(*geos):
    return {"format_version": "1.12.0", "minecraft:geometry": [g.json() for g in geos]}
