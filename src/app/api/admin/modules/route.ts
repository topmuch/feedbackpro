// ============================================================
// API Superadmin - Gestion des modules activables
// ------------------------------------------------------------
// GET  /api/admin/modules        → liste tous les modules (key, nom,
//                                  description, actif, config)
// PUT  /api/admin/modules        body: { key, actif?, config? }
//                                  → met à jour un module (toggle
//                                  actif et/ou édition de config)
//
// Sécurité : SUPERADMIN uniquement. Le cache mémoire des modules
// (src/lib/modules.ts) est invalidé à chaque PUT pour que les
// endpoints publics (scan, retour) réagissent immédiatement.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { invaliderCacheModules } from "@/lib/modules"

/** Module sérialisé pour la réponse API */
type ModuleDto = {
  id: string
  key: string
  nom: string
  description: string
  actif: boolean
  config: Record<string, unknown>
  updatedAt: string
}

/** Parse le champ config JSON en objet ({} si invalide). */
function parseConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()
    const modules = await db.module.findMany({ orderBy: { key: "asc" } })
    const data: ModuleDto[] = modules.map((m) => ({
      id: m.id,
      key: m.key,
      nom: m.nom,
      description: m.description,
      actif: m.actif,
      config: parseConfig(m.config),
      updatedAt: m.updatedAt.toISOString(),
    }))
    return ok({ modules: data })
  } catch (e) {
    console.error("admin modules GET error", e)
    return fail("Erreur serveur", 500)
  }
}

/** Validation du corps PUT : { key: string, actif?: boolean, config?: object } */
type PutBody = {
  key?: unknown
  actif?: unknown
  config?: unknown
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()
    const body = (await req.json().catch(() => null)) as PutBody | null
    if (!body || typeof body.key !== "string" || !body.key.trim()) {
      return fail("Champ `key` requis", 400)
    }
    const key = body.key.trim()
    const existant = await db.module.findUnique({ where: { key } })
    if (!existant) return fail("Module introuvable", 404)

    // Construit le payload de mise à jour
    const data: { actif?: boolean; config?: string } = {}
    if (typeof body.actif === "boolean") {
      data.actif = body.actif
    }
    if (
      body.config !== undefined &&
      body.config !== null &&
      typeof body.config === "object" &&
      !Array.isArray(body.config)
    ) {
      // On sérialise nous-même pour garantir un JSON stable
      data.config = JSON.stringify(body.config)
    }
    if (Object.keys(data).length === 0) {
      return fail("Aucune donnée à mettre à jour (`actif` ou `config`)", 400)
    }

    const updated = await db.module.update({ where: { key }, data })
    // Invalide le cache mémoire pour que les endpoints publics réagissent
    invaliderCacheModules()

    return ok({
      module: {
        id: updated.id,
        key: updated.key,
        nom: updated.nom,
        description: updated.description,
        actif: updated.actif,
        config: parseConfig(updated.config),
        updatedAt: updated.updatedAt.toISOString(),
      } satisfies ModuleDto,
    })
  } catch (e) {
    console.error("admin modules PUT error", e)
    return fail("Erreur serveur", 500)
  }
}
