#!/usr/bin/env python3
# ============================================================
# Vérification FINALE — proportions EXACTES du DOM des plaques
#   md : QR 176px · img logo 44px (h-11) · pad 6px · ring 1.5px
#        → puce = (44+12+3)/176 = 33.5% du côté, marge ~10%
#   svg export : puce 0.34 × s, inset 12%
# 10 lectures réalistes (flou + échelles) × 3 résolutions.
# ============================================================
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFilter
from pyzbar.pyzbar import decode as zbar_decode
import cv2
import numpy as np

URL = "https://feedback.qrbags.com/?qr_type=CLIENT_ZONE&zone_id=test-token-t01"
LIGHT = (251, 247, 236)
GOLD = (201, 169, 97)
INK = (26, 26, 26)

def make_qr(px: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=1)
    qr.add_data(URL)
    qr.make(fit=True)
    return qr.make_image(fill_color="#2C2C2C", back_color="#FBF7EC").convert("RGB").resize((px, px), Image.NEAREST)

def plaque_md(qr_px: int) -> Image.Image:
    """QR à l'échelle qr_px pour un 'md' — proportions DOM exactes."""
    scale = qr_px / 176.0
    img_s = round(44 * scale)
    pad = round(6 * scale)
    ring = max(2, round(1.5 * 2 * scale))
    qr = make_qr(qr_px)
    d = ImageDraw.Draw(qr)
    chip_s = img_s + 2 * pad + ring
    x0 = (qr_px - chip_s) // 2
    d.rounded_rectangle([x0, x0, x0 + chip_s, x0 + chip_s], radius=max(3, chip_s // 9), fill=LIGHT, outline=GOLD, width=ring)
    logo_s = img_s
    d.rounded_rectangle([x0 + pad, x0 + pad, x0 + pad + logo_s, x0 + pad + logo_s], radius=max(2, logo_s // 8), fill=INK)
    d.text((x0 + pad + logo_s // 2, x0 + pad + logo_s // 2), "E", font_size=int(logo_s * 0.6), fill=GOLD, anchor="mm")
    return qr

def trial(img, i):
    t = img.filter(ImageFilter.GaussianBlur((i % 4) * 0.3)) if i > 0 else img
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

print(f"URL {len(URL)} car. — proportions DOM 'md' exactes (puce 33.5%)")
for px in (512, 384, 256):
    img = plaque_md(px)
    ok = sum(1 for i in range(10) if trial(img, i))
    print(f"QR {px}px · logo EN GRAND : {ok}/10 lectures → {'100% SCANNABLE' if ok == 10 else 'INSUFFISANT'}")
    if px == 512:
        img.save("/tmp/shots/plaque-qr-logo-final.png")
