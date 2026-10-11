// ============================================================
// API Pro - Envoi d'un rapport IA par email (Session 4, §3)
// POST /api/pro/coach/email { rapportId } → { envoye, email }
// Renvoie le rapport déjà généré à l'email du Pro (configuré dans
// Paramètres). L'envoi est effectué par lib/email.ts (Resend en
// production, simulation tracée dans les logs en sandbox).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRapport } from "@/lib/ia"
import { sendEmail, emailRapportIA } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const { pro } = ctx

    const body = (await req.json().catch(() => null)) as { rapportId?: string } | null
    const rapportId = body?.rapportId
    if (!rapportId) return fail("ID du rapport manquant", 400)

    const rapport = await db.rapportIA.findFirst({
      where: { id: rapportId, proId: pro.id },
    })
    if (!rapport) return fail("Rapport introuvable", 404)

    if (!pro.email) return fail("Aucun email de réception configuré dans vos Paramètres", 400)

    const serialise = serialiserRapport(rapport)
    const { sujet, html } = emailRapportIA(
      { nomEtablissement: pro.nomEtablissement },
      serialise
    )
    const envoye = await sendEmail(pro.email, sujet, html)

    if (envoye) {
      await db.rapportIA.update({ where: { id: rapport.id }, data: { envoyeParEmail: true } })
    }

    return ok({ envoye, email: pro.email })
  } catch (e) {
    console.error("coach/email POST error", e)
    return fail("Envoi impossible pour le moment", 500)
  }
}
