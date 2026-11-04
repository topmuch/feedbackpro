// ============================================================
// API Superadmin - Configuration du questionnaire par secteur
// ------------------------------------------------------------
// GET  /api/admin/secteurs → liste des SecteurConfig avec questionnaireConfig
// PUT  /api/admin/secteurs { secteurId, questionnaireConfig }
//                          → met à jour le questionnaire d'un secteur
//
// Task 2 — Le questionnaire adaptatif (3 scénarios CRISE/MITIGE/SUCCES)
// est stocké dans SecteurConfig.questionnaireConfig (JSON). Le superadmin
// peut l'éditer depuis l'onglet "Configuration secteurs" du dashboard.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { getQuestionnaireConfigFromDb, macroSecteurPourTypeEtablissement, type Secteur } from "@/lib/questionnaire-config"
import { macroSecteurPourSecteur } from "@/lib/secteurs-v2"

/** Type renvoyé par GET /api/admin/secteurs (un SecteurConfig allégé + questionnaire). */
type SecteurQuestionnaire = {
  id: string
  nom: string
  emoji: string
  description: string
  macroSecteur: string | null
  questionnaire: unknown // SecteurConfig (JSON parsé) ou null si vide
  source: "bdd" | "fallback" // indique si la config vient de la BDD ou du fallback hardcoded
  questionCount: number
  scenarioCount: number
}

/** Parse le JSON questionnaireConfig et renvoie la config structurée. */
function parserQuestionnaire(
  questionnaireConfig: string,
  typeEtablissement: string
): { questionnaire: unknown | null; source: "bdd" | "fallback"; questionCount: number; scenarioCount: number } {
  if (questionnaireConfig && questionnaireConfig !== "{}") {
    try {
      const parsed = JSON.parse(questionnaireConfig) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as { scenarios?: unknown }
        if (Array.isArray(obj.scenarios)) {
          const scenarios = obj.scenarios as Array<{ questions?: unknown[] }>
          const questionCount = scenarios.reduce((s, sc) => s + (Array.isArray(sc.questions) ? sc.questions.length : 0), 0)
          return {
            questionnaire: parsed,
            source: "bdd",
            questionCount,
            scenarioCount: scenarios.length,
          }
        }
      }
    } catch {
      // JSON invalide → fallback
    }
  }
  // Fallback hardcoded
  const macro = macroSecteurPourSecteur(typeEtablissement)?.nom ?? null
  const secteur: Secteur = macroSecteurPourTypeEtablissement(typeEtablissement)
  const config = getQuestionnaireConfigFromDb({ questionnaireConfig }, secteur)
  return {
    questionnaire: config,
    source: "fallback",
    questionCount: config.scenarios.reduce((s, sc) => s + sc.questions.length, 0),
    scenarioCount: config.scenarios.length,
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const secteurs = await db.secteurConfig.findMany({
      orderBy: { nom: "asc" },
      select: {
        id: true,
        nom: true,
        emoji: true,
        description: true,
        questionnaireConfig: true,
      },
    })

    const data: SecteurQuestionnaire[] = secteurs.map((s) => {
      const parsed = parserQuestionnaire(s.questionnaireConfig, s.nom)
      const macro = macroSecteurPourSecteur(s.nom)?.nom ?? null
      return {
        id: s.id,
        nom: s.nom,
        emoji: s.emoji,
        description: s.description,
        macroSecteur: macro,
        questionnaire: parsed.questionnaire,
        source: parsed.source,
        questionCount: parsed.questionCount,
        scenarioCount: parsed.scenarioCount,
      }
    })

    return ok({ secteurs: data })
  } catch (e) {
    console.error("admin secteurs GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return fail("Payload invalide", 400)
    }
    const { secteurId, questionnaireConfig } = body as {
      secteurId?: unknown
      questionnaireConfig?: unknown
    }
    if (typeof secteurId !== "string" || !secteurId) {
      return fail("secteurId requis", 400)
    }

    // Valide que questionnaireConfig est soit une chaîne JSON valide, soit un objet
    let jsonStr: string
    if (typeof questionnaireConfig === "string") {
      jsonStr = questionnaireConfig
    } else if (questionnaireConfig && typeof questionnaireConfig === "object") {
      jsonStr = JSON.stringify(questionnaireConfig)
    } else {
      return fail("questionnaireConfig doit être un objet ou une chaîne JSON", 400)
    }

    // Vérifie que le JSON est valide (sinon on refuse l'update)
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return fail("questionnaireConfig n'est pas un JSON valide", 400)
    }

    // Cas spécial : `{}` ou `{ "scenarios": [] }` = réinitialisation (fallback hardcoded)
    // On accepte ces valeurs pour permettre au superadmin de revenir à la config par défaut.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const objVide = parsed as { scenarios?: unknown }
      if (
        Object.keys(parsed).length === 0 ||
        (Array.isArray(objVide.scenarios) && objVide.scenarios.length === 0)
      ) {
        // Réinitialisation : on stocke "{}" pour déclencher le fallback
        await db.secteurConfig.update({
          where: { id: secteurId },
          data: { questionnaireConfig: "{}" },
        })
        return ok({ secteurId, source: "fallback", message: "Configuration réinitialisée (fallback hardcoded)" })
      }
    }

    // Validation minimale de la structure : { secteur, scenarios: ScenarioConfig[] }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("questionnaireConfig doit être un objet { secteur, scenarios: [] }", 400)
    }
    const obj = parsed as { scenarios?: unknown; secteur?: unknown }
    if (!Array.isArray(obj.scenarios) || obj.scenarios.length === 0) {
      return fail("questionnaireConfig.scenarios doit être un tableau non vide", 400)
    }
    // Chaque scénario doit avoir au moins 1 question
    for (const s of obj.scenarios as Array<Record<string, unknown>>) {
      if (!s || typeof s.scenario !== "string" || !Array.isArray(s.questions) || s.questions.length === 0) {
        return fail("Chaque scénario doit avoir un champ 'scenario' (string) et 'questions' (tableau non vide)", 400)
      }
    }

    // Vérifie que le secteur existe
    const existe = await db.secteurConfig.findUnique({ where: { id: secteurId } })
    if (!existe) {
      return fail("Secteur introuvable", 404)
    }

    await db.secteurConfig.update({
      where: { id: secteurId },
      data: { questionnaireConfig: jsonStr },
    })

    return ok({ secteurId, source: "bdd", message: "Configuration enregistrée" })
  } catch (e) {
    console.error("admin secteurs PUT error", e)
    return fail("Erreur serveur", 500)
  }
}
