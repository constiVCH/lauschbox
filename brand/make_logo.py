"""Erzeugt Logo und Piktogramm der Lauschbox (SVG + PNG) und die App-Icons in testapp/assets.

Motiv, bewusst schlicht: eine abgerundete Box mit Henkel, vorn ein Fortschrittsring (der LED-Ring beim Abspielen) mit
Play-Zeichen. Box mit Henkel = tragbares Gerät, Ring + Play = es spielt etwas ab.
- Logo und Piktogramm: Motiv mit dem Namen darunter (Nunito ExtraBold, SIL OFL, brand/fonts/), alles vertikal zentriert.
  Im SVG ist der Name als Pfad gespeichert, es braucht also keine installierte Schrift.
- App-Icons: nur das Motiv, denn der Name wäre dort zu klein zum Lesen.
Das Piktogramm ist einfarbig mit echten Aussparungen (zum Drucken, Lasern, Plotten), das Logo farbig auf Navy.

Aufruf: python brand/make_logo.py   (braucht Pillow und fonttools)
"""
import math
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
ASSETS = ROOT / "testapp" / "assets"
FONT = BRAND / "fonts" / "Nunito-ExtraBold.ttf"
NAME = "Lauschbox"

NAVY = "#1B2333"
CREAM = "#FFF4E6"
CORAL = "#E8663D"
CORAL_DARK = "#B04224"

# Motiv in einem 512er-Quadrat; place() skaliert und zentriert es
HANDLE = ((256, 184), 50, 205, 335, 20)  # Bogen: Mitte, Radius, von/bis Grad (0 = rechts, 90 = unten), Strichstärke
BODY = (92, 164, 420, 412, 64)  # x0, y0, x1, y1, Eckradius
RING_C, RING_R, RING_W = (256, 288), 80, 20
PROGRESS = (-90, 180)  # drei Viertel gehört
# Play: Schwerpunkt leicht rechts der Ringmitte, dann wirkt das Dreieck optisch mittig
PLAY = [(234, 257), (234, 319), (287, 288)]
PLAY_ROUND = 12
TOP = HANDLE[0][1] - HANDLE[1] - HANDLE[4] / 2  # oberer Rand des Henkels
BOTTOM = BODY[3]


def motif(colored: bool):
    """Zeichenschritte von hinten nach vorn: (form, parameter, farbe). Farbe None = Aussparung."""
    fg = "fg"
    return [
        ("arc", HANDLE, CORAL if colored else fg),
        ("rrect", BODY, CORAL if colored else fg),
        *([("arc", (RING_C, RING_R, 0, 360, RING_W), CORAL_DARK)] if colored else []),
        ("arc", (RING_C, RING_R, *PROGRESS, RING_W), CREAM if colored else None),
        ("poly", PLAY, CREAM if colored else None),
    ]


def _name_outline(size: float):
    """Name als Pfad (SVG-Syntax, y nach unten, Grundlinie bei 0) plus Breite und Höhe über der Grundlinie."""
    font = TTFont(FONT)
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    k = size / font["head"].unitsPerEm
    pen, bounds, x = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip(".")), BoundsPen(glyphs), 0
    for ch in NAME:
        g = cmap[ord(ch)]
        glyphs[g].draw(TransformPen(pen, (k, 0, 0, -k, x * k, 0)))
        glyphs[g].draw(TransformPen(bounds, (k, 0, 0, k, x * k, 0)))
        x += hmtx[g][0]
    x0, y0, x1, y1 = bounds.bounds
    return pen.getCommands(), x1 - x0, y1, x0


