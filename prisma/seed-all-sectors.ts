// ============================================================
// FeedbackPro — Seed multi-secteurs (toutes zones statiques)
// ------------------------------------------------------------
// Idempotent : upsert toutes les zones définies dans les configs
// statiques sectorielles (aéroport + hôtel + gare + hôpital + ERP)
// vers la table AirportZone (qui sert de registry générique
// multi-secteurs — son nom historique est conservé pour éviter
// une migration destructrice).
//
// Pour chaque zone :
//   - code      (clé unique métier — préfixée par secteur)
//   - nom       (libellé affiché)
//   - emoji     (visuel)
//   - description (sous-titre — null si non défini)
//   - tags      (JSON string[] — tags URL scannables)
//   - problemes (JSON string[] — boutons rapides)
//
// Le restaurant n'est PAS seedé ici : il utilise le système
// Zone + SecteurConfig (zones créées par le Pro lui-même).
//
// Exécution : bun run prisma/seed-all-sectors.ts
// ============================================================

import { PrismaClient } from '@prisma/client'
import { SECTORS, getAllStaticZones } from '../src/lib/sector-config'

const db = new PrismaClient()

async function main() {
  const allZones = getAllStaticZones()
  const totalExpected = allZones.length

  // Compte par secteur pour le log
  const countsBySector = SECTORS.map((s) => ({
    id: s.id,
    nom: s.nom,
    emoji: s.emoji,
    count: s.zones.length,
  }))

  console.log('🌱 Seed multi-secteurs — toutes les zones statiques...')
  console.log('   Catalogue attendu :')
  for (const c of countsBySector) {
    console.log(`     ${c.emoji} ${c.nom.padEnd(28)} ${String(c.count).padStart(3)} zone(s)`)
  }
  console.log(`   ─────────────────────────────────────────────`)
  console.log(`   TOTAL                                  ${String(totalExpected).padStart(3)} zone(s)\n`)

  let created = 0
  let updated = 0

  for (const sector of SECTORS) {
    if (sector.zones.length === 0) {
      console.log(`⊘ Secteur ${sector.emoji} ${sector.nom} — pas de zones statiques (skip)`)
      continue
    }
    console.log(`\n▸ Secteur ${sector.emoji} ${sector.nom} (${sector.zones.length} zones)...`)
    for (const z of sector.zones) {
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
  }

  // Vérification : aucune zone "orpheline" en BDD (code absent de la config)
  const allDbZones = await db.airportZone.findMany({ select: { code: true, nom: true } })
  const configCodes = new Set(allZones.map((z) => z.code))
  const orphelins = allDbZones.filter((z) => !configCodes.has(z.code))
  if (orphelins.length > 0) {
    console.log(`\n⚠️  ${orphelins.length} zone(s) orpheline(s) en BDD (absentes de la config) :`)
    for (const o of orphelins) {
      console.log(`    - ${o.code} (${o.nom})`)
    }
  }

  const total = await db.airportZone.count()
  console.log(`\n✅ Seed multi-secteurs terminé : ${created} créée(s), ${updated} mise(s) à jour.`)
  console.log(`✅ Total zones en BDD : ${total} (catalogue attendu : ${totalExpected}).`)
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed multi-secteurs :', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
