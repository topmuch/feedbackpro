// ============================================================
// FeedVoice - Réception des erreurs client
// POST /api/log-error
// ------------------------------------------------------------
// Le reporter client (window.onerror / unhandledrejection branché au
// boot de page.tsx) y pousse les exceptions navigateur : ring buffer
// mémoire consultable par le superadmin (/api/admin/error-log).
// Public (un visiteur peut rencontrer l'erreur), rate-limité, payload
// borné — aucun contenu sensible attendu (message/stack/page seulement).
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { ok } from "@/lib/session"
import { journalErreur } from "@/lib/error-log"
import { limiteTaux, ipClient } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  // 30 msg/min/IP : largement au-dessus d'un usage réel, bloque les boucles.
  const bloque = limiteTaux(req, "log-error", { max: 30, fenetreMs: 60_000 })
  if (bloque) return bloque

  try {
    const corps = (await req.json()) as {
      message?: unknown
      stack?: unknown
      source?: unknown
      page?: unknown
    }

    const message =
      typeof corps.message === "string" ? corps.message.slice(0, 500) : "Erreur client inconnue"
    const stack = typeof corps.stack === "string" ? corps.stack.slice(0, 2000) : undefined
    const source = typeof corps.source === "string" ? corps.source.slice(0, 60) : "client"
    const page = typeof corps.page === "string" ? corps.page.slice(0, 300) : undefined

    journalErreur({ source, message, stack, page, ua: req.headers.get("user-agent") ?? undefined })
    void ipClient // (l'IP est implicitement dans la clé du rate limit ; pas stockée)

    return ok({ recu: true })
  } catch {
    return NextResponse.json({ ok: false, error: "Payload invalide" }, { status: 400 })
  }
}
