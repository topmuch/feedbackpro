// ============================================================
// FeedbackPro - Export CSV (compatible Excel FR)
// - Séparateur : ; (Excel FR)
// - BOM UTF-8 (sinon les accents cassent à l'ouverture dans Excel FR)
// - Échappement des guillemets " → ""
// - Téléchargement côté client via Blob + URL.createObjectURL
// ============================================================

/** Quote une cellule CSV : entoure de " et échappe les " internes */
function echapperCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return ""
  let s: string
  if (valeur instanceof Date) {
    s = valeur.toISOString()
  } else if (typeof valeur === "object") {
    try {
      s = JSON.stringify(valeur)
    } catch {
      s = String(valeur)
    }
  } else {
    s = String(valeur)
  }
  // Échappe les guillemets
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * Génère le contenu CSV (UTF-8 BOM) à partir d'un tableau d'objets.
 * La première ligne contient les clés (entêtes), les suivantes les valeurs.
 */
export function genererCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "\uFEFF" // BOM seul si vide
  }
  // Union des clés (préserve l'ordre de la 1re ligne, puis les nouvelles)
  const cles: string[] = []
  const vues = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!vues.has(k)) {
        vues.add(k)
        cles.push(k)
      }
    }
  }

  const lignes: string[] = []
  lignes.push(cles.map(echapperCellule).join(";"))
  for (const r of rows) {
    lignes.push(cles.map((k) => echapperCellule(r[k])).join(";"))
  }
  // BOM UTF-8 (\uFEFF) en tête pour qu'Excel FR interprète correctement les accents
  return "\uFEFF" + lignes.join("\r\n")
}

/**
 * Télécharge un CSV côté client.
 * @param filename nom du fichier (ex: "commercants.csv")
 * @param rows tableau d'objets plats (chaque clé devient une colonne)
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]): void {
  const csv = genererCsv(rows)
  // Mime type Excel-friendly : text/csv;charset=utf-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Libère l'URL après un court délai (Safari)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
