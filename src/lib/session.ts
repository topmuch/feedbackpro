// ============================================================
// FeedbackPro - Helpers de session côté serveur (API routes)
// Cookie httpOnly → Session en base → User (+ Pro)
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Pro } from "@prisma/client"

export const SESSION_COOKIE = "fp_session"
const SESSION_DAYS = 30

/** Utilisateur résolu depuis le cookie de session (champs pivot Session 1) */
export type SessionUser = {
  id: string
  email: string
  role: string
  proId: string | null
  nomEtablissement: string | null
  plan: string
  onboardingDone: boolean
}

/** Données Pro sérialisées renvoyées au frontend (même forme que ProData du store) */
export type ProData = {
  id: string
  nomEtablissement: string
  typeEtablissement: string
  adresse: string
  ville: string
  whatsapp: string | null
  email: string
  logoUrl: string | null
  plan: string
  frequenceRapport: string
  recompense: string | null
  /** Récompenses structurées (Session 3) : toggle, type et code promo */
  recompenseActive: boolean
  recompenseType: string
  recompenseCode: string
  messageWhatsapp: string | null
  onboardingDone: boolean
  suspendu: boolean
  smsAlertes: boolean
  createdAt: string
}

/**
 * Sérialise un Pro pour les réponses API (forme stable, champs pivot uniquement).
 * Centralisé ici pour garantir l'identité du contrat entre /auth/*, /pro/settings, /pro/plan…
 */
export function serializePro(pro: Pro): ProData {
  return {
    id: pro.id,
    nomEtablissement: pro.nomEtablissement,
    typeEtablissement: pro.typeEtablissement,
    adresse: pro.adresse,
    ville: pro.ville,
    whatsapp: pro.whatsapp,
    email: pro.email,
    logoUrl: pro.logoUrl,
    plan: pro.plan,
    frequenceRapport: pro.frequenceRapport,
    recompense: pro.recompense,
    // Récompenses structurées (Session 3)
    recompenseActive: pro.recompenseActive,
    recompenseType: pro.recompenseType,
    recompenseCode: pro.recompenseCode,
    messageWhatsapp: pro.messageWhatsapp,
    onboardingDone: pro.onboardingDone,
    suspendu: pro.suspendu,
    smsAlertes: pro.smsAlertes,
    createdAt: pro.createdAt.toISOString(),
  }
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
    nomEtablissement: u.pro?.nomEtablissement ?? null,
    plan: u.pro?.plan ?? "STARTER",
    onboardingDone: u.pro?.onboardingDone ?? false,
  }
}

/** Réponses JSON standardisées : { ok: true, data } | { ok: false, error } */
export function ok(data: unknown = null, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}
