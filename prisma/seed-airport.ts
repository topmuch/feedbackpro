// ============================================================
// FeedbackPro — Seed des zones aéroport
// ------------------------------------------------------------
// Idempotent : insère les 5 zones définies dans src/lib/airport-config.ts
// (ou met à jour leurs tags/problèmes si elles existent déjà).
//
// Exécution : bun prisma/seed-airport.ts
// ============================================================

import { PrismaClient } from '@prisma/client'
import { AIRPORT_ZONES } from '../src/lib/airport-config'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seed des zones aéroport...')

  for (const z of AIRPORT_ZONES) {
    const existing = await db.airportZone.findUnique({ where: { code: z.code } })
    const data = {
      nom: z.nom,
      emoji: z.emoji,
      description: z.description ?? null,
      tags: JSON.stringify(z.tags),
      problemes: JSON.stringify(z.problemes),
    }
    if (existing) {
      await db.airportZone.update({ where: { code: z.code }, data })
      console.log(`  ↻ Zone mise à jour : ${z.emoji} ${z.nom} (${z.code}) — ${z.tags.length} tags, ${z.problemes.length} problématiques`)
    } else {
      await db.airportZone.create({ data: { code: z.code, ...data } })
      console.log(`  ✚ Zone créée : ${z.emoji} ${z.nom} (${z.code}) — ${z.tags.length} tags, ${z.problemes.length} problématiques`)
    }
  }

  const total = await db.airportZone.count()
  console.log(`✅ Seed aéroport terminé : ${total} zones actives.`)
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed aéroport :', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
