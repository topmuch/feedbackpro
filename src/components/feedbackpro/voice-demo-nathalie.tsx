"use client"

// ============================================================
// Nathalie — démo vocale interactive (section sombre du landing)
// ------------------------------------------------------------
// Web Speech API native du navigateur : aucun asset audio, aucune
// dépendance. Le prospect choisit un contexte d'écoute (Salon VIP,
// aéroport, restaurant, hôtel), lit l'annonce correspondante et
// entend la voix s'adapter à l'environnement :
//   · Salon VIP / Hôtel → ton doux (pitch +, rythme −)
//   · Aéroport / Restaurant → ton professionnel neutre
//
// États gérés : lecture en cours (onde sonore animée, barre de
// progression, libellé « Nathalie parle… »), arrêt/reprise au clic,
// horloge temps réel, repli gracieux si le navigateur ne supporte
// pas la synthèse vocale, nettoyage complet à l'unmount.
// ============================================================

import { useEffect, useRef, useState } from "react"
import { Hotel, Mic, Plane, Play, Square, UtensilsCrossed, Wine } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type VoiceContextId = "vip" | "airport" | "restaurant" | "hotel"

interface VoiceContextDef {
  id: VoiceContextId
  label: string
  text: string
  location: string
  tone: string
  voice: "doux" | "normal" | "urgent"
  icon: LucideIcon
}

const CONTEXTS: VoiceContextDef[] = [
  {
    id: "vip",
    label: "Salon VIP",
    icon: Wine,
    text: "Point d'attention : Buffet niveau bas à 35 %. Rafraîchissement recommandé. Table T-08 signale un bruit excessif, intervention discrète en cours.",
    location: "Salon VIP Terra",
    tone: "Mode discret",
    voice: "doux",
  },
  {
    id: "airport",
    label: "Aéroport",
    icon: Plane,
    text: "Alerte zone bagages. Tapis numéro 4 arrêté depuis 8 minutes. Équipe maintenance notifiée. Temps d'attente estimé : 15 minutes.",
    location: "Terminal 2 · Bagages",
    tone: "Ton ferme",
    voice: "normal",
  },
  {
    id: "restaurant",
    label: "Restaurant",
    icon: UtensilsCrossed,
    text: "Attention équipe. Table 12 attend son plat depuis 18 minutes. Cuisine, priorité table 12. Service, vérification en salle.",
    location: "Salle principale",
    tone: "Ton direct",
    voice: "normal",
  },
  {
    id: "hotel",
    label: "Hôtel",
    icon: Hotel,
    text: "Bonsoir équipe. Résumé de la nuit : 2 incidents résolus. Chambre 302 a signalé un bruit de climatisation. Maintenance passée, soyez vigilants. Petit-déjeuner : 60 couverts, pic à 8 h 30.",
    location: "Réception · Briefing matin",
    tone: "Ton informatif",
    voice: "doux",
  },
]

/** Indices de noms de voix féminines françaises (priorité au naturel). */
const FEMALE_VOICE_HINTS = [
  "amélie",
  "amelie",
  "audrey",
  "julie",
  "marie",
  "céline",
  "celine",
  "virginie",
  "aurélie",
  "aurelie",
  "charlotte",
  "élodie",
  "elodie",
  "female",
  "femme",
]

function pickFrenchVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const french = voices.filter((v) => v.lang.toLowerCase().startsWith("fr"))
  const female = french.find((v) => {
    const name = v.name.toLowerCase()
    return FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))
  })
  return female ?? french[0] ?? null
}

