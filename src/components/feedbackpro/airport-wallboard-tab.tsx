'use client'

// ============================================================
// <AirportWallboardTab /> — Wrapper léger intégré au ProDashboard
// ------------------------------------------------------------
// Task 2-4 : embedde le wallboard plein écran /ops-wallboard dans
// une iframe qui remplit la zone de contenu du ProDashboard (thème
// clair). Le wallboard lui-même reste sur son route dédiée avec
// son propre thème sombre (slate-950) — c'est volontaire, c'est
// un affichage "salle ops" TV.
//
// L'iframe remplit la hauteur disponible sous le header du Pro :
// `calc(100vh - 12rem)` couvre header sticky + paddings du main.
// ============================================================

export function AirportWallboardTab() {
  return (
    <div className="h-[calc(100vh-12rem)] w-full overflow-hidden rounded-lg border">
      <iframe
        src="/ops-wallboard"
        className="h-full w-full border-0"
        title="Wallboard Ops Aéroport"
      />
    </div>
  )
}
