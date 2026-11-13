// ============================================================
// staff-alert.ts — Alerte sonore + vibration pour la PWA staff
// ------------------------------------------------------------
// Deux signaux non-vocaux pour capter l'attention du staff
// terrain quand un nouvel incident arrive :
//
//   1. jouerDing()  — son "ding dong" MP3 (fichier audio custom
//                     fourni par l'utilisateur). Fallback Web Audio
//                     si le fichier n'est pas chargeable.
//   2. vibrer()     — vibration du téléphone (Vibration API),
//                     pattern ding-ding-ding (200/100/200/100/200).
//
// Chaîne d'alerte côté staff (voir airport-staff-view.tsx) :
//   nouvel incident → vibrer() → jouerDing() → parler(...)
//   (vibration + son court capte l'attention, puis la voix
//    Denise décrit l'incident).
//
// Aucun effet si l'API n'existe pas (SSR, navigateur desktop
// sans vibration, vieux navigateur sans AudioContext) — silencieux.
// ============================================================

// Cache l'instance Audio pour éviter de recréer à chaque appel
let audioCache: HTMLAudioElement | null = null

/**
 * Joue le son "ding dong" MP3 personnalisé.
 * Utilise le fichier /sounds/ding-dong.mp3 fourni par l'utilisateur.
 * Fallback : si le MP3 ne peut pas être chargé (erreur réseau, format
 * non supporté), on génère un son de secours via Web Audio API.
 */
export function jouerDing(): void {
  if (typeof window === 'undefined') return

  // Tenter de jouer le MP3 personnalisé
  try {
    if (!audioCache) {
      audioCache = new Audio('/sounds/ding-dong.mp3')
      audioCache.volume = 0.8
      audioCache.preload = 'auto'
    }
    // Remettre au début si déjà en lecture
    audioCache.currentTime = 0
    const promise = audioCache.play()
    if (promise) {
      promise.catch(() => {
        // Autoplay bloqué ou erreur de chargement → fallback Web Audio
        jouerDingFallback()
      })
    }
  } catch {
    // Erreur quelconque → fallback Web Audio
    jouerDingFallback()
  }
}

/**
 * Fallback : génère un son "ding ding" via Web Audio API si le MP3
 * n'est pas disponible. Deux tons montants : 880 Hz puis 988 Hz.
 */
function jouerDingFallback(): void {
  if (typeof window === 'undefined') return
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  try {
    const ctx = new AudioCtx()
    const tones = [880, 988]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.12)
    })
  } catch {
    // AudioContext bloqué (autoplay) — silencieux
  }
}

/**
 * Fait vibrer le téléphone (pattern ding-ding-ding).
 * 200ms on, 100ms off, 200ms on, 100ms off, 200ms on.
 */
export function vibrer(): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  navigator.vibrate([200, 100, 200, 100, 200])
}
