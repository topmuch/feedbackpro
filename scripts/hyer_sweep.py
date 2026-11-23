"""Harmonisation Hyer Aviation — balayage des couleurs de marque.

Principe : monochrome + UNE note chaude (Clay Ember #bc7155).
- Bleus aéroport / navy / violet airline -> famille encre (Deep Ink / Hull / Deck)
- Ors, jaunes, ambre, émeraude, vert, orange, fuchsia -> famille Clay Ember
- sky / bleus Tailwind -> gris-encre neutres
- CONSERVÉS (sémantique fonctionnelle) : red / rose (erreur), neutres gris
Exclusion : landing-hyer.tsx (déjà 100 % Hyer).
"""
import re
from pathlib import Path

SRC = Path("src")
EXCLUDE = {"landing-hyer.tsx"}

# --- Palette Tailwind -> valeurs arbitraires (REMPLACEMENT longest-first) ---
CLAY = {
    950: "#3f231b", 900: "#573125", 800: "#6f3f30", 700: "#8a4f3b",
    600: "#a05f45", 500: "#bc7155", 400: "#c98b72", 300: "#dba28a",
    200: "#e7c1ae", 100: "#f3ddd2", 50: "#faf1ec",
}
SKY = {
    950: "#0f0f1c", 900: "#14152a", 800: "#1c1d2c", 700: "#2e3040",
    600: "#3c3e4c", 500: "#4b4d5e", 400: "#5e6070", 300: "#8e8e95",
    200: "#b9bbc2", 100: "#dcdee0", 50: "#f0f1f2",
}
FAMILIES = {
    "amber": CLAY, "emerald": CLAY, "green": CLAY, "orange": CLAY,
    "violet": CLAY, "purple": CLAY, "fuchsia": CLAY, "lime": CLAY,
    "teal": CLAY, "cyan": CLAY,
    "sky": SKY, "blue": SKY, "indigo": SKY,
}

def palette_rules():
    """Retourne [(pattern, repl)] triés par longueur de token décroissante."""
    rules = []
    for fam, mapping in FAMILIES.items():
        for shade in sorted(mapping, key=lambda s: -len(str(s))):
            rules.append((f"{fam}-{shade}", mapping[shade]))
    rules.sort(key=lambda p: -len(p[0]))
    return rules