def layout(with_name: bool, area: float = 512, margin: float = 0.0):
    """Skalierung und Lage von Motiv und Name, alles zusammen vertikal zentriert."""
    if not with_name:
        s = 1.0
        dy = (area - (BOTTOM - TOP) * s) / 2 - TOP * s
        return s, dy, None
    s = 0.66
    size = 76  # Schriftgröße in Einheiten des 512er-Quadrats
    _, width, height, x0 = _name_outline(size)
    gap = 30
    total = (BOTTOM - TOP) * s + gap + height
    top = (area - total) / 2
    dy = top - TOP * s
    baseline = top + (BOTTOM - TOP) * s + gap + height
    return s, dy, (size, (area - width) / 2 - x0, baseline)


def place(ops, s: float, dy: float):
    """Motiv um die senkrechte Mittellinie skalieren und verschieben."""
    def pt(x, y):
        return (256 + (x - 256) * s, y * s + dy)

    out = []
    for kind, p, c in ops:
        if kind == "rrect":
            x0, y0, x1, y1, r = p
            (x0, y0), (x1, y1) = pt(x0, y0), pt(x1, y1)
            p = (x0, y0, x1, y1, r * s)
        elif kind == "poly":
            p = [pt(x, y) for x, y in p]
        else:
            center, radius, a0, a1, w = p
            p = (pt(*center), radius * s, a0, a1, w * s)
        out.append((kind, p, c))
    return out


def _arc_points(center, radius, a0, a1, steps=1):
    return [(center[0] + radius * math.cos(math.radians(a)), center[1] + radius * math.sin(math.radians(a)))
            for a in (a0 + (a1 - a0) * i / steps for i in range(steps + 1))]


def draw(d: ImageDraw.ImageDraw, ops, k: float, color_of, s: float = 1.0) -> None:
    """k: Pixel je Einheit. color_of: Farbe des Zeichenschritts → PIL-Farbe. s: Skalierung (für die Play-Rundung)."""
    for kind, p, color in ops:
        fill = color_of(color)
        if kind == "rrect":
            x0, y0, x1, y1, r = p
            d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=r * k, fill=fill)
        elif kind == "poly":
            pts = [(x * k, y * k) for x, y in p]
            w = PLAY_ROUND * s * k
            d.polygon(pts, fill=fill)
            d.line(pts + [pts[0]], fill=fill, width=round(w), joint="curve")  # runde Ecken
            for x, y in pts:
                d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fill)
        else:
            center, radius, a0, a1, width = p
            (cx, cy), r, w = (center[0] * k, center[1] * k), radius * k, width * k
            # Pillow zeichnet die Breite nach innen: Bogen außen um die halbe Breite größer ansetzen
            d.arc([cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2], a0, a1, fill=fill, width=round(w))
            if a1 - a0 < 360:
                for x, y in _arc_points((cx, cy), r, a0, a1, steps=1):  # runde Enden
                    d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fill)


def _draw_name(d: ImageDraw.ImageDraw, name, k: float, fill) -> None:
    size, x, baseline = name
    d.text((x * k, baseline * k), NAME, font=ImageFont.truetype(str(FONT), round(size * k)), fill=fill, anchor="ls")


