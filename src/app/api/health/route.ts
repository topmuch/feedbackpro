// ============================================================
// FeedVoice - Health check public
// GET /api/health
// ------------------------------------------------------------
// Sonde de monitoring (uptime robot, Coolify, supervision externe) :
//   { ok, service, version, uptimeSec, db: "up"|"down", timestamp }
// Toujours 200 si le process répond — la santé de la DB est un champ
// d'information, pas un statut HTTP (un robot d'uptime veut un ping
// process ; la perte DB est journalisée côté supervision).
//
// Sans authentification, sans données sensibles, no-store.
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { TAG_LIB_WIFI } from "@/lib/vip-clients"
import { db } from "@/lib/db"
import { ipClient } from "@/lib/rate-limit"
import { sondeConfigAi } from "@/lib/sonde-ai"
import pkg from "../../../../package.json"

const DEMARRAGE_MS = Date.now() // module chargé = process démarré (approx)

// Compteur globalThis (diagnostic + heartbeat monitoring) : doit croître
// entre deux appels — sinon le runtime recrée l'état module par requête.
const CLE_COMPTEUR = "__fv_health_hits__"

export async function GET(req: NextRequest) {
  const g = globalThis as { [CLE_COMPTEUR]?: number }
  g[CLE_COMPTEUR] = (g[CLE_COMPTEUR] ?? 0) + 1
  const hits = g[CLE_COMPTEUR]

  let dbEtat: "up" | "down" = "down"
  try {
    await db.$queryRaw`SELECT 1`
    dbEtat = "up"
  } catch {
    dbEtat = "down"
  }

  return NextResponse.json(
    {
      ok: true,
      service: "feedvoice",
      version: pkg.version ?? "0.0.0",
      build: "wifi-fix-1",
      libTag: TAG_LIB_WIFI,
      uptimeSec: Math.round((Date.now() - DEMARRAGE_MS) / 1000),
      hits,
      ip: ipClient(req),
      db: dbEtat,
      ai: sondeConfigAi(),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
