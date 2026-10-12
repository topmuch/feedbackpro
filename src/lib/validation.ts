// ============================================================
// FeedbackPro - Schémas de validation partagés (client + serveur)
// Une seule source de vérité : zod (v4) — mêmes messages d'erreur
// affichés dans les formulaires et appliqués par les API routes.
// Pivot Session 1 : « Le Coach IA d'Audit Qualité Continu »
// ============================================================

import { z } from "zod"

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

/**
 * Numéro WhatsApp : format international sans « + » ni espaces (ex: 33612345678).
 * Les caractères non numériques sont silencieusement retirés (collage depuis un carnet d'adresses).
 */
export const whatsappField = z
  .string()
  .transform((v) => v.replace(/[^0-9]/g, ""))
  .refine((v) => v === "" || /^[0-9]{8,15}$/.test(v), "Numéro WhatsApp invalide (format international : 33612345678)")

export const typeEtablissementField = z
  .string()
  .trim()
  .min(1, "Indiquez le type d'établissement")
  .max(60, "Type d'établissement trop long")

export const frequenceRapportField = z.enum(["quotidien", "hebdomadaire"], {
  message: "Fréquence de rapport invalide (quotidien ou hebdomadaire)",
})

/** Liste d'ids de tags (tags du formulaire de scan d'une zone) */
export const tagsField = z
  .array(z.string().trim().min(1).max(32))
  .max(8, "Trop de tags sélectionnés (8 maximum)")
  .default([])

// ---------- Authentification ----------

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  nomEtablissement: z
    .string()
    .trim()
    .min(2, "Indiquez le nom de votre établissement")
    .max(80, "Nom d'établissement trop long"),
  typeEtablissement: typeEtablissementField,
  adresse: z.string().trim().min(5, "L'adresse est requise").max(200, "Adresse trop longue"),
  ville: z.string().trim().min(2, "La ville est requise").max(80, "Ville trop longue"),
  whatsapp: whatsappField.optional().default(""),
  // Logo optionnel choisi à l'inscription (wizard, data URL compressée côté client)
  logoUrl: logoField.nullable().optional(),
  // Audit : noms des zones créées à l'inscription (wizard 4 étapes).
  // Optionnel pour compat : absent ou vide → zone « Accueil » par défaut.
  zones: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Le nom d'une zone ne peut pas être vide")
        .max(60, "Nom de zone trop long (60 caractères maximum)")
    )
    .max(10, "10 zones maximum à l'inscription (vous pourrez en ajouter d'autres dans le dashboard)")
    .optional()
    .default([]),
})

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Mot de passe requis").max(72),
})

// ---------- Zones (points de contact avec QR code) ----------

export const zoneCreateSchema = z.object({
  nom: z.string().trim().min(1, "Le nom de la zone est requis").max(60, "Nom de zone trop long"),
  description: z.string().trim().max(200, "Description trop longue").optional(),
  tagsPositifs: tagsField.optional(),
  tagsNegatifs: tagsField.optional(),
})

export const zoneUpdateSchema = z.object({
  id: z.string().trim().min(1, "ID manquant"),
  nom: z.string().trim().min(1, "Le nom de la zone est requis").max(60, "Nom de zone trop long").optional(),
  description: z.string().trim().max(200, "Description trop longue").nullable().optional(),
  tagsPositifs: tagsField.optional(),
  tagsNegatifs: tagsField.optional(),
})

// ---------- Retour client (page de scan publique) ----------

export const retourSchema = z.object({
  // Token du QR code scanné (qrToken de la Zone)
  qrToken: z.string().trim().min(4, "QR code invalide").max(64, "QR code invalide"),
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
  canalChoisi: z.enum(["whatsapp", "aucun"]).nullable().optional(),
  // Audit RGPD : consentement explicite (opt-in) pour enregistrer la ville
  // approximative déduite de l'IP. Absent → false (aucune donnée géo).
  geoConsent: z.boolean().optional().default(false),
})

