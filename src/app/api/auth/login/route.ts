// ============================================================
// API - Connexion
// POST /api/auth/login  { email, password } → { user, pro }
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { createSession, attachSessionCookie, serializePro } from "@/lib/session"
import { loginSchema, firstError } from "@/lib/validation"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 })
    }

    // Validation zod (schéma partagé avec le formulaire client)
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstError(parsed.error) }, { status: 400 })
    }
    const { email, password } = parsed.data

    const user = await db.user.findUnique({
      where: { email },
      include: { pro: true },
    })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ ok: false, error: "Email ou mot de passe incorrect" }, { status: 401 })
    }

    // Compte suspendu par le superadmin : on refuse la connexion
    // (le miroir Pro.suspendu couvre les comptes Pro existants avant l'ajout
    // de User.suspendu — conservé pour rétro-compatibilité).
    if (user.suspendu || user.pro?.suspendu) {
      return NextResponse.json(
        { ok: false, error: "Votre compte a été suspendu. Contactez le support." },
        { status: 403 }
      )
    }

    // Trace la dernière connexion (colonne derniereConnexion, null si jamais connecté).
    // En dev, le PrismaClient peut être en cache (schéma ancien) — on utilise
    // du SQL brut pour être robuste même avant un redémarrage du serveur.
    try {
      await db.$executeRaw`UPDATE User SET derniereConnexion = ${new Date().toISOString()} WHERE id = ${user.id}`
    } catch (e) {
      console.warn("Mise à jour derniereConnexion impossible (non bloquant)", e)
    }

    const sessionId = await createSession(user.id)
    const res = NextResponse.json({
      ok: true,
      data: {
        user: { id: user.id, email: user.email, role: user.role },
        pro: user.pro ? serializePro(user.pro) : null,
      },
    })
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("login error", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur lors de la connexion" }, { status: 500 })
  }
}
