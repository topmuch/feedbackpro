'use client'

// ============================================================
// <CityWallboardTab /> — Wrapper intégré au CityDashboard
// ------------------------------------------------------------
// Embedde le wallboard plein écran /city-wallboard dans une iframe
// qui remplit la zone de contenu du dashboard ville. Inspiré du
// <AirportWallboardTab /> : iframe en absolute inset-0 (les iframes
// ne respectent pas toujours height:100% dans un parent flex sans
// height explicite).
//
// Le wallboard lui-même garde son thème sombre (#0a0a0a) car c'est
// un affichage "salle ops" TV : le contraste sombre marque la
// différence avec le reste du dashboard (clair).
// ============================================================

export function CityWallboardTab() {
  return (
    <div className="relative h-[calc(100vh-80px)] w-full overflow-hidden rounded-xl">
      <iframe
        src="/city-wallboard"
        className="absolute inset-0 h-full w-full border-0"
        title="Wallboard Ville"
      />
    </div>
  )
}
