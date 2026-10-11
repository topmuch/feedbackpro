// ============================================================
// API Pro - Export CSV des retours (avec BOM Excel)
// GET /api/pro/retours/export
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePro, unauthorized } from "@/lib/guards"
import { tagLabel } from "@/lib/constants"

function esc(v: string | number | null | undefined): string {
  const s = String(v ?? "")
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  const ctx = await requirePro(req)
  if (!ctx) return unauthorized()

  const retours = await db.retour.findMany({
    where: { boutiqueId: ctx.boutique.id },
    orderBy: { createdAt: "desc" },
    include: { employe: { select: { nom: true } } },
  })

  const lignes = [
    "Date;Note;Tags;Employé;Personnel mentionné;Commentaire;Canal;Statut;Lu",
  ]
  for (const r of retours) {
    lignes.push(
      [
        esc(r.createdAt.toLocaleString("fr-FR")),
        esc(r.note),
        esc(JSON.parse(r.tags).map(tagLabel).join(", ")),
        esc(r.employe?.nom ?? ""),
        esc(r.personnelMentionne ?? ""),
        esc(r.commentaire ?? ""),
        esc(r.canalChoisi ?? ""),
        esc(r.statut),
        esc(r.lu ? "Oui" : "Non"),
      ].join(";")
    )
  }

  // \uFEFF = BOM UTF-8 pour que Excel affiche correctement les accents
  const csv = "\uFEFF" + lignes.join("\n")
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="retours-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