def render(size: int, background: bool, with_name: bool = False, rounded: bool = False, inset: float = 0.0, scale: int = 4) -> Image.Image:
    """Farbiges Logo. inset: Rand in Anteilen der Kantenlänge (Android-Icons brauchen eine Sicherheitszone)."""
    px = size * scale
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle([0, 0, px - 1, px - 1], radius=int(px * 0.22) if rounded else 0, fill=NAVY)
    k = px * (1 - 2 * inset) / 512
    layer = Image.new("RGBA", (int(512 * k), int(512 * k)), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    s, dy, name = layout(with_name)
    draw(ld, place(motif(colored=True), s, dy), k, lambda c: c, s)
    if name:
        _draw_name(ld, name, k, CREAM)
    off = int(px * inset)
    img.alpha_composite(layer, (off, off))
    return img.resize((size, size), Image.LANCZOS)


def _svg_shape(kind, p, color: str, s: float) -> str:
    f = lambda v: f"{v:.1f}"  # noqa: E731
    if kind == "rrect":
        x0, y0, x1, y1, r = p
        return f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" rx="{f(r)}" fill="{color}"/>'
    if kind == "poly":
        pts = " ".join(f"{f(x)},{f(y)}" for x, y in p)
        return f'<polygon points="{pts}" fill="{color}" stroke="{color}" stroke-width="{f(PLAY_ROUND * s)}" stroke-linejoin="round"/>'
    center, radius, a0, a1, width = p
    if a1 - a0 >= 360:
        return f'<circle cx="{f(center[0])}" cy="{f(center[1])}" r="{f(radius)}" fill="none" stroke="{color}" stroke-width="{f(width)}"/>'
    (sx, sy), (ex, ey) = _arc_points(center, radius, a0, a1, steps=1)
    large = 1 if a1 - a0 > 180 else 0
    path = f"M{f(sx)} {f(sy)} A{f(radius)} {f(radius)} 0 {large} 1 {f(ex)} {f(ey)}"
    return f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{f(width)}" stroke-linecap="round"/>'


def _svg_name(name, color: str) -> str:
    size, x, baseline = name
    path, *_ = _name_outline(size)
    return f'<path transform="translate({x:.1f} {baseline:.1f})" d="{path}" fill="{color}"/>'


def svg_pictogram(with_name: bool = True) -> str:
    # Maske: Weiß zeichnet, Schwarz spart aus. So bleibt das Piktogramm eine einzige Farbe (currentColor).
    s, dy, name = layout(with_name)
    parts = [_svg_shape(kind, p, "black" if c is None else "white", s) for kind, p, c in place(motif(colored=False), s, dy)]
    if name:
        parts.append(_svg_name(name, "white"))
    body = "\n".join(parts)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Lauschbox">\n'
        "<!-- Piktogramm der Lauschbox, einfarbig (currentColor). Erzeugt von brand/make_logo.py -->\n"
        f'<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">\n{body}\n</mask>\n'
        '<rect width="512" height="512" fill="currentColor" mask="url(#m)"/>\n</svg>\n'
    )


def svg_logo(with_name: bool = True) -> str:
    s, dy, name = layout(with_name)
    parts = [_svg_shape(kind, p, c, s) for kind, p, c in place(motif(colored=True), s, dy)]
    if name:
        parts.append(_svg_name(name, CREAM))
    body = "\n".join(parts)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Lauschbox">\n'
        "<!-- Logo der Lauschbox. Erzeugt von brand/make_logo.py -->\n"
        f'<rect width="512" height="512" rx="113" fill="{NAVY}"/>\n{body}\n</svg>\n'
    )


def pictogram_png(size: int, color: str = NAVY, scale: int = 4) -> Image.Image:
    px = size * scale
    k = px / 512
    mask = Image.new("L", (px, px), 0)
    md = ImageDraw.Draw(mask)
    s, dy, name = layout(True)
    draw(md, place(motif(colored=False), s, dy), k, lambda c: 0 if c is None else 255, s)
    _draw_name(md, name, k, 255)
    img = Image.new("RGBA", (px, px), color)
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    (BRAND / "piktogramm.svg").write_text(svg_pictogram(), encoding="utf-8")
    (BRAND / "logo.svg").write_text(svg_logo(), encoding="utf-8")
    pictogram_png(1024).save(BRAND / "piktogramm-1024.png")
    render(1024, background=True, with_name=True, rounded=True).save(BRAND / "logo-1024.png")
    render(1024, background=True).save(BRAND / "icon-square-1024.png")
    render(1024, background=True, rounded=True).save(ASSETS / "logo.png")  # Startbildschirm, der Name steht dort darunter
    render(1024, background=True).save(ASSETS / "icon.png")
    render(1024, background=False, inset=0.17).save(ASSETS / "android-icon-foreground.png")  # Hintergrund kommt aus app.json
    render(1024, background=False, inset=0.12).save(ASSETS / "splash-icon.png")
    render(48, background=True, rounded=True).save(ASSETS / "favicon.png")
