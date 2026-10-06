"""Offline preview renderer for Bedrock geometry + animations (dev tool).

Renders a .geo.json with its texture, optionally posed by an animation at a
given time, to a PNG using an orthographic camera. It understands box UV,
bone hierarchies, pivots, bind rotations, inflate, mirror and the rotation
conventions Bedrock uses (front of the model is -Z, the model's right side is
-X, negative X rotation raises a limb forward, positive Y turns right,
positive Z swings a hanging limb out to the right).

    python3 tools/preview.py geo.json texture.png out.png [anim.json anim_name t] [yaw]
"""
import json
import math
import re
import sys

import numpy as np
from PIL import Image, ImageDraw


def load_json(path):
    s = open(path).read()
    s = re.sub(r"//[^\n]*", "", s)
    return json.loads(s)


# ---------------------------------------------------------------- molang (subset)
def ternaries(e):
    """Rewrite Molang `cond ? a : b` (nested and parenthesised too) as Python `(a if cond else b)`."""
    out, i = "", 0
    while i < len(e):
        if e[i] == "(":
            depth, j = 1, i + 1
            while depth:
                depth += {"(": 1, ")": -1}.get(e[j], 0)
                j += 1
            out += "(" + ternaries(e[i + 1:j - 1]) + ")"
            i = j
        else:
            out += e[i]
            i += 1
    depth, q = 0, -1
    for k, ch in enumerate(out):
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if ch == "?" and depth == 0:
            q = k
            break
    if q < 0:
        return out
    depth, nest, colon = 0, 0, -1
    for k in range(q + 1, len(out)):
        ch = out[k]
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if depth == 0 and ch == "?":
            nest += 1
        elif depth == 0 and ch == ":":
            if nest == 0:
                colon = k
                break
            nest -= 1
    return "((%s) if (%s) else (%s))" % (out[q + 1:colon], out[:q], ternaries(out[colon + 1:]))


def molang(expr, t, ctx=None):
    if isinstance(expr, (int, float)):
        return float(expr)
    e = str(expr).strip()
    if e == "":
        return 0.0
    ctx = ctx or {}
    e = re.sub(r"\bq(uery)?\.anim_time\b", "__t", e)
    e = re.sub(r"\bq(uery)?\.life_time\b", "__t", e)
    e = re.sub(r"\bq(uery)?\.property\('([^']+)'\)", lambda m: repr(ctx.get(m.group(2), 0)), e)
    e = re.sub(r"\b(v|variable)\.([a-z_0-9]+)", lambda m: repr(ctx.get("v." + m.group(2), 0)), e)
    e = re.sub(r"\bq(?:uery)?\.([a-z_0-9]+)\b(?!\()", lambda m: repr(ctx.get("q." + m.group(1), 0)), e)
    e = re.sub(r"\bmath\.sin\(", "__sin(", e)
    e = re.sub(r"\bmath\.cos\(", "__cos(", e)
    e = re.sub(r"\bmath\.abs\(", "abs(", e)
    e = re.sub(r"\bmath\.min\(", "min(", e)
    e = re.sub(r"\bmath\.max\(", "max(", e)
    e = re.sub(r"\bmath\.clamp\(", "__clamp(", e)
    e = re.sub(r"\bmath\.mod\(", "__mod(", e)
    e = re.sub(r"\bmath\.lerp\(", "__lerp(", e)
    e = re.sub(r"\bmath\.pow\(", "pow(", e)
    e = re.sub(r"\bmath\.sqrt\(", "__sqrt(", e)
    e = re.sub(r"\bmath\.pi\b", repr(math.pi), e)
    e = re.sub(r"\bthis\b", "0", e)
    e = e.replace("&&", " and ").replace("||", " or ")
    e = re.sub(r"!(?!=)", " not ", e)
    e = ternaries(e)
    env = {
        "__t": t,
        "__sin": lambda d: math.sin(math.radians(d)),
        "__cos": lambda d: math.cos(math.radians(d)),
        "__clamp": lambda v, a, b: max(a, min(b, v)),
        "__sqrt": lambda v: math.sqrt(max(0.0, v)),
        "__mod": lambda a, b: math.fmod(a, b),
        "__lerp": lambda a, b, k: a + (b - a) * k,
    }
    return float(eval(e, {"__builtins__": {"abs": abs, "min": min, "max": max, "pow": pow}}, env))


