"""Small procedural pixel-art toolkit used by gen_textures.py.

Everything works on float RGBA numpy canvases (0..255) so noise and blending
stay cheap, and is written out with Pillow at the end.
"""
import math

import numpy as np
from PIL import Image


class Canvas:
    def __init__(self, w, h, fill=(0, 0, 0, 0)):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), dtype=np.float64)
        self.a[:, :] = fill

    # -- basic access -------------------------------------------------------
    def rect(self, x, y, w, h, color):
        x0, y0 = max(0, int(x)), max(0, int(y))
        x1, y1 = min(self.w, int(x + w)), min(self.h, int(y + h))
        if x1 > x0 and y1 > y0:
            self.a[y0:y1, x0:x1] = _rgba(color)

    def px(self, x, y, color):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = _rgba(color)

    def blend_px(self, x, y, color, t):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            c = np.array(_rgba(color), dtype=np.float64)
            self.a[y, x, :3] = self.a[y, x, :3] * (1 - t) + c[:3] * t
            self.a[y, x, 3] = max(self.a[y, x, 3], c[3])

    def get(self, x, y):
        return self.a[int(y), int(x)]

    def save(self, path):
        img = Image.fromarray(np.clip(np.round(self.a), 0, 255).astype(np.uint8), "RGBA")
        img.save(path)
        return img


def _rgba(c):
    if len(c) == 3:
        return (c[0], c[1], c[2], 255)
    return tuple(c)


def hexc(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


# -- noise --------------------------------------------------------------------
def value_noise(w, h, cell, seed):
    """Smooth value noise in 0..1, cell = feature size in pixels."""
    rng = np.random.default_rng(seed)
    cell = max(1.0, float(cell))
    gw, gh = int(w / cell) + 3, int(h / cell) + 3
    grid = rng.random((gh, gw))
    ys = np.arange(h) / cell
    xs = np.arange(w) / cell
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    ty = ys - y0
    tx = xs - x0
    ty = ty * ty * (3 - 2 * ty)
    tx = tx * tx * (3 - 2 * tx)
    a = grid[y0][:, x0]
    b = grid[y0][:, x0 + 1]
    c = grid[y0 + 1][:, x0]
    d = grid[y0 + 1][:, x0 + 1]
    top = a + (b - a) * tx[None, :]
    bot = c + (d - c) * tx[None, :]
    return top + (bot - top) * ty[:, None]


def fbm(w, h, seed, cell=16, octaves=4):
    total = np.zeros((h, w))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(w, h, cell / (2 ** o), seed + o * 101)
        norm += amp
        amp *= 0.5
    return total / norm


class Painter:
    """Paints materials into rectangular regions of a canvas.

    A single full-canvas noise field is shared so neighbouring faces of a box
    get coherent blotches.
    """

    def __init__(self, canvas, seed=1):
        self.c = canvas
        self.rng = np.random.default_rng(seed)
        self.n1 = fbm(canvas.w, canvas.h, seed + 1, cell=10, octaves=4)
        self.n2 = fbm(canvas.w, canvas.h, seed + 2, cell=5, octaves=3)
        self.grain = self.rng.random((canvas.h, canvas.w))

    def material(self, x, y, w, h, dark, mid, light, contrast=1.0, grain=0.12):
        """Fill a region with a 3-tone noisy material."""
        x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
        n = self.n1[y0:y1, x0:x1] * 0.65 + self.n2[y0:y1, x0:x1] * 0.35
        n = (n - 0.5) * contrast + 0.5
        n = n + (self.grain[y0:y1, x0:x1] - 0.5) * grain
        n = np.clip(n, 0, 1)
        dark, mid, light = (np.array(_rgba(c), dtype=np.float64) for c in (dark, mid, light))
        lo = n < 0.5
        t = np.where(lo, n / 0.5, (n - 0.5) / 0.5)[..., None]
        out = np.where(lo[..., None], dark + (mid - dark) * t, mid + (light - mid) * t)
        self.c.a[y0:y1, x0:x1] = out

    def blotches(self, x, y, w, h, color, threshold=0.62, field=None, soft=0.08, alpha=1.0):
        """Overlay `color` where the noise field exceeds threshold."""
        x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
        f = (self.n2 if field is None else field)[y0:y1, x0:x1]
        t = np.clip((f - threshold) / soft, 0, 1)[..., None] * alpha
        col = np.array(_rgba(color), dtype=np.float64)
        reg = self.c.a[y0:y1, x0:x1]
        reg[..., :3] = reg[..., :3] * (1 - t) + col[:3] * t

    def shade_edges(self, x, y, w, h, amount=0.18, width=None):
        """Darken the border of a face slightly so boxes read as volumes."""
        x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
        ww, hh = x1 - x0, y1 - y0
        if ww <= 0 or hh <= 0:
            return
        width = width or max(1, min(ww, hh) // 8)
        yy, xx = np.mgrid[0:hh, 0:ww]
        d = np.minimum.reduce([xx, yy, ww - 1 - xx, hh - 1 - yy]).astype(np.float64)
        t = np.clip(1 - d / width, 0, 1) * amount
        reg = self.c.a[y0:y1, x0:x1]
        reg[..., :3] *= (1 - t)[..., None]

    def vertical_gradient(self, x, y, w, h, top_mul, bottom_mul):
        x0, y0, x1, y1 = int(x), int(y), int(x + w), int(y + h)
        hh = y1 - y0
        if hh <= 0:
            return
        m = np.linspace(top_mul, bottom_mul, hh)[:, None, None]
        self.c.a[y0:y1, x0:x1, :3] *= m


def box_faces(u, v, w, h, d):
    """Standard Minecraft box-UV layout, in texture units.

    right = the model's right side (-X), front = the face side.
    """
    return {
        "top": (u + d, v, w, d),
        "bottom": (u + d + w, v, w, d),
        "right": (u, v + d, d, h),
        "front": (u + d, v + d, w, h),
        "left": (u + d + w, v + d, d, h),
        "back": (u + 2 * d + w, v + d, w, h),
    }


def scaled(rect, s):
    x, y, w, h = rect
    return (x * s, y * s, w * s, h * s)


def ragged_edge(rng, length, base, amp, smooth=2):
    """1-D ragged line (e.g. a torn hem)."""
    vals = rng.random(length + smooth * 2)
    k = np.ones(smooth * 2 + 1) / (smooth * 2 + 1)
    vals = np.convolve(vals, k, mode="same")[smooth:smooth + length]
    return base + (vals - 0.5) * 2 * amp


def radial(w, h, cx, cy, r):
    yy, xx = np.mgrid[0:h, 0:w]
    return np.sqrt((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2) / r


def to_image(arr):
    return Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), "RGBA")


def circle_mask(size, cx, cy, r):
    yy, xx = np.mgrid[0:size[1], 0:size[0]]
    return ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2) <= r * r


def deg(a):
    return a * math.pi / 180.0
