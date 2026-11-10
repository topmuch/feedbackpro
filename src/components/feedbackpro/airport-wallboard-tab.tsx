'use client'

// ============================================================
// <AirportWallboardTab /> — Wrapper intégré au ProDashboard
// ------------------------------------------------------------
// Embedde le wallboard plein écran /ops-wallboard dans une iframe
// qui remplit TOUTE la zone de contenu du ProDashboard (sous le
// header, à droite de la sidebar). Le <main> du ProDashboard passe
// en mode "plein écran" (flex flex-col, pas de max-width, pas de
// padding) quand cet onglet est actif — voir pro-dashboard.tsx.
//
// L'iframe utilise position:absolute inset-0 (au lieu de h-full)
// car les iframes ne respectent pas toujours height:100% quand le
// parent a une hauteur calculée par flexbox sans propriété height
// explicite.
//
// Le wallboard lui-même garde son thème sombre (slate-950) car c'est
// un affichage "salle ops" TV : le contraste sombre dans la page
// claire est volontaire et marque la différence.
// ============================================================

export function AirportWallboardTab() {
  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <iframe
        src="/ops-wallboard"
        className="absolute inset-0 h-full w-full border-0"
        title="Wallboard Ops Aéroport"
      />
    </div>
  )
}
