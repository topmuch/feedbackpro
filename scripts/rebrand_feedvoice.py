#!/usr/bin/env python3
# ============================================================
# REBRAND-2 — Remplacement global FeedbackPro -> FeedVoice
# Protections :
#   - admin@feedbackpro.fr : credential fonctionnel (seed DB),
#     NON remplace (la prod a ete seeded avec cet email).
#   - identifiants techniques (dossiers, stores, eventTypes) : hors scope
#     (on ne remplace que du texte et des assets references).
# ============================================================
import os, re

PROTECT = "admin@feedbackpro.fr"
TOKEN = "@@ADMIN_CRED@@"

RULES = [
    ("FeedbackPro", "FeedVoice"),
    ("FEEDBACKPRO", "FEEDVOICE"),
    ("gofeedbackpro.com", "feedvoice.com"),
    ("feedbackpro.fr", "feedvoice.fr"),
    ("feedbackpro.sn", "feedvoice.sn"),
    ("feedbackpro.local", "feedvoice.local"),
    ("/logo-feedbackpro-transparent.png", "/feedvoice/logo.png"),
    ("/logo-feedbackpro.png", "/feedvoice/logo.png"),
    ("logo-feedbackpro.png", "feedvoice/logo.png"),  # restes en commentaire
]

EXTS = {".ts", ".tsx", ".js", ".json", ".css", ".txt", ".webmanifest"}
SCOPES = ["src", "public/sw.js", "public/robots.txt", "public/manifest.webmanifest"]

changed_files = []
total = 0
for scope in SCOPES:
    if os.path.isfile(scope):
        paths = [scope]
    else:
        paths = []
        for root, dirs, files in os.walk(scope):
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next"}]
            for f in files:
                if os.path.splitext(f)[1] in EXTS:
                    paths.append(os.path.join(root, f))
    for p in paths:
        try:
            s = open(p, encoding="utf-8").read()
        except (UnicodeDecodeError, IsADirectoryError):
            continue
        orig = s
        s = s.replace(PROTECT, TOKEN)
        n = 0
        for old, new in RULES:
            n += s.count(old)
            s = s.replace(old, new)
        s = s.replace(TOKEN, PROTECT)
        if s != orig:
            open(p, "w", encoding="utf-8").write(s)
            changed_files.append((p, n))
            total += n

for p, n in sorted(changed_files, key=lambda x: -x[1]):
    print(f"{n:4d}  {p}")
print(f"\nTOTAL: {total} remplacements dans {len(changed_files)} fichiers")

# ---- Verifications post-remplacement ----
print("\n--- Restes 'FeedbackPro' (attendu 0) ---")
import subprocess
r = subprocess.run(["grep", "-ri", "FeedbackPro", "src", "--include=*", "-l"],
                   capture_output=True, text=True)
rest = r.stdout.strip()
print(rest if rest else "OK — aucun reste")

print("\n--- Restes 'feedbackpro' lowercase (hors credential protege + identifiants) ---")
r2 = subprocess.run(["grep", "-rn", "feedbackpro", "src", "public/manifest.webmanifest", "public/sw.js"],
                    capture_output=True, text=True)
allowed = ("admin@feedbackpro.fr", "feedbackpro-store", "components/feedbackpro",
           "lib/feedbackpro", "feedbackpro-airport", "feedbackpro-api", "useFpStore",
           "feedbackpro/types", "feedbackpro/")
for line in r2.stdout.splitlines():
    if any(a in line for a in allowed):
        continue
    print(line)
