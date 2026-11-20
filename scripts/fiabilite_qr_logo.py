#!/usr/bin/env python3
# ============================================================
# Fiabilité : fraction puce logo qui reste décodable à 10/10
# par les DEUX décodeurs, avec flou progressif + 5 échelles
# (simulation distance/qualité photo). On teste aussi un
# padding ivoire généreux autour du logo sombre.
# ============================================================
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFilter
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

def chip(qr: Image.Image, frac: float, pad_ratio: float = 0.08) -> Image.Image:
    """Puce ivoire frac×côté, logo sombre à l'intérieur (marge pad_ratio)."""
    w = qr.size[0]
    chip_s = round(w * frac)
    size = chip_s
    pad = round(chip_s * pad_ratio)          # marge ivoire autour du logo
    canvas = qr.copy()
    d = ImageDraw.Draw(canvas)
    x0 = (w - size) // 2
    d.rounded_rectangle([x0, x0, x0 + size, x0 + size], radius=max(4, size // 8), fill=LIGHT, outline=GOLD, width=max(2, size // 70))
    logo_s = size - 2 * pad
    d.rounded_rectangle([x0 + pad, x0 + pad, x0 + pad + logo_s, x0 + pad + logo_s], radius=max(3, logo_s // 8), fill=INK)
    d.text((x0 + pad + logo_s // 2, x0 + pad + logo_s // 2), "E", font_size=int(logo_s * 0.55), fill=GOLD, anchor="mm")
    return canvas

def trial(img: Image.Image, i: int) -> bool:
    """Une lecture réaliste : échelle variée + flou léger."""
    t = img
    if i > 0:
        t = img.filter(ImageFilter.GaussianBlur((i % 4) * 0.3))
    scale = [1.0, 0.55, 0.8, 0.35, 1.25][i % 5]
    t2 = t.resize((max(60, int(t.size[0] * scale)), max(60, int(t.size[1] * scale))))
    r = zbar_decode(t2)
    if r and r[0].data.decode("utf-8", "ignore") == URL:
        return True
    det = cv2.QRCodeDetector()
    arr = cv2.cvtColor(np.array(t2), cv2.COLOR_RGB2BGR)
    try:
        data, _, _ = det.detectAndDecode(arr)
        return data == URL
    except cv2.error:
        return False

base = make_qr(512)
print(f"URL {len(URL)} car. — ECC H — 10 lectures réalistes (flou + échelles) par fraction")
print(f"{'frac':>6} | {'score /10':>9} | verdict")
for frac in [0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36]:
    ok = sum(1 for i in range(10) if trial(chip(base, frac), i))
    print(f"{frac:>6.2f} | {ok:>9}/10 | {'SÛR' if ok == 10 else ('LIMITE' if ok >= 7 else 'NON')}")
print()
print("Avec MARGE ivoire 14% (logo plus petit dans la même puce):")
for frac in [0.30, 0.34, 0.38, 0.42]:
    ok = sum(1 for i in range(10) if trial(chip(base, frac, pad_ratio=0.14), i))
    print(f"{frac:>6.2f} | {ok:>9}/10 | {'SÛR' if ok == 10 else ('LIMITE' if ok >= 7 else 'NON')}")
