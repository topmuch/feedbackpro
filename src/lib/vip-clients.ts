// ============================================================
// vip-clients.ts — Socle "Base Clients VIP" (module fondamental)
// ------------------------------------------------------------
// - Normalisation & matching pour la détection VIP au scan
// - Enregistrement des visites + alertes Maître d'Hôtel (visuelles)
// - Config tenant lounge (JSONB-like : VipTenantConfig) avec défauts
// - Clamp dur du volume Denise à 30% (impossible de monter plus)
// - DND nocturne (respecté par Denise / notifications)
// - Journal d'audit des actions staff (VipAuditTrail)
// ============================================================

import { db } from '@/lib/db'

// ---------- Niveaux VIP ----------
export const VIP_LEVELS_VALIDES = new Set(['gold', 'platinum', 'diamond'])
export const NIVEAU_LABEL: Record<string, string> = {
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
}

// ---------- Helpers JSON (SQLite : pas de type JSONB natif) ----------
export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean)
    return []
  } catch {
    return []
  }
}

export function parseJsonObject<T = Record<string, unknown>>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as T
    return fallback
  } catch {
    return fallback
  }
}

// Normalisation d'un nom pour le matching de détection :
// minuscules, accents retirés, espaces/punctuation compressés.
export function normaliserNom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normaliserTelephone(phone: string): string {
  return phone.replace(/[^+\d]/g, '')
}

// ---------- Défauts de config tenant lounge ----------
export const VOLUME_DENISE_MAX = 30 // PLAFOND DUR — 30% maximum, non négociable

export interface VipLoungeConfig {
  general: {
    nom: string
    logo: string | null
    adresse: string
    horaires: string
    capaciteMax: number
    // Wi-Fi du salon — affiché à l'accueil Nathalie (Écran 1) avec
    // « Copier en 1 clic ». Champs vides par défaut : la carte Wi-Fi
    // n'apparaît au client QUE si le salon l'a configurée.
    wifiNom: string
    wifiMotDePasse: string
  }
  alertesVip: {
    enabled: boolean
    destinataire: string // maitre_dhotel | manager | reception
    delaiSecondes: number // délai avant relance visuelle si non prise en charge
  }
  buffet: {
    intervalleMinutes: number
    seuilBas: number // % en dessous duquel l'item passe en warning
    items: string[]
  }
  douches: {
    nombre: number
    tempsUtilisationMinutes: number
    tempsNettoyageMinutes: number
    nettoyageProfondJour: string
  }
  recompenses: {
    budgetMaxFcfa: number
    validationManager: boolean
    catalogue: string[]
  }
  notifications: {
    canaux: { push: boolean; email: boolean; sms: boolean; whatsapp: boolean }
    dndDebut: string // "22:00"
    dndFin: string // "07:00"
    destinataires: { vip: string; incident: string; lostfound: string }
  }
  integrations: {
    apiVols: { enabled: boolean; url: string; readOnly: boolean }
    importVip: { enabled: boolean; dernierImport: string | null }
  }
  modulesEnabled: {
    smartShower: boolean
    upselling: boolean
    pretExpress: boolean
    debarrassage: boolean
    briefingVocal: boolean
    lostFound: boolean
    flashRewards: boolean
  }
}

export interface VipDeniseSettings {
  alertesVocales: boolean
  volume: number // PLAFONNÉ À 30 (clamp serveur + client)
  tonDoux: boolean // ton doux toujours (mode discrétion)
  langues: string[]
  messageBienvenue: string
  dndRespect: boolean // respect du DND nocturne par les annonces vocales
}

export const DEFAUT_CONFIG: VipLoungeConfig = {
  general: { nom: 'Salon VIP', logo: null, adresse: '', horaires: '06:00 — 23:00', capaciteMax: 120, wifiNom: '', wifiMotDePasse: '' },
  alertesVip: { enabled: true, destinataire: 'maitre_dhotel', delaiSecondes: 30 },
  buffet: { intervalleMinutes: 30, seuilBas: 40, items: ['buffet_fill', 'drinks_level', 'cleanliness'] },
  douches: { nombre: 4, tempsUtilisationMinutes: 30, tempsNettoyageMinutes: 15, nettoyageProfondJour: 'dimanche' },
  recompenses: {
    budgetMaxFcfa: 50000,
    validationManager: true,
    catalogue: ['Champagne', 'Cocktail signature', 'Spa express', 'Accès salon privé', 'Souvenir premium'],
  },
  notifications: {
    canaux: { push: true, email: false, sms: false, whatsapp: false },
    dndDebut: '22:00',
    dndFin: '07:00',
    destinataires: { vip: 'maitre_dhotel', incident: 'manager', lostfound: 'reception' },
  },
  integrations: {
    apiVols: { enabled: false, url: '', readOnly: true },
    importVip: { enabled: true, dernierImport: null },
  },
  modulesEnabled: {
    smartShower: true,
    upselling: true,
    pretExpress: true,
    debarrassage: true,
    briefingVocal: true,
    lostFound: true,
    flashRewards: true,
  },
}

