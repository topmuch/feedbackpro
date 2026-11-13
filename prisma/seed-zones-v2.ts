// ============================================================
// FeedbackPro — Seed v2 des zones aéroport (25 zones)
// ------------------------------------------------------------
// Idempotent : upsert toutes les zones définies dans
// src/lib/airport-config.ts (5 historiques + 20 nouvelles
// réparties en EXTÉRIEUR / SÛRETÉ / TERMINAL / COMMERCIAL /
// SERVICE / URGENCE).
//
// Pour chaque zone :
//   - code      (clé unique métier)
//   - nom       (libellé affiché)
//   - emoji     (visuel)
//   - description (sous-titre)
//   - tags      (JSON string[] — tags URL scannables)
//   - problemes (JSON string[] — boutons rapides)
//
// Exécution : bun run prisma/seed-zones-v2.ts
// ============================================================

import { PrismaClient } from '@prisma/client'
import { AIRPORT_ZONES } from '../src/lib/airport-config'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seed v2 des zones aéroport — 25 zones attendues...')

  let created = 0
  let updated = 0

  for (const z of AIRPORT_ZONES) {
    const data = {
      nom: z.nom,
      emoji: z.emoji,
      description: z.description ?? null,
      tags: JSON.stringify(z.tags),
      problemes: JSON.stringify(z.problemes),
    }

    const existing = await db.airportZone.findUnique({ where: { code: z.code } })

    if (existing) {
      await db.airportZone.update({
        where: { code: z.code },
        data,
      })
      updated++
      console.log(
        `  ↻ Zone mise à jour : ${z.emoji} ${z.nom} (${z.code}) — ${z.tags.length} tags, ${z.problemes.length} problématique(s)`,
      )
    } else {
      await db.airportZone.create({
        data: { code: z.code, ...data },
      })
      created++
      console.log(
        `  ✚ Zone créée : ${z.emoji} ${z.nom} (${z.code}) — ${z.tags.length} tags, ${z.problemes.length} problématique(s)`,
      )
    }
  }

  // Vérification : aucune zone "orpheline" en BDD (code absent de la config)
  const allDbZones = await db.airportZone.findMany({ select: { code: true, nom: true } })
  const configCodes = new Set(AIRPORT_ZONES.map((z) => z.code))
  const orphelins = allDbZones.filter((z) => !configCodes.has(z.code))
  if (orphelins.length > 0) {
    console.log(`\n⚠️  ${orphelins.length} zone(s) orpheline(s) en BDD (absentes de la config) :`)
    for (const o of orphelins) {
      console.log(`    - ${o.code} (${o.nom})`)
    }
  }

  const total = await db.airportZone.count()
  console.log(`\n✅ Seed v2 terminé : ${created} créée(s), ${updated} mise(s) à jour.`)
  console.log(`✅ Total zones en BDD : ${total} (config attendue : ${AIRPORT_ZONES.length}).`)
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed zones v2 :', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
