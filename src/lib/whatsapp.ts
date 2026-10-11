// ============================================================
// FeedbackPro - Construction du message WhatsApp structuré
// Utilisé côté client (lien wa.me) après enregistrement du retour
// ============================================================

import { tagLabel } from "./constants"

export type RetourPayload = {
  note: number
  tags: string[]
  commentaire?: string | null
  personnelMentionne?: string | null
  /** Nom de la zone scannée (Accueil, Salle, Toilettes…) — affiché après 📍 */
  zoneNom?: string | null
}

export type ProInfo = {
  nomEtablissement: string
  whatsapp: string | null
  messageWhatsapp?: string | null
}

/** Formate la date à la française : 15/03/2025 à 18:42 */
export function formatDateFr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Construit le message WhatsApp structuré :
 * 🎉 RETOUR POSITIF / ⚠️ RÉCLAMATION
 * 📍 Zone (nom)
 * ⭐ Note : X/5
 * 🏷️ Tags · 👤 Personnel · 💬 Détails
 * Pied : messageWhatsapp personnalisé ou mention FeedbackPro ✨
 */
export function buildWhatsAppMessage(
  pro: ProInfo,
  retour: RetourPayload,
  employeNom?: string | null
): string {
  const estPositif = retour.note >= 4
  const lignes: string[] = []

  lignes.push(estPositif ? "🎉 RETOUR POSITIF" : "⚠️ RÉCLAMATION")
  lignes.push(`📍 Zone : ${retour.zoneNom || "Général"} — ${pro.nomEtablissement}`)
  lignes.push(`⭐ Note : ${retour.note}/5`)
  lignes.push(`📅 ${formatDateFr(new Date())}`)

  if (retour.tags.length > 0) {
    lignes.push(`🏷️ Tags : ${retour.tags.map(tagLabel).join(", ")}`)
  }

  const personnel = retour.personnelMentionne || employeNom
  if (personnel) {
    lignes.push(`👤 Personnel : ${personnel}`)
  }

  if (retour.commentaire && retour.commentaire.trim()) {
    lignes.push(`💬 Détails : ${retour.commentaire.trim()}`)
  }

  lignes.push("")
  // Signature personnalisée de l'établissement si configurée, sinon mention FeedbackPro
  lignes.push(pro.messageWhatsapp || "Envoyé via FeedbackPro ✨")

  return lignes.join("\n")
}

/**
 * Construit le lien "click to chat" WhatsApp avec message encodé.
 * On utilise directement l'endpoint officiel api.whatsapp.com/send
 * (identique à wa.me sur mobile) : cela évite la redirection wa.me
 * qui corrompt certains emojis.
 */
export function buildWaLink(pro: ProInfo, retour: RetourPayload, employeNom?: string | null): string {
  const numero = (pro.whatsapp || "").replace(/[^0-9]/g, "")
  const message = buildWhatsAppMessage(pro, retour, employeNom)
  return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`
}
