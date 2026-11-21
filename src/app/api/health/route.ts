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

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import pkg from "../../../../package.json"

const DEMARRAGE_MS = Date.now() // module chargé = process démarré (approx)

export async function GET() {
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
      uptimeSec: Math.round((Date.now() - DEMARRAGE_MS) / 1000),
      db: dbEtat,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
