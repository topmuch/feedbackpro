// ============================================================
// POST /api/setup/seed
// Route PUBLIQUE pour initialiser la DB de production.
// À appeler UNE SEULE FOIS après un déploiement avec DB vide.
// ============================================================

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  const results: string[] = []
  try {
    // Toujours upsert le superadmin — le seed du build utilise bcrypt
    // mais le login utilise hashPassword (SHA256). On force le bon hash.
    const admin = await db.user.upsert({
      where: { email: "admin@feedbackpro.fr" },
      create: { email: "admin@feedbackpro.fr", passwordHash: hashPassword("admin123"), role: "SUPERADMIN" },
      update: { passwordHash: hashPassword("admin123"), role: "SUPERADMIN" },
    })
    results.push(`✓ Superadmin: ${admin.email} / admin123 (hash corrigé)`)

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
