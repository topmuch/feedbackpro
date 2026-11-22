"use client"

// ============================================================
// Nathalie — démo vocale interactive (section sombre du landing)
// ------------------------------------------------------------
// DEUX MOTEURS DE VOIX, par priorité décroissante :
//   1. VOIX SERVEUR (vraie voix IA) : POST /api/voice/demo → WAV
//      généré par le SDK z-ai-web-dev-sdk via Z_AI_CONFIG (voir
//      src/instrumentation.ts). L'audio du contexte courant est
//      PRÉCHARGÉ au montage et au changement de contexte : au clic,
//      play() est appelé directement dans le geste utilisateur —
//      indispensable sur iOS/Safari (politique d'autoplay stricte).
//      Le prospect entend donc la MÊME voix de Nathalie sur tous les
//      appareils, y compris ceux sans aucune voix FR installée (cas
//      « audio bloqué » historique).
//   2. WEB SPEECH API (repli navigateur) : si le serveur ne répond
//      pas (502, réseau…), on retombe sur la synthèse vocale native.
//
// Le prospect choisit un contexte d'écoute (Salon VIP, aéroport,
// restaurant, hôtel) et entend l'annonce correspondante :
//   · Salon VIP / Hôtel → ton doux (vitesse −)
//   · Aéroport / Restaurant → ton professionnel neutre
//
// États gérés : préparation de la voix (chargement), lecture en cours
// (onde sonore animée, barre de progression pilotée par la durée réelle
// du WAV), arrêt/reprise au clic, horloge temps réel, repli gracieux
// (simulateur visuel si AUCUN moteur ne peut parler), nettoyage complet
// à l'unmount (URLs objet révoquées, synthèse annulée).
// ============================================================

import { useEffect, useRef, useState } from "react"
import {
  Hotel,
  Loader2,
  Mic,
  Plane,
  Play,
  Square,
  UtensilsCrossed,
  Wine,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ANNONCES_DEMO, type ContexteVocalId } from "@/lib/voix-demo"