export const DEFAUT_DENISE: VipDeniseSettings = {
  alertesVocales: true,
  volume: 20, // ≤ 30
  tonDoux: true,
  langues: ['fr', 'en'],
  messageBienvenue: 'Bienvenue dans notre salon. Nous restons à votre entière disposition.',
  dndRespect: true,
}

// Deep merge superficiel par section (2 niveaux) — les clés inconnues sont conservées
function mergeSection<T extends object>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k]
    if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(b as Record<string, unknown>), ...(v as Record<string, unknown>) }
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out as T
}

// ---------- Chargeur de config tenant (auto-création) ----------
export async function chargerVipConfig(): Promise<{
  config: VipLoungeConfig
  deniseSettings: VipDeniseSettings
  rawConfig: Record<string, unknown>
  rawDenise: Record<string, unknown>
  updatedAt: Date
}> {
  let row = await db.vipTenantConfig.findUnique({ where: { loungeKey: 'lounge' } })
  if (!row) {
    row = await db.vipTenantConfig.create({ data: { loungeKey: 'lounge' } })
  }
  const rawConfig = parseJsonObject(row.config, {})
  const rawDenise = parseJsonObject(row.deniseSettings, {})
  const config = mergeSection(DEFAUT_CONFIG, rawConfig)
  const deniseSettings = mergeSection(DEFAUT_DENISE, rawDenise)
  return { config, deniseSettings, rawConfig, rawDenise, updatedAt: row.updatedAt }
}

// Clamp dur des réglages Denise : volume ≤ 30%, ton doux forcé si volume > 15,
// DND respecté par défaut. Le serveur est la source de vérité.
export function clampDeniseSettings(input: unknown): VipDeniseSettings {
  const merged = mergeSection(DEFAUT_DENISE, input)
  const volumeBrut = Number(merged.volume)
  const volume = Number.isFinite(volumeBrut) ? Math.min(VOLUME_DENISE_MAX, Math.max(0, Math.round(volumeBrut))) : DEFAUT_DENISE.volume
  return {
    alertesVocales: Boolean(merged.alertesVocales),
    volume,
    tonDoux: Boolean(merged.tonDoux),
    langues: Array.isArray(merged.langues) && merged.langues.length ? merged.langues.slice(0, 6).map(String) : DEFAUT_DENISE.langues,
    messageBienvenue: typeof merged.messageBienvenue === 'string' && merged.messageBienvenue.trim()
      ? merged.messageBienvenue.trim().slice(0, 300)
      : DEFAUT_DENISE.messageBienvenue,
    dndRespect: Boolean(merged.dndRespect),
  }
}

// ---------- DND nocturne ----------
// Respect du DND : true si l'heure locale courante est dans [dndDebut, dndFin).
// Gère le passage de minuit (22:00 → 07:00).
export function estEnDnd(notif: VipLoungeConfig['notifications'], now: Date = new Date()): boolean {
  try {
    const mins = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10))
      if (!Number.isFinite(h)) return null
      return h * 60 + (Number.isFinite(m) ? m : 0)
    }
    const debut = mins(notif.dndDebut)
    const fin = mins(notif.dndFin)
    if (debut === null || fin === null) return false
    const cur = now.getHours() * 60 + now.getMinutes()
    if (debut === fin) return false
    if (debut < fin) return cur >= debut && cur < fin
    return cur >= debut || cur < fin // traverse minuit
  } catch {
    return false
  }
}

// Denise a-t-elle le droit de parler maintenant ? (alertes vocales + DND + ton doux)
export async function denisePeutParler(now: Date = new Date()): Promise<{
  autorise: boolean
  raison: string | null
  settings: VipDeniseSettings
}> {
  const { config, deniseSettings } = await chargerVipConfig()
  if (!deniseSettings.alertesVocales) return { autorise: false, raison: 'Alertes vocales désactivées', settings: deniseSettings }
  if (deniseSettings.dndRespect && estEnDnd(config.notifications, now)) {
    return { autorise: false, raison: 'Période DND nocturne', settings: deniseSettings }
  }
  return { autorise: true, raison: null, settings: deniseSettings }
}

// ---------- Audit trail ----------
export async function logAudit(entry: {
  actor: string
  actorRole?: string | null
  action: string
  cible?: string | null
  detail?: string | null
}): Promise<void> {
  try {
    await db.vipAuditTrail.create({
      data: {
        actor: entry.actor.slice(0, 120),
        actorRole: entry.actorRole?.slice(0, 60) ?? null,
        action: entry.action.slice(0, 60),
        cible: entry.cible?.slice(0, 200) ?? null,
        detail: entry.detail?.slice(0, 500) ?? null,
      },
    })
  } catch {
    // L'audit ne doit jamais casser le flux métier
  }
}

