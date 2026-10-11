// ============================================================
// FeedbackPro - Point d'entrée API (health check)
// GET /api → statut de la plateforme (utile pour le monitoring)
// ============================================================

import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      nom: "FeedbackPro",
      produit: "Le Coach IA d'Audit Qualité Continu",
      statut: "operational",
      horodatage: new Date().toISOString(),
    },
  })
}
