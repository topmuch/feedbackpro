import crypto from "crypto"
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
function hashPassword(p: string) { return crypto.createHash("sha256").update(p).digest("hex") }
async function main() {
  const user = await db.user.upsert({
    where: { email: "vip@salon.fr" },
    create: { email: "vip@salon.fr", passwordHash: hashPassword("demo1234"), role: "PRO", tenantType: "vip_lounge" },
    update: { passwordHash: hashPassword("demo1234"), role: "PRO", tenantType: "vip_lounge" },
  })
  await db.pro.upsert({
    where: { userId: user.id },
    create: { userId: user.id, nomEtablissement: "Terra Solution — Salon VIP DIASS", typeEtablissement: "Salon VIP", plan: "PRO", onboardingDone: true },
    update: { nomEtablissement: "Terra Solution — Salon VIP DIASS", typeEtablissement: "Salon VIP" },
  })
  console.log("✓ VIP demo user vip@salon.fr / demo1234 (tenantType vip_lounge)")
}
main().finally(() => db.$disconnect())
