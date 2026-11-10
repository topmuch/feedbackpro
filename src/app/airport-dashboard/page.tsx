"use client"

// ============================================================
// Page /airport-dashboard — Dashboard Ops Aéroport
// ------------------------------------------------------------
// Console opérationnelle pour l'équipe ops aéroport (TV/laptop
// en salle de supervision). Quatre onglets :
//   1. Wallboard    — embed iframe /ops-wallboard
//   2. Zones        — édition des 5 zones aéroport (nom, emoji,
//                     tags, problématiques)
//   3. Signalements — liste filtrable des AirportReport
//   4. Bot WhatsApp — documentation & status du bot
//
// Palette : slate-950 background + accents emerald (cohérent
// avec /ops-wallboard). Aucune trace du bleu FeedbackPro #002e85.
//
// Public (comme le wallboard) — pas d'auth pour l'instant.
// Client component pour éviter l'hydration mismatch (horloge live).
// ============================================================

import AirportDashboard from '@/components/feedbackpro/airport-dashboard'

export default function AirportDashboardPage() {
  return <AirportDashboard />
}
