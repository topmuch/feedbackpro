// ============================================================
// FeedbackPro - Alertes temps réel (Session 5 §4)
// ------------------------------------------------------------
// Quand un retour avec note ≤ 2 est créé :
//   1. Sauvegarde en BDD (déjà faite par /api/retour)
//   2. Analyse rapide : est-ce un problème RÉCURRENT dans cette zone ?
//      → seuil : 3 réclamations ≤ 2★ dans la même zone sur les 48
//        dernières heures (retour courant inclus)
//   3. Si OUI : SMS d'alerte au Pro (Twilio — mode démo simulé sans
//      clés, ou email de secours si le SMS est désactivé) + alerte
//      marquée canal "SMS"
//   4. Si NON : simple notification dans le dashboard (canal
//      "DASHBOARD"), aucun SMS ni email
//
// Tout est strictement non bloquant : un échec d'envoi ne doit JAMAIS
// faire échouer l'enregistrement du retour (le client attend sa page
// de remerciement). Cette fonction ne lève jamais d'exception.
// ============================================================

import { db } from "@/lib/db"
import { sendSMS } from "@/lib/twilio"
import { sendEmail, emailAlerteRecurrente } from "@/lib/email"
import type { Pro, Zone, Retour } from "@prisma/client"

/** Nombre de réclamations ≤ 2★ (48 h, même zone) à partir duquel le problème est récurrent */
export const SEUIL_RECURRENCE = 3

/** Fenêtre glissante d'analyse de récurrence (heures) */
export const FENETRE_RECURRENCE_HEURES = 48

/**
 * Analyse un retour ≤ 2★ et déclenche la bonne alerte :
 * - récurrent (≥ SEUIL_RECURRENCE dans la zone sur la fenêtre) → SMS/email + alerte "SMS"
 * - isolé → notification dashboard uniquement
 *
 * Renvoie { recurrente, nbSignalements, canal } — utile pour la réponse
 * API et les preuves de test.
 */
export async function analyserEtAlerterRetour(
  pro: Pro,
  zone: Pick<Zone, "id" | "nom">,
  retour: Pick<Retour, "id" | "note">,
  tagsLabels: string[]
): Promise<{ recurrente: boolean; nbSignalements: number; canal: "SMS" | "DASHBOARD" }> {
  try {
    // ---------- 1. Analyse rapide de récurrence dans la zone ----------
    const debutFenetre = new Date(Date.now() - FENETRE_RECURRENCE_HEURES * 3600 * 1000)
    const nbSignalements = await db.retour.count({
      where: {
        proId: pro.id,
        zoneId: zone.id,
        note: { lte: 2 },
        createdAt: { gte: debutFenetre },
      },
    })
    const recurrente = nbSignalements >= SEUIL_RECURRENCE

    const motifTxt = tagsLabels.length ? tagsLabels.join(", ") : "non précisé"
    const dashboardUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.fr").replace(/\/$/, "")}/dashboard`

    if (recurrente) {
      // ---------- 2a. Problème RÉCURRENT → SMS d'alerte (Twilio) ----------
      const titre = `🚨 Problème récurrent — ${zone.nom} (${nbSignalements} alertes en 48 h)`
      const message =
        `${nbSignalements} réclamations ≤ 2★ sur la zone « ${zone.nom} » en ${FENETRE_RECURRENCE_HEURES} h ` +
        `(dernier motif : ${motifTxt}, note ${retour.note}/5). C'est un problème récurrent — SMS envoyé au gérant. Intervenez vite !`

      await db.alerte.create({
        data: { proId: pro.id, retourId: retour.id, titre, message, canal: "SMS", lu: false },
      })

      if (pro.smsAlertes && pro.whatsapp) {
        const sms = `🚨 FeedbackPro - PROBLÈME RÉCURRENT : ${nbSignalements} alertes ≤2★ zone ${zone.nom} en 48h (motif : ${motifTxt}). Intervenez : ${dashboardUrl}`
        await sendSMS(pro.whatsapp, sms).catch((e) => console.warn("SMS de récurrence non envoyé (non bloquant)", e))
      } else if (pro.email) {
        // Secours : SMS désactivé ou numéro manquant → email
        await sendEmail(
          pro.email,
          `🚨 Problème récurrent — ${zone.nom} (${pro.nomEtablissement})`,
          emailAlerteRecurrente(pro.nomEtablissement, zone.nom, nbSignalements, motifTxt, dashboardUrl)
        ).catch((e) => console.warn("Email de récurrence non envoyé (non bloquant)", e))
      }

      console.log(
        `[Alerte] Problème RÉCURRENT détecté : ${pro.nomEtablissement} / ${zone.nom} — ${nbSignalements} signalements ≤ 2★ en 48 h → alerte SMS`
      )
      return { recurrente: true, nbSignalements, canal: "SMS" }
    }

    // ---------- 2b. Problème ISOLÉ → notification dashboard uniquement ----------
    await db.alerte.create({
      data: {
        proId: pro.id,
        retourId: retour.id,
        titre: `🚨 Réclamation ${retour.note}/5 — ${zone.nom}`,
        message: `Un Client Mystère vient de laisser un retour ${retour.note}/5 sur la zone « ${zone.nom} ». Motif : ${motifTxt}. Notification dashboard uniquement (récurrence non atteinte : ${nbSignalements}/${SEUIL_RECURRENCE} en 48 h).`,
        canal: "DASHBOARD",
        lu: false,
      },
    })
    console.log(
      `[Alerte] Réclamation isolée : ${pro.nomEtablissement} / ${zone.nom} — ${nbSignalements}/${SEUIL_RECURRENCE} en 48 h → notification dashboard`
    )
    return { recurrente: false, nbSignalements, canal: "DASHBOARD" }
  } catch (e) {
    // Aucun échec d'alerte ne doit remonter au parcours client
    console.warn("analyserEtAlerterRetour : échec non bloquant", e)
    return { recurrente: false, nbSignalements: 0, canal: "DASHBOARD" }
  }
}
