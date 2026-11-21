"""Fixes formes Hyer pour auth-view.tsx (pills, wordmark, hairlines)."""
from pathlib import Path

p = Path("src/components/feedbackpro/auth-view.tsx")
t = p.read_text(encoding="utf-8")
n = 0
misses = []


def rep(old, new):
    global t, n
    if old in t:
        t = t.replace(old, new)
        n += 1
    else:
        misses.append(old[:80])


# 1) Serif -> sans editorial Hyer
rep(
    'className="fbp-serif max-w-lg text-4xl font-bold leading-tight text-[#f7efe9] xl:text-5xl"',
    'className="max-w-lg text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white xl:text-5xl"',
)
t = t.replace(
    'className="fbp-serif text-3xl font-bold tracking-tight text-[#0f0f1c]"',
    'className="text-3xl font-bold tracking-[-0.02em] text-[#0f0f1c]"',
)
t = t.replace(
    'className="fbp-serif text-3xl font-bold tracking-tight text-[#f7efe9]"',
    'className="text-3xl font-bold tracking-[-0.02em] text-white"',
)

# 2) Toggle : conteneur pill + texte blanc sur pilule sombre
rep(
    '<div className="relative flex rounded-2xl border border-[#e7c1ae] bg-[#f3ddd2] p-1">',
    '<div className="relative flex rounded-full border border-[#000d10]/15 bg-[#f2f1ef] p-1">',
)
rep(
    'rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${\n                  actif ? "text-[#0f0f1c]" : "text-stone-500 hover:text-[#0f0f1c]"',
    'rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${\n                  actif ? "text-white" : "text-[#8e8e95] hover:text-[#0f0f1c]"',
)

# 3) Logo panneau gauche : carte blanche + png bleu -> wordmark texte blanc
rep(
    '''<div className="relative flex items-center gap-3">
        <div className="rounded-xl bg-[#ffffff] px-4 py-2 shadow-lg shadow-black/40">
          <img
            src="/logo-feedbackpro.png"
            alt="FeedbackPro"
            className="h-10 w-auto"
          />
        </div>
      </div>''',
    '''<div className="relative flex items-center gap-3">
        <span className="text-2xl font-bold leading-none tracking-[-0.02em] text-white">
          FeedbackPro<sup className="align-super text-[0.55em]">\u00ae</sup>
        </span>
      </div>''',
)

# 4) Logo mobile : png bleu -> wordmark encre
rep(
    '<img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-9" />',
    '<span className="text-xl font-bold leading-none tracking-[-0.02em] text-[#000d10]">\n              FeedbackPro<sup className="align-super text-[0.55em]">\u00ae</sup>\n            </span>',
)

# 5) Grille de fond dorée -> clay
rep(
    '"linear-gradient(rgba(201,169,97,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,97,0.7) 1px, transparent 1px)"',
    '"linear-gradient(rgba(188,113,85,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(188,113,85,0.7) 1px, transparent 1px)"',
)

# 6) Témoignage : carte carrée hairline, zéro ombre
rep(
    'className="max-w-md rounded-2xl border border-[#bc7155]/25 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-md"',
    'className="max-w-md rounded-none border border-white/15 bg-white/5 p-6 backdrop-blur-md"',
)

# 7) Champs : carrés éditoriaux
rep(
    '"h-12 rounded-xl border-2 border-[#d5d3d4] bg-white pl-11 pr-11 text-[#0f0f1c] placeholder:text-stone-400 focus-visible:border-[#bc7155] focus-visible:ring-2 focus-visible:ring-[#bc7155]/25"',
    '"h-12 rounded-none border border-[#d5d3d4] bg-white pl-11 pr-11 text-[#0f0f1c] placeholder:text-stone-400 focus-visible:border-[#000d10] focus-visible:ring-2 focus-visible:ring-[#000d10]/15"',
)

# 8) Pastille OK clay -> texte blanc
rep(
    'rounded-full bg-[#bc7155] text-[#0f0f1c] text-xs font-bold',
    'rounded-full bg-[#bc7155] text-white text-xs font-bold',
)

p.write_text(t, encoding="utf-8")
print("remplacements:", n)
for m in misses:
    print("MANQUE:", m)