# --- Hex bruts (insensible à la casse) ---
HEX = {
    # bleus aéroport / navy -> encre
    "003399": "#000d10", "0047c7": "#0f0f1c", "002e85": "#0f0f1c",
    "0044bb": "#0f0f1c", "1e1e2e": "#0f0f1c", "0f172a": "#0f0f1c",
    "14110b": "#0f0f1c", "252ed1": "#000d10", "0033aa": "#000d10",
    # ors / jaunes / violets / orange -> Clay Ember
    "fcd116": "#bc7155", "c9a961": "#bc7155", "c97b63": "#bc7155",
    "d4af37": "#bc7155", "fbbf24": "#bc7155", "ff6b00": "#bc7155",
    "5b8def": "#bc7155", "6b4c9a": "#bc7155", "e3c985": "#dba28a",
    "e5d4a8": "#e7c1ae", "f6f1e5": "#f7efe9", "f3eedf": "#f7efe9",
    "eae5dc": "#efe7e0",
    # vert positif -> Clay (positif = note chaude)
    "4a7c59": "#bc7155", "00a651": "#bc7155", "10b981": "#bc7155",
    "34d399": "#c98b72", "6ee7b7": "#dba28a", "a7f3d0": "#e7c1ae",
    "d1fae5": "#f3ddd2", "ecfdf5": "#faf1ec", "059669": "#a05f45",
    "047857": "#8a4f3b", "065f46": "#6f3f30",
    # ambre / orange hex
    "f59e0b": "#bc7155", "d97706": "#a05f45", "b45309": "#8a4f3b",
    "92400e": "#6f3f30", "78350f": "#573125", "451a03": "#3f231b",
    "fef3c7": "#f3ddd2", "fde68a": "#e7c1ae", "fcd34d": "#dba28a",
    "fffbeb": "#faf1ec", "ffedd5": "#f3ddd2", "fed7aa": "#e7c1ae",
    "fdba74": "#dba28a", "fb923c": "#c98b72", "f97316": "#bc7155",
    "ea580c": "#a05f45", "c2410c": "#8a4f3b", "9a3412": "#6f3f30",
    "7c2d12": "#573125", "431407": "#3f231b", "fff7ed": "#faf1ec",
    # violet / fuchsia hex
    "8b5cf6": "#bc7155", "7c3aed": "#a05f45", "6d28d9": "#8a4f3b",
    "5b21b6": "#6f3f30", "4c1d95": "#573125", "a78bfa": "#c98b72",
    "c4b5fd": "#dba28a", "ddd6fe": "#e7c1ae", "ede9fe": "#f3ddd2",
    "f5f3ff": "#faf1ec", "d946ef": "#bc7155", "c026d3": "#a05f45",
    "a21caf": "#8a4f3b", "e879f9": "#dba28a", "f0abfc": "#e7c1ae",
    "fae8ff": "#f3ddd2", "fdf4ff": "#faf1ec",
    # sky / bleu clair hex -> gris-encre
    "0ea5e9": "#4b4d5e", "0284c7": "#3c3e4c", "0369a1": "#2e3040",
    "38bdf8": "#5e6070", "7dd3fc": "#8e8e95", "bae6fd": "#b9bbc2",
    "e0f2fe": "#dcdee0", "f0f9ff": "#f0f1f2", "075985": "#1c1d2c",
    "0c4a6e": "#14152a", "082f49": "#0f0f1c", "2563eb": "#000d10",
    "1d4ed8": "#000d10", "1e40af": "#000d10", "1e3a8a": "#0f0f1c",
    "3b82f6": "#000d10", "60a5fa": "#5e6070", "93c5fd": "#8e8e95",
    "bfdbfe": "#b9bbc2", "dbeafe": "#dcdee0", "eff6ff": "#f0f1f2",
    "6366f1": "#000d10", "4f46e5": "#000d10", "4338ca": "#0f0f1c",
    "3730a3": "#0f0f1c", "312e81": "#0f0f1c", "818cf8": "#5e6070",
    "a5b4fc": "#8e8e95", "c7d2fe": "#b9bbc2", "e0e7ff": "#dcdee0",
    "eef2ff": "#f0f1f2",
}

hex_rules = [(re.compile(r"#([0-9a-fA-F]{6})", re.I), {k.upper(): v for k, v in HEX.items()})]

def process_file(p: Path, rules, hexmap_re, hexmap):
    txt = p.read_text(encoding="utf-8")
    original = txt
    n = 0
    # classes palette (ex: bg-amber-500 -> bg-[#bc7155])
    for token, val in rules:
        pat = re.compile(r"(?<=-)" + re.escape(token) + r"\b")
        txt, k = pat.subn(f"[{val}]", txt)
        n += k
    # hex bruts
    def sub_hex(m):
        nonlocal n
        key = m.group(1).upper()
        if key in hexmap:
            n += 1
            return hexmap[key]
        return m.group(0)
    txt = hexmap_re.sub(sub_hex, txt)
    if txt != original:
        p.write_text(txt, encoding="utf-8")
    return n

def main():
    rules = palette_rules()
    hexmap_re, hexmap = hex_rules[0]
    files = [p for p in SRC.rglob("*") if p.suffix in {".tsx", ".ts", ".css"} and p.name not in EXCLUDE]
    total = 0
    touched = []
    for p in files:
        k = process_file(p, rules, hexmap_re, hexmap)
        if k:
            total += k
            touched.append((str(p), k))
    touched.sort(key=lambda t: -t[1])
    print(f"fichiers modifiés={len(touched)} remplacements={total}")
    for path, k in touched[:25]:
        print(f"  {k:5d}  {path}")

main()
