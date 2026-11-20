#!/usr/bin/env python3
# ============================================================
# Test de scannabilité des plaques QR avec logo EN GRAND
# ------------------------------------------------------------
# Reproduit EXACTEMENT les paramètres du composant
# nathalie-qr-plaque.tsx :
#   · qrcode ECC niveau H, margin 1, dark #2C2C2C / light #FBF7EC
#   · puce ivoire centrée = 38% du côté du QR (logo + padding)
#   · anneau or simulé par le contour de la puce
# Décodage avec pyzbar (zbar) — le même moteur que la plupart
# des lecteurs mobiles. 10 lectures par variante (bruit gaussien
# progressif) pour vérifier la robustesse.
# ============================================================
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFilter
from pyzbar.pyzbar import decode
import io, os

URL = "https://feedback.qrbags.com/?qr_type=CLIENT_ZONE&zone_id=test-token-t01"
CHIP_FRACTION = 0.38          # puce = 38% du côté (comme le DOM/SVG du composant)
DARK, LIGHT = "#2C2C2C", "#FBF7EC"

def make_qr(px: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=1)
    qr.add_data(URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color=DARK, back_color=LIGHT).convert("RGB")
    return img.resize((px, px), Image.NEAREST)

def composite_logo_chip(qr: Image.Image, logo_path: str | None) -> Image.Image:
    w = qr.size[0]
    chip = round(w * CHIP_FRACTION)
    pad = max(2, round(chip * 0.055))
    size = chip + pad * 2
    canvas = qr.copy()
    d = ImageDraw.Draw(canvas)
    x0 = (w - size) // 2
    # puce ivoire + anneau or (approximé par un contour jaune-brun)
    d.rounded_rectangle([x0, x0, x0 + size, x0 + size], radius=max(4, size // 7), fill=LIGHT, outline=(201, 169, 97), width=max(2, round(size * 0.02)))
    if logo_path and os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGB").resize((chip, chip))
        canvas.paste(logo, (x0 + pad, x0 + pad))
    else:
        d.rounded_rectangle([x0 + pad, x0 + pad, x0 + size - pad, x0 + size - pad], radius=max(3, chip // 7), fill=(26, 26, 26))
    return canvas

def read_score(img: Image.Image, label: str) -> float:
    ok = 0
    trials = 10
    for i in range(trials):
        t = img
        if i > 0:  # bruit croissant (compression simulée + flou léger)
            t = img.filter(ImageFilter.GaussianBlur(i * 0.35))
        # échelles différentes (les téléphones scannent à diverses distances)
        scale = [1.0, 0.5, 0.35, 0.7, 1.3][i % 5]
        t2 = t.resize((max(60, int(t.size[0] * scale)), max(60, int(t.size[1] * scale))))
        res = decode(t2)
        if res and res[0].data.decode("utf-8", "ignore") == URL:
            ok += 1
    print(f"{label}: {ok}/{trials} lectures réussies")
    return ok / trials

# Test 1 : md (512px) avec logo réel du monogramme E
logo_test = "/tmp/logo-e.png"
import base64
svg = "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' rx='36' fill='#1A1A1A'/><text x='128' y='170' font-family='Georgia' font-size='120' fill='#C9A961' text-anchor='middle'>E</text></svg>"
sub = __import__("subprocess")
# rasterise le SVG avec PIL n'est pas possible → dessin direct PIL
lg = Image.new("RGB", (256, 256), (26, 26, 26))
d = ImageDraw.Draw(lg)
d.rounded_rectangle([0, 0, 255, 255], radius=36, fill=(26, 26, 26))
d.text((128, 128), "E", font_size=150, fill=(201, 169, 97), anchor="mm")
lg.save(logo_test)

print("URL encodée:", URL, f"({len(URL)} car.)")
print()
sans = composite_logo_chip(make_qr(512), None)
avec = composite_logo_chip(make_qr(512), logo_test)
s1 = read_score(sans, "512px SANS logo (référence)")
s2 = read_score(avec, "512px AVEC logo EN GRAND (38%)")
s3 = read_score(composite_logo_chip(make_qr(384), logo_test), "384px AVEC logo (taille sm)")
s4 = read_score(composite_logo_chip(make_qr(256), logo_test), "256px AVEC logo (taille xs)")

# Sauvegarde d'une preuve visuelle
avec.save("/tmp/shots/qr-plaque-logo-grand.png")
print()
print("RÉSULTAT:", "SCANNABLE" if s2 >= s1 * 0.7 and s2 >= 0.7 else "PROBLÈME — réduire la puce")
