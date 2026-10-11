// ============================================================
// FeedbackPro - Helpers de session côté serveur (API routes)
// Cookie httpOnly → Session en base → User (+ Pro)
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const SESSION_COOKIE = "fp_session"
const SESSION_DAYS = 30

export type SessionUser = {
  id: string
  email: string
  role: string
  proId: string | null
  nomCommerce: string | null
  plan: string
  onboardingDone: boolean
  qrToken: string | null
}

/** Crée une session en base et pose le cookie httpOnly sur la réponse */
export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
  const session = await db.session.create({ data: { userId, expiresAt } })
  return session.id
}

/** Attache le cookie de session à une NextResponse */
export function attachSessionCookie(res: NextResponse, sessionId: string) {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // sandbox HTTP : secure=false obligatoire
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  })
  return res
}

/** Efface le cookie de session */
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  return res
}

/** Récupère l'utilisateur courant depuis le cookie de session (ou null) */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value
  if (!sid) return null

  const session = await db.session.findUnique({
    where: { id: sid },
    include: { user: { include: { pro: true } } },
  })

  if (!session || session.expiresAt < new Date()) return null

  const u = session.user
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    proId: u.pro?.id ?? null,
    nomCommerce: u.pro?.nomCommerce ?? null,
    plan: u.pro?.plan ?? "STARTER",
    onboardingDone: u.pro?.onboardingDone ?? false,
    qrToken: u.pro?.qrToken ?? null,
  }
}

/** Réponses JSON standardisées */
export function ok(data: unknown = null, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}