def sample_channel(ch, t, length, ctx):
    """ch: [x,y,z] | expr | {time: value|{pre,post}|{post,lerp_mode}}"""
    if isinstance(ch, list):
        return [molang(v, t, ctx) for v in ch]
    if isinstance(ch, (int, float, str)):
        v = molang(ch, t, ctx)
        return [v, v, v]
    keys = sorted(((float(k), v) for k, v in ch.items()), key=lambda kv: kv[0])

    def val(v, side):
        if isinstance(v, dict):
            if side in v:
                v = v[side]
            elif "post" in v:
                v = v["post"]
            else:
                v = v.get("pre")
        return [molang(x, t, ctx) for x in v]

    if t <= keys[0][0]:
        return val(keys[0][1], "pre")
    if t >= keys[-1][0]:
        return val(keys[-1][1], "post")
    for i in range(len(keys) - 1):
        t0, v0 = keys[i]
        t1, v1 = keys[i + 1]
        if t0 <= t <= t1:
            a = val(v0, "post")
            b = val(v1, "pre")
            k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return [a[j] + (b[j] - a[j]) * k for j in range(3)]
    return [0, 0, 0]


def pose_from_anims(anims, ctx):
    """anims: list of (anim_json_obj, time). Returns {bone: {rot,pos,scale}} (additive)."""
    pose = {}
    for anim, t in anims:
        length = anim.get("animation_length", 0)
        tt = t
        if anim.get("loop") is True and length:
            tt = math.fmod(t, length)
        for bone, chans in anim.get("bones", {}).items():
            p = pose.setdefault(bone.lower(), {"rot": [0, 0, 0], "pos": [0, 0, 0], "scale": [1, 1, 1]})
            if "rotation" in chans:
                r = sample_channel(chans["rotation"], tt, length, ctx)
                p["rot"] = [p["rot"][i] + r[i] for i in range(3)]
            if "position" in chans:
                r = sample_channel(chans["position"], tt, length, ctx)
                p["pos"] = [p["pos"][i] + r[i] for i in range(3)]
            if "scale" in chans:
                r = sample_channel(chans["scale"], tt, length, ctx)
                p["scale"] = [p["scale"][i] * r[i] for i in range(3)]
    return pose


# ---------------------------------------------------------------- math
def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])


def tr(v):
    m = np.eye(4)
    m[:3, 3] = v
    return m


def sc(v):
    return np.diag([v[0], v[1], v[2], 1.0])


def to_preview(v):
    """Bedrock model space -> right-handed preview space (mirror X)."""
    return np.array([-v[0], v[1], v[2]])


def bone_rot_matrix(r):
    # Bedrock values -> preview space rotation (see module docstring)
    return rz(math.radians(r[2])) @ ry(math.radians(-r[1])) @ rx(math.radians(-r[0]))


