// ============================================================
// /api/vip/clients/import — Import CSV depuis compagnie partenaire
// ------------------------------------------------------------
// POST { csv: string, update?: boolean }
//   Format attendu (séparateur , ou ; — entête flexible) :
//     nom;compagnie;niveau;preferences;allergies;consent_photo;consent_profil
//   - niveau : gold | platinum | diamond (défaut gold)
//   - consent_* : oui/true/1/y (défaut non)
//   - preferences / allergies : items séparés par "|" ou "/"
//   - photo optionnelle : colonne "photo"
// Réponse : { created, updated, skipped, erreurs[] } + audit.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { VIP_LEVELS_VALIDES, logAudit } from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function detecterSeparateur(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const semi = (firstLine.match(/;/g) ?? []).length
  const comma = (firstLine.match(/,/g) ?? []).length
  return semi > comma ? ';' : ','
}

function parseCsv(text: string): string[][] {
  const sep = detecterSeparateur(text)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === sep) {
      cur.push(field)
      field = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(field)
      field = ''
      if (cur.some((c) => c.trim())) rows.push(cur)
      cur = []
      continue
    }
    field += ch
  }
  if (field || cur.length) {
    cur.push(field)
    if (cur.some((c) => c.trim())) rows.push(cur)
  }
  return rows
}

function normaliserEntete(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function estVrai(v: string): boolean {
  return /^(oui|yes|true|1|y|o|x)$/i.test(v.trim())
}

function parseListe(v: string): string[] {
  return v
    .split(/[|/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.csv !== 'string' || !body.csv.trim()) {
    return fail('Contenu CSV requis (champ "csv")', 400)
  }
  const updateExisting = Boolean(body.update)

  const rows = parseCsv(body.csv.trim())
  if (rows.length < 2) return fail('CSV vide ou sans données (une entête + au moins une ligne)', 400)

  const headers = rows[0].map(normaliserEntete)
  const idx = (...cands: string[]) => headers.findIndex((h) => cands.includes(h))
  const iName = idx('nom', 'name', 'nom_complet', 'fullname', 'client')
  const iAirline = idx('compagnie', 'airline', 'societe', 'company', 'compagnie_partenaire')
  const iLevel = idx('niveau', 'niveau_vip', 'viplevel', 'vip_level', 'tier')
  const iPrefs = idx('preferences', 'preference', 'prefs', 'gouts')
  const iAllergies = idx('allergies', 'allergie', 'restrictions')
  const iPhoto = idx('photo', 'photo_url', 'url_photo')
  const iPass = idx('carte', 'boardingpass', 'boarding_pass_id', 'carte_embarquement', 'pass')
  const iConsentPhoto = idx('consent_photo', 'consentement_photo', 'photo_consent')
  const iConsentProfil = idx('consent_profil', 'consentement_profil', 'profil_consent', 'consentement')

  if (iName < 0) {
    return fail('Colonne "nom" introuvable dans l\'entête du CSV', 400)
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const erreurs: string[] = []

  for (let r = 1; r < rows.length && r <= 500; r++) {
    const cells = rows[r]
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : '')
    const name = get(iName)
    if (!name) {
      skipped++
      erreurs.push(`Ligne ${r + 1} : nom manquant — ignorée`)
      continue
    }

    const niveauBrut = get(iLevel).toLowerCase()
    const vipLevel = VIP_LEVELS_VALIDES.has(niveauBrut) ? niveauBrut : 'gold'
    const airline = get(iAirline).slice(0, 80) || null
    const photo = get(iPhoto).slice(0, 500) || null
    const boardingPassId = get(iPass).slice(0, 80) || null
    const preferences = JSON.stringify(parseListe(get(iPrefs)))
    const allergies = JSON.stringify(parseListe(get(iAllergies)))
    const consentPhoto = estVrai(get(iConsentPhoto))
    const consentProfil = estVrai(get(iConsentProfil))

    // RGPD : pas de photo sans consentement photo ; profil sans consentement → ignoré
    if (!consentProfil) {
      skipped++
      erreurs.push(`Ligne ${r + 1} : ${name} — consentement profil absent (RGPD), non importé`)
      continue
    }
    const photoFinale = consentPhoto ? photo : null

    const existing = await db.vipClient.findFirst({ where: { name: { contains: name } } })
    const isExact = existing && existing.name.toLowerCase() === name.toLowerCase()

    if (isExact && existing) {
      if (!updateExisting) {
        skipped++
        erreurs.push(`Ligne ${r + 1} : ${name} — déjà présent (update=false)`)
        continue
      }
      await db.vipClient.update({
        where: { id: existing.id },
        data: { airline, vipLevel, preferences, allergies, photo: photoFinale ?? existing.photo, boardingPassId, consentPhoto, consentProfil, updatedAt: new Date() },
      })
      updated++
      continue
    }

    try {
      await db.vipClient.create({
        data: {
          name: name.slice(0, 120),
          airline,
          vipLevel,
          preferences,
          allergies,
          photo: photoFinale,
          boardingPassId,
          consentPhoto,
          consentProfil,
          ownerUserId: user.id,
        },
      })
      created++
    } catch {
      skipped++
      erreurs.push(`Ligne ${r + 1} : ${name} — échec d'insertion`)
    }
  }

  await logAudit({
    actor: user.email,
    actorRole: 'PRO',
    action: 'IMPORT_CSV',
    cible: `${created + updated} clients`,
    detail: `Import CSV — ${created} créé(s), ${updated} mis à jour, ${skipped} ignoré(s)`,
  })

  // Mémorise la date du dernier import dans la config intégrations
  const { rawConfig } = await chargerConfigSecurisee()
  await db.vipTenantConfig.upsert({
    where: { loungeKey: 'lounge' },
    create: {
      loungeKey: 'lounge',
      config: JSON.stringify({
        ...rawConfig,
        integrations: { ...(rawConfig.integrations as object | undefined ?? {}), importVip: { enabled: true, dernierImport: new Date().toISOString() } },
      }),
    },
    update: {
      config: JSON.stringify({
        ...rawConfig,
        integrations: { ...(rawConfig.integrations as object | undefined ?? {}), importVip: { enabled: true, dernierImport: new Date().toISOString() } },
      }),
    },
  })

  return ok({ created, updated, skipped, erreurs: erreurs.slice(0, 20) })
}

// Petit helper local pour lire la config brute sans écraser les autres sections
async function chargerConfigSecurisee(): Promise<{ rawConfig: Record<string, unknown> }> {
  const row = await db.vipTenantConfig.findUnique({ where: { loungeKey: 'lounge' } })
  let rawConfig: Record<string, unknown> = {}
  if (row) {
    try {
      const parsed = JSON.parse(row.config)
      if (parsed && typeof parsed === 'object') rawConfig = parsed
    } catch {
      /* défaut */
    }
  }
  return { rawConfig }
}
