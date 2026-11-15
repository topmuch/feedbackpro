"use client"

// ============================================================
// FeedbackPro - LanguagePicker (Task WAHOO-1 — Denise Traducteur)
// ------------------------------------------------------------
// Sélecteur de langue compact pour la PWA voyageur aéroport.
// Le voyageur choisit sa langue maternellle parmi 11 langues + auto.
// Le commentaire saisi (ou dicté) sera traduit en français par
// /api/airport/translate avant d'être soumis à /api/airport/report.
//
// Props :
//   - value       : code langue courant (fr, en, zh, ar, es, de, pt,
//                   it, ru, ja, wo, auto)
//   - onChange    : callback appelé avec le nouveau code langue
//
// Affichage : bouton compact (drapeau + libellé court) + popover
// liste déroulante. Style glassmorphism violet/fuchsia cohérent avec
// l'écran "probleme_choisi" de AirportScanView.
// ============================================================

import { useEffect, useRef, useState } from "react"
import { Check, Globe, Languages } from "lucide-react"
import { cn } from "@/lib/utils"

export type AirportLang =
  | "fr"
  | "en"
  | "zh"
  | "ar"
  | "es"
  | "de"
  | "pt"
  | "it"
  | "ru"
  | "ja"
  | "wo"
  | "auto"

type LangInfo = {
  code: AirportLang
  flag: string
  label: string
  short: string
}

// Liste ordonnée par fréquence probable à l'aéroport (FR d'abord,
// puis anglais, wolof — aéroport de Dakar —, et grandes langues
// touristiques). "Auto" en dernier (détection LLM).
const LANGS: LangInfo[] = [
  { code: "fr", flag: "🇫🇷", label: "Français", short: "FR" },
  { code: "en", flag: "🇬🇧", label: "English", short: "EN" },
  { code: "wo", flag: "🇸🇳", label: "Wolof", short: "WO" },
  { code: "zh", flag: "🇨🇳", label: "中文", short: "ZH" },
  { code: "ar", flag: "🇸🇦", label: "العربية", short: "AR" },
  { code: "es", flag: "🇪🇸", label: "Español", short: "ES" },
  { code: "de", flag: "🇩🇪", label: "Deutsch", short: "DE" },
  { code: "pt", flag: "🇵🇹", label: "Português", short: "PT" },
  { code: "it", flag: "🇮🇹", label: "Italiano", short: "IT" },
  { code: "ru", flag: "🇷🇺", label: "Русский", short: "RU" },
  { code: "ja", flag: "🇯🇵", label: "日本語", short: "JA" },
  { code: "auto", flag: "🌍", label: "Auto (détection)", short: "Auto" },
]

const LANG_BY_CODE = new Map<string, LangInfo>(
  LANGS.map((l) => [l.code, l]),
)

export function getLangInfo(code: string): LangInfo | undefined {
  return LANG_BY_CODE.get(code)
}

type Props = {
  value: string
  onChange: (lang: AirportLang) => void
  className?: string
}

export function LanguagePicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Ferme le popover si on clique en dehors ou si Escape est pressé.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const current = LANG_BY_CODE.get(value) ?? LANGS[0]

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choisir la langue du message"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-white/60 backdrop-blur-md transition-all hover:bg-white/90 hover:ring-violet-200",
          open && "ring-2 ring-violet-300 bg-white/90",
        )}
      >
        <Languages className="size-3.5 text-violet-500" aria-hidden />
        <span aria-hidden className="text-sm leading-none">
          {current.flag}
        </span>
        <span className="leading-none">{current.short}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Langues disponibles"
          className="absolute end-0 z-30 mt-1 max-h-72 w-48 overflow-y-auto rounded-2xl border border-white/60 bg-white/95 p-1 shadow-xl backdrop-blur-md ring-1 ring-violet-100"
        >
          {/* En-tête */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-500">
            <Globe className="size-3" aria-hidden />
            <span>Langue du message</span>
          </div>

          {LANGS.map((l) => {
            const actif = l.code === value
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={actif}
                onClick={() => {
                  onChange(l.code)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                  actif
                    ? "bg-gradient-to-r from-violet-50 to-fuchsia-50 font-bold text-violet-700 ring-1 ring-violet-200"
                    : "text-slate-700 hover:bg-violet-50/60",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {l.flag}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                {actif && <Check className="size-3.5 text-violet-600" aria-hidden />}
              </button>
            )
          })}

          {/* Note pédagogique */}
          <p className="px-2.5 py-1.5 text-[10px] leading-snug text-slate-400">
            Votre message sera traduit en français pour le staff.
          </p>
        </div>
      )}
    </div>
  )
}