/** Résolution d'une zone par son QR token (POST /api/public/scan) */
export const scanSchema = z.object({
  qrToken: z.string().trim().min(4, "QR code invalide").max(64, "QR code invalide"),
})

// ---------- Employés ----------

export const employeCreateSchema = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom de l'employé").max(80, "Nom trop long"),
  poste: z.string().trim().max(80, "Poste trop long").optional(),
  zoneIds: z.array(z.string().trim().min(1)).max(50, "Trop de zones").optional().default([]),
})

export const employeUpdateSchema = z.object({
  id: z.string().trim().min(1, "ID manquant"),
  nom: z.string().trim().min(2, "Indiquez le nom de l'employé").max(80, "Nom trop long").optional(),
  poste: z.string().trim().max(80, "Poste trop long").nullable().optional(),
  zoneIds: z.array(z.string().trim().min(1)).max(50, "Trop de zones").optional(),
  actif: z.boolean().optional(),
})

// ---------- Suivi des retours (dashboard Pro) ----------

export const retourPatchSchema = z.object({
  id: z.string().trim().min(1, "ID manquant"),
  statut: z.enum(["NEW", "IN_PROGRESS", "RESOLVED"], { message: "Statut invalide" }).optional(),
  reponsePro: z.string().trim().max(2000, "Réponse trop longue").nullable().optional(),
  actionPrise: z.string().trim().max(500, "Action trop longue").nullable().optional(),
  lu: z.boolean().optional(),
})

// ---------- Paramètres de l'établissement (PUT /api/pro/settings) ----------

export const settingsSchema = z.object({
  nomEtablissement: z
    .string()
    .trim()
    .min(2, "Le nom de l'établissement est requis")
    .max(80, "Nom d'établissement trop long"),
  typeEtablissement: typeEtablissementField,
  adresse: z.string().trim().min(5, "L'adresse est requise").max(200, "Adresse trop longue"),
  ville: z.string().trim().min(2, "La ville est requise").max(80, "Ville trop longue"),
  whatsapp: whatsappField.optional().default(""),
  email: emailField,
  logoUrl: logoField.nullable().optional(),
  messageWhatsapp: z.string().trim().max(160, "Message trop long").nullable().optional(),
  frequenceRapport: frequenceRapportField,
  recompense: z.string().trim().max(120, "Récompense trop longue").nullable().optional(),
  // Récompenses structurées (Session 3)
  recompenseActive: z.boolean().optional(),
  recompenseType: z.enum(["cafe", "reduction", "autre"], { message: "Type de récompense invalide" }).optional(),
  recompenseCode: z
    .string()
    .trim()
    .max(32, "Code promo trop long")
    .transform((v) => v.toUpperCase())
    .optional(),
  smsAlertes: z.boolean().optional(),
})

// ---------- Commandes de supports physiques ----------

export const commandeSchema = z.object({
  typeSupport: z.enum(["STICKERS_50", "CHEVALET_ACRYLIQUE", "AFFICHE_A4"], {
    message: "Type de support invalide",
  }),
  adresseLivraison: z.string().trim().min(10, "Indiquez une adresse de livraison complète").max(200),
  zoneId: z.string().trim().min(1).nullable().optional(),
})

export const planSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "ENTERPRISE"], { message: "Plan invalide" }),
})

// ---------- Alertes ----------

export const alertePatchSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    all: z.boolean().optional(),
    lu: z.boolean().optional(),
  })
  .refine((v) => v.all === true || !!v.id, "ID manquant")

// ---------- Superadmin ----------

export const adminProActionSchema = z.object({
  action: z.enum(["changerPlan", "suspendre", "reactiver", "supprimer"], { message: "Action invalide" }),
  id: z.string().trim().min(1, "ID manquant"),
  plan: z.string().optional(),
})

export const adminCommandePatchSchema = z.object({
  id: z.string().trim().min(1, "id manquant"),
  statut: z.string().trim().min(1, "Statut manquant"),
  numeroSuivi: z.string().trim().max(100, "Numéro de suivi trop long").optional(),
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
