// ============================================================
// FeedbackPro - Génération de PDF côté client (jsPDF)
// - Affiche A4 "VOTRE AVIS COMPTE" avec QR (par ZONE)
// - Planche d'étiquettes 5x5 cm (20 étiquettes)
// - Bon d'impression d'une commande (Superadmin, avec n° de suivi)
// - Rapport de satisfaction (onglet Statistiques)
// ============================================================

import { jsPDF } from "jspdf"
import { STATUT_COMMANDE_LABEL, SUPPORTS, TypeSupportId } from "./constants"

const MM = "mm"

/**
 * Sous-titre de l'affiche A4 adapté au CONTEXTE de la zone (spec Session 3).
 * Ex. « Toilettes RDC » → « L'entretien de cet espace est-il à la hauteur ? »
 * Détection par mots-clés sur le nom de la zone, repli = sous-titre générique.
 */
export function sousTitreZone(nomZone: string): string {
  const nom = nomZone
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  if (/toilette|wc|sanitaire|douch|vestiaire|piscine|spa|hammam|sauna|jacuzzi/.test(nom)) {
    return "L'entretien de cet espace est-il à la hauteur ?"
  }
  if (/restaurant|salle|cuisine|bar|terrasse|pizzeria|brasserie|cafe|cafete/.test(nom)) {
    return "Votre repas et le service ont-ils été à la hauteur ?"
  }
  if (/accueil|reception|check-?in|comptoir|caisse|boutique|entree/.test(nom)) {
    return "L'accueil que vous avez reçu est-il à la hauteur ?"
  }
  return "Scannez pour évaluer votre expérience en 15 secondes"
}

/** Télécharge une image PNG (dataURL) sous forme de fichier */
export function downloadPng(dataUrl: string, filename: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Affiche A4 prêt à imprimer (spec pivot Session 1, par ZONE) :
 * - Titre "VOTRE AVIS COMPTE"
 * - Nom de la ZONE (Accueil, Salle, Toilettes…)
 * - Sous-titre "Scannez pour évaluer votre expérience en 15 secondes"
 * - QR code centré (8 x 8 cm)
 * - Logo de l'établissement en bas (si disponible)
 * - Mention "Propulsé par FeedbackPro" discrète
 */
export function generatePosterPdf(
  qrDataUrl: string,
  nomEtablissement: string,
  logoDataUrl?: string | null,
  zoneNom?: string | null
) {
  const doc = new jsPDF({ unit: MM, format: "a4" }) // 210 x 297 mm
  const W = 210
  const H = 297

  // Cadre extérieur double
  doc.setDrawColor(37, 99, 235) // bleu FeedbackPro
  doc.setLineWidth(2)
  doc.rect(10, 10, W - 20, H - 20)
  doc.setLineWidth(0.5)
  doc.rect(14, 14, W - 28, H - 28)

  // Titre (spec : VOTRE AVIS COMPTE)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(40)
  doc.setTextColor(37, 99, 235)
  doc.text("VOTRE AVIS COMPTE", W / 2, 48, { align: "center" })

  // Nom de la ZONE scannée — c'est le QR de cette zone précise
  doc.setFontSize(24)
  doc.setTextColor(30, 30, 30)
  doc.text((zoneNom || nomEtablissement).toUpperCase(), W / 2, 64, { align: "center" })

  // Sous-titre (spec : 15 secondes)
  doc.setFontSize(14)
  doc.setTextColor(80, 80, 80)
  doc.setFont("helvetica", "normal")
  doc.text("Scannez pour évaluer votre expérience en 15 secondes", W / 2, 76, { align: "center" })

  // QR code encadré — 8 x 8 cm comme demandé
  const qrSize = 80
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(37, 99, 235)
  doc.setLineWidth(1)
  doc.rect((W - qrSize) / 2 - 6, 92, qrSize + 12, qrSize + 12)
  doc.addImage(qrDataUrl, "PNG", (W - qrSize) / 2, 98, qrSize, qrSize)

  // Pied : incitation + remerciement
  doc.setFont("helvetica", "normal")
  doc.setFontSize(13)
  doc.setTextColor(80, 80, 80)
  doc.text("Votre expérience nous aide à nous améliorer", W / 2, 208, { align: "center" })
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(37, 99, 235)
  doc.text("Merci pour votre confiance !", W / 2, 220, { align: "center" })

  // Logo de l'établissement en bas (si disponible, proportion conservée)
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl)
      const maxW = 44
      const maxH = 20
      const ratio = Math.min(maxW / props.width, maxH / props.height)
      const l = props.width * ratio
      const h = props.height * ratio
      doc.addImage(logoDataUrl, "PNG", (W - l) / 2, 236, l, h)
    } catch {
      /* logo illisible : on génère l'affiche sans */
    }
  }

  // Marque discrète
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text("Propulsé par FeedbackPro", W / 2, 280, { align: "center" })

  doc.save(`affiche-a4-${slug(zoneNom || nomEtablissement)}.pdf`)
}

