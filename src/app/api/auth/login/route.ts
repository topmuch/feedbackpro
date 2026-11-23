// ============================================================
// API - Connexion
// POST /api/auth/login  { email, password } → { user, pro }
//
// LOGIN-2 — Vérification DUAL-ALGORITHME des mots de passe :
//  - hash préfixé $2a/$2b/$2y → bcrypt (comptes historiques seedés
//    en bcrypt, présents dans certaines bases — bcryptjs est déjà
//    installé)
//  - sinon → SHA256 (comptes créés via /api/auth/register et
//    scripts/create-admin.cjs)
// La vérification SHA256 stricte seule empêchait TOUTE connexion
// sur les bases contenant des hash bcrypt → bug « la connexion
// déconne ».
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { createSession, attachSessionCookie, serializePro } from "@/lib/session"
import { loginSchema, firstError } from "@/lib/validation"
import { limiteTaux } from "@/lib/rate-limit"

/** SHA256 — même algorithme que create-admin.cjs, prisma/seed.ts et /api/auth/register */
function hashSha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/** Vérifie le mot de passe selon l'algorithme détecté dans le hash stocké. */
function verifierMotDePasse(password: string, passwordHash: string): boolean {
  try {
    if (passwordHash.startsWith('$2')) {
      // bcrypt ($2a / $2b / $2y) — comptes historiques
      return bcrypt.compareSync(password, passwordHash)
    }
    return passwordHash === hashSha256(password)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // Anti brute-force : 8 tentatives/min/IP (fenêtre glissante en mémoire).
  const bloque = limiteTaux(req, "login", { max: 8, fenetreMs: 60_000 })
  if (bloque) return bloque
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

    if (!user || !verifierMotDePasse(password, user.passwordHash)) {
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
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          // TENANT-3 — Type de tenant pour le routage dashboard (airport |
          // airline | vip_lounge | classic). Lecture défensive pour la
          // migration (colonne nouvellement ajoutée au User).
          tenantType:
            (user as unknown as { tenantType?: string }).tenantType ?? 'classic',
        },
        pro: user.pro ? serializePro(user.pro) : null,
      },
    })
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("login error", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur lors de la connexion" }, { status: 500 })
  }
}