interface VoiceContextDef {
  id: ContexteVocalId
  label: string
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
    location: "Salon VIP Terra",
    tone: "Mode discret",
    voice: "doux",
  },
  {
    id: "airport",
    label: "Aéroport",
    icon: Plane,
    location: "Terminal 2 · Bagages",
    tone: "Ton ferme",
    voice: "normal",
  },
  {
    id: "restaurant",
    label: "Restaurant",
    icon: UtensilsCrossed,
    location: "Salle principale",
    tone: "Ton direct",
    voice: "normal",
  },
  {
    id: "hotel",
    label: "Hôtel",
    icon: Hotel,
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

/** Élément <audio> prêt pour un contexte donné (blob WAV serveur). */
interface AudioPrete {
  id: ContexteVocalId
  el: HTMLAudioElement
  url: string
}

export function VoiceDemoNathalie() {
  const [contextId, setContextId] = useState<ContexteVocalId>("vip")
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  // true pendant la génération/téléchargement de la voix serveur
  const [chargement, setChargement] = useState(false)
  // Passe à true uniquement si AUCUN moteur ne peut parler (ni serveur
  // ni navigateur) — posé dans un gestionnaire d'événement, jamais
  // pendant un effet.
  const [speechFailed, setSpeechFailed] = useState(false)
  const [clock, setClock] = useState("--:--:--")

  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const progressTimerRef = useRef<number | null>(null)
  const fallbackTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const estimatedMsRef = useRef(1)
  const visualPlayingRef = useRef(false)
  const realSpeechRef = useRef(false)
  /** Moteur de voix en cours : « serveur » (WAV) / « navigateur » (Web Speech) / null. */
  const moteurActifRef = useRef<"serveur" | "navigateur" | null>(null)
  // Audio serveur du contexte courant (préchargé) + promesses en cours.
  const audioRef = useRef<AudioPrete | null>(null)
  const promesseAudioRef = useRef<Map<ContexteVocalId, Promise<HTMLAudioElement | null>>>(new Map())
  // Référence « latest » pour appeler la version courante depuis les
  // effets à dépendances restreintes et les handlers d'éléments audio.
  const obtenirAudioRef = useRef<(id: ContexteVocalId) => Promise<HTMLAudioElement | null>>(
    async () => null
  )

  const context = CONTEXTS.find((c) => c.id === contextId) ?? CONTEXTS[0]
  /** Texte exact affiché ET prononcé — source unique : src/lib/voix-demo.ts. */
  const texte = ANNONCES_DEMO[context.id].texte

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

  // ---------- Audio serveur : chargement + libération ----------

  /** Arrête et révoque l'élément audio courant (blob URL). */
  const libererAudioCourant = () => {
    const courant = audioRef.current
    if (!courant) return
    try {
      courant.el.pause()
    } catch {
      /* déjà arrêté */
    }
    try {
      URL.revokeObjectURL(courant.url)
    } catch {
      /* URL déjà révoquée */
    }
    audioRef.current = null
  }

  /**
   * Récupère (et met en cache local) l'audio serveur d'un contexte.
   * Retourne null si le serveur ne peut pas produire l'audio —
   * l'appelant retombe alors sur la Web Speech API.
   */
  const obtenirAudio = (id: ContexteVocalId): Promise<HTMLAudioElement | null> => {
    if (typeof window === "undefined") return Promise.resolve(null)
    const existant = audioRef.current
    if (existant && existant.id === id) return Promise.resolve(existant.el)
    const dejaEnCours = promesseAudioRef.current.get(id)
    if (dejaEnCours) return dejaEnCours

    const promesse = (async () => {
      try {
        const res = await fetch("/api/voice/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: id }),
        })
        if (!res.ok) return null
        const type = res.headers.get("content-type") ?? ""
        if (!type.includes("audio")) return null
        const blob = await res.blob()
        if (blob.size === 0) return null
        libererAudioCourant()
        const url = URL.createObjectURL(blob)
        const el = new Audio(url)
        el.preload = "auto"
        el.onended = () => stopPlayback()
        el.onplay = () => {
          moteurActifRef.current = "serveur"
          realSpeechRef.current = true
          beginVisualPlayback()
        }
        audioRef.current = { id, el, url }
        return el
      } catch {
        return null
      } finally {
        promesseAudioRef.current.delete(id)
      }
    })()
    promesseAudioRef.current.set(id, promesse)
    return promesse
  }
  obtenirAudioRef.current = obtenirAudio

  // Préchargement de la voix du contexte courant : au clic, play() est
  // appelé directement dans le geste utilisateur (contrainte iOS/Safari).
  useEffect(() => {
    if (typeof window === "undefined") return
    void obtenirAudioRef.current?.(contextId)
  }, [contextId])

  // ---------- Contrôle de lecture ----------

  const stopPlayback = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    const courant = audioRef.current
    if (courant) {
      try {
        courant.el.pause()
        courant.el.currentTime = 0
      } catch {
        /* élément déjà à l'arrêt */
      }
    }
    moteurActifRef.current = null
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
  // progression. Idempotent — appelé par onplay/onstart ou par le filet
  // de sécurité si l'environnement ne déclenche jamais ces événements.
  const beginVisualPlayback = () => {
    if (visualPlayingRef.current) return
    visualPlayingRef.current = true
    setPlaying(true)
    startedAtRef.current = Date.now()
    // Durée estimée : ~60 ms par caractère (borne basse 1,2 s) —
    // remplacée par la durée RÉELLE du WAV dès que les métadonnées
    // sont connues (voir l'intervalle ci-dessous).
    estimatedMsRef.current = Math.max(texte.length * 60, 1200)
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current)
    progressTimerRef.current = window.setInterval(() => {
      // Progression pilotée par le WAV (durée réelle) UNIQUEMENT si le
      // moteur serveur est bien celui qui parle — sinon (repli navigateur
      // ou simulation visuelle) on garde l'estimation : l'élément audio
      // reste figé à currentTime 0 et casserait la barre à 0 %.
      const courant = audioRef.current
      const el =
        moteurActifRef.current === "serveur" && courant && courant.id === context.id
          ? courant.el
          : null
      const dureeValide = el !== null && Number.isFinite(el.duration) && el.duration > 0
      const pct = dureeValide && el
        ? Math.min((el.currentTime / el.duration) * 100, 100)
        : Math.min(((Date.now() - startedAtRef.current) / estimatedMsRef.current) * 100, 100)
      setProgress(pct)
      // Si aucune vraie voix n'a jamais démarré (échec serveur + repli
      // visuel), on repose l'interface à 100 % plutôt que de laisser un
      // état « Nathalie parle… » figé.
      if (pct >= 100 && !realSpeechRef.current) stopPlayback()
    }, 100)
  }

  // Moteur 2 — Web Speech API du navigateur (repli si le serveur
  // d'audio est indisponible ou si la lecture du WAV est bloquée).
  const startPlayback = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechFailed(true)
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    stopPlayback()
    moteurActifRef.current = "navigateur"

    const utterance = new SpeechSynthesisUtterance(texte)
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
      // Repli ultime : aucun moteur disponible → simulation visuelle
      // de l'annonce plutôt qu'un bouton inerte.
      beginVisualPlayback()
    }

    synth.speak(utterance)

    // Filet de sécurité : si onstart ne survient pas sous 900 ms
    // (aucune voix installée, backend audio absent…), l'interface
    // entre quand même en état « lecture » pour ne jamais paraître inerte.
    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current)
    fallbackTimerRef.current = window.setTimeout(beginVisualPlayback, 900)
  }

  // Moteur 1 — voix serveur (vraie voix IA Nathalie).
  const demarrerLectureServeur = () => {
    const pret = audioRef.current && audioRef.current.id === contextId ? audioRef.current : null
    if (pret) {
      // Audio déjà préchargé : play() est appelé SYNCHRONEMENT dans le
      // geste utilisateur (condition requise par iOS/Safari).
      stopPlayback()
      pret.el.currentTime = 0
      pret.el.play().catch(() => startPlayback()) // bloqué → repli navigateur
      return
    }
    // Audio pas encore prêt : chargement puis lecture. Si le serveur
    // échoue ou si la lecture est refusée → repli Web Speech API.
    setChargement(true)
    obtenirAudioRef
      .current?.(contextId)
      .then((el) => {
        setChargement(false)
        if (!el) {
          startPlayback()
          return
        }
        stopPlayback()
        el.currentTime = 0
        el.play().catch(() => startPlayback())
      })
      .catch(() => {
        setChargement(false)
        startPlayback()
      })
  }

  const changeContext = (id: ContexteVocalId) => {
    if (id === contextId) return
    stopPlayback()
    setChargement(false)
    setContextId(id)
  }

  // Jamais de voix résiduelle ni de fuite mémoire en quittant la page.
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
      promesseAudioRef.current.clear()
      libererAudioCourant()
      cancelSpeech()
    }
  }, [])

  const toggle = () => {
    if (playing || chargement) {
      setChargement(false)
      stopPlayback()
    } else {
      demarrerLectureServeur()
    }
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
          « {texte} »
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
        aria-busy={chargement}
        aria-label={
          playing
            ? "Arrêter la démonstration vocale"
            : `Écouter Nathalie — contexte ${context.label}`
        }
      >
        {playing ? (
          <Square size={16} aria-hidden />
        ) : chargement ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <Play size={16} aria-hidden />
        )}
        {playing ? "Nathalie parle…" : chargement ? "Nathalie arrive…" : "Écouter Nathalie"}
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
          La lecture audio n'est pas disponible sur cet appareil. Essayez Chrome ou Safari, ou
          réessayez dans quelques instants.
        </p>
      )}
    </div>
  )
}
