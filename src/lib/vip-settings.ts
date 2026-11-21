// ============================================================
// vip-settings.ts — Validation / clamp de la config tenant lounge
// ------------------------------------------------------------
// Le serveur est la source de vérité : toute valeur hors bornes est
// ramenée dans les limites (notamment le volume Nathalie ≤ 30%).
// ============================================================

import {
  chargerVipConfig as chargerConfigBrute,
  VOLUME_DENISE_MAX,
  DEFAUT_CONFIG,
  DEFAUT_DENISE,
  clampDeniseSettings,
  type VipLoungeConfig,
  type VipDeniseSettings,
} from '@/lib/vip-clients'

const ROLES_DESTINATAIRES = new Set(['maitre_dhotel', 'manager', 'reception'])
const JOURS = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampHhmm(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback
  const m = v.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!m) return fallback
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function clampRole(v: unknown, fallback: string): string {
  return typeof v === 'string' && ROLES_DESTINATAIRES.has(v) ? v : fallback
}

// Merge par section avec validation des bornes pour chaque champ.
// Les valeurs inconnues du patch sont ignorées (schéma contrôlé).
export function validerConfig(patch: unknown, base: VipLoungeConfig): VipLoungeConfig {
  const p = (patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}) as Record<string, unknown>
  const out: VipLoungeConfig = JSON.parse(JSON.stringify(base))

  // Général
  if (p.general && typeof p.general === 'object') {
    const g = p.general as Record<string, unknown>
    if (typeof g.nom === 'string' && g.nom.trim()) out.general.nom = g.nom.trim().slice(0, 120)
    // Logo du salon : soit une URL https (500 car max), soit une data URL
    // image uploadée dans les Paramètres (redimensionnée côté client,
    // plafonnée à 200k caractères ≈ 150 ko — le reste du JSON config
    // tient sans problème dans la colonne TEXT de VipTenantConfig).
    if (g.logo === null || typeof g.logo === 'string') {
      const raw = g.logo ? String(g.logo) : null
      if (!raw) out.general.logo = null
      else if (raw.startsWith('data:image/')) out.general.logo = raw.length <= 200_000 ? raw : null
      else out.general.logo = raw.slice(0, 500)
    }
    if (typeof g.adresse === 'string') out.general.adresse = g.adresse.slice(0, 300)
    if (typeof g.horaires === 'string') out.general.horaires = g.horaires.slice(0, 80)
    out.general.capaciteMax = clampInt(g.capaciteMax, 1, 2000, base.general.capaciteMax)
    // Wi-Fi du salon (Écran 1 Nathalie — carte « Copier en 1 clic »).
    // Champ vide → la carte Wi-Fi est masquée côté client.
    if (typeof g.wifiNom === 'string') out.general.wifiNom = g.wifiNom.trim().slice(0, 64)
    if (typeof g.wifiMotDePasse === 'string') out.general.wifiMotDePasse = g.wifiMotDePasse.trim().slice(0, 64)
  }

  // Alertes VIP
  if (p.alertesVip && typeof p.alertesVip === 'object') {
    const a = p.alertesVip as Record<string, unknown>
    if (typeof a.enabled === 'boolean') out.alertesVip.enabled = a.enabled
    out.alertesVip.destinataire = clampRole(a.destinataire, base.alertesVip.destinataire)
    out.alertesVip.delaiSecondes = clampInt(a.delaiSecondes, 0, 600, base.alertesVip.delaiSecondes)
  }

  // Checklist buffet
  if (p.buffet && typeof p.buffet === 'object') {
    const b = p.buffet as Record<string, unknown>
    out.buffet.intervalleMinutes = clampInt(b.intervalleMinutes, 5, 180, base.buffet.intervalleMinutes)
    out.buffet.seuilBas = clampInt(b.seuilBas, 0, 100, base.buffet.seuilBas)
    if (Array.isArray(b.items)) {
      out.buffet.items = b.items.slice(0, 12).map((i) => String(i).slice(0, 60))
    }
  }

  // Douches
  if (p.douches && typeof p.douches === 'object') {
    const d = p.douches as Record<string, unknown>
    out.douches.nombre = clampInt(d.nombre, 0, 20, base.douches.nombre)
    out.douches.tempsUtilisationMinutes = clampInt(d.tempsUtilisationMinutes, 5, 120, base.douches.tempsUtilisationMinutes)
    out.douches.tempsNettoyageMinutes = clampInt(d.tempsNettoyageMinutes, 5, 120, base.douches.tempsNettoyageMinutes)
    if (typeof d.nettoyageProfondJour === 'string' && JOURS.has(d.nettoyageProfondJour)) {
      out.douches.nettoyageProfondJour = d.nettoyageProfondJour
    }
  }

  // Récompenses
  if (p.recompenses && typeof p.recompenses === 'object') {
    const r = p.recompenses as Record<string, unknown>
    out.recompenses.budgetMaxFcfa = clampInt(r.budgetMaxFcfa, 0, 5_000_000, base.recompenses.budgetMaxFcfa)
    if (typeof r.validationManager === 'boolean') out.recompenses.validationManager = r.validationManager
    if (Array.isArray(r.catalogue)) {
      out.recompenses.catalogue = r.catalogue.slice(0, 20).map((i) => String(i).slice(0, 80))
    }
  }

  // Notifications
  if (p.notifications && typeof p.notifications === 'object') {
    const n = p.notifications as Record<string, unknown>
    if (n.canaux && typeof n.canaux === 'object') {
      const c = n.canaux as Record<string, unknown>
      out.notifications.canaux = {
        push: typeof c.push === 'boolean' ? c.push : base.notifications.canaux.push,
        email: typeof c.email === 'boolean' ? c.email : base.notifications.canaux.email,
        sms: typeof c.sms === 'boolean' ? c.sms : base.notifications.canaux.sms,
        whatsapp: typeof c.whatsapp === 'boolean' ? c.whatsapp : base.notifications.canaux.whatsapp,
      }
    }
    out.notifications.dndDebut = clampHhmm(n.dndDebut, base.notifications.dndDebut)
    out.notifications.dndFin = clampHhmm(n.dndFin, base.notifications.dndFin)
    if (n.destinataires && typeof n.destinataires === 'object') {
      const d = n.destinataires as Record<string, unknown>
      out.notifications.destinataires = {
        vip: clampRole(d.vip, base.notifications.destinataires.vip),
        incident: clampRole(d.incident, base.notifications.destinataires.incident),
        lostfound: clampRole(d.lostfound, base.notifications.destinataires.lostfound),
      }
    }
  }

  // Intégrations
  if (p.integrations && typeof p.integrations === 'object') {
    const it = p.integrations as Record<string, unknown>
    if (it.apiVols && typeof it.apiVols === 'object') {
      const v = it.apiVols as Record<string, unknown>
      out.integrations.apiVols = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : base.integrations.apiVols.enabled,
        url: typeof v.url === 'string' ? v.url.slice(0, 300) : base.integrations.apiVols.url,
        readOnly: true, // API vols TOUJOURS read-only (spécification)
      }
    }
    if (it.importVip && typeof it.importVip === 'object') {
      const im = it.importVip as Record<string, unknown>
      out.integrations.importVip = {
        enabled: typeof im.enabled === 'boolean' ? im.enabled : base.integrations.importVip.enabled,
        dernierImport: typeof im.dernierImport === 'string' ? im.dernierImport : base.integrations.importVip.dernierImport,
      }
    }
  }

  // Modules optionnels (toggles)
  if (p.modulesEnabled && typeof p.modulesEnabled === 'object') {
    const m = p.modulesEnabled as Record<string, unknown>
    const keys = Object.keys(base.modulesEnabled) as (keyof VipLoungeConfig['modulesEnabled'])[]
    for (const k of keys) {
      if (typeof m[k] === 'boolean') out.modulesEnabled[k] = m[k] as boolean
    }
  }

  return out
}

