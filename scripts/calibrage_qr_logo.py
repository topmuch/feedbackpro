#!/usr/bin/env python3
# ============================================================
# Calibrage : taille MAX de la puce logo au centre du QR
# ------------------------------------------------------------
# Balayage de fractions du côté (0.16 → 0.40) × 2 décodeurs
# (pyzbar/zbar + OpenCV QRCodeDetector) × 2 contenus de puce
# (ivoire vide = érosion pure / logo noir + or) à 3 échelles.
# Objectif : trouver la plus GRANDE puce 100% décodable par
# les DEUX décodeurs, pour caler la plaque et le scanner.
# ============================================================
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw
from pyzbar.pyzbar import decode as zbar_decode
import cv2
import numpy as np

URL = "https://feedback.qrbags.com/?qr_type=CLIENT_ZONE&zone_id=test-token-t01"
DARK, LIGHT = (44, 44, 44), (251, 247, 236)
GOLD = (201, 169, 97)
INK = (26, 26, 26)

def make_qr(px: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=1)
    qr.add_data(URL)
    qr.make(fit=True)
    return qr.make_image(fill_color="#2C2C2C", back_color="#FBF7EC").convert("RGB").resize((px, px), Image.NEAREST)

def chip(qr: Image.Image, frac: float, with_logo: bool) -> Image.Image:
    w = qr.size[0]
    chip_s = round(w * frac)
    pad = max(2, round(chip_s * 0.06))
    size = chip_s + pad * 2
    canvas = qr.copy()
    d = ImageDraw.Draw(canvas)
    x0 = (w - size) // 2
    d.rounded_rectangle([x0, x0, x0 + size, x0 + size], radius=max(4, size // 8), fill=LIGHT, outline=GOLD, width=max(2, size // 60))
    inner = [x0 + pad, x0 + pad, x0 + size - pad, x0 + size - pad]
    if with_logo:
        d.rounded_rectangle(inner, radius=max(3, chip_s // 8), fill=INK)
        d.text(((inner[0] + inner[2]) // 2, (inner[1] + inner[3]) // 2), "E", font_size=chip_s, fill=GOLD, anchor="mm")
    else:
        d.rounded_rectangle(inner, radius=max(3, chip_s // 8), fill=LIGHT)
    return canvas

def try_zbar(img: Image.Image):
    for s in (1.0, 0.6, 1.4, 0.4):
        t = img.resize((int(img.size[0] * s), int(img.size[1] * s)))
        r = zbar_decode(t)
        if r and r[0].data.decode("utf-8", "ignore") == URL:
            return True
    return False

def try_cv2(img: Image.Image):
    det = cv2.QRCodeDetector()
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    for s in (1.0, 0.6, 1.4, 0.4):
        a = cv2.resize(arr, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_NEAREST)
        try:
            data, _, _ = det.detectAndDecode(a)
            if data == URL:
                return True
        except cv2.error:
            pass
    return False

print(f"URL: {URL} ({len(URL)} car.) — version QR:", end=" ")
_qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H)
_qr.add_data(URL); _qr.make(fit=True)
print(f"v{_qr.version} ({_qr.modules_count}×{_qr.modules_count} modules)")
print()
print(f"{'puce':>6} | {'ivoire zbar':>11} | {'ivoire cv2':>10} | {'logo zbar':>9} | {'logo cv2':>8}")
base = make_qr(512)
for frac in [0.16, 0.20, 0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36, 0.38, 0.40]:
    z1 = try_zbar(chip(base, frac, False))
    c1 = try_cv2(chip(base, frac, False))
    z2 = try_zbar(chip(base, frac, True))
    c2 = try_cv2(chip(base, frac, True))
    print(f"{frac:>6.2f} | {str(z1):>11} | {str(c1):>10} | {str(z2):>9} | {str(c2):>8}")
