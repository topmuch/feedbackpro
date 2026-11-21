"""Détourage du rendu produit + harmonisation Clay Ember (v4).

Calibrage mesuré :
- fond 0.90-0.93, contour des cartes 0.78-0.88 -> seuil 0.885
- seed du fond UNIQUEMENT via bords haut/gauche/droite : l'écran blanc du
  téléphone touche le bord bas (téléphone rogné) et ne doit pas fuir
- shift clay STRICT : masque orange (hue 10-40, sat>=0.45, mx>=0.45) x
  falloff sat -> ne touche ni l'encre ni les reflets sombres du titanium
"""
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

SRC = "/tmp/hero-white.png"
OUT = "/tmp/hero-cut.png"
PREVIEW = "/tmp/hero-preview.png"

img = Image.open(SRC).convert("RGB")
rgb = np.asarray(img).astype(np.float64) / 255.0
h, w, _ = rgb.shape

r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx = rgb.max(axis=2)
mn = rgb.min(axis=2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0)

# ---------- 1) fond ----------
near_white = (mn >= 0.885) & (sat <= 0.06)
lab, n = ndimage.label(near_white)
seed_labels = set(np.unique(np.concatenate([
    lab[0, :], lab[:, 0], lab[:, -1]          # top / left / right uniquement
])))
seed_labels.discard(0)
bg = np.isin(lab, list(seed_labels))
print(f"labels={n} bg={100.0 * bg.sum() / (h * w):.1f}%")

bg_d = ndimage.binary_dilation(bg, iterations=2)
keep = ~bg_d

alpha = np.where(keep, 255, 0).astype(np.uint8)
a_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.5))
alpha_f = np.asarray(a_img).astype(np.float64)
alpha_f[~keep] = 0.0
alpha_out = alpha_f.astype(np.uint8)

# ---------- 2) orange vif -> Clay Ember #bc7155 ----------
hue = np.zeros((h, w))
m = (mx == r) & ((mx - mn) > 0)
hue[m] = (60 * ((g[m] - b[m]) / (mx[m] - mn[m])) + 360) % 360
m2 = (mx == g) & ((mx - mn) > 0)
hue[m2] = 60 * ((b[m2] - r[m2]) / (mx[m2] - mn[m2])) + 120

orange = (hue >= 10) & (hue <= 40) & (sat >= 0.45) & (mx >= 0.45)
orange = ndimage.binary_dilation(orange, iterations=1)
falloff = np.clip((sat - 0.30) / 0.25, 0, 1)
weight = (orange & (falloff > 0))[..., None] * falloff[..., None]

target = np.array([0.737, 0.443, 0.333])
lum = (0.299 * r + 0.587 * g + 0.114 * b)[..., None]
clay = target[None, None, :] * np.clip(lum / 0.55, 0.80, 1.15)
out = rgb * (1 - weight) + clay * weight

# ---------- 2b) efface l'ombre grise résiduelle sous le téléphone ----------
dark = mn < 0.55
dark_prot = ndimage.binary_dilation(dark, iterations=4)
shadow_zone = np.zeros((h, w), dtype=bool)
shadow_zone[655:, :] = True
is_shadow = shadow_zone & (mn >= 0.55) & (sat <= 0.10) & ~dark_prot
alpha_out[is_shadow] = 0
print(f"shadow px={is_shadow.sum()}")

# ---------- 3) export ----------
result = np.dstack([(np.clip(out, 0, 1) * 255).astype(np.uint8), alpha_out])
Image.fromarray(result).save(OUT)
print("saved", OUT)

# ---------- 4) preview sur ciel d'aube CSS ----------
sky = np.zeros((h, w, 3))
top = np.array([0xD9, 0xE5, 0xEE]) / 255.0
mid = np.array([0xF4, 0xE7, 0xD7]) / 255.0
bot = np.array([0xFF, 0xFF, 0xFF]) / 255.0
for y in range(h):
    t = y / (h - 1)
    if t < 0.62:
        k = t / 0.62
        sky[y, :, :] = top * (1 - k) + mid * k
    else:
        k = (t - 0.62) / 0.38
        sky[y, :, :] = mid * (1 - k) + bot * k
af = (alpha_out / 255.0)[..., None]
comp = out * af + sky * (1 - af)
Image.fromarray((np.clip(comp, 0, 1) * 255).astype(np.uint8)).save(PREVIEW)
print("saved", PREVIEW)
