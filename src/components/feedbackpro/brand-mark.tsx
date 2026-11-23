// ============================================================
// FeedVoice — Marque-logo officiel (harmonisation globale)
// ------------------------------------------------------------
// POINT UNIQUE pour afficher le logo FeedVoice sur TOUTES les
// pages : landing, auth, dashboards, pages légales, marketing.
//
// Sources (assets officiels détourés) :
//   - /feedvoice/logo@2x.png        → encre (noir), 450×114
//   - /feedvoice/logo-white@2x.png  → blanc, 450×114
//
// Échelle harmonisée (une seule doctrine, partout) :
//   - h-6 (24px) : barres de navigation, headers sticky, footers
//   - h-7 (28px) : panneaux d'authentification, sidebar admin
//   - h-8+       : écrans centrés (login), logos d'accueil
//   - Wordmark héro (landing) : via className libre
//
// Utilisation : <BrandMark /> · <BrandMark tone="white" className="h-7" />
// ============================================================

const SOURCES = {
  ink: "/feedvoice/logo@2x.png",
  white: "/feedvoice/logo-white@2x.png",
} as const

export function BrandMark({
  tone = "ink",
  className = "h-6",
}: {
  tone?: "ink" | "white"
  /** Classe de hauteur Tailwind (h-5/h-6/h-7/h-8…) ou libre */
  className?: string
}) {
  return (
    <img
      src={SOURCES[tone]}
      alt="FeedVoice"
      draggable={false}
      className={`block w-auto max-w-none ${className}`}
    />
  )
}
