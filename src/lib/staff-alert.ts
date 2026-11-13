// ============================================================
// staff-alert.ts — Alerte sonore + vibration pour la PWA staff
// ------------------------------------------------------------
// Deux signaux non-vocaux pour capter l'attention du staff
// terrain quand un nouvel incident arrive :
//
//   1. jouerDing()  — son "ding ding" (Web Audio API, pas de
//                     fichier audio). Deux tons montants 880 Hz
//                     puis 988 Hz, façon notification.
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

/**
 * Joue un son "ding ding" via Web Audio API (pas de fichier audio).
 * Deux tons montants : 880 Hz puis 988 Hz, chacun ~120 ms.
 */
export function jouerDing(): void {
  if (typeof window === 'undefined') return
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  try {
    const ctx = new AudioCtx()
    // Deux tons courts (ding ding) — 880Hz puis 988Hz
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
    // AudioContext bloqué (autoplay) ou indisponible — silencieux
  }
}

/**
 * Fait vibrer le téléphone (pattern ding-ding-ding).
 * 200ms on, 100ms off, 200ms on, 100ms off, 200ms on.
 */
export function vibrer(): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  // Pattern: ding-ding-ding (200ms on, 100ms off, repeat)
  navigator.vibrate([200, 100, 200, 100, 200])
}
