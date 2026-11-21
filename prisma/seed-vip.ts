// ============================================================
// FeedbackPro - Seed du compte Salon VIP (TENANT-3)
// ------------------------------------------------------------
// Exécution : bun prisma/seed-vip.ts
//
// Crée (ou met à jour) le compte manager du salon VIP :
//   vip@salon.fr / vip1234  —  tenantType "vip_lounge"
//
// Les données du salon s'auto-seed au premier chargement :
//   - 12 tables T-01 → T-12      : /api/vip/tables
//   - 4 douches                  : /api/vip/showers
//   - config lounge + Nathalie     : /api/vip/settings
//
// Le mot de passe n'est jamais écrasé si le compte existe déjà
// (seul tenantType est réaligné).
// ============================================================

import { PrismaClient } from "@prisma/client"
import crypto from "node:crypto"

const db = new PrismaClient()

function hash(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

async function main() {
  const user = await db.user.upsert({
    where: { email: "vip@salon.fr" },
    create: {
      email: "vip@salon.fr",
      passwordHash: hash("vip1234"),
      role: "PRO",
      tenantType: "vip_lounge",
    },
    update: {
      tenantType: "vip_lounge",
    },
  })
  console.log("✅ Salon VIP prêt :", user.email, "(tenantType:", user.tenantType + ")")
  console.log("   Connexion : vip@salon.fr / vip1234")
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
