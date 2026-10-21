"""Erzeugt das Lauschring-Logo als SVG + PNG und ersetzt die Flutter-Standard-Icons."""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(sys.argv[1])
BRAND = ROOT / "brand"
APP = ROOT / "app"

NAVY = (27, 35, 51)
TOKEN = (255, 244, 230)
AMBER = (255, 190, 92)
CORAL = (232, 102, 61)
N, LIT = 12, 9


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def dots():
    """(x, y, farbe, leuchtet) in Einheiten von 0..1, Start oben, im Uhrzeigersinn."""
    for i in range(N):
        a = -math.pi / 2 + i * 2 * math.pi / N
        lit = i < LIT
        color = lerp(AMBER, CORAL, i / (LIT - 1)) if lit else CORAL
        yield 0.5 + 0.315 * math.cos(a), 0.5 + 0.315 * math.sin(a), color, lit


DOT_R, TOKEN_R = 0.056, 0.165


def render(size, rounded, scale=4):
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bg = Image.new("L", (s, s), 0)
    ImageDraw.Draw(bg).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22) if rounded else 0, fill=255)
    img.paste(Image.new("RGBA", (s, s), NAVY + (255,)), mask=bg)

    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for x, y, c, lit in dots():
        if lit:
            r = DOT_R * 1.7 * s
            gd.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=c + (75,))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.022))
    img = Image.alpha_composite(img, Image.composite(glow, Image.new("RGBA", (s, s), (0, 0, 0, 0)), bg))

    d = ImageDraw.Draw(img)
    for x, y, c, lit in dots():
        r = DOT_R * s
        fill = c + (255,) if lit else lerp(NAVY, CORAL, 0.28) + (255,)
        d.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=fill)
    r = TOKEN_R * s
    d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=TOKEN + (255,))
    return img.resize((size, size), Image.LANCZOS)


def svg():
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Lauschring">',
        "<defs>",
        '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="11"/></filter>',
        "</defs>",
        f'<rect width="512" height="512" rx="113" fill="rgb{NAVY}"/>',
        '<g filter="url(#glow)" opacity="0.3">',
    ]
    for x, y, c, lit in dots():
        if lit:
            parts.append(f'<circle cx="{x*512:.1f}" cy="{y*512:.1f}" r="{DOT_R*512*2:.1f}" fill="rgb{c}"/>')
    parts.append("</g>")
    for x, y, c, lit in dots():
        fill = f"rgb{c}" if lit else f"rgb{lerp(NAVY, CORAL, 0.28)}"
        parts.append(f'<circle cx="{x*512:.1f}" cy="{y*512:.1f}" r="{DOT_R*512:.1f}" fill="{fill}"/>')
    parts.append(f'<circle cx="256" cy="256" r="{TOKEN_R*512:.1f}" fill="rgb{TOKEN}"/>')
    parts.append("</svg>")
    return "\n".join(parts).replace(", ", ",") + "\n"


BRAND.mkdir(exist_ok=True)
(BRAND / "logo.svg").write_text(svg(), encoding="utf-8")
render(1024, rounded=True).save(BRAND / "logo-1024.png")
render(1024, rounded=False).save(BRAND / "icon-square-1024.png")
(APP / "assets").mkdir(exist_ok=True)
render(512, rounded=True).save(APP / "assets" / "logo.png")

# Vorhandene Flutter-Icons in gleicher Größe ersetzen.
# iOS + maskierbare Web-Icons: randlos (das System rundet selbst), sonst abgerundet.
replaced = []
for p in list(APP.glob("android/app/src/main/res/mipmap-*/ic_launcher.png")) + \
        list(APP.glob("ios/Runner/Assets.xcassets/AppIcon.appiconset/*.png")) + \
        list(APP.glob("web/icons/*.png")) + [APP / "web" / "favicon.png"]:
    if not p.exists():
        continue
    size = Image.open(p).size[0]
    square = "ios" in p.parts or "maskable" in p.name
    img = render(size, rounded=not square, scale=max(4, 4096 // size // 4))
    if "ios" in p.parts:
        img = img.convert("RGB")  # App Store verlangt Icons ohne Alpha
    img.save(p)
    replaced.append(f"{p.relative_to(APP)} ({size}px)")
print("\n".join(replaced))