// ---------- Détection VIP ----------
export interface DetectionInput {
  name?: string | null
  deviceId?: string | null
  boardingPassId?: string | null
  phone?: string | null
  tableNumber?: string | null
  canal?: 'scan' | 'reception' | 'session'
  detection?: string | null
}

// Retrouve un VipClient correspondant aux critères de détection.
// Priorité : boardingPassId exact > deviceId (dernière session) > nom normalisé.
export async function trouverVipPourDetection(input: DetectionInput) {
  const boardingPass = input.boardingPassId?.trim()
  if (boardingPass) {
    const parPass = await db.vipClient.findFirst({ where: { boardingPassId: boardingPass } })
    if (parPass) return { client: parPass, critere: `carte d'embarquement ${boardingPass}` }
  }

  const deviceId = input.deviceId?.trim()
  if (deviceId) {
    // Reprise par device : la dernière session connue sur ce device pointe le client
    const session = await db.clientSession.findFirst({
      where: { deviceId, vipClientId: { not: null } },
      orderBy: { lastActiveAt: 'desc' },
    })
    if (session?.vipClientId) {
      const parDevice = await db.vipClient.findUnique({ where: { id: session.vipClientId } })
      if (parDevice) return { client: parDevice, critere: 'appareil déjà reconnu' }
    }
  }

  const name = input.name?.trim()
  if (name) {
    const candidats = await db.vipClient.findMany({
      where: { name: { contains: name } },
      take: 5,
    })
    const cible = normaliserNom(name)
    const exact = candidats.find((c) => normaliserNom(c.name) === cible)
    if (exact) return { client: exact, critere: 'nom reconnu' }
  }

  return null
}

// Enregistre une détection : visite + compteur + alerte Maître d'Hôtel (visuelle).
// Respecte les settings : alertesVip.enabled.
export async function enregistrerDetectionVip(params: {
  client: { id: string; name: string; photo: string | null; vipLevel: string; airline: string | null }
  input: DetectionInput
}): Promise<{ alerte: boolean }> {
  const { client, input } = params

  await db.vipVisit.create({
    data: {
      vipClientId: client.id,
      canal: input.canal ?? 'scan',
      tableNumber: input.tableNumber?.slice(0, 40) ?? null,
      deviceToken: input.deviceId?.slice(0, 100) ?? null,
      detection: input.detection?.slice(0, 200) ?? null,
    },
  })

  await db.vipClient.update({
    where: { id: client.id },
    data: { visitCount: { increment: 1 }, lastVisit: new Date() },
  })

  const { config } = await chargerVipConfig()
  if (!config.alertesVip.enabled) return { alerte: false }

  // Anti-spam : une seule alerte "nouvelle" par client / 10 minutes
  const recent = await db.vipGuestAlert.findFirst({
    where: {
      vipClientId: client.id,
      status: 'nouvelle',
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
  })
  if (recent) return { alerte: true }

  // Allergies connues → motif renforcé pour le Maître d'Hôtel
  const allergies = parseStringArray((client as unknown as { allergies?: string }).allergies)
  await db.vipGuestAlert.create({
    data: {
      vipClientId: client.id,
      clientName: client.name.slice(0, 120),
      photo: client.photo,
      vipLevel: client.vipLevel,
      airline: client.airline,
      tableNumber: input.tableNumber?.slice(0, 40) ?? null,
      motif: allergies.length ? 'allergie' : 'vip_detected',
      detail: allergies.length
        ? `Allergies : ${allergies.join(', ')}`
        : 'Client VIP reconnu à l’entrée',
      destinataire: config.alertesVip.destinataire,
    },
  })

  await logAudit({
    actor: input.canal === 'reception' ? 'Réception' : 'Scan automatique',
    action: 'VIP_DETECTE',
    cible: client.name,
    detail: `${client.vipLevel} — ${input.tableNumber ?? 'entrée salon'}`,
  })

  return { alerte: true }
}

// ---------- Sérialisation client (contrat API) ----------
export function serialiserVipClient(c: {
  id: string
  name: string
  photo: string | null
  airline: string | null
  vipLevel: string
  boardingPassId: string | null
  preferences: string
  allergies: string
  consentPhoto: boolean
  consentProfil: boolean
  visitCount: number
  lastVisit: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: c.id,
    name: c.name,
    photo: c.photo,
    airline: c.airline,
    vipLevel: c.vipLevel,
    boardingPassId: c.boardingPassId,
    preferences: parseStringArray(c.preferences),
    allergies: parseStringArray(c.allergies),
    consentPhoto: c.consentPhoto,
    consentProfil: c.consentProfil,
    visitCount: c.visitCount,
    lastVisit: c.lastVisit?.toISOString() ?? null,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}