/**
 * Planche d'étiquettes 5x5 cm sur A4 :
 * grille 4 x 5 = 20 étiquettes (avec bordure pointillée de découpe)
 */
export function generateLabelsPdf(
  qrDataUrl: string,
  nomEtablissement: string,
  zoneNom?: string | null
) {
  const doc = new jsPDF({ unit: MM, format: "a4" })
  const W = 210
  const H = 297
  const etiq = 50 // 5 cm
  const cols = 4
  const rows = 5
  const marginX = (W - cols * etiq) / 2
  const marginY = 20

  // En-tête
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(60, 60, 60)
  const contexte = zoneNom ? `${nomEtablissement} — ${zoneNom}` : nomEtablissement
  doc.text(`Planche d'étiquettes 5x5 cm - ${contexte}`, W / 2, 12, { align: "center" })

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = marginX + c * etiq
      const y = marginY + r * (etiq + 6)

      // Contour pointillé de découpe
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.setLineDashPattern([1.5, 1.5], 0)
      doc.rect(x, y, etiq, etiq)
      doc.setLineDashPattern([], 0)

      // QR centré dans l'étiquette
      const qr = 34
      doc.addImage(qrDataUrl, "PNG", x + (etiq - qr) / 2, y + 3, qr, qr)

      // Mini légende (même design que l'affiche A4, en réduit)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6)
      doc.setTextColor(37, 99, 235)
      doc.text("VOTRE AVIS COMPTE", x + etiq / 2, y + etiq - 9, { align: "center" })
      doc.setFont("helvetica", "normal")
      doc.setFontSize(5)
      doc.setTextColor(120, 120, 120)
      doc.text("Scannez pour évaluer votre expérience", x + etiq / 2, y + etiq - 5.5, { align: "center" })
    }
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text("Propulsé par FeedbackPro - Impression à 100% sur A4, découpe le long des pointillés", W / 2, H - 12, {
    align: "center",
  })

  doc.save(`planche-etiquettes-${slug(zoneNom || nomEtablissement)}.pdf`)
}

/**
 * Bon d'impression d'une commande de supports (utilisé par le Superadmin).
 * qrDataUrl (optionnel) : QR de scan de la zone imprimé en bas du bon —
 * permet à l'atelier de vérifier le support avant expédition.
 */
