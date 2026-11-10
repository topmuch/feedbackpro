// ============================================================
// FeedbackPro — Seed des contacts ops aéroport (WhatsApp bot)
// ------------------------------------------------------------
// Insère 3 contacts de démo dans AirportOpsContact.
// Idempotent : upsert par numéro (phone).
//
// Exécution : node prisma/seed-airport-ops.cjs
//   (on utilise .cjs + node plutôt que bun à cause d'un souci de
//    résolution du Prisma Client dans cet environnement.)
// ============================================================

/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const CONTACTS = [
  {
    phone: '33612345678',
    name: 'Marc - Responsable Ops',
    role: 'ops',
  },
  {
    phone: '33698765432',
    name: 'Sophie - Équipe Nettoyage',
    role: 'nettoyage',
  },
  {
    phone: '33611112222',
    name: 'Pierre - Maintenance',
    role: 'maintenance',
  },
]

async function main() {
  console.log('🌱 Seed des contacts ops aéroport...')
  for (const c of CONTACTS) {
    const created = await db.airportOpsContact.upsert({
      where: { phone: c.phone },
      update: { name: c.name, role: c.role, actif: true },
      create: { ...c, actif: true },
    })
    console.log(`  ✓ ${created.phone} — ${created.name} (${created.role})`)
  }
  const total = await db.airportOpsContact.count()
  console.log(`✅ Seed terminé : ${total} contacts ops en base.`)
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed ops aéroport :', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
