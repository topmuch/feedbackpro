// ============================================================
// POST /api/setup/seed
// Route d'initialisation de la DB — durcie (faille critique corrigée).
//
// HISTORIQUE : la version initiale était publique et réinitialisait le
// mot de passe superadmin à « admin123 » À CHAQUE POST — n'importe qui
// pouvait donc reprendre le contrôle du compte admin d'une prod (faille
// découverte lors de la revue sécurité 2026-11-22, mot de passe rotaté).
//
// POLITIQUE ACTUELLE :
//   1. Mode bootstrap : si la DB ne contient AUCUN utilisateur (fresh
//      install), le seed est autorisé sans secret — c'est son rôle.
//   2. Sinon : exige l'en-tête `x-seed-token` égal à process.env.SEED_SECRET.
//      Si SEED_SECRET n'est pas défini, la route répond 403 (désactivée).
//   3. Le mot de passe d'un utilisateur EXISTANT n'est JAMAIS écrasé :
//      l'upsert ne touche que le rôle en cas de mise à jour.
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"
import { limiteTaux } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // 5 appels/heure/IP : une initialisation n'a pas besoin de plus.
  const bloque = limiteTaux(req, "setup-seed", { max: 5, fenetreMs: 3_600_000 })
  if (bloque) return bloque

  // Garde-fou principal : bootstrap-only, ou secret valide.
  const nbUsers = await db.user.count()
  const secretFourni = req.headers.get("x-seed-token")
  const secretAttendu = process.env.SEED_SECRET

  const modeBootstrap = nbUsers === 0
  const secretValide =
    typeof secretAttendu === "string" &&
    secretAttendu.length >= 16 &&
    typeof secretFourni === "string" &&
    secretFourni.length === secretAttendu.length &&
    crypto.timingSafeEqual(Buffer.from(secretFourni), Buffer.from(secretAttendu))

  if (!modeBootstrap && !secretValide) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Seed désactivé : la base contient déjà des utilisateurs. Réinitialisation possible uniquement avec l'en-tête x-seed-token correct.",
      },
      { status: 403 }
    )
  }

  const results: string[] = []
  try {
    // Superadmin : créé UNIQUEMENT en bootstrap (DB vide). En mode secret,
    // on garantit juste le rôle — jamais le mot de passe.
    if (modeBootstrap) {
      const admin = await db.user.upsert({
        where: { email: "admin@feedbackpro.fr" },
        create: { email: "admin@feedbackpro.fr", passwordHash: hashPassword("admin123"), role: "SUPERADMIN" },
        update: { role: "SUPERADMIN" },
      })
      results.push(`✓ Superadmin: ${admin.email} (mot de passe temporaire admin123 — À CHANGER immédiatement)`)
    } else {
      await db.user.update({
        where: { email: "admin@feedbackpro.fr" },
        data: { role: "SUPERADMIN" },
      })
      results.push("✓ Superadmin: rôle vérifié (mot de passe INTACT)")
    }

    // Modules
    const modules = [
      { key: "surveys", nom: "Sondages", description: "Questionnaires", actif: true },
      { key: "voice_ai", nom: "Coach Vocal IA", description: "Nathalie", actif: true },
      { key: "trends", nom: "Analytics", description: "Tableaux de bord", actif: true },
      { key: "nps", nom: "NPS", description: "Satisfaction", actif: true },
      { key: "abonnement_multi_sites", nom: "Multi-Sites", description: "Multi-établissements", actif: true },
      { key: "feedbackpro_plus", nom: "Plus", description: "Avancé", actif: true },
      { key: "white_label", nom: "Marque Blanche", description: "Customisation", actif: true },
    ]
    for (const m of modules) await db.module.upsert({ where: { key: m.key }, create: m, update: m })
    results.push(`✓ ${modules.length} modules`)

    // Secteurs (SecteurConfig a 'nom' @unique, pas 'secteur')
    const secteurs = [
      'restaurant', 'aeroport', 'hotel', 'pharmacie', 'boutique', 'garage',
      'coiffure', 'spa', 'vetement', 'electromenager', 'fastfood', 'boulangerie',
      'salle_sport', 'clinique', 'ecole',
    ]
    for (const nom of secteurs) {
      await db.secteurConfig.upsert({ where: { nom }, create: { nom, zonesDefaut: '[]' }, update: {} })
    }
    results.push(`✓ ${secteurs.length} secteurs`)

    // Settings
    for (const s of [
      { key: "site_name", value: "FeedVoice" },
      { key: "support_email", value: "support@feedvoice.fr" },
      { key: "default_language", value: "fr" },
    ]) await db.setting.upsert({ where: { key: s.key }, create: s, update: s })
    results.push("✓ 3 paramètres")

    const stats = {
      users: await db.user.count(), pros: await db.pro.count(),
      modules: await db.module.count(), secteurs: await db.secteurConfig.count(),
    }
    return NextResponse.json({ ok: true, message: "DB initialisée", details: results, stats })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), partial: results }, { status: 500 })
  }
}
