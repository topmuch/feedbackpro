// ============================================================
// staff-tts.ts — Voix Denise pour la PWA staff aéroport
// ------------------------------------------------------------
// Synthèse vocale navigateur (Web Speech API) configurée pour
// imiter "Denise" : voix française, débit rapide (assertif),
// ton grave. Réutilise la même API que le wallboard ops
// (src/app/ops-wallboard/page.tsx → speak()) mais avec un profil
// vocal plus commandant pour le staff terrain.
//
// Utilisation :
//   import { parler } from '@/lib/staff-tts'
//   parler("Nouvel incident signalé. Zone toilettes T1.")
//
// Notes :
//   - speechSynthesis.cancel() coupe l'annonce précédente pour
//     éviter la cacophonie si plusieurs incidents arrivent d'un coup.
//   - getVoices() peut renvoyer [] au premier appel (les voix ne
//     sont pas encore chargées) — on tombe alors sur la voix par
//     défaut avec lang='fr-FR', ce qui reste acceptable.
//   - Aucun effet si window.speechSynthesis n'existe pas (SSR,
//     vieux navigateur) — silencieux.
// ============================================================

/**
 * Annonce vocale en français (voix "Denise" : grave + rapide).
 * Coupe toute annonce en cours avant de parler.
 *
 * @param texte - Phrase à annoncer (français).
 */
export function parler(texte: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(texte)
  utter.lang = 'fr-FR'
  utter.rate = 1.1 // débit rapide (assertif)
  utter.pitch = 0.9 // ton grave (Denise)
  utter.volume = 1
  // Chercher une voix française
  const voix = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('fr'))
  if (voix) utter.voice = voix
  window.speechSynthesis.cancel() // coupe l'annonce précédente
  window.speechSynthesis.speak(utter)
}
