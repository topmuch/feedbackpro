// ============================================================
// API - Inscription commerçant
// POST /api/auth/register
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { createSession, attachSessionCookie } from "@/lib/session"
import { registerSchema, firstError } from "@/lib/validation"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 })
    }

    // Validation zod (schéma partagé avec le formulaire client)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstError(parsed.error) }, { status: 400 })
    }
    const { email, password, nomCommerce } = parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ ok: false, error: "Un compte existe déjà avec cet email" }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await db.user.create({
      data: { email, passwordHash, role: "PRO" },
    })

    // Création du Pro + boutique par défaut (onboarding à compléter)
    const pro = await db.pro.create({
      data: {
        userId: user.id,
        nomCommerce,
        plan: "STARTER",
        onboardingDone: false,
      },
    })
    await db.boutique.create({
      data: { proId: pro.id, nom: nomCommerce, adresse: "" },
    })

    const sessionId = await createSession(user.id)
    const res = NextResponse.json({
      ok: true,
      data: { user: { id: user.id, email: user.email, role: user.role }, needsOnboarding: true },
    })
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("register error", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur lors de l'inscription" }, { status: 500 })
  }
}