export function generateCommandePdf(
  commande: {
    id: string
    typeSupport: string
    quantite: number
    prixEuros: number
    adresseLivraison: string
    statut: string
    numeroSuivi?: string | null
    createdAt: string
  },
  pro: { nomEtablissement: string; ville: string; email: string },
  qrDataUrl?: string
) {
  const doc = new jsPDF({ unit: MM, format: "a4" })
  const W = 210

  // Bandeau (bleu FeedbackPro #2563EB)
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, W, 42, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  doc.setTextColor(255, 255, 255)
  doc.text("FeedbackPro", 15, 20)
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text("Bon d'impression - Support physique", 15, 30)

  // Référence commande
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(30, 30, 30)
  doc.text(`Commande #${commande.id.slice(-8).toUpperCase()}`, 15, 60)

  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(70, 70, 70)
  doc.text(`Créée le ${new Date(commande.createdAt).toLocaleDateString("fr-FR")}`, 15, 68)

  // Bloc client
  doc.setDrawColor(220, 220, 220)
  doc.setFillColor(248, 250, 249)
  doc.roundedRect(15, 78, W - 30, 42, 3, 3, "FD")
  doc.setFont("helvetica", "bold")
  doc.setTextColor(30, 30, 30)
  doc.text("Client", 22, 88)
  doc.setFont("helvetica", "normal")
  doc.text(`${pro.nomEtablissement} (${pro.ville})`, 22, 96)
  doc.text(`Email : ${pro.email}`, 22, 103)
  doc.text(`Livraison : ${commande.adresseLivraison}`, 22, 110)

  // Bloc produit
  doc.setFont("helvetica", "bold")
  doc.text("Produit commandé", 22, 134)
  const support = SUPPORTS[commande.typeSupport as TypeSupportId]
  doc.setFont("helvetica", "normal")
  doc.text(`${support?.label ?? commande.typeSupport} - Quantité : ${commande.quantite}`, 22, 142)
  doc.text(`Prix : ${commande.prixEuros} EUR`, 22, 149)

  // Statut + numéro de suivi (affiché dès qu'il existe)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(37, 99, 235)
  doc.text(`Statut actuel : ${STATUT_COMMANDE_LABEL[commande.statut] ?? commande.statut}`, 15, 170)
  if (commande.numeroSuivi) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    doc.setTextColor(60, 60, 60)
    doc.text(`N° de suivi : ${commande.numeroSuivi}`, 15, 178)
  }

  // Zone de validation
  doc.setDrawColor(200, 200, 200)
  doc.rect(15, 200, 80, 30)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text("Visa atelier / date d'impression :", 18, 208)

  // QR de scan de la zone (optionnel) : vérification du support avant expédition
  if (qrDataUrl) {
    try {
      const qr = 40 // 4 x 4 cm
      doc.setDrawColor(200, 200, 200)
      doc.rect(W - qr - 20, 205, qr + 8, qr + 14)
      doc.addImage(qrDataUrl, "PNG", W - qr - 16, 209, qr, qr)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(110, 110, 110)
      doc.text("Vérification QR avant expédition", W - qr / 2 - 16, 242, { align: "center" })
    } catch {
      /* QR illisible : le bon est généré sans */
    }
  }

  // Référence interne
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(`Réf. interne : ${commande.id}`, 15, 250)

  doc.save(`impression-commande-${commande.id.slice(-8)}.pdf`)
}

/**
 * Rapport de satisfaction (export PDF de l'onglet Statistiques) :
 * KPIs, répartition des notes, tags récurrents et heatmap jour/créneau.
 * Généré côté client à partir des données déjà chargées par le dashboard.
 */
