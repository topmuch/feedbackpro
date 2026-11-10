// ============================================================
// FeedbackPro - Planification des rapports IA (Session 5 §3)
// ------------------------------------------------------------
// Deux fonctions de cron, appelées par les routes /api/cron/* :
//
// - cronRapportQuotidien()   : TOUS LES JOURS à 7h du matin
//   → boucle sur tous les Pros avec plan PRO+ (PRO ou ENTERPRISE),
//     frequenceRapport = "quotidien", non suspendus, ayant reçu au
//     moins un retour sur les 24 dernières heures → rapport quotidien
//
// - cronRapportHebdomadaire() : TOUS LES LUNDIS à 7h du matin
//   → boucle sur tous les Pros avec plan PRO+ (PRO ou ENTERPRISE),
//     non suspendus, ayant reçu au moins un retour sur les 7 derniers
//     jours → rapport hebdomadaire
//
// La génération passe par genererRapportIA() (src/lib/ia.ts) :
// LLM + fallback déterministe garanti + email automatique (Resend,
// mode démo simulé sans clé). Un échec pour un Pro n'interrompt
// JAMAIS la série.
// ============================================================

import { db } from "@/lib/db"
import { genererRapportIA } from "@/lib/ia"
import { sendEmail } from "@/lib/email"
import { setSetting, getSetting } from "@/lib/settings"
import {
  emailOnboardingJour0,
  emailOnboardingJour3,
  emailOnboardingJour7,
} from "@/lib/onboarding-emails"

/** Résultat d'un rapport généré par le cron (pour la réponse API / logs) */
export type ResultatCronRapport = {
  proId: string
  nomEtablissement: string
  rapportId: string
  scoreGlobal: number
  /** "ia" = généré par le LLM · "fallback" = analyse locale déterministe */
  source: string
  /** Email du rapport envoyé (mode démo : simulé) */
  emailEnvoye: boolean
}

/** Résultat complet d'un cron de rapports */
export type ResultatCron = {
  cibles: number
  rapports: ResultatCronRapport[]
  erreurs: { proId: string; nomEtablissement: string }[]
}

/** Plans éligibles aux rapports IA automatiques : PRO et Enterprise (PRO+) */
const PLANS_PRO_PLUS = ["PRO", "ENTERPRISE"]

/**
 * CRON QUOTIDIEN (7h du matin) — génère le rapport quotidien de chaque
 * Pro plan PRO+ en fréquence quotidienne.
 */
export async function cronRapportQuotidien(): Promise<ResultatCron> {
  const ilYA24h = new Date(Date.now() - 24 * 3600 * 1000)

  // Cibles : Pros plan PRO+, fréquence quotidienne, actifs, avec retours sur 24 h
  const pros = await db.pro.findMany({
    where: {
      plan: { in: PLANS_PRO_PLUS },
      frequenceRapport: "quotidien",
      suspendu: false,
      retours: { some: { createdAt: { gte: ilYA24h } } },
    },
    orderBy: { createdAt: "asc" },
  })

  console.log(`[CRON quotidien 7h] ${pros.length} établissement(s) plan PRO+ à auditer`)

  const rapports: ResultatCronRapport[] = []
  const erreurs: { proId: string; nomEtablissement: string }[] = []

  // Génération séquentielle (politesse envers le LLM)
  for (const pro of pros) {
    try {
      const { rapport, source } = await genererRapportIA(pro.id, "quotidien", { envoyerEmail: true })
      rapports.push({
        proId: pro.id,
        nomEtablissement: pro.nomEtablissement,
        rapportId: rapport.id,
        scoreGlobal: rapport.scoreGlobal,
        source,
        emailEnvoye: rapport.envoyeParEmail,
      })
    } catch (e) {
      console.error(`[CRON quotidien] Rapport impossible pour ${pro.nomEtablissement}`, e)
      erreurs.push({ proId: pro.id, nomEtablissement: pro.nomEtablissement })
    }
  }

  console.log(`[CRON quotidien 7h] Terminé : ${rapports.length}/${pros.length} rapport(s) généré(s)`)
  return { cibles: pros.length, rapports, erreurs }
}

/**
 * CRON HEBDOMADAIRE (lundi 7h du matin) — génère le rapport hebdomadaire
 * de chaque Pro plan PRO+ (quelle que soit leur fréquence : les Pro en
 * fréquence quotidienne reçoivent en plus cet audit hebdo consolidé).
 */
export async function cronRapportHebdomadaire(): Promise<ResultatCron> {
  const ilYA7j = new Date(Date.now() - 7 * 24 * 3600 * 1000)

  // Cibles : TOUS les Pros plan PRO+ non suspendus, avec retours sur 7 jours
  const pros = await db.pro.findMany({
    where: {
      plan: { in: PLANS_PRO_PLUS },
      suspendu: false,
      retours: { some: { createdAt: { gte: ilYA7j } } },
    },
    orderBy: { createdAt: "asc" },
  })

  console.log(`[CRON hebdomadaire lundi 7h] ${pros.length} établissement(s) plan PRO+ à auditer`)

  const rapports: ResultatCronRapport[] = []
  const erreurs: { proId: string; nomEtablissement: string }[] = []

  for (const pro of pros) {
    try {
      const { rapport, source } = await genererRapportIA(pro.id, "hebdomadaire", { envoyerEmail: true })
      rapports.push({
        proId: pro.id,
        nomEtablissement: pro.nomEtablissement,
        rapportId: rapport.id,
        scoreGlobal: rapport.scoreGlobal,
        source,
        emailEnvoye: rapport.envoyeParEmail,
      })
    } catch (e) {
      console.error(`[CRON hebdomadaire] Rapport impossible pour ${pro.nomEtablissement}`, e)
      erreurs.push({ proId: pro.id, nomEtablissement: pro.nomEtablissement })
    }
  }

  console.log(`[CRON hebdomadaire lundi 7h] Terminé : ${rapports.length}/${pros.length} rapport(s) généré(s)`)
  return { cibles: pros.length, rapports, erreurs }
}

