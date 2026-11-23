#!/usr/bin/env python3
# ============================================================
# REBRAND-1 — Assets FeedVoice
# Génère tous les assets de marque depuis le logo uploadé
# (upload/41cafec7-5f49-455e-bd8e-7de930a2777f.png, 225x57 RGBA)
# ============================================================
import base64
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = "upload/41cafec7-5f49-455e-bd8e-7de930a2777f.png"
INK = (0, 13, 16)        # #000d10 Deep Ink
CLAY = (188, 113, 85)    # #bc7155 Clay Ember
ASH = (142, 142, 149)    # #8e8e95 Cool Ash
WHITE = (255, 255, 255)

src = Image.open(SRC).convert("RGBA")
arr = np.array(src)

# ---------- 0. Détourage : le PNG source est noir-sur-blanc OPAQUE ----------
# Technique « black on white -> alpha » : alpha = 255 - luminance,
# RGB = encre noire pure. Les bords anti-aliasés restent lisibles.
lum = arr[..., :3].mean(axis=2)
ink_alpha = np.clip(255.0 - lum, 0, 255).astype(np.uint8)
# Anti-voile : l'ancien fond blanc n'est pas uniformément 255 (compression)
# → résidu alpha 5-25 visible sur fond sombre. Seuil doux + gain léger :
ink_alpha = np.where(ink_alpha < 30, 0, np.minimum(255, (ink_alpha.astype(np.int32) * 1.12))).astype(np.uint8)
print("alpha ink range:", ink_alpha.min(), ink_alpha.max(),
      "| transparent px:", (ink_alpha < 8).sum(), "/", ink_alpha.size)
src = Image.fromarray(np.dstack([
    np.zeros_like(arr[..., :3]) + 0, ink_alpha
]).astype(np.uint8), "RGBA")

# ---------- 1. Logos noir (multi-résolution) ----------
import os
os.makedirs("public/feedvoice", exist_ok=True)
src.save("public/feedvoice/logo.png")
src.resize((450, 114), Image.LANCZOS).save("public/feedvoice/logo@2x.png")
src.resize((900, 228), Image.LANCZOS).save("public/feedvoice/logo@4x.png")

# ---------- 2. Logos blancs (alpha détouré, RGB -> blanc) ----------
white_arr = np.dstack([
    np.full_like(arr[..., :3], 255), ink_alpha
]).astype(np.uint8)
white_img = Image.fromarray(white_arr, "RGBA")
white_img.save("public/feedvoice/logo-white.png")
white_img.resize((450, 114), Image.LANCZOS).save("public/feedvoice/logo-white@2x.png")
white_img.resize((900, 228), Image.LANCZOS).save("public/feedvoice/logo-white@4x.png")

# ---------- 3. Compat : overwrite anciens fallbacks (mêmes chemins) ----------
src.save("public/logo-feedbackpro.png")
src.save("public/logo-feedbackpro-transparent.png")

# ---------- 4. Icônes PWA 512 / 192 (ink + wordmark blanc) ----------
def make_icon(size, out):
    canvas = Image.new("RGBA", (size, size), INK + (255,))
    wm_w = int(size * 0.62)
    wm_h = round(wm_w * 114 / 450)
    wm = white_img.resize((wm_w, wm_h), Image.LANCZOS)
    canvas.paste(wm, ((size - wm_w) // 2, (size - wm_h) // 2), wm)
    canvas.convert("RGB").save(out, "PNG")
    print("icon:", out, canvas.size)

make_icon(512, "public/icon-512.png")
make_icon(192, "public/icon-192.png")

# ---------- 5. Favicon App Router : bulle de parole dessinée ----------
fav = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
d = ImageDraw.Draw(fav)
d.ellipse((16, 30, 112, 92), outline=INK + (255,), width=11)
for dx in (-24, 0, 24):
    cx, cy, r = 64 + dx, 61, 7
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=INK + (255,))
d.polygon([(56, 86), (36, 126), (84, 92)], fill=INK + (255,))
fav.save("src/app/icon.png")
print("favicon: src/app/icon.png")

# ---------- 6. og-image 1344x768 (ink, wordmark blanc, barre clay, tagline) ----------
og = Image.new("RGB", (1344, 768), INK)
d = ImageDraw.Draw(og)
wm = white_img.resize((640, 162), Image.LANCZOS)
og.paste(wm, ((1344 - 640) // 2, 168), wm)
d.rounded_rectangle([(602, 380), (742, 387)], radius=3, fill=CLAY)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 33)
    tag = "L'excellence opérationnelle, mesurée en temps réel."
    tw = d.textlength(tag, font=font)
    d.text(((1344 - tw) / 2, 424), tag, font=font, fill=ASH)
    sub = "Denise & Nathalie — Assistantes IA temps réel"
    f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    sw = d.textlength(sub, font=f2)
    d.text(((1344 - sw) / 2, 492), sub, font=f2, fill=(213, 211, 212))
except Exception as e:
    print("font skip:", e)
og.save("public/og-image.png", quality=92)
print("og-image ok")

# ---------- 7. logo.svg (wordmark embarqué base64 — remplace l'ancien) ----------
b64 = base64.b64encode(open("public/feedvoice/logo@2x.png", "rb").read()).decode()
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 114" width="450" height="114">'
    f'<image width="450" height="114" href="data:image/png;base64,{b64}"/>'
    "</svg>"
)
open("public/logo.svg", "w").write(svg)
print("logo.svg ok")

# ---------- 8. Vérifications ----------
for p in ["public/feedvoice/logo.png", "public/feedvoice/logo-white@4x.png",
          "public/icon-512.png", "public/icon-192.png", "src/app/icon.png",
          "public/og-image.png"]:
    im = Image.open(p)
    print(p, im.size, im.mode)
print("DONE")
