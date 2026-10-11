// ============================================================
// API Pro - Retours des Clients Mystères
// GET   /api/pro/retours?note=&zoneId=&statut=&tag=&dateDebut=&dateFin=&page=
//       → { retours: RetourDetail[], total } (RetourDetail = Retour + zone + employe)
// PATCH /api/pro/retours { id, statut?, reponsePro?, actionPrise?, lu? }
//       → { retour } — le changement de statut est journalisé dans l'historique
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRetour } from "@/lib/serialise"
import { retourPatchSchema, firstError } from "@/lib/validation"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const sp = req.nextUrl.searchParams
    const note = sp.get("note") ? Number(sp.get("note")) : undefined
    const zoneId = sp.get("zoneId") || undefined
    const statut = sp.get("statut") || undefined
    const tag = sp.get("tag") || undefined
    const q = sp.get("q")?.trim().toLowerCase() || ""
    const lu = sp.get("lu")
    const dateDebut = sp.get("dateDebut") ? new Date(sp.get("dateDebut") + "T00:00:00") : undefined
    const dateFin = sp.get("dateFin") ? new Date(sp.get("dateFin") + "T23:59:59") : undefined
    const page = Math.max(1, Number(sp.get("page") || 1))

    // Volume modéré : filtres en mémoire (recherche simple et robuste)
    const all = await db.retour.findMany({
      where: { proId: ctx.pro.id },
      orderBy: { createdAt: "desc" },
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
    })

    let filtered = all
    if (note) filtered = filtered.filter((r) => r.note === note)
    if (zoneId) filtered = filtered.filter((r) => r.zoneId === zoneId)
    if (statut) filtered = filtered.filter((r) => r.statut === statut)
    if (tag) filtered = filtered.filter((r) => serialiserRetour(r).tags.includes(tag))
    if (dateDebut) filtered = filtered.filter((r) => r.createdAt >= dateDebut)
    if (dateFin) filtered = filtered.filter((r) => r.createdAt <= dateFin)
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
    const retours = filtered
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map(serialiserRetour)

    return ok({ retours, total, page, pageSize: PAGE_SIZE })
  } catch (e) {
    console.error("retours GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = retourPatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { id, ...champs } = parsed.data

    // Vérifie que le retour appartient bien à l'établissement
    const existing = await db.retour.findFirst({
      where: { id, proId: ctx.pro.id },
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
    })
    if (!existing) return fail("Retour introuvable", 404)

    const data: {
      statut?: string
      lu?: boolean
      reponsePro?: string | null
      actionPrise?: string | null
      historique?: string
    } = {}
    if (champs.statut) data.statut = champs.statut
    if (typeof champs.lu === "boolean") data.lu = champs.lu
    if (champs.reponsePro !== undefined) data.reponsePro = champs.reponsePro
    if (champs.actionPrise !== undefined) data.actionPrise = champs.actionPrise

    // Journalise le changement de statut dans l'historique (STRING JSON)
    if (data.statut && data.statut !== existing.statut) {
      let hist: { statut: string; at: string }[] = []
      try {
        const parse = JSON.parse(existing.historique || "[]") as unknown
        if (Array.isArray(parse)) hist = parse as { statut: string; at: string }[]
      } catch {
        hist = []
      }
      hist.push({ statut: data.statut, at: new Date().toISOString() })
      data.historique = JSON.stringify(hist)
    }

    await db.retour.update({ where: { id }, data })

    // Renvoie le retour complet actualisé (forme RetourDetail)
    const retour = await db.retour.findUnique({
      where: { id },
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
    })
    return ok({ retour: retour ? serialiserRetour(retour) : null })
  } catch (e) {
    console.error("retours PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
