// Types partagés FeedbackPro
export type StatutRetour = 'NOUVEAU' | 'EN_COURS' | 'RESOLU'

export type Retour = {
  id: string
  nps: number
  tags: string[]
  reponses: { question: string; reponse: string; gravite?: string }[] | null
  commentaire: string | null
  zone: string | null
  personnelMentionne: string[]
  photoUrl: string | null
  clientEmail: string | null
  clientPhone: string | null
  statut: StatutRetour
  actionPrise: { tags: string[]; commentaire: string } | null
  recompenseAttribuee: boolean
  recompenseUtilisee: boolean
  dateRecompenseUtilisee: string | null
  isRecidive: boolean
  reponseGerant: string | null
  dateReponseGerant: string | null
  createdAt: string
}

export type Recommandation = {
  niveau: 'CRITIQUE' | 'MITIGÉ' | 'POSITIF'
  diagnostic: string
  actions: string[]
  impact: string
}

export type RecompenseConfig = {
  active: boolean
  type: string | null
  texte: string | null
  codePromo: string | null
  whatsappActive: boolean
  whatsapp: string | null
}

// Durée de validité d'une récompense attribuée à un client (en heures).
// Au-delà, la récompense est considérée comme expirée.
export const RECOMPENSE_DUREE_VALIDITE_H = 72

// Calcule la date d'expiration d'une récompense à partir de sa date d'attribution.
export function dateExpirationRecompense(dateAttribution: string | Date): Date {
  const d = typeof dateAttribution === 'string' ? new Date(dateAttribution) : dateAttribution
  return new Date(d.getTime() + RECOMPENSE_DUREE_VALIDITE_H * 3600_000)
}

export type ProUser = {
  id: string
  email: string
  name: string | null
  etablissements: { id: string; nom: string; type: string }[]
}

// Tags négatifs vs positifs (pour le badge de gravité dans le détail)
export const TAGS_NEGATIFS = new Set([
  'hygiene',
  'proprete',
  'service',
  'attente',
  'temperature',
])

export const TAG_LABELS: Record<string, { label: string; emoji: string }> = {
  hygiene: { label: 'Hygiène', emoji: '🧼' },
  proprete: { label: 'Propreté', emoji: '🧹' },
  service: { label: 'Service', emoji: '🍽️' },
  accueil: { label: 'Accueil', emoji: '👋' },
  qualite: { label: 'Qualité des plats', emoji: '🍕' },
  ambiance: { label: 'Ambiance', emoji: '🎵' },
  attente: { label: 'Attente', emoji: '⏳' },
  prix: { label: 'Rapport qualité/prix', emoji: '💰' },
  temperature: { label: 'Température', emoji: '🌡️' },
}

export const ZONE_EMOJIS: Record<string, string> = {
  toilettes: '🚻',
  salle: '🪑',
  cuisine: '👨‍🍳',
  bar: '🍹',
  entree: '🚪',
  parking: '🅿️',
}

export function getZoneEmoji(zone?: string | null): string {
  if (!zone) return '📍'
  const z = zone.toLowerCase()
  for (const key of Object.keys(ZONE_EMOJIS)) {
    if (z.includes(key)) return ZONE_EMOJIS[key]
  }
  return '📍'
}

export function getTagInfo(tag: string): { label: string; emoji: string } {
  return TAG_LABELS[tag] ?? { label: tag, emoji: '•' }
}

// Badge de gravité selon la note et la nature du tag
export type Gravite = 'CRITIQUE' | 'ÉLEVÉE' | 'MOYENNE' | 'OK'

export function graviteForTag(tag: string, nps: number): Gravite {
  const isNegatif = TAGS_NEGATIFS.has(tag)
  if (nps >= 4) return 'OK'
  if (nps === 3) return isNegatif ? 'MOYENNE' : 'OK'
  if (nps === 2) return isNegatif ? 'ÉLEVÉE' : 'OK'
  // nps === 1
  return isNegatif ? 'CRITIQUE' : 'MOYENNE'
}

export function graviteEmoji(g: Gravite): string {
  switch (g) {
    case 'CRITIQUE':
      return '🔴'
    case 'ÉLEVÉE':
      return '🟠'
    case 'MOYENNE':
      return '🟡'
    case 'OK':
      return '🟢'
  }
}

export type Urgence = 'URGENT' | 'A_TRAITER' | 'MITIGE' | 'POSITIF'

export function urgenceForRetour(nps: number, isRecidive?: boolean): Urgence {
  if (nps <= 2 && isRecidive) return 'URGENT'
  if (nps <= 2) return 'A_TRAITER'
  if (nps === 3) return 'MITIGE'
  return 'POSITIF'
}

export const URGENCES: Record<Urgence, { label: string; emoji: string; bg: string; bgDark: string }> = {
  URGENT: { label: 'Urgent', emoji: '🚨', bg: '#720032', bgDark: '#5a0026' },
  A_TRAITER: { label: 'À traiter', emoji: '🟠', bg: '#c2410c', bgDark: '#9a3412' },
  MITIGE: { label: 'Mitigé', emoji: '🟡', bg: '#a16207', bgDark: '#854d0e' },
  POSITIF: { label: 'Positif', emoji: '🟢', bg: '#0da14b', bgDark: '#0a8f3f' },
}

// Tags d'action managériale (SECTION 4)
export const ACTION_TAGS = [
  { id: 'formation', label: 'Formation équipe', emoji: '✅' },
  { id: 'recadrage', label: 'Recadrage', emoji: '🔄' },
  { id: 'processus', label: 'Processus', emoji: '📋' },
  { id: 'compensation', label: 'Compensation', emoji: '🎁' },
  { id: 'autre', label: 'Autre', emoji: '📝' },
] as const
