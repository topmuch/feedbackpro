// ============================================================
// Feature 1 — Cron : boucle de suivi post-rattrapage client
// GET /api/cron/suivi-rattrapage
// ------------------------------------------------------------
// Planifié une fois par jour (vercel.json). Pour chaque retour négatif
// (note ≤ 2★) des dernières 24h qui a un `nomClientRattrapage` ET un
// `emailClient`, on envoie un email de suivi au client :
//
//   « Le manager a-t-il pu résoudre votre problème lors de votre visite
//     chez [établissement] ? Cliquez ici pour nous le dire. »
//
// Le lien ouvre un mailto pré-rempli vers l'email du commerçant — pas de
// page publique dédiée (le client reste dans une conversation privée).
//
// Sécurité : CRON_SECRET obligatoire (Authorization: Bearer <secret>).
// Tracking des envois : on utilise la table Setting avec la clé
// `suivi_rattrapage:<retourId>` pour éviter les doublons (un même retour
// ne reçoit qu'un seul email de suivi, même si le cron tourne deux fois).
//
// → { ok, data: { cibles, envoyes, erreurs, skipped } }
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { db } from "@/lib/db"
import { sendEmail, emailSuiviRattrapage } from "@/lib/email"
import { getSetting, setSetting } from "@/lib/settings"

export async function GET(req: NextRequest) {
  try {
    // ---------- Sécurité : CRON_SECRET obligatoire ----------
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return fail("Cron non configuré (CRON_SECRET absent)", 501)
    }
    const auth = req.headers.get("authorization") ?? ""
    if (auth !== `Bearer ${secret}`) {
      return fail("Non autorisé", 401)
    }

    // ---------- Cibles : retours négatifs ≤ 2★ des dernières 24h ----------
    // avec un nom de client rattrapage ET un email client.
    const ilYA24h = new Date(Date.now() - 24 * 3600 * 1000)
    const retours = await db.retour.findMany({
      where: {
        note: { lte: 2 },
        createdAt: { gte: ilYA24h },
        nomClientRattrapage: { not: null },
        emailClient: { not: null },
      },
      include: {
        pro: { select: { nomEtablissement: true, email: true } },
        zone: { select: { nom: true } },
      },
    })

    let envoyes = 0
    let erreurs = 0
    let skipped = 0

    for (const r of retours) {
      // Vérifie que le retour a bien les données nécessaires (nom + email + pro)
      if (!r.nomClientRattrapage || !r.emailClient || !r.pro?.email) {
        skipped++
        continue
      }
      // Anti-doublon : on ne renvoie pas l'email de suivi si déjà fait
      const dejaEnvoye = await getSetting(`suivi_rattrapage:${r.id}`, "")
      if (dejaEnvoye === "1") {
        skipped++
        continue
      }

      try {
        const { sujet, html } = emailSuiviRattrapage(
          { nomEtablissement: r.pro.nomEtablissement, email: r.pro.email },
          { nom: r.nomClientRattrapage, email: r.emailClient },
          { note: r.note, zoneNom: r.zone?.nom ?? "—", dateVisite: r.createdAt }
        )
        const envoye = await sendEmail(r.emailClient, sujet, html)
        if (envoye) {
          await setSetting(`suivi_rattrapage:${r.id}`, "1")
          envoyes++
        } else {
          erreurs++
        }
      } catch (e) {
        console.warn(
          `[CRON suivi-rattrapage] Email échoué pour retour ${r.id}`,
          e
        )
        erreurs++
      }
    }

    console.log(
      `[CRON suivi-rattrapage] cibles=${retours.length} envoyes=${envoyes} erreurs=${erreurs} skipped=${skipped}`
    )

    return ok({
      cibles: retours.length,
      envoyes,
      erreurs,
      skipped,
    })
  } catch (e) {
    console.error("cron suivi-rattrapage error", e)
    return fail("Erreur serveur lors du suivi rattrapage", 500)
  }
}