export function VoiceDemoNathalie() {
  const [contextId, setContextId] = useState<VoiceContextId>("vip")
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  // Passe à true uniquement si un clic échoue faute de support navigateur
  // (posé dans le gestionnaire d'événement — jamais pendant un effet).
  const [speechFailed, setSpeechFailed] = useState(false)
  const [clock, setClock] = useState("--:--:--")

  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const progressTimerRef = useRef<number | null>(null)
  const fallbackTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const estimatedMsRef = useRef(1)
  const visualPlayingRef = useRef(false)
  const realSpeechRef = useRef(false)

  const context = CONTEXTS.find((c) => c.id === contextId) ?? CONTEXTS[0]

  // Horloge temps réel — client uniquement, aucun écart d'hydratation.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("fr-FR", { hour12: false }))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Chargement des voix (asynchrone selon navigateurs) — refs uniquement.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return
    }
    const synth = window.speechSynthesis
    const loadVoices = () => {
      voicesRef.current = synth.getVoices()
    }
    loadVoices()
    synth.addEventListener("voiceschanged", loadVoices)
    return () => synth.removeEventListener("voiceschanged", loadVoices)
  }, [])

  const stopPlayback = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    visualPlayingRef.current = false
    realSpeechRef.current = false
    setPlaying(false)
    setProgress(0)
  }

  // Passe l'interface en état « lecture » : onde sonore, barre de
  // progression. Idempotent — appelé par onstart ou par le filet de
  // sécurité si l'environnement ne déclenche jamais onstart.
  const beginVisualPlayback = () => {
    if (visualPlayingRef.current) return
    visualPlayingRef.current = true
    setPlaying(true)
    startedAtRef.current = Date.now()
    // Durée estimée : ~60 ms par caractère (borne basse 1,2 s).
    estimatedMsRef.current = Math.max(context.text.length * 60, 1200)
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current)
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current
      const pct = Math.min((elapsed / estimatedMsRef.current) * 100, 100)
      setProgress(pct)
      // Si aucune vraie voix n'a jamais démarré (aucune voix installée,
      // environnement sans audio), on repose l'interface à 100 % plutôt
      // que de laisser un état « Nathalie parle… » figé.
      if (pct >= 100 && !realSpeechRef.current) stopPlayback()
    }, 100)
  }

  const startPlayback = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechFailed(true)
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    stopPlayback()

    const utterance = new SpeechSynthesisUtterance(context.text)
    utterance.lang = "fr-FR"
    utterance.volume = 0.85
    if (context.voice === "doux") {
      utterance.rate = 0.88
      utterance.pitch = 1.1
    } else if (context.voice === "urgent") {
      utterance.rate = 1
      utterance.pitch = 1
    } else {
      utterance.rate = 0.92
      utterance.pitch = 1.05
    }
    const voice = pickFrenchVoice(voicesRef.current)
    if (voice) utterance.voice = voice

    utterance.onstart = () => {
      realSpeechRef.current = true
      beginVisualPlayback()
    }
    utterance.onend = stopPlayback
    utterance.onerror = (event) => {
      // Si la voix avait réellement démarré puis échoué → repos.
      if (realSpeechRef.current) {
        stopPlayback()
        return
      }
      // Annulation volontaire (bouton Stop, changement de contexte) :
      // Chrome émet un « error: canceled/interrupted » après cancel() —
      // il ne faut surtout pas relancer l'interface dans ce cas.
      if (event.error === "canceled" || event.error === "interrupted") {
        return
      }
      // Repli : aucune voix exploitable (aucune voix installée, backend
      // audio absent…) → on simule l'annonce visuellement plutôt que de
      // laisser un bouton inerte.
      beginVisualPlayback()
    }

    synth.speak(utterance)

    // Filet de sécurité : si onstart ne survient pas sous 900 ms
    // (aucune voix installée, backend audio absent…), l'interface
    // entre quand même en état « lecture » pour ne jamais paraître inerte.
    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current)
    fallbackTimerRef.current = window.setTimeout(beginVisualPlayback, 900)
  }

  const changeContext = (id: VoiceContextId) => {
    if (id === contextId) return
    stopPlayback()
    setContextId(id)
  }

  // Jamais de voix résiduelle en quittant la page.
  useEffect(() => {
    const cancelSpeech = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
    const onUnload = () => cancelSpeech()
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current)
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current)
      cancelSpeech()
    }
  }, [])

  const toggle = () => {
    if (playing) stopPlayback()
    else startPlayback()
  }

  return (
    <div className="hy-denise-panel hy-vdemo-panel">
      <div className="hy-denise-head">
        <span className="hy-denise-avatar hy-vdemo-avatar" aria-hidden>
          <Mic size={20} strokeWidth={2.2} />
        </span>
        <div>
          <div className="hy-denise-name">Nathalie</div>
          <div className="hy-denise-status">
            <span className="hy-denise-dot" aria-hidden />
            Écoute active · Prête à parler
          </div>
        </div>
      </div>

      <div className="hy-vdemo-ctx" role="group" aria-label="Choisir un contexte d'écoute">
        {CONTEXTS.map((c) => {
          const Icon = c.icon
          const active = c.id === contextId
          return (
            <button
              key={c.id}
              type="button"
              className="hy-vdemo-pill"
              data-active={active ? "true" : "false"}
              aria-pressed={active}
              onClick={() => changeContext(c.id)}
            >
              <Icon size={15} aria-hidden />
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="hy-vdemo-group">
        <div className="hy-denise-label">Annonce de Nathalie</div>
        <p className="hy-denise-quote hy-vdemo-quote" key={context.id} aria-live="polite">
          « {context.text} »
        </p>
      </div>

      <div className="hy-denise-meta">
        <span>{clock}</span>
        <span>{context.location}</span>
        <span>{context.tone}</span>
      </div>

      <button
        type="button"
        className="hy-vdemo-listen"
        data-playing={playing ? "true" : "false"}
        onClick={toggle}
        aria-label={playing ? "Arrêter la démonstration vocale" : `Écouter Nathalie — contexte ${context.label}`}
      >
        {playing ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        {playing ? "Nathalie parle…" : "Écouter Nathalie"}
        <span className="hy-vdemo-wave" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </button>

      {!speechFailed && <div className="hy-vdemo-progress" data-visible={playing ? "true" : "false"} aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>}

      {speechFailed && (
        <p className="hy-vdemo-fallback" role="note">
          Votre navigateur ne supporte pas la synthèse vocale. Essayez Chrome ou Safari.
        </p>
      )}
    </div>
  )
}
