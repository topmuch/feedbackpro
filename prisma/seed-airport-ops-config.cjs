// ============================================================
// FeedbackPro — Seed des configs ops aéroport
// ------------------------------------------------------------
// Insère les seuils d'alerte, SLA et shifts par défaut pour les
// 5 zones aéroport. Idempotent (upsert).
//
// Exécution : node prisma/seed-airport-ops-config.cjs
// ============================================================

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const ZONES = ['bagages', 'sanitaires', 'files_attente', 'embarquement', 'restauration']

// Seuils d'alerte par défaut (par zone + globaux)
const THRESHOLDS = [
  // Pics de signalements (détection automatique)
  { zoneCode: 'ALL', type: 'SPIKE_15MIN', threshold: 3 },   // 3+ signalements en 15min = pic
  { zoneCode: 'ALL', type: 'SPIKE_30MIN', threshold: 5 },   // 5+ en 30min
  { zoneCode: 'ALL', type: 'SPIKE_1H', threshold: 8 },      // 8+ en 1h
  // Cumul d'attente
  { zoneCode: 'ALL', type: 'PENDING_COUNT', threshold: 10 }, // 10+ EN_ATTENTE cumulés
  // Absence de résolution
  { zoneCode: 'ALL', type: 'NO_RESOLUTION_HOURS', threshold: 2 }, // 2h sans résolution
]

// SLA par zone (en minutes) — basé sur les standards aéroport
const SLAS = [
  { zoneCode: 'sanitaires', targetMinutes: 15 },     // Toilettes : intervention rapide
  { zoneCode: 'files_attente', targetMinutes: 10 },  // Sécurité/PAF : critique
  { zoneCode: 'bagages', targetMinutes: 20 },        // Tapis : logistique
  { zoneCode: 'embarquement', targetMinutes: 30 },   // Portes : moins urgent
  { zoneCode: 'restauration', targetMinutes: 30 },   // Food court : moins urgent
]

// Shifts ops par défaut (24/7)
const SHIFTS = [
  {
    name: 'Matin',
    startTime: '06:00',
    endTime: '14:00',
    daysOfWeek: '[0,1,2,3,4,5,6]',
    opsPhones: '["33612345678"]', // Marc (responsable ops)
  },
  {
    name: 'Après-midi',
    startTime: '14:00',
    endTime: '22:00',
    daysOfWeek: '[0,1,2,3,4,5,6]',
    opsPhones: '["33698765432","33611112222"]', // Sophie (nettoyage) + Pierre (maintenance)
  },
  {
    name: 'Nuit',
    startTime: '22:00',
    endTime: '06:00',
    daysOfWeek: '[0,1,2,3,4,5,6]',
    opsPhones: '["33612345678"]', // Marc (astreinte)
  },
]

async function main() {
  console.log('🌱 Seed configs ops aéroport...')

  // Seuils d'alerte (idempotent : delete + recreate)
  await db.airportAlertThreshold.deleteMany({})
  for (const t of THRESHOLDS) {
    await db.airportAlertThreshold.create({ data: t })
  }
  console.log(`  ✚ ${THRESHOLDS.length} seuils d'alerte créés`)

  // SLA (upsert par zoneCode unique)
  for (const s of SLAS) {
    await db.airportSla.upsert({
      where: { zoneCode: s.zoneCode },
      create: s,
      update: { targetMinutes: s.targetMinutes },
    })
  }
  console.log(`  ✚ ${SLAS.length} SLA configurés`)

  // Shifts (idempotent : delete + recreate)
  await db.airportShift.deleteMany({})
  for (const s of SHIFTS) {
    await db.airportShift.create({ data: s })
  }
  console.log(`  ✚ ${SHIFTS.length} shifts ops créés`)

  console.log('✅ Seed configs ops terminé.')
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
