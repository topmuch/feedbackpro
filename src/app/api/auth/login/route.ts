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
