// ============================================================
// API Pro - Liste des retours (filtres + pagination) & mise à jour
// GET  /api/pro/retours?note=&statut=&employeId=&tag=&q=&from=&to=&lu=&page=
// PATCH /api/pro/retours { id, statut?, lu?, reponsePro? }
// Le changement de statut est journalisé dans Retour.historique (JSON)
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const { boutique } = ctx

    const sp = req.nextUrl.searchParams
    const note = sp.get("note") ? Number(sp.get("note")) : undefined
    const statut = sp.get("statut") || undefined
    const employeId = sp.get("employeId") || undefined
    const tag = sp.get("tag") || undefined
    const q = sp.get("q")?.trim().toLowerCase() || ""
    const from = sp.get("from") ? new Date(sp.get("from") + "T00:00:00") : undefined
    const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59") : undefined
    const lu = sp.get("lu")
    const page = Math.max(1, Number(sp.get("page") || 1))

    // Filtres en mémoire (volume modéré, logique de recherche simple et robuste)
    const all = await db.retour.findMany({
      where: { boutiqueId: boutique.id },
      orderBy: { createdAt: "desc" },
      include: { employe: { select: { nom: true } } },
    })

    let filtered = all
    if (note) filtered = filtered.filter((r) => r.note === note)
    if (statut) filtered = filtered.filter((r) => r.statut === statut)
    if (employeId) filtered = filtered.filter((r) => r.employeId === employeId)
    if (tag) filtered = filtered.filter((r) => (JSON.parse(r.tags) as string[]).includes(tag))
    if (from) filtered = filtered.filter((r) => r.createdAt >= from)
    if (to) filtered = filtered.filter((r) => r.createdAt <= to)
    if (lu === "false") filtered = filtered.filter((r) => !r.lu)
    if (q) {
      filtered = filtered.filter(
        (r) =>
          (r.commentaire || "").toLowerCase().includes(q) ||
          (r.personnelMentionne || "").toLowerCase().includes(q) ||
          r.tags.toLowerCase().includes(q) ||
          (r.employe?.nom || "").toLowerCase().includes(q)
      )
    }

    const total = filtered.length
    const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => ({
      id: r.id,
      note: r.note,
      tags: JSON.parse(r.tags) as string[],
      commentaire: r.commentaire,
      personnelMentionne: r.personnelMentionne,
      employeNom: r.employe?.nom ?? null,
      canalChoisi: r.canalChoisi,
      statut: r.statut,
      lu: r.lu,
      reponsePro: r.reponsePro,
      ipCity: r.ipCity,
      historique: JSON.parse(r.historique || "[]") as { statut: string; at: string }[],
      createdAt: r.createdAt,
    }))

    // Liste des employés pour les filtres
    const employes = await db.employe.findMany({
      where: { boutiqueId: boutique.id, actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    })

    return ok({ items, total, page, pageSize: PAGE_SIZE, employes })
  } catch (e) {
    console.error("retours GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return fail("ID manquant", 400)

    // Vérifie que le retour appartient bien au commerçant
    const existing = await db.retour.findFirst({ where: { id, boutiqueId: ctx.boutique.id } })
    if (!existing) return fail("Retour introuvable", 404)

    const data: { statut?: string; lu?: boolean; reponsePro?: string; historique?: string } = {}
    if (body.statut && ["NEW", "IN_PROGRESS", "RESOLVED"].includes(body.statut)) data.statut = body.statut
    if (typeof body.lu === "boolean") data.lu = body.lu
    if (typeof body.reponsePro === "string") data.reponsePro = body.reponsePro.slice(0, 2000)

    // Journalise le changement de statut dans l'historique (JSON)
    if (data.statut && data.statut !== existing.statut) {
      const hist = JSON.parse(existing.historique || "[]") as { statut: string; at: string }[]
      hist.push({ statut: data.statut, at: new Date().toISOString() })
      data.historique = JSON.stringify(hist)
    }

    const updated = await db.retour.update({ where: { id }, data })
    return ok({
      id: updated.id,
      statut: updated.statut,
      lu: updated.lu,
      reponsePro: updated.reponsePro,
      historique: JSON.parse(updated.historique || "[]"),
    })
  } catch (e) {
    console.error("retours PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
