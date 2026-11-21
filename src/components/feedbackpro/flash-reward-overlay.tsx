"use client"

// ============================================================
// FlashRewardOverlay — Carte à gratter post-signalement
// ------------------------------------------------------------
// Overlay plein écran affiché au voyageur APRÈS qu'il a signalé
// un incident (et ~3,5 s après que Nathalie a parlé).
//
// Flux :
//   1. On mount → POST /api/airport/flash-rewards/redeem
//      { reportId, zoneCode, problemType, clientIp }.
//   2. Si eligible=false → onClose() immédiat.
//   3. Sinon, countdown "Votre cadeau vous attend..." 3 s.
//   4. Carte à gratter (canvas) :
//        - fond: imageUrl OU gradient navy/gold
//        - titre, valeur (-15%), description
//        - code unique (FBK-XXXX-YYYY) en grand monospace
//        - expiration
//   5. Quand ≥ 55 % gratté → POST /scratch (marque "scratched")
//      + affiche 2 CTA : "Enregistrer le code" (localStorage)
//      et "Partager sur WhatsApp".
//   6. Bouton X en haut à droite.
//
// Palette aéroport : navy #000d10 + gold #bc7155.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Gift,
  Loader2,
  Sparkles,
  Save,
  Share2,
  CheckCircle2,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------- Palette ----------
const NAVY = "#000d10"
const GOLD = "#bc7155"

// ---------- Types (mirror API) ----------
type RedeemResponse =
  | {
      eligible: false
    }
  | {
      eligible: true
      campaign: {
        id: string
        title: string
        rewardType: string
        rewardValue: string
        description: string
        imageUrl: string | null
        codeValidityHours: number
        activeFrom: string
        activeTo: string
      }
      code: {
        id: string
        code: string
        expiresAt: string
      }
    }

type FlashRewardOverlayProps = {
  reportId: string
  zoneCode: string
  problemType: string
  onClose: () => void
}

// ---------- Composant principal ----------
export function FlashRewardOverlay({
  reportId,
  zoneCode,
  problemType,
  onClose,
}: FlashRewardOverlayProps) {
  const [phase, setPhase] = useState<"loading" | "teasing" | "scratch" | "revealed">(
    "loading",
  )
  const [data, setData] = useState<RedeemResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [codeSaved, setCodeSaved] = useState(false)
  // Ref pour éviter un double fetch en React StrictMode (dev)
  const fetchedRef = useRef(false)

  // 1. Fetch redeem au mount — SILENCIEUX : pas de spinner visible.
  // L'overlay reste invisible (return null) pendant la vérification.
  // Si pas éligible → onClose() sans jamais rien afficher (pas de flash).
  // Si éligible → setData + setPhase("teasing") → la carte apparaît.
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    void (async () => {
      try {
        const res = await fetch("/api/airport/flash-rewards/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId,
            zoneCode,
            problemType,
            clientIp: getClientIpHint(),
          }),
        })
        const json = (await res.json()) as { ok: boolean; data?: RedeemResponse }
        if (!res.ok || !json.ok || !json.data) {
          // Pas éligible → fermer SANS afficher quoi que ce soit (pas de flash)
          onClose()
          return
        }
        if (!json.data.eligible) {
          // Pas éligible → fermer SANS afficher quoi que ce soit
          onClose()
          return
        }
        // Éligible ! → afficher la carte
        setData(json.data)
        setPhase("teasing")
      } catch {
        // Erreur réseau → fermer sans bruit
        onClose()
      }
    })()
  }, [reportId, zoneCode, problemType, onClose])

  // 2. Countdown teasing → scratch (3s de suspense "votre cadeau vous attend")
  useEffect(() => {
    if (phase !== "teasing") return
    const id = setTimeout(() => setPhase("scratch"), 3000)
    return () => clearTimeout(id)
  }, [phase])

  // Fermeture clavier (Échap)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // PENDANT LE LOADING : invisible (return null). Pas de spinner, pas de
  // flash. L'overlay n'apparaît que si data est set (éligible=true).
  if (!data) {
    return null
  }

  if (error) {
    return (
      <OverlayShell onClose={onClose}>
        <div className="text-center text-white">
          <p className="text-sm text-white/80">{error}</p>
          <Button variant="outline" className="mt-4" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </OverlayShell>
    )
  }

  if (!data || !data.eligible) {
    // Ne devrait pas arriver (onClose déjà appelé), mais par sécurité :
    return null
  }

  const { campaign, code } = data

  return (
    <OverlayShell onClose={onClose}>
      <AnimatePresence mode="wait">
        {phase === "teasing" && (
          <motion.div
            key="teasing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 text-center text-white"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              <Gift className="h-8 w-8" aria-hidden />
            </motion.div>
            <h2 className="text-xl font-black">Votre cadeau vous attend…</h2>
            <p className="text-sm text-white/80">Grattez la carte pour révéler votre récompense</p>
            <CountdownDots />
          </motion.div>
        )}

        {(phase === "scratch" || phase === "revealed") && (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex w-full flex-col items-center"
          >
            <ScratchCard
              campaign={campaign}
              code={code}
              revealed={phase === "revealed"}
              onRevealed={() => {
                setPhase("revealed")
                // Best-effort POST scratch (idempotent côté serveur)
                void fetch("/api/airport/flash-rewards/scratch", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ codeId: code.id }),
                }).catch(() => undefined)
              }}
            />

            {phase === "revealed" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-4 flex flex-col gap-2"
              >
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      saveCodeToStorage(code, campaign)
                      setCodeSaved(true)
                    }}
                    className="flex-1 gap-1.5"
                    style={{ backgroundColor: NAVY }}
                  >
                    {codeSaved ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Code enregistré
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" aria-hidden />
                        Enregistrer le code
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => shareOnWhatsApp(code, campaign)}
                    className="flex-1 gap-1.5"
                    style={{ borderColor: GOLD, color: NAVY }}
                  >
                    <Share2 className="h-4 w-4" aria-hidden />
                    WhatsApp
                  </Button>
                </div>
                <Button variant="ghost" className="text-white/80" onClick={onClose}>
                  Continuer
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayShell>
  )
}

