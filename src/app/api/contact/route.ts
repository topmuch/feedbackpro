// ============================================================
// API publique - Contact
// ------------------------------------------------------------
// POST /api/contact — Crée un Message envoyé depuis la page
// /contact (formulaire public, sans connexion). Le message est
// ensuite visible par le superadmin dans l'onglet « Messages ».
// Aucune authentification requise (canal public).
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { firstError } from "@/lib/validation"

const contactSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(80, "Le nom est trop long (80 caractères maximum)"),
  email: z.string().trim().toLowerCase().pipe(z.email("Adresse email invalide")),
  sujet: z
    .string()
    .trim()
    .min(3, "Le sujet doit contenir au moins 3 caractères")
    .max(120, "Le sujet est trop long (120 caractères maximum)"),
  message: z
    .string()
    .trim()
    .min(10, "Le message doit contenir au moins 10 caractères")
    .max(2000, "Le message est trop long (2000 caractères maximum)"),
})

export async function POST(req: NextRequest) {
  try {
    const parse = contactSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const { nom, email, sujet, message } = parse.data

    const cree = await db.message.create({
      data: { nom, email, sujet, message },
    })

    return ok({ id: cree.id }, 201)
  } catch (e) {
    console.error("contact POST error", e)
    return fail("Erreur serveur", 500)
  }
}
