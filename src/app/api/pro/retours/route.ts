// ============================================================
// API Pro - Retours des Clients Mystères
// GET   /api/pro/retours?note=&zoneId=&statut=&tag=&employeId=&ids=a,b,c&dateDebut=&dateFin=&page=
//       → { retours: RetourDetail[], total } (RetourDetail = Retour + zone + employe)
// PATCH /api/pro/retours { id, statut?, reponsePro?, actionPrise?, lu? }
//       → { retour } — le changement de statut est journalisé dans l'historique
// POST  /api/pro/retours { action: "repondre", id, message }
//       → enregistre reponsePro + envoie l'email au client (via Resend si
//       configuré, sinon log serveur en mode démo) ; 400 si pas d'email client.
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRetour } from "@/lib/serialise"
import { retourPatchSchema, firstError } from "@/lib/validation"
import { sendEmail } from "@/lib/email"

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
    // Session 4 : filtre par employé rattaché au retour
    const employeId = sp.get("employeId") || undefined
    // Session 4 : récupération par liste d'IDs (priorités du Coach IA « Voir détails »)
    const idsBrut = sp.get("ids")
    const ids = idsBrut ? idsBrut.split(",").map((s) => s.trim()).filter(Boolean) : undefined
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
    if (employeId) filtered = filtered.filter((r) => r.employeId === employeId)
    if (ids && ids.length > 0) {
      const setIds = new Set(ids)
      filtered = filtered.filter((r) => setIds.has(r.id))
    }
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

const postSchema = z.object({
  action: z.enum(["repondre", "supprimer", "rattrapagePrisEnCharge"]),
  id: z.string().trim().min(1, "ID manquant"),
  message: z.string().trim().min(5, "Message trop court (5 caractères minimum)").max(2000, "Message trop long").optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { id, action, message } = parsed.data

    // Vérifie que le retour appartient bien à l'établissement
    const existing = await db.retour.findFirst({
      where: { id, proId: ctx.pro.id },
      include: { zone: { select: { nom: true } } },
    })
    if (!existing) return fail("Retour introuvable", 404)

    // ---------- Action : supprimer le retour ----------
    if (action === "supprimer") {
      await db.retour.delete({ where: { id } })
      return ok({ supprime: true, id })
    }

    // ---------- Action : marquer le rattrapage comme pris en charge ----------
    // Feature 1 — Appelé par le bouton "Je m'en occupe" du toast persistant
    // affiché dans le dashboard Pro. Horodate la prise en charge pour audit
    // et pour le cron de suivi (n'envoie l'email de suivi que si le manager
    // n'a pas marqué l'alerte comme traitée).
    if (action === "rattrapagePrisEnCharge") {
      await db.retour.update({
        where: { id },
        data: { rattrapagePrisEnChargeAt: new Date() },
      })
      const retour = await db.retour.findUnique({
        where: { id },
        include: { zone: { select: { nom: true } }, employe: { select: { nom: true } } },
      })
      return ok({ retour: retour ? serialiserRetour(retour) : null, prisEnCharge: true })
    }

    // ---------- Action : répondre au client ----------
    if (!message) return fail("Message manquant", 400)

    // Garde-fou : si le client n'a pas laissé d'email, on refuse l'envoi
    if (!existing.emailClient) {
      return fail("Le client n'a pas laissé d'email, impossible de lui répondre", 400)
    }

    // Enregistre la réponse du commerçant sur le retour + passage NEW → IN_PROGRESS
    const statutPasse = existing.statut === "NEW"
    const data: { reponsePro: string; statut?: string; lu: boolean; historique?: string } = {
      reponsePro: message,
      lu: true,
      ...(statutPasse ? { statut: "IN_PROGRESS" } : {}),
    }
    if (statutPasse) {
      let hist: { statut: string; at: string }[] = []
      try {
        const parse = JSON.parse(existing.historique || "[]") as unknown
        if (Array.isArray(parse)) hist = parse as { statut: string; at: string }[]
      } catch {
        hist = []
      }
      hist.push({ statut: "IN_PROGRESS", at: new Date().toISOString() })
      data.historique = JSON.stringify(hist)
    }
    await db.retour.update({ where: { id }, data })

    // Envoi de l'email au client (mode démo = log serveur, jamais bloquant)
    const sujet = `Réponse de ${ctx.pro.nomEtablissement} — FeedbackPro`
    const html = `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1917;background:#f5f5f4;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<div style="background:#2563EB;padding:24px 32px;color:#fff"><p style="margin:0;font-size:20px;font-weight:700">FeedbackPro</p></div>
<div style="padding:32px">
<h1 style="margin:0 0 12px;font-size:18px">Réponse de ${ctx.pro.nomEtablissement}</h1>
<p style="margin:0 0 16px;line-height:1.6;color:#44403c">Suite à votre retour du ${new Date(existing.createdAt).toLocaleDateString("fr-FR")} sur la zone « ${existing.zone?.nom ?? "—"} », le commerçant vous a adressé la réponse suivante :</p>
<blockquote style="margin:0 0 16px;padding:16px;background:#f5f5f4;border-left:4px solid #2563EB;border-radius:8px;font-style:italic;line-height:1.7;color:#1c1917">${message.replace(/</g, "&lt;").replace(/\n/g, "<br />")}</blockquote>
<p style="margin:16px 0 0;line-height:1.6;color:#78716c;font-size:12px">Merci d'avoir partagé votre retour. À bientôt chez ${ctx.pro.nomEtablissement}.</p>
</div></div></body></html>`

    const envoye = await sendEmail(existing.emailClient, sujet, html)

    const retour = await db.retour.findUnique({
      where: { id },
      include: { zone: { select: { nom: true } }, employe: { select: { nom: true } } },
    })

    return ok({
      retour: retour ? serialiserRetour(retour) : null,
      emailEnvoye: envoye,
    })
  } catch (e) {
    console.error("retours POST error", e)
    return fail("Erreur serveur", 500)
  }
}
