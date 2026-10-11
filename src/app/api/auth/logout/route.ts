// ============================================================
// API - Déconnexion
// POST /api/auth/logout
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { SESSION_COOKIE, clearSessionCookie } from "@/lib/session"

export async function POST(req: NextRequest) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value
  if (sid) {
    await db.session.deleteMany({ where: { id: sid } })
  }
  const res = NextResponse.json({ ok: true })
  return clearSessionCookie(res)
}
