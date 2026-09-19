"""Generates the PWA icons.

Run manually; the PNGs are committed. Drawn from the same shapes the game
itself uses — arena, shockwave ring, boss, party — so the icon is generated
rather than illustrated, and stays consistent if the palette changes.

    python3 scripts/make-icons.py
"""

import math
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

BG = (10, 10, 15, 255)
FLOOR = (20, 20, 28, 255)
EDGE = (43, 43, 61, 255)
RING = (253, 224, 71, 255)
BOSS = (239, 68, 68, 255)
PLAYER = (74, 222, 128, 255)
TANK = (96, 165, 250, 255)
HEALER = (240, 171, 252, 255)

# Supersample, then downscale, so the circles come out clean.
SS = 4


def disc(draw, cx, cy, r, fill=None, outline=None, width=1):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline=outline, width=width)


def render(size, safe=1.0):
    """safe < 1 shrinks the artwork for maskable icons."""
    n = size * SS
    img = Image.new("RGBA", (n, n), BG)
    d = ImageDraw.Draw(img)

    c = n / 2
    scale = (n / 2) * safe

    disc(d, c, c, scale * 0.86, fill=FLOOR)
    disc(d, c, c, scale * 0.86, outline=EDGE, width=int(scale * 0.035))

    # Shockwave ring mid-expansion.
    disc(d, c, c, scale * 0.60, outline=RING, width=int(scale * 0.07))

    # Boss at the centre.
    disc(d, c, c, scale * 0.20, fill=BOSS)

    # Party arranged around it.
    party = [(PLAYER, 0.42), (TANK, 0.30), (HEALER, 0.42)]
    for i, (colour, dist) in enumerate(party):
        angle = math.radians(90 + i * 120)
        px = c + math.cos(angle) * scale * dist
        py = c + math.sin(angle) * scale * dist
        disc(d, px, py, scale * 0.075, fill=colour)

    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for size in (192, 512):
    render(size).save(os.path.join(OUT, f"icon-{size}.png"))
# Maskable icons get cropped to a circle on some launchers; keep clear of the rim.
render(512, safe=0.78).save(os.path.join(OUT, "icon-maskable-512.png"))
render(180).save(os.path.join(OUT, "apple-touch-icon.png"))
render(32).save(os.path.join(OUT, "favicon-32.png"))

print("wrote", ", ".join(sorted(os.listdir(OUT))))