# ---------------------------------------------------------------- render
def render(geo_path, tex_path, out_path, pose=None, yaw=-35, pitch=18, size=900, hidden=(), scale_px=None):
    geo = load_json(geo_path)["minecraft:geometry"][0]
    desc = geo["description"]
    tw, th = desc["texture_width"], desc["texture_height"]
    tex = Image.open(tex_path).convert("RGBA")
    tex_arr = np.array(tex)
    # treat emissive low-alpha pixels as opaque for preview
    low = (tex_arr[..., 3] > 0) & (tex_arr[..., 3] < 60)
    tex_arr[low, 3] = 255
    tex = Image.fromarray(tex_arr)
    kx, ky = tex.size[0] / tw, tex.size[1] / th
    pose = {k.lower(): v for k, v in (pose or {}).items()}

    bones = {b["name"].lower(): b for b in geo["bones"]}
    mats = {}

    def bone_mat(name):
        if name in mats:
            return mats[name]
        b = bones[name]
        parent = b.get("parent")
        m = bone_mat(parent.lower()) if parent else np.eye(4)
        piv = to_preview(b.get("pivot", [0, 0, 0]))
        p = pose.get(name, {"rot": [0, 0, 0], "pos": [0, 0, 0], "scale": [1, 1, 1]})
        bind = b.get("rotation", [0, 0, 0])
        rot = [bind[i] + p["rot"][i] for i in range(3)]
        pos = to_preview(p["pos"])
        local = tr(pos) @ tr(piv) @ bone_rot_matrix(rot) @ sc(p["scale"]) @ tr(-piv)
        mats[name] = m @ local
        return mats[name]

    # camera
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    # camera looks along -dir; place camera in front of the model (front = -Z)
    view = rx(math.radians(pitch)) @ ry(math.radians(yaw)) @ ry(math.pi)

    faces = []
    for name, b in bones.items():
        if name in hidden or b.get("neverRender"):
            continue
        Mb = bone_mat(name)
        for cube in b.get("cubes", []):
            M = Mb
            if "rotation" in cube:
                cpiv = to_preview(cube.get("pivot", [0, 0, 0]))
                M = Mb @ tr(cpiv) @ bone_rot_matrix(cube["rotation"]) @ tr(-cpiv)
            o = np.array(cube["origin"], dtype=float)
            sz = np.array(cube["size"], dtype=float)
            inf = cube.get("inflate", 0)
            mirror = cube.get("mirror", b.get("mirror", False))
            lo, hi = o - inf, o + sz + inf
            u, v = cube["uv"]
            w, h, d = sz
            # 8 corners in bedrock space
            def C(x, y, z):
                p = to_preview([x, y, z])
                return (view @ M @ np.array([p[0], p[1], p[2], 1.0]))[:3]
            x0, y0, z0 = lo
            x1, y1, z1 = hi
            # face: list of 4 corners (tl, tr, br, bl) in texture orientation, uv rect
            # front (-Z): tex left = model -X (character right)
            F = {
                "front": ([C(x0, y1, z0), C(x1, y1, z0), C(x1, y0, z0), C(x0, y0, z0)], (u + d, v + d, w, h)),
                "back": ([C(x1, y1, z1), C(x0, y1, z1), C(x0, y0, z1), C(x1, y0, z1)], (u + 2 * d + w, v + d, w, h)),
                "right": ([C(x0, y1, z1), C(x0, y1, z0), C(x0, y0, z0), C(x0, y0, z1)], (u, v + d, d, h)),
                "left": ([C(x1, y1, z0), C(x1, y1, z1), C(x1, y0, z1), C(x1, y0, z0)], (u + d + w, v + d, d, h)),
                "top": ([C(x0, y1, z1), C(x1, y1, z1), C(x1, y1, z0), C(x0, y1, z0)], (u + d, v, w, d)),
                "bottom": ([C(x0, y0, z0), C(x1, y0, z0), C(x1, y0, z1), C(x0, y0, z1)], (u + d + w, v, w, d)),
            }
            if mirror:
                F["right"], F["left"] = ((F["right"][0], F["left"][1]), (F["left"][0], F["right"][1]))
            for fname, (pts, uvr) in F.items():
                pts = np.array(pts)
                n = np.cross(pts[3] - pts[0], pts[1] - pts[0])
                if np.linalg.norm(n) < 1e-9:
                    continue
                faces.append((pts, uvr, n / np.linalg.norm(n), mirror))

    if not faces:
        return
    allp = np.concatenate([f[0] for f in faces])
    minx, maxx = allp[:, 0].min(), allp[:, 0].max()
    miny, maxy = allp[:, 1].min(), allp[:, 1].max()
    span = max(maxx - minx, maxy - miny) * 1.1
    k = scale_px or (size / span)
    cxm, cym = (minx + maxx) / 2, (miny + maxy) / 2

    canvas = Image.new("RGBA", (size, size), (120, 160, 200, 255))
    dz = ImageDraw.Draw(canvas)

    def P(p):
        return (size / 2 + (p[0] - cxm) * k, size / 2 - (p[1] - cym) * k)

    # ground line (the model's y = 0) in level views
    if pitch == 0:
        gy = P((0, 0, 0))[1]
        dz.line([(0, gy), (size, gy)], fill=(70, 110, 60, 255), width=2)

    faces.sort(key=lambda f: f[0][:, 2].mean())   # far (low z) first; camera looks toward -z
    zbuf = np.full((size, size), -np.inf)
    ys, xs = np.mgrid[0:size, 0:size]
    for pts, (u, v, w, h), n, mirror in faces:
        if n[2] <= 0:      # facing away (camera at +z)
            continue
        q = [P(p) for p in pts]
        # texture rect in px
        u0, v0, u1, v1 = u * kx, v * ky, (u + w) * kx, (v + h) * ky
        if mirror:
            u0, u1 = u1, u0
        # affine: canvas -> texture.  q0=tl (u0,v0), q1=tr (u1,v0), q3=bl (u0,v1)
        (ax, ay), (bx, by), (_, _), (dx, dy) = q[0], q[1], q[2], q[3]
        Mx = np.array([[bx - ax, dx - ax], [by - ay, dy - ay]])
        if abs(np.linalg.det(Mx)) < 1e-6:
            continue
        inv = np.linalg.inv(Mx)
        # (s,t) = inv @ (X-ax, Y-ay);  U = u0 + s*(u1-u0); V = v0 + t*(v1-v0)
        A = inv[0, 0] * (u1 - u0)
        B = inv[0, 1] * (u1 - u0)
        Cc = u0 - (A * ax + B * ay)
        D = inv[1, 0] * (v1 - v0)
        E = inv[1, 1] * (v1 - v0)
        Fc = v0 - (D * ax + E * ay)
        warped = tex.transform((size, size), Image.AFFINE, (A, B, Cc, D, E, Fc), resample=Image.NEAREST)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).polygon(q, fill=255)
        wa = np.array(warped)
        shade = 0.55 + 0.45 * max(0.0, float(n[2])) + 0.12 * float(n[1])
        wa[..., :3] = np.clip(wa[..., :3].astype(float) * shade, 0, 255).astype(np.uint8)
        alpha = np.minimum(np.array(mask), wa[..., 3])
        # depth test: the face is a plane, so its depth is affine in screen space
        (qx0, qy0), (qx1, qy1), (qx3, qy3) = q[0], q[1], q[3]
        A3 = np.array([[qx0, qy0, 1.0], [qx1, qy1, 1.0], [qx3, qy3, 1.0]])
        if abs(np.linalg.det(A3)) < 1e-9:
            continue
        a, b, c = np.linalg.solve(A3, np.array([pts[0][2], pts[1][2], pts[3][2]]))
        depth = a * (xs + 0.5) + b * (ys + 0.5) + c
        draw = (alpha > 0) & (depth >= zbuf - 1e-6)
        zbuf[draw] = depth[draw]
        cv = np.array(canvas)
        cv[draw] = wa[draw]
        cv[draw, 3] = 255
        canvas = Image.fromarray(cv)
    canvas.save(out_path)


if __name__ == "__main__":
    geo, tex, outp = sys.argv[1:4]
    pose = None
    yaw = -35
    if len(sys.argv) >= 7:
        anims = load_json(sys.argv[4])["animations"]
        pose = pose_from_anims([(anims[sys.argv[5]], float(sys.argv[6]))], {})
    if len(sys.argv) >= 8:
        yaw = float(sys.argv[7])
    render(geo, tex, outp, pose=pose, yaw=yaw)
