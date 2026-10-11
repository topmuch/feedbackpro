// ============================================================
// FeedbackPro - Schémas de validation partagés (client + serveur)
// Une seule source de vérité : zod (v4) — mêmes messages d'erreur
// affichés dans les formulaires et appliqués par les API routes
// ============================================================

import { z } from "zod"
import { CATEGORIES_COMMERCE } from "@/lib/constants"

// ---------- Logo (data URL redimensionnée côté client, ou URL https) ----------

export const LOGO_MAX_LENGTH = 400_000 // ~300 Ko une fois encodé en base64

export const logoField = z
  .string()
  .max(LOGO_MAX_LENGTH, "Logo trop volumineux (300 Ko maximum)")
  .refine(
    (v) =>
      v === "" ||
      /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ||
      /^https:\/\/\S+$/.test(v),
    "Format de logo non supporté (PNG, JPEG ou WebP)"
  )

// ---------- Champs isolés ----------

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Adresse email invalide"))

export const passwordField = z
  .string()
  .min(6, "Le mot de passe doit contenir au moins 6 caractères")
  .max(72, "Le mot de passe est trop long")

// ---------- Authentification ----------

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  nomCommerce: z.string().trim().min(2, "Indiquez le nom de votre commerce").max(80, "Nom du commerce trop long"),
})

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Mot de passe requis").max(72),
})

// ---------- Onboarding (étapes 1 et 2 + finalisation) ----------

export const onboardingSchema = z.object({
  nomCommerce: z.string().trim().min(2, "Le nom du commerce est requis").max(80, "Nom du commerce trop long"),
  categorie: z.string().refine((c) => CATEGORIES_COMMERCE.includes(c), "Catégorie invalide"),
  adresse: z.string().trim().min(5, "L'adresse est requise").max(200, "Adresse trop longue"),
  ville: z.string().trim().min(2, "La ville est requise").max(80, "Ville trop longue"),
  // WhatsApp : facultatif aux étapes intermédiaires (undefined = ne pas modifier),
  // obligatoire à la finalisation (vérifié séparément avec onboardingDone)
  whatsapp: z
    .string()
    .transform((v) => v.replace(/[^0-9]/g, ""))
    .refine(
      (v) => v === "" || /^\d{8,15}$/.test(v),
      "Numéro WhatsApp invalide (format international : 33612345678)"
    )
    .optional(),
  // undefined = conserver la valeur existante ; "" / null = effacer
  googleUrl: z.union([z.url("Lien Google invalide"), z.literal(""), z.null()]).optional(),
  logoUrl: logoField.nullable().optional(),
  onboardingDone: z.boolean().optional(),
})

// ---------- Retour client (page de scan publique, POST /api/retour) ----------

export const retourSchema = z.object({
  // Token du QR code scanné (qrToken du Pro)
  token: z.string().trim().min(4, "QR code invalide").max(64, "QR code invalide"),
  note: z
    .number("Note invalide")
    .int("Note invalide")
    .min(1, "Note invalide (1 à 5 attendus)")
    .max(5, "Note invalide (1 à 5 attendus)"),
  tags: z.array(z.string().max(32)).max(8, "Trop de tags sélectionnés").default([]),
  commentaire: z
    .string()
    .trim()
    .max(2000, "Commentaire trop long (2000 caractères maximum)")
    .nullable()
    .optional(),
  personnelMentionne: z
    .string()
    .trim()
    .max(120, "Nom du personnel trop long")
    .nullable()
    .optional(),
  employeId: z.string().trim().max(64).nullable().optional(),
  canalChoisi: z.enum(["whatsapp", "google", "aucun"]).nullable().optional(),
})

// ---------- Helpers d'exploitation des erreurs ----------

/** Premier message d'erreur (pour les réponses API) */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Données invalides"
}

/** Map champ → message (pour l'affichage sous chaque input) */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_")
    if (!out[key]) out[key] = issue.message
  }
  return out
}