// ============================================================
// Overlay shell (fond + close button + content centré)
// ============================================================

function OverlayShell({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label="Carte à gratter Flash Reward"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
    >
      {/* Voile */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: `linear-gradient(135deg, ${NAVY}F2 0%, ${NAVY}99 100%)` }}
      />
      {/* Blobs décoratifs */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full blur-3xl"
        style={{ backgroundColor: `${GOLD}22` }}
      />
      <div
        className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full blur-3xl"
        style={{ backgroundColor: `${GOLD}1A` }}
      />

      {/* Bouton X */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      {/* Contenu centré */}
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </motion.div>
  )
}

// ============================================================
// Countdown dots (3 s)
// ============================================================
function CountdownDots() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setActive((a) => Math.min(2, a + 1)), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full transition-colors"
          style={{ backgroundColor: i <= active ? GOLD : `${GOLD}55` }}
        />
      ))}
    </div>
  )
}

// ============================================================
// ScratchCard — carte à gratter avec canvas
// Adapté de /components/feedbackpro/scratch-card.tsx
// ============================================================

type CampaignData = {
  id: string
  title: string
  rewardType: string
  rewardValue: string
  description: string
  imageUrl: string | null
  codeValidityHours: number
  activeFrom: string
  activeTo: string
}
type CodeData = { id: string; code: string; expiresAt: string }

