// ============================================================
// level-up-sound.ts — Son "level up" pour la gamification staff
// ------------------------------------------------------------
// Génère un arpège ascendant plaisant (type "level up" de jeu vidéo)
// via la Web Audio API. Aucun fichier audio requis.
//
// Utilisation :
//   import { playLevelUpSound } from '@/lib/level-up-sound'
//   playLevelUpSound()   // fire-and-forget, ne bloque pas l'UI
//
// Notes :
//   - AudioContext partagé (lazy init, réutilisé entre appels).
//   - Si l'API n'est pas dispo (SSR, vieux navigateur) → silencieux.
//   - L'AudioContext peut être en état "suspended" (politique
//     autoplay) ; on tente un resume() explicite avant de jouer.
// ============================================================

/**
 * Fréquences des 4 notes de l'arpège ascendant :
 * C5 (523.25 Hz), E5 (659.25 Hz), G5 (783.99 Hz), C6 (1046.50 Hz).
 * Un arpège majeur qui sonne triomphant.
 */
const NOTES = [523.25, 659.25, 783.99, 1046.5]

/** Durée d'une note (ms) — enveloppe attack/decay. */
const NOTE_DURATION_MS = 200

/** Décalage entre chaque note (ms) — stagger. */
const NOTE_STAGGER_MS = 100

/** Gain maximal (amplitude) — 0.15 = volume modéré, ni trop fort ni trop faible. */
const PEAK_GAIN = 0.15

// Cache l'instance AudioContext pour la réutiliser entre appels.
// Initialisé paresseusement au premier appel côté client.
let sharedCtx: AudioContext | null = null

/**
 * Récupère (ou crée) un AudioContext partagé côté client.
 * Retourne null si l'API n'est pas disponible (SSR, navigateur legacy).
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedCtx) sharedCtx = new Ctor()
  return sharedCtx
}

/**
 * Joue une note unique (sine wave + enveloppe ADSR simplifiée).
 * - attack instantané au gain peak
 * - decay exponentiel vers 0.001 sur NOTE_DURATION_MS
 */
function playNote(ctx: AudioContext, freq: number, startAt: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startAt)

  // Enveloppe : peak au départ, exponential decay sur 200ms.
  gain.gain.setValueAtTime(PEAK_GAIN, startAt)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + NOTE_DURATION_MS / 1000)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(startAt)
  osc.stop(startAt + NOTE_DURATION_MS / 1000 + 0.02) // petit extra pour éviter le clic
}

/**
 * Joue un son "level up" (arpège ascendant) via Web Audio API.
 * Aucun fichier audio requis. Silencieux si l'API n'est pas dispo.
 *
 * - 4 notes : C5, E5, G5, C6 (arpège majeur ascendant)
 * - chaque note : sine wave, gain 0.15, decay exponentiel 200ms
 * - stagger de 100ms entre chaque note
 * - durée totale : ~500ms (dernière note démarre à t=300ms, finit à t=500ms)
 *
 * Fire-and-forget : ne lance aucune promesse, ne bloque pas l'UI.
 */
export function playLevelUpSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return

  // Politique autoplay : si le contexte est "suspended" (Première
  // interaction utilisateur non encore enregistrée), on tente un
  // resume(). Si ça échoue, on reste silencieux — pas d'exception.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      /* Autoplay bloqué — silencieux */
    })
  }

  const t0 = ctx.currentTime
  NOTES.forEach((freq, i) => {
    playNote(ctx, freq, t0 + (i * NOTE_STAGGER_MS) / 1000)
  })
}