export function generateStatsReportPdf(
  stats: {
    jours: number
    categories: { categorie: string; count: number }[]
    repartitionNotes: { note: string; count: number }[]
    heatmap: { jour: string; creneau: string; total: number; alertes: number }[]
    total: number
    noteMoyenne: number
  },
  nomEtablissement: string
) {
  const doc = new jsPDF({ unit: MM, format: "a4" })
  const W = 210
  const H = 297
  const M = 15 // marge
  const BLEU: [number, number, number] = [37, 99, 235]

  // ---------- Bandeau ----------
  doc.setFillColor(...BLEU)
  doc.rect(0, 0, W, 36, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255)
  doc.text("Rapport de satisfaction", M, 16)
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text(`${nomEtablissement} - ${stats.jours} derniers jours`, M, 26)
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`, W - M, 26, {
    align: "right",
  })

  let y = 52

  // ---------- KPIs ----------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(30, 30, 30)
  doc.text("Vue d'ensemble", M, y)
  y += 4

  const alertes = stats.heatmap.reduce((s, c) => s + c.alertes, 0)
  const kpis: [string, string][] = [
    ["Note moyenne", stats.noteMoyenne ? `${stats.noteMoyenne.toFixed(2)} / 5` : "—"],
    ["Retours sur la période", String(stats.total)],
    ["Alertes (note ≤ 2)", String(alertes)],
    ["Taux de satisfaction", stats.total ? `${Math.round((stats.repartitionNotes.filter((r) => Number(r.note) >= 4).reduce((s, r) => s + r.count, 0) / stats.total) * 100)} %` : "—"],
  ]
  const colW = (W - 2 * M) / 4
  kpis.forEach(([label, value], i) => {
    const x = M + i * colW
    doc.setDrawColor(225, 228, 232)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, colW - 4, 22, 2, 2, "FD")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(110, 115, 120)
    doc.text(label, x + 4, y + 7)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor(30, 30, 30)
    doc.text(value, x + 4, y + 16)
  })
  y += 34

  // ---------- Répartition des notes (mini barres) ----------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("Répartition des notes", M, y)
  y += 8
  const maxCount = Math.max(1, ...stats.repartitionNotes.map((r) => r.count))
  stats.repartitionNotes.forEach((r) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)
    doc.text(`${r.note} étoile${Number(r.note) > 1 ? "s" : ""}`, M, y + 4)
    const barW = 90
    const filled = (r.count / maxCount) * barW
    doc.setFillColor(235, 235, 240)
    doc.roundedRect(M + 45, y, barW, 5, 1.5, 1.5, "F")
    if (r.count > 0) {
      doc.setFillColor(...BLEU)
      doc.roundedRect(M + 45, y, Math.max(1.5, filled), 5, 1.5, 1.5, "F")
    }
    doc.setFont("helvetica", "bold")
    doc.text(String(r.count), M + 45 + barW + 4, y + 4.5)
    y += 8
  })
  y += 8

  // ---------- Tags récurrents (catégories) ----------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("Mentions clients par thème", M, y)
  y += 8
  const cats = stats.categories.filter((c) => c.count > 0)
  if (cats.length === 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(120, 120, 120)
    doc.text("Aucune mention sur la période", M, y + 4)
    y += 12
  } else {
    cats.forEach((c) => {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(c.categorie, M, y + 4)
      doc.setFont("helvetica", "bold")
      doc.text(`${c.count} mention${c.count > 1 ? "s" : ""}`, M + 60, y + 4)
      y += 7
    })
    y += 8
  }

  // ---------- Heatmap ----------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("Alertes par jour et créneau", M, y)
  y += 8

  const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
  const creneaux = ["6h-10h", "10h-14h", "14h-18h", "18h-22h", "22h-6h"]
  const maxAlertes = Math.max(1, ...stats.heatmap.map((c) => c.alertes))
  const cellW = 24
  const cellH = 9

  // En-têtes jours
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(110, 115, 120)
  jours.forEach((j, i) => {
    doc.text(j, M + 24 + i * cellW + cellW / 2, y + 3, { align: "center" })
  })
  y += 6

  creneaux.forEach((creneau) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 60)
    doc.text(creneau, M, y + cellH / 2 + 1)
    jours.forEach((j, i) => {
      const cell = stats.heatmap.find((c) => c.jour === j && c.creneau === creneau)
      const a = cell?.alertes ?? 0
      const ratio = a / maxAlertes
      // Intensité bleue claire → bleue pleine
      if (a === 0) {
        doc.setFillColor(243, 244, 246)
      } else {
        const t = Math.min(1, 0.25 + ratio * 0.75)
        doc.setFillColor(255 - (255 - 37) * t, 255 - (255 - 99) * t, 255 - (255 - 235) * t)
      }
      doc.roundedRect(M + 24 + i * cellW, y, cellW - 1.5, cellH - 1.5, 1.5, 1.5, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.setTextColor(a === 0 ? 160 : ratio > 0.5 ? 255 : 40, ratio > 0.5 ? 255 : 40, ratio > 0.5 ? 255 : 60)
      doc.text(String(a), M + 24 + i * cellW + (cellW - 1.5) / 2, y + cellH / 2, { align: "center" })
    })
    y += cellH
  })

  // ---------- Pied de page ----------
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text("Propulsé par FeedbackPro - Rapport généré automatiquement", W / 2, H - 12, { align: "center" })

  doc.save(`rapport-${slug(nomEtablissement)}-${new Date().toISOString().slice(0, 10)}.pdf`)
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