export async function chargerVipConfig(): Promise<{
  config: VipLoungeConfig
  deniseSettings: VipDeniseSettings
  updatedAt: Date
}> {
  const brute = await chargerConfigBrute()
  const config = validerConfig(brute.config, DEFAUT_CONFIG)
  const deniseSettings = clampDeniseSettings(brute.deniseSettings)
  return { config, deniseSettings, updatedAt: brute.updatedAt }
}

export async function mergeConfigValide(
  configPatch: unknown,
  denisePatch: unknown,
): Promise<
  | { erreur: string }
  | { config: VipLoungeConfig; deniseSettings: VipDeniseSettings }
> {
  if (configPatch !== undefined && configPatch !== null && (typeof configPatch !== 'object' || Array.isArray(configPatch))) {
    return { erreur: 'config doit être un objet' }
  }
  if (denisePatch !== undefined && denisePatch !== null && (typeof denisePatch !== 'object' || Array.isArray(denisePatch))) {
    return { erreur: 'deniseSettings doit être un objet' }
  }

  const current = await chargerVipConfig()
  const config = validerConfig(configPatch ?? {}, current.config)
  const deniseSettings = denisePatch ? clampDeniseSettings(denisePatch) : current.deniseSettings

  return { config, deniseSettings }
}

// Ré-export pour les routes
export { VOLUME_DENISE_MAX }
