"use client"

// ============================================================
// ScratchCard — Ticket à gratter digital (module loterie)
// ------------------------------------------------------------
// Canvas HTML5 qui simule le grattage d'un ticket à gratter.
// Le client glisse son doigt / souris sur la zone argentée pour
// révéler le gain (ou la perte). Quand ≥ 55 % de la surface est
// grattée, on déclenche onComplete() et on efface totalement le
// calque argenté pour révéler le contenu en grand.
//
// Props :
//   - gain          : texte affiché sous le calque (ex : "☕ Café offert")
//   - gagne         : true si le client a gagné, false sinon
//   - onComplete    : callback appelé quand le grattage est terminé
//   - largeur       : largeur du canvas (défaut 320)
//   - hauteur       : hauteur du canvas (défaut 200)
// ============================================================

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type ScratchCardProps = {
  gain: string
  gagne: boolean
  onComplete?: () => void
  largeur?: number
  hauteur?: number
  labelGrattez?: string
  className?: string
}

export function ScratchCard({
  gain,
  gagne,
  onComplete,
  largeur = 320,
  hauteur = 200,
  labelGrattez = "Grattez ici",
  className,
}: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gratteEnCours, setGratteEnCours] = useState(false)
  const [termine, setTermine] = useState(false)
  // Compteur de pixels grattés pour détecter le seuil (55 %)
  const pctRef = useRef(0)
  // Ref mutable pour éviter de multiplier les callbacks onComplete
  const completeRef = useRef(false)

  // ---------- Init : remplit le canvas avec un dégradé argenté ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Hi-DPI : on augmente la résolution du canvas sans changer sa taille CSS
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    canvas.width = largeur * dpr
    canvas.height = hauteur * dpr
    ctx.scale(dpr, dpr)

    // Dégradé argenté
    const gradient = ctx.createLinearGradient(0, 0, largeur, hauteur)
    gradient.addColorStop(0, "#cbd5e1") // slate-300
    gradient.addColorStop(0.5, "#94a3b8") // slate-400
    gradient.addColorStop(1, "#64748b") // slate-500
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, largeur, hauteur)

    // Motif "grattez ici" en pointillés
    ctx.fillStyle = "rgba(255,255,255,0.65)"
    ctx.font = "bold 16px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(labelGrattez, largeur / 2, hauteur / 2 - 10)
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif"
    ctx.fillText("👆👆👆", largeur / 2, hauteur / 2 + 14)

    // Mode "destination-out" : les prochains tracés effacent le calque
    ctx.globalCompositeOperation = "destination-out"
    ctx.lineWidth = 28
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [largeur, hauteur, labelGrattez])

  // ---------- Helpers : position souris/doigt relative au canvas ----------
  function positionRelative(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e as PointerEvent).clientX - rect.left) * (largeur / rect.width),
      y: ((e as PointerEvent).clientY - rect.top) * (hauteur / rect.height),
    }
  }

  // ---------- Grattage : tracer un segment qui efface ----------
  let dernierePos: { x: number; y: number } | null = null

  function gratteStart(e: React.PointerEvent<HTMLCanvasElement>) {
    if (termine) return
    e.preventDefault()
    setGratteEnCours(true)
    dernierePos = positionRelative(e)
    // Premier point : on dessine un disque pour avoir une trace immédiate
    grattePoint(dernierePos)
  }

  function gratteMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!gratteEnCours || termine) return
    e.preventDefault()
    const pos = positionRelative(e)
    gratteSegment(dernierePos, pos)
    dernierePos = pos
  }

  function gratteEnd() {
    if (!gratteEnCours) return
    setGratteEnCours(false)
    dernierePos = null
    verifierProgression()
  }

  function grattePoint(p: { x: number; y: number }) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    ctx.beginPath()
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2)
    ctx.fill()
  }

  function gratteSegment(
    from: { x: number; y: number } | null,
    to: { x: number; y: number }
  ) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    ctx.beginPath()
    if (from) {
      ctx.moveTo(from.x, from.y)
    } else {
      ctx.moveTo(to.x, to.y)
    }
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    // Petit disque au bout pour lisser
    ctx.beginPath()
    ctx.arc(to.x, to.y, 14, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---------- Vérifie le % de surface grattée ----------
  function verifierProgression() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    // Échantillonne 1 pixel sur 8 (8x8 = 64) pour rester léger
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const w = canvas.width
    const h = canvas.height
    let transparentes = 0
    let total = 0
    const step = 8 * dpr
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const pixel = ctx.getImageData(x, y, 1, 1).data
        // alpha < 128 = pixel effacé (transparent)
        if (pixel[3] < 128) transparentes++
        total++
      }
    }
    const pct = total > 0 ? (transparentes / total) * 100 : 0
    pctRef.current = pct
    if (pct >= 55 && !completeRef.current) {
      completeRef.current = true
      revelerComplet()
    }
  }

  // ---------- Révèle entièrement le ticket (efface le calque) ----------
  function revelerComplet() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    // Animation : on efface le canvas en 200 ms (fade out)
    ctx.globalCompositeOperation = "destination-out"
    const start = performance.now()
    const duree = 200
    function step(now: number) {
      const t = Math.min(1, (now - start) / duree)
      if (!canvas || !ctx) return
      // On repeint le calque argenté avec une opacité décroissante, en
      // mode destination-out → ça efface progressivement
      ctx.save()
      ctx.globalCompositeOperation = "destination-out"
      ctx.fillStyle = `rgba(0,0,0,${0.18 * t})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
      if (t < 1) {
        requestAnimationFrame(step)
      } else {
        // Effacement final propre
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setTermine(true)
        onComplete?.()
      }
    }
    requestAnimationFrame(step)
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-4 border-amber-300 bg-white shadow-lg",
        className
      )}
      style={{ width: largeur, height: hauteur, maxWidth: "100%" }}
    >
      {/* Couche de fond : gain affiché sous le calque argenté */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        {gagne ? (
          <>
            <span className="text-4xl" aria-hidden>
              🎉
            </span>
            <p className="text-balance text-lg font-black leading-tight text-amber-700 sm:text-xl">
              {gain}
            </p>
          </>
        ) : (
          <>
            <span className="text-4xl" aria-hidden>
              😊
            </span>
            <p className="text-balance text-base font-bold leading-tight text-slate-600 sm:text-lg">
              Merci pour votre participation !
            </p>
            <p className="text-xs text-slate-500">Retentez votre chance à votre prochaine visite.</p>
          </>
        )}
      </div>

      {/* Canvas par-dessus (calque argenté à gratter) */}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          termine ? "pointer-events-none opacity-0 transition-opacity duration-300" : "cursor-pointer"
        )}
        style={{ width: "100%", height: "100%" }}
        onPointerDown={gratteStart}
        onPointerMove={gratteMove}
        onPointerUp={gratteEnd}
        onPointerLeave={gratteEnd}
        onPointerCancel={gratteEnd}
        aria-label="Ticket à gratter — glissez votre doigt pour révéler le gain"
      />
    </div>
  )
}
