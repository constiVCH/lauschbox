"""Erzeugt Piktogramm und Logo der Lauschbox (SVG + PNG) und die App-Icons in testapp/assets.

Motiv: die Box von vorn. Vorne der LED-Ring, oben die drei Tasten, darüber flach die Kordel als Griff. Die Schallbögen links und rechts stehen für die Lautsprecher in den Seiten.
Piktogramm und Logo nutzen dieselbe Zeichnung: das Piktogramm einfarbig mit echten Aussparungen (zum Drucken,
Lasern, Plotten), das Logo farbig auf Navy.

Aufruf: python brand/make_logo.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
ASSETS = ROOT / "testapp" / "assets"

NAVY = "#1B2333"
CREAM = "#FFF4E6"
AMBER = "#FFBE5C"
CORAL = "#E8663D"
CORAL_DARK = "#B04224"
CORD_COLOR = "#8A7F78"  # gedämpftes Grau-Braun: Kordel tritt zurück

# Geometrie in einem 512er-Quadrat
STROKE = 14
CORD_STROKE = 7  # die Kordel dünn und dezent
CORD = ((150, 232), (256, 120), (362, 232))  # quadratische Kurve: Start, Kontrollpunkt, Ende
BUTTONS = [(c - 15, 214, c + 15, 236, 7) for c in (212, 256, 300)]
BODY = (120, 228, 392, 412, 36)
RING_C, RING_R, DOT_R = (256, 320), 58, 9  # LED-Ring vorn: 12 Punkte
N, LIT = 12, 9
WAVES = [(170, 20), (196, 15)]  # Radius um die Mitte der Box, halber Winkel in Grad


def shapes(colored: bool):
    """Zeichenschritte von hinten nach vorn: (form, parameter, farbe). Farbe None = Aussparung."""
    ops = [("curve", CORD, CORD_COLOR if colored else "fg")]
    ops.append(("rrect", BODY, CORAL if colored else "fg"))
    ops += [("rrect", b, CORAL_DARK if colored else "fg") for b in BUTTONS]
    for radius, half in WAVES:
        for side in (0, 180):
            ops.append(("arc", (RING_C, radius, side - half, side + half), AMBER if colored else "fg"))
    for i in range(N):
        a = math.radians(-90 + i * 360 / N)
        p = (RING_C[0] + RING_R * math.cos(a), RING_C[1] + RING_R * math.sin(a))
        ops.append(("circle", (p, DOT_R), (CREAM if i < LIT else CORAL_DARK) if colored else None))
    return ops


def _bezier(points, steps=64):
    (x0, y0), (cx, cy), (x1, y1) = points
    return [((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1)
            for t in (i / steps for i in range(steps + 1))]


def _arc_points(center, radius, a0, a1, steps=32):
    return [(center[0] + radius * math.cos(math.radians(a)), center[1] + radius * math.sin(math.radians(a)))
            for a in (a0 + (a1 - a0) * i / steps for i in range(steps + 1))]


def draw(d: ImageDraw.ImageDraw, ops, k: float, color_of) -> None:
    """k: Pixel je Einheit. color_of: Farbe des Zeichenschritts → PIL-Farbe."""
    for kind, p, color in ops:
        fill = color_of(color)
        if kind == "rrect":
            x0, y0, x1, y1, r = p
            d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=r * k, fill=fill)
        elif kind == "circle":
            (cx, cy), r = p
            d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=fill)
        else:
            pts = _bezier(p) if kind == "curve" else _arc_points(*p)
            w = (CORD_STROKE if kind == "curve" else STROKE) * k
            d.line([(x * k, y * k) for x, y in pts], fill=fill, width=round(w), joint="curve")
            for x, y in (pts[0], pts[-1]):  # runde Enden
                d.ellipse([x * k - w / 2, y * k - w / 2, x * k + w / 2, y * k + w / 2], fill=fill)


def render(size: int, background: bool, rounded: bool = False, inset: float = 0.0, scale: int = 4) -> Image.Image:
    """Farbiges Logo. inset: Rand in Anteilen der Kantenlänge (Android-Icons brauchen eine Sicherheitszone)."""
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22) if rounded else 0, fill=NAVY)
    k = s * (1 - 2 * inset) / 512
    layer = Image.new("RGBA", (int(512 * k), int(512 * k)), (0, 0, 0, 0))
    ops = shapes(colored=True)
    if not background:
        # Ohne Hintergrund müssen die Abstände um die Tasten durchsichtig sein statt Navy
        ops = [(kind, p, None if c == NAVY else c) for kind, p, c in ops]
    draw(ImageDraw.Draw(layer), ops, k, lambda c: (0, 0, 0, 0) if c is None else c)
    off = int(s * inset)
    img.alpha_composite(layer, (off, off))
    return img.resize((size, size), Image.LANCZOS)


def _svg_shape(kind, p, attrs: str) -> str:
    if kind == "rrect":
        x0, y0, x1, y1, r = p
        return f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" {attrs}/>'
    if kind == "circle":
        (cx, cy), r = p
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" {attrs}/>'
    if kind == "curve":
        (x0, y0), (cx, cy), (x1, y1) = p
        path = f"M{x0} {y0} Q{cx} {cy} {x1} {y1}"
    else:
        (sx, sy), (ex, ey) = _arc_points(*p, steps=1)
        path = f"M{sx:.1f} {sy:.1f} A{p[1]} {p[1]} 0 0 1 {ex:.1f} {ey:.1f}"
    width = CORD_STROKE if kind == "curve" else STROKE
    return f'<path d="{path}" fill="none" stroke-width="{width}" stroke-linecap="round" {attrs.replace("fill=", "stroke=")}/>'


def svg_pictogram() -> str:
    # Maske: Weiß zeichnet, Schwarz spart aus. So bleibt das Piktogramm eine einzige Farbe (currentColor).
    body = "\n".join(_svg_shape(kind, p, f'fill="{"black" if c is None else "white"}"') for kind, p, c in shapes(colored=False))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Lauschbox">\n'
        "<!-- Piktogramm der Lauschbox, einfarbig (currentColor). Erzeugt von brand/make_logo.py -->\n"
        f'<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">\n{body}\n</mask>\n'
        '<rect width="512" height="512" fill="currentColor" mask="url(#m)"/>\n</svg>\n'
    )


def svg_logo() -> str:
    body = "\n".join(_svg_shape(kind, p, f'fill="{c}"') for kind, p, c in shapes(colored=True))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Lauschbox">\n'
        "<!-- Logo der Lauschbox. Erzeugt von brand/make_logo.py -->\n"
        f'<rect width="512" height="512" rx="113" fill="{NAVY}"/>\n{body}\n</svg>\n'
    )


def pictogram_png(size: int, color: str = NAVY, scale: int = 4) -> Image.Image:
    s = size * scale
    mask = Image.new("L", (s, s), 0)
    draw(ImageDraw.Draw(mask), shapes(colored=False), s / 512, lambda c: 0 if c is None else 255)
    img = Image.new("RGBA", (s, s), color)
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    (BRAND / "piktogramm.svg").write_text(svg_pictogram(), encoding="utf-8")
    (BRAND / "logo.svg").write_text(svg_logo(), encoding="utf-8")
    pictogram_png(1024).save(BRAND / "piktogramm-1024.png")
    render(1024, background=True, rounded=True).save(BRAND / "logo-1024.png")
    render(1024, background=True).save(BRAND / "icon-square-1024.png")
    render(1024, background=True, rounded=True).save(ASSETS / "logo.png")
    render(1024, background=True).save(ASSETS / "icon.png")
    render(1024, background=False, inset=0.17).save(ASSETS / "android-icon-foreground.png")  # Hintergrund kommt aus app.json
    render(1024, background=False, inset=0.12).save(ASSETS / "splash-icon.png")
    render(48, background=True, rounded=True).save(ASSETS / "favicon.png")
