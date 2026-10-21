"""Erzeugt das Lauschkiste-Logo als SVG + PNG und ersetzt die Flutter-Standard-Icons.

Motiv: Kiste in leichter Draufsicht. Vorne das Lautsprechergitter, oben in einer dunklen Mulde
der LED-Ring (12 Punkte, 9 leuchten) mit dem Token in der Mitte, darüber ein warmer Lichtschein.

Aufruf: python brand/make_logo.py <Projektordner>
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
APP = ROOT / "app"

NAVY = (27, 35, 51)
PLATE = (38, 47, 68)
TOKEN = (255, 244, 230)
AMBER = (255, 190, 92)
CORAL = (232, 102, 61)
CORAL_DARK = (201, 80, 44)
LID = (244, 140, 92)
GRILLE = (176, 66, 36)
N, LIT = 12, 9
OFFSET_Y = -48  # Motiv optisch mittig setzen

# Geometrie in Einheiten eines 1024er-Quadrats
LID_INNER = [(296, 372), (728, 372), (778, 500), (246, 500)]  # wird um LID_ROUND nach außen gerundet
LID_ROUND = 26
FRONT = (220, 500, 804, 832, 60)  # x0, y0, x1, y1, Radius
PLATE_C, PLATE_R = (512, 436), (208, 54)
RING_R = (164, 36)
DOT = (14, 9)
TOKEN_R = (62, 16)
GRILLE_COLS, GRILLE_ROWS, GRILLE_STEP, GRILLE_R, GRILLE_Y = 6, 3, 58, 15, 680


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def ring_dots():
    """(x, y, farbe, leuchtet); Start vorne-oben im Uhrzeigersinn, perspektivisch gestaucht."""
    for i in range(N):
        a = -math.pi / 2 + i * 2 * math.pi / N
        lit = i < LIT
        color = lerp(AMBER, CORAL, i / (LIT - 1)) if lit else lerp(PLATE, CORAL, 0.3)
        yield PLATE_C[0] + RING_R[0] * math.cos(a), PLATE_C[1] + RING_R[1] * math.sin(a), color, lit


def grille():
    x0 = 512 - (GRILLE_COLS - 1) * GRILLE_STEP / 2
    y0 = GRILLE_Y - (GRILLE_ROWS - 1) * GRILLE_STEP / 2
    for r in range(GRILLE_ROWS):
        for c in range(GRILLE_COLS):
            yield x0 + c * GRILLE_STEP, y0 + r * GRILLE_STEP


def render(size, rounded, scale=4):
    s = size * scale
    k = s / 1024

    def P(x, y):
        return x * k, (y + OFFSET_Y) * k

    def ell(d, cx, cy, rx, ry, fill):
        cy += OFFSET_Y
        d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=fill)

    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22) if rounded else 0, fill=255)
    img = Image.new("RGBA", (s, s), NAVY + (255,))

    # Schatten unter der Kiste
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ell(ImageDraw.Draw(shadow), 512, 846, 300, 26, (0, 0, 0, 120))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(14 * k)))

    # Lichtschein, der hinter dem Deckel nach oben steigt
    halo = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ell(ImageDraw.Draw(halo), 512, 372, 240, 92, AMBER + (95,))
    img = Image.alpha_composite(img, halo.filter(ImageFilter.GaussianBlur(40 * k)))

    # Front mit Verlauf
    x0, y0, x1, y1, r = FRONT
    front_mask = Image.new("L", (s, s), 0)
    fm = ImageDraw.Draw(front_mask)
    fm.rounded_rectangle([*P(x0, y0), *P(x1, y1)], radius=r * k, fill=255)
    fm.rectangle([*P(x0, y0), *P(x1, y0 + r)], fill=255)
    grad = Image.new("RGBA", (s, s))
    gd = ImageDraw.Draw(grad)
    for yy in range(int((y0 + OFFSET_Y) * k), int((y1 + OFFSET_Y) * k) + 1):
        t = (yy / k - OFFSET_Y - y0) / (y1 - y0)
        gd.line([(0, yy), (s, yy)], fill=lerp(CORAL, CORAL_DARK, t) + (255,))
    img.paste(grad, mask=front_mask)

    d = ImageDraw.Draw(img)
    for gx, gy in grille():
        ell(d, gx, gy, GRILLE_R, GRILLE_R, GRILLE + (255,))

    # Deckel: Trapez mit runden Ecken (Füllung + dicke Kontur mit runden Verbindungen)
    pts = [P(x, y) for x, y in LID_INNER]
    d.polygon(pts, fill=LID + (255,))
    d.line(pts + [pts[0]], fill=LID + (255,), width=int(2 * LID_ROUND * k), joint="curve")
    for p in pts:
        d.ellipse([p[0] - LID_ROUND * k, p[1] - LID_ROUND * k, p[0] + LID_ROUND * k, p[1] + LID_ROUND * k], fill=LID + (255,))

    ell(d, *PLATE_C, *PLATE_R, PLATE + (255,))

    # Lichtschein über den leuchtenden LEDs
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gl = ImageDraw.Draw(glow)
    for x, y, c, lit in ring_dots():
        if lit:
            ell(gl, x, y, DOT[0] * 1.8, DOT[1] * 1.8, c + (90,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(9 * k)))

    d = ImageDraw.Draw(img)
    for x, y, c, lit in ring_dots():
        ell(d, x, y, *DOT, c + (255,))
    ell(d, *PLATE_C, *TOKEN_R, TOKEN + (255,))

    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(img, mask=mask)
    return out.resize((size, size), Image.LANCZOS)


def svg():
    f = 0.5  # 1024er-Geometrie -> viewBox 512
    rgb = lambda c: "#%02X%02X%02X" % c
    x0, y0, x1, y1, r = FRONT
    lid = " ".join(f"{x*f:.1f},{y*f:.1f}" for x, y in LID_INNER)
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Lauschkiste">',
        "<defs>",
        f'<linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{rgb(CORAL)}"/>'
        f'<stop offset="1" stop-color="{rgb(CORAL_DARK)}"/></linearGradient>',
        '<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>',
        '<filter id="halo" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="20"/></filter>',
        '<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>',
        "</defs>",
        f'<rect width="512" height="512" rx="113" fill="{rgb(NAVY)}"/>',
        f'<g transform="translate(0 {OFFSET_Y*f})">',
        f'<ellipse cx="256" cy="{372*f}" rx="{240*f}" ry="{92*f}" fill="{rgb(AMBER)}" opacity="0.37" filter="url(#halo)"/>',
        f'<ellipse cx="256" cy="{846*f}" rx="{300*f}" ry="{26*f}" fill="#000" opacity="0.47" filter="url(#shadow)"/>',
        f'<rect x="{x0*f}" y="{y0*f}" width="{(x1-x0)*f}" height="{(y1-y0)*f}" rx="{r*f}" fill="url(#front)"/>',
        f'<rect x="{x0*f}" y="{y0*f}" width="{(x1-x0)*f}" height="{r*f}" fill="{rgb(CORAL)}"/>',
    ]
    parts += [f'<circle cx="{x*f:.1f}" cy="{y*f:.1f}" r="{GRILLE_R*f}" fill="{rgb(GRILLE)}"/>' for x, y in grille()]
    parts.append(f'<polygon points="{lid}" fill="{rgb(LID)}" stroke="{rgb(LID)}" stroke-width="{2*LID_ROUND*f}" stroke-linejoin="round"/>')
    parts.append(f'<ellipse cx="{PLATE_C[0]*f}" cy="{PLATE_C[1]*f}" rx="{PLATE_R[0]*f}" ry="{PLATE_R[1]*f}" fill="{rgb(PLATE)}"/>')
    parts.append('<g filter="url(#blur)">')
    for x, y, c, lit in ring_dots():
        if lit:
            parts.append(f'<ellipse cx="{x*f:.1f}" cy="{y*f:.1f}" rx="{DOT[0]*1.8*f:.1f}" ry="{DOT[1]*1.8*f:.1f}" fill="{rgb(c)}" opacity="0.35"/>')
    parts.append("</g>")
    for x, y, c, lit in ring_dots():
        parts.append(f'<ellipse cx="{x*f:.1f}" cy="{y*f:.1f}" rx="{DOT[0]*f}" ry="{DOT[1]*f}" fill="{rgb(c)}"/>')
    parts.append(f'<ellipse cx="{PLATE_C[0]*f}" cy="{PLATE_C[1]*f}" rx="{TOKEN_R[0]*f}" ry="{TOKEN_R[1]*f}" fill="{rgb(TOKEN)}"/>')
    parts.append("</g>")
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


if __name__ == "__main__":
    BRAND.mkdir(exist_ok=True)
    (BRAND / "logo.svg").write_text(svg(), encoding="utf-8")
    render(1024, rounded=True).save(BRAND / "logo-1024.png")
    render(1024, rounded=False).save(BRAND / "icon-square-1024.png")
    (APP / "assets").mkdir(exist_ok=True)
    render(512, rounded=True).save(APP / "assets" / "logo.png")

    # Vorhandene Flutter-Icons in gleicher Größe ersetzen.
    # iOS + maskierbare Web-Icons: randlos (das System rundet selbst), sonst abgerundet.
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