function ScratchCard({
  campaign,
  code,
  revealed,
  onRevealed,
}: {
  campaign: CampaignData
  code: CodeData
  revealed: boolean
  onRevealed: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gratteEnCours, setGratteEnCours] = useState(false)
  const pctRef = useRef(0)
  const completeRef = useRef(false)
  const dernierePosRef = useRef<{ x: number; y: number } | null>(null)

  // Dimensions "logiques" du canvas (le calque argenté)
  const W = 360
  const H = 480

  // Init canvas argenté
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    // Dégradé argenté façon carte à gratter
    const gradient = ctx.createLinearGradient(0, 0, W, H)
    gradient.addColorStop(0, "#cbd5e1")
    gradient.addColorStop(0.5, "#94a3b8")
    gradient.addColorStop(1, "#64748b")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, W, H)

    // Motif
    ctx.fillStyle = "rgba(255,255,255,0.7)"
    ctx.font = "bold 18px ui-sans-serif, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("GRATTEZ ICI", W / 2, H / 2 - 16)
    ctx.font = "14px ui-sans-serif, system-ui, sans-serif"
    ctx.fillText("👆👆👆", W / 2, H / 2 + 12)

    // Petit logo Gift discret
    ctx.fillStyle = "rgba(0,51,153,0.45)"
    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif"
    ctx.fillText("Flash Reward", W / 2, 20)

    // Mode "destination-out" pour effacer en grattant
    ctx.globalCompositeOperation = "destination-out"
    ctx.lineWidth = 32
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
  }, [])

  function posRelative(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e as PointerEvent).clientX - rect.left) * (W / rect.width),
      y: ((e as PointerEvent).clientY - rect.top) * (H / rect.height),
    }
  }

  function gratteStart(e: React.PointerEvent<HTMLCanvasElement>) {
    if (revealed) return
    e.preventDefault()
    setGratteEnCours(true)
    const p = posRelative(e)
    dernierePosRef.current = p
    grattePoint(p)
  }

  function gratteMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!gratteEnCours || revealed) return
    e.preventDefault()
    const pos = posRelative(e)
    gratteSegment(dernierePosRef.current, pos)
    dernierePosRef.current = pos
  }

  function gratteEnd() {
    if (!gratteEnCours) return
    setGratteEnCours(false)
    dernierePosRef.current = null
    verifierProgression()
  }

  function grattePoint(p: { x: number; y: number }) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    ctx.beginPath()
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2)
    ctx.fill()
  }

  function gratteSegment(from: { x: number; y: number } | null, to: { x: number; y: number }) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    ctx.beginPath()
    if (from) ctx.moveTo(from.x, from.y)
    else ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(to.x, to.y, 16, 0, Math.PI * 2)
    ctx.fill()
  }

  function verifierProgression() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const w = canvas.width
    const h = canvas.height
    let transparentes = 0
    let total = 0
    const step = 8 * dpr
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const pixel = ctx.getImageData(x, y, 1, 1).data
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

  function revelerComplet() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return
    ctx.globalCompositeOperation = "destination-out"
    const start = performance.now()
    const duree = 250
    function step(now: number) {
      const t = Math.min(1, (now - start) / duree)
      if (!canvas || !ctx) return
      ctx.save()
      ctx.globalCompositeOperation = "destination-out"
      ctx.fillStyle = `rgba(0,0,0,${0.2 * t})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
      if (t < 1) {
        requestAnimationFrame(step)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        onRevealed()
      }
    }
    requestAnimationFrame(step)
  }

  const expiresLabel = (() => {
    try {
      const d = new Date(code.expiresAt)
      return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  })()

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20"
      style={{ width: "100%", aspectRatio: "3 / 4", maxWidth: W }}
    >
      {/* Fond de la carte : image OU gradient navy/gold */}
      <div className="absolute inset-0">
        {campaign.imageUrl ? (
          <img
            src={campaign.imageUrl}
            alt={campaign.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `radial-gradient(circle at top, ${NAVY}EE 0%, ${NAVY} 60%, #001a4d 100%)`,
            }}
          />
        )}
        {/* Voile sombre pour lisibilité du texte */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, rgba(0,26,77,0.4) 0%, rgba(0,51,153,0.7) 100%)`,
          }}
        />
      </div>

      {/* Contenu révélé */}
      <div className="absolute inset-0 flex flex-col items-center justify-between p-5 text-center text-white">
        {/* Bandeau haut */}
        <div className="flex w-full items-center justify-center">
          <span
            className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
            Flash Reward
          </span>
        </div>

        {/* Centre : titre + valeur + description */}
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <h3 className="text-balance text-lg font-black leading-tight drop-shadow-md">
            {campaign.title}
          </h3>
          <div
            className="text-5xl font-black drop-shadow-lg"
            style={{ color: GOLD }}
          >
            -{campaign.rewardValue}
            <span className="ml-1 text-xl">
              {campaign.rewardType === "percentage"
                ? "%"
                : campaign.rewardType === "fixed_amount"
                  ? " F"
                  : ""}
            </span>
          </div>
          {campaign.description && (
            <p className="text-balance text-xs leading-relaxed text-white/90">
              {campaign.description}
            </p>
          )}
        </div>

        {/* Bas : code + expiration */}
        <div className="w-full space-y-2">
          <div className="rounded-lg bg-white/15 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/70">
              Votre code
            </p>
            <p className="font-mono text-lg font-black tracking-wider" style={{ color: GOLD }}>
              {code.code}
            </p>
          </div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-white/70">
            <Clock className="h-3 w-3" aria-hidden />
            <span>Valable jusqu&apos;au {expiresLabel}</span>
          </div>
        </div>
      </div>

      {/* Canvas par-dessus (calque argenté à gratter) */}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          revealed ? "pointer-events-none opacity-0 transition-opacity duration-300" : "cursor-pointer",
        )}
        style={{ width: "100%", height: "100%" }}
        onPointerDown={gratteStart}
        onPointerMove={gratteMove}
        onPointerUp={gratteEnd}
        onPointerLeave={gratteEnd}
        onPointerCancel={gratteEnd}
        aria-label="Carte à gratter — glissez votre doigt pour révéler votre récompense"
      />
    </div>
  )
}

// ============================================================
// Helpers client
// ============================================================

/**
 * Tente de récupérer une "empreinte IP" côté client. En pratique,
 * le client ne connaît pas son IP publique, mais on envoie un hint
 * que le serveur peut compléter via X-Forwarded-For.
 */
function getClientIpHint(): string {
  // Les APIs publiques sont généralement bloquées en sandbox — on
  // laisse le serveur résoudre l'IP via les headers.
  return ""
}

function saveCodeToStorage(code: CodeData, campaign: CampaignData) {
  try {
    const key = "flash_rewards_codes"
    const raw = localStorage.getItem(key)
    const arr: Array<{
      code: string
      title: string
      expiresAt: string
      savedAt: string
    }> = raw ? JSON.parse(raw) : []
    arr.unshift({
      code: code.code,
      title: campaign.title,
      expiresAt: code.expiresAt,
      savedAt: new Date().toISOString(),
    })
    // Garde les 20 derniers
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 20)))
  } catch {
    /* localStorage peut être bloqué */
  }
}

function shareOnWhatsApp(code: CodeData, campaign: CampaignData) {
  const text = `Bonjour, j'ai reçu ce code cadeau Flash Reward : ${code.code} (${campaign.title}). Valable jusqu'au ${new Date(code.expiresAt).toLocaleString("fr-FR")}.`
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
  try {
    window.open(url, "_blank", "noopener,noreferrer")
  } catch {
    /* ignore */
  }
}
