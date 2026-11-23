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

// ------------------------------------------------------------
// CSS autonome — injecté par le composant : la démo peut vivre dans
// N'IMPORTE quelle landing (Hyer, Accueil Premium, …) sans dépendre
// d'un bloc CSS parent. Accent or #C9A961 (palette Accueil Premium
// v.14 harmonisée). Préfixe hy- conservé (historique + compatibilité).
// ------------------------------------------------------------
const VDEMO_CSS = `
.vdemo-scope {
  --vdemo-accent: #C9A961;
  --vdemo-ink: #000d10;
  --vdemo-white: #ffffff;
  --vdemo-deck: #151623;
}
.vdemo-scope .hy-denise-panel {
  background: var(--vdemo-deck);
  border-radius: 0;
  padding: 22px;
  display: flex; flex-direction: column; gap: 16px;
}
.vdemo-scope .hy-denise-head { display: flex; align-items: center; gap: 14px; }
.vdemo-scope .hy-denise-avatar {
  width: 44px; height: 44px; border-radius: 100%;
  background: var(--vdemo-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0; color: #1A1A1A;
}
.vdemo-scope .hy-denise-name { font-size: 17px; font-weight: 700; color: var(--vdemo-white); }
.vdemo-scope .hy-denise-status { font-size: 17px; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 8px; }
.vdemo-scope .hy-denise-dot { width: 8px; height: 8px; border-radius: 50%; background: #7fce94; display: inline-block; }
.vdemo-scope .hy-denise-label { font-size: 17px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); }
.vdemo-scope .hy-denise-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 15px; color: rgba(255,255,255,0.6); }
.vdemo-scope .hy-denise-meta span { display: inline-flex; align-items: center; gap: 6px; }
.vdemo-scope .hy-vdemo-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}
.vdemo-scope .hy-vdemo-panel::before {
  content: "";
  position: absolute;
  top: -170px;
  right: -130px;
  width: 440px;
  height: 440px;
  border-radius: 100%;
  background: radial-gradient(circle, rgba(201,169,97,0.14) 0%, transparent 68%);
  pointer-events: none;
}
.vdemo-scope .hy-vdemo-avatar { position: relative; }
.vdemo-scope .hy-vdemo-avatar::after {
  content: "";
  position: absolute;
  inset: -5px;
  border-radius: 100%;
  border: 1px solid rgba(201,169,97,0.45);
  animation: vdemo-avatar-pulse 2.2s ease-in-out infinite;
}
@keyframes vdemo-avatar-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.12); opacity: 0.4; }
}
.vdemo-scope .hy-vdemo-ctx { display: flex; flex-wrap: wrap; gap: 10px; }
.vdemo-scope .hy-vdemo-pill {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.72);
  padding: 10px 16px 11px;
  border-radius: 1000px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}
.vdemo-scope .hy-vdemo-pill:hover { border-color: rgba(201,169,97,0.55); color: var(--vdemo-white); }
.vdemo-scope .hy-vdemo-pill[data-active="true"] { background: var(--vdemo-accent); border-color: var(--vdemo-accent); color: #1A1A1A; }
.vdemo-scope .hy-vdemo-group { display: flex; flex-direction: column; gap: 10px; }
.vdemo-scope .hy-vdemo-quote {
  background: rgba(201,169,97,0.08);
  border-left: 3px solid var(--vdemo-accent);
  padding: 18px 20px;
  min-height: 108px;
  margin: 0;
  font-size: 17px;
  line-height: 1.6;
  color: var(--vdemo-white);
  animation: vdemo-quote-in 0.35s ease;
}
@keyframes vdemo-quote-in {
  from { opacity: 0.3; }
  to { opacity: 1; }
}
.vdemo-scope .hy-vdemo-listen {
  width: 100%;
  background: var(--vdemo-white);
  color: var(--vdemo-ink);
  border: 1px solid transparent;
  border-radius: 1000px;
  padding: 15px 22px 16px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 52px;
  transition: background 0.25s ease, color 0.25s ease;
}
.vdemo-scope .hy-vdemo-listen:hover { background: var(--vdemo-accent); color: #1A1A1A; }
.vdemo-scope .hy-vdemo-listen[data-playing="true"] { background: var(--vdemo-accent); color: #1A1A1A; }
.vdemo-scope .hy-vdemo-wave { display: none; align-items: flex-end; gap: 3px; height: 18px; }
.vdemo-scope .hy-vdemo-listen[data-playing="true"] .hy-vdemo-wave { display: flex; }
.vdemo-scope .hy-vdemo-wave span {
  width: 3px;
  background: currentColor;
  border-radius: 2px;
  animation: vdemo-wave-bar 1s ease-in-out infinite;
}
.vdemo-scope .hy-vdemo-wave span:nth-child(1) { animation-delay: 0s; height: 7px; }
.vdemo-scope .hy-vdemo-wave span:nth-child(2) { animation-delay: 0.1s; height: 12px; }
.vdemo-scope .hy-vdemo-wave span:nth-child(3) { animation-delay: 0.2s; height: 18px; }
.vdemo-scope .hy-vdemo-wave span:nth-child(4) { animation-delay: 0.3s; height: 12px; }
.vdemo-scope .hy-vdemo-wave span:nth-child(5) { animation-delay: 0.4s; height: 7px; }
@keyframes vdemo-wave-bar {
  0%, 100% { transform: scaleY(0.55); }
  50% { transform: scaleY(1.3); }
}
.vdemo-scope .hy-vdemo-progress {
  height: 3px;
  background: rgba(255,255,255,0.12);
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.vdemo-scope .hy-vdemo-progress[data-visible="true"] { opacity: 1; }
.vdemo-scope .hy-vdemo-progress span {
  display: block;
  height: 100%;
  background: var(--vdemo-accent);
  transition: width 0.12s linear;
}
.vdemo-scope .hy-vdemo-fallback {
  margin: 0;
  border: 1px solid rgba(255,193,7,0.35);
  background: rgba(255,193,7,0.08);
  color: #ffd166;
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .vdemo-scope .hy-vdemo-avatar::after { animation: none; }
  .vdemo-scope .hy-vdemo-wave span { animation: none; }
}
`

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
    <div className="vdemo-scope">
      <style dangerouslySetInnerHTML={{ __html: VDEMO_CSS }} />
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
    </div>
  )
}