// ============================================================
// CRON ONBOARDING "First Week" (Task 1)
// ------------------------------------------------------------
// Appelé une fois par jour. Envoie les 3 emails d'onboarding aux Pros
// éligibles selon l'âge de leur compte :
//   • Jour 0 (inscription J, âge < 24h)        → emailOnboardingJour0
//   • Jour 3 (âge entre 2 et 4 jours)          → emailOnboardingJour3
//   • Jour 7 (âge entre 6 et 8 jours)          → emailOnboardingJour7
//
// Tracking des envois : on utilise la table Setting avec des clés
// `onb:<proId>:J0|J3|J7`. Cela découple le tracking des emails du
// onboardingStep (qui est lui piloté par la bannière UI du dashboard).
// ============================================================

export async function cronOnboardingEmails(): Promise<{
  jour0: number
  jour3: number
  jour7: number
  erreurs: number
}> {
  const now = Date.now()
  const unJour = 24 * 3600 * 1000

  const compteurs = { jour0: 0, jour3: 0, jour7: 0, erreurs: 0 }

  async function emailDejaEnvoye(proId: string, code: "J0" | "J3" | "J7"): Promise<boolean> {
    const v = await getSetting(`onb:${proId}:${code}`, "")
    return v === "1"
  }
  async function marquerEmailEnvoye(proId: string, code: "J0" | "J3" | "J7"): Promise<void> {
    await setSetting(`onb:${proId}:${code}`, "1")
  }

  // ----- Jour 0 : Pros inscrits depuis < 24h, email pas encore envoyé
  const prosJour0 = await db.pro.findMany({
    where: {
      suspendu: false,
      createdAt: { gte: new Date(now - unJour) },
    },
  })
  for (const pro of prosJour0) {
    try {
      if (await emailDejaEnvoye(pro.id, "J0")) continue
      const { sujet, html } = emailOnboardingJour0(pro.nomEtablissement)
      await sendEmail(pro.email, sujet, html)
      await marquerEmailEnvoye(pro.id, "J0")
      compteurs.jour0++
    } catch (e) {
      console.warn(`[CRON onboarding] Email jour 0 échoué pour ${pro.nomEtablissement}`, e)
      compteurs.erreurs++
    }
  }

  // ----- Jour 3 : Pros inscrits depuis 2 à 4 jours, email pas encore envoyé
  const prosJour3 = await db.pro.findMany({
    where: {
      suspendu: false,
      createdAt: {
        gte: new Date(now - 4 * unJour),
        lte: new Date(now - 2 * unJour),
      },
    },
  })
  for (const pro of prosJour3) {
    try {
      if (await emailDejaEnvoye(pro.id, "J3")) continue
      const { sujet, html } = emailOnboardingJour3(pro.nomEtablissement)
      await sendEmail(pro.email, sujet, html)
      await marquerEmailEnvoye(pro.id, "J3")
      compteurs.jour3++
    } catch (e) {
      console.warn(`[CRON onboarding] Email jour 3 échoué pour ${pro.nomEtablissement}`, e)
      compteurs.erreurs++
    }
  }

  // ----- Jour 7 : Pros inscrits depuis 6 à 8 jours, email pas encore envoyé
  const prosJour7 = await db.pro.findMany({
    where: {
      suspendu: false,
      createdAt: {
        gte: new Date(now - 8 * unJour),
        lte: new Date(now - 6 * unJour),
      },
    },
  })
  for (const pro of prosJour7) {
    try {
      if (await emailDejaEnvoye(pro.id, "J7")) continue
      // Tente de récupérer le dernier rapport IA disponible
      const dernierRapport = await db.rapportIA.findFirst({
        where: { proId: pro.id },
        orderBy: { createdAt: "desc" },
      })
      const rapportEmail = dernierRapport
        ? {
            type: dernierRapport.type,
            periodeDebut: dernierRapport.periodeDebut,
            periodeFin: dernierRapport.periodeFin,
            scoreGlobal: dernierRapport.scoreGlobal,
            contenuMarkdown: dernierRapport.contenuMarkdown,
            priorites: dernierRapport.priorites,
          }
        : undefined
      const { sujet, html } = emailOnboardingJour7(pro.nomEtablissement, rapportEmail)
      await sendEmail(pro.email, sujet, html)
      await marquerEmailEnvoye(pro.id, "J7")
      compteurs.jour7++
    } catch (e) {
      console.warn(`[CRON onboarding] Email jour 7 échoué pour ${pro.nomEtablissement}`, e)
      compteurs.erreurs++
    }
  }

  console.log(
    `[CRON onboarding] J0:${compteurs.jour0} J3:${compteurs.jour3} J7:${compteurs.jour7} erreurs:${compteurs.erreurs}`
  )
  return compteurs
}
