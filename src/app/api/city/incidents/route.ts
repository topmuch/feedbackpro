// ============================================================
// /api/city/incidents
// ------------------------------------------------------------
// Ville Connectée — Signalements citoyens émis depuis les
// plaques QR publiques de Dakar.
//
// GET  → liste des incidents (filtres ?status & ?type).
//        Triés par createdAt DESC, limit 100, avec plaque liée.
// POST → crée un incident depuis le scan citoyen :
//          - si qrToken → résout la plaque, incrémente scanCount,
//            met à jour lastScanAt.
//          - type : emergency | report | orientation | artisan | mairie
//          - emergency → assignedTo="Police", status="assigned"
//          - report    → auto-routage par category vers Mairie /
//                        Senelec / ONAS.
//          - après création : génère les URLs WhatsApp de notification
//            (agent assigné + confirmation citoyen si téléphone fourni).
// Body : { qrToken?, type, category?, description?, gpsLat?, gpsLng?,
//          citizenPhone?, agentPhone? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Types & constantes de validation
// ---------------------------------------------------------------

const VALID_TYPES = new Set([
  'emergency',
  'report',
  'orientation',
  'artisan',
  'mairie',
])

const VALID_STATUSES = new Set([
  'pending',
  'assigned',
  'in_progress',
  'resolved',
])

/** Catégories reconnues pour le type "report" et leur service assigné. */
const CATEGORY_ROUTING: Readonly<Record<string, string>> = {
  propreté: 'Mairie',
  proprete: 'Mairie',
  voirie: 'Mairie',
  éclairage: 'Senelec',
  eclairage: 'Senelec',
  eau: 'ONAS',
  transport: 'Mairie',
  sécurité: 'Police',
  securite: 'Police',
} as const

/**
 * Détermine le service assigné à un signalement citoyen.
 * - Pour "emergency" → Police (toujours)
 * - Pour "report"    → Mairie par défaut, sauf routage spécialisé
 *                      (Senelec pour éclairage, ONAS pour eau…)
 * - Pour les autres types → null (à assigner manuellement par la mairie)
 */
function resolveAssignedTo(type: string, category?: string | null): string | null {
  if (type === 'emergency') return 'Police'
  if (type === 'report') {
    if (!category) return 'Mairie'
    const normalized = category.trim().toLowerCase()
    return CATEGORY_ROUTING[normalized] ?? 'Mairie'
  }
  return null
}

// ---------------------------------------------------------------
// WhatsApp — helpers de construction des messages & URLs
// ---------------------------------------------------------------

/**
 * Extrait un numéro de téléphone sénégalais d'un texte libre
 * (typiquement la description d'un incident). Reconnaît les formats :
 *   - +221 77 123 45 67 / 00221 77 123 45 67
 *   - 221771234567
 *   - 77 123 45 67 / 77.123.45.67 / 77-123-45-67 / 771234567
 * Retourne le numéro au format international SANS le « + » (attendu par
 * wa.me), ex: "221771234567", ou null si aucun numéro valide trouvé.
 */
function extractPhoneFromText(text: string | null | undefined): string | null {
  if (!text) return null
  // Cherche des séquences « numéro-like » : préfixe international optionnel
  // (+221 / 00221) puis un numéro local de 9 chiffres commençant par 7/8/9,
  // les chiffres pouvant être séparés par des espaces, points ou tirets.
  const candidates = text.match(
    /(?:\+?221|00221)?[\s.\-]*[7-9](?:[\s.\-]?\d){8}/g,
  )
  if (candidates) {
    for (const c of candidates) {
      const digits = c.replace(/\D/g, '')
      if (digits.length === 9 && /^[7-9]/.test(digits)) return `221${digits}`
      if (digits.length === 12 && digits.startsWith('221')) return digits
      if (digits.length === 13 && digits.startsWith('00221')) return digits.slice(2)
    }
  }
  // Fallback : numéro local collé (9 chiffres) commençant par 7/8/9.
  const m = text.match(/\b([7-9]\d{8})\b/)
  if (m) {
    return `221${m[1]}`
  }
  return null
}

/** Normalise un numéro saisi (citoyen ou agent) pour wa.me : chiffres only,
 * au format international sans « + ». Si le numéro est local (9 chiffres
 * Sénégal), on préfixe avec 221. */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d]/g, '')
  if (digits.length === 9 && /^[7-9]/.test(digits)) return `221${digits}`
  if (digits.length === 12 && digits.startsWith('221')) return digits
  if (digits.length === 13 && digits.startsWith('00221')) return digits.slice(2)
  if (digits.length >= 8) return digits // best-effort (autre pays)
  return null
}

/**
 * Construit le message WhatsApp de notification à destination de l'agent
 * (Police / Senelec / ONAS / Mairie) assigné au signalement. Inclut tous
 * les détails : type, catégorie, description, GPS, plaque, service, date.
 */
function buildAgentNotificationMessage(opts: {
  type: string
  category: string | null
  description: string | null
  gpsLat: number | null
  gpsLng: number | null
  plate: { plateNumber: string; label: string; district: string | null } | null
  assignedTo: string | null
  createdAt: Date
}): string {
  const { type, category, description, gpsLat, gpsLng, plate, assignedTo, createdAt } = opts
  const typeLabel =
    type === 'emergency'
      ? 'Urgence'
      : type === 'report'
        ? 'Signalement'
        : type === 'orientation'
          ? 'Orientation'
          : type === 'artisan'
            ? 'Artisan'
            : type === 'mairie'
              ? 'Mairie'
              : type
  const lines: string[] = ['🚨 NOUVEAU SIGNALEMENT']
  lines.push(`Type: ${typeLabel} (${type})`)
  if (category) lines.push(`Catégorie: ${category}`)
  if (description) {
    lines.push(`Description: ${description}`)
  }
  if (gpsLat != null && gpsLng != null) {
    lines.push(`Position GPS: ${gpsLat}, ${gpsLng}`)
    lines.push(`Carte: https://www.google.com/maps?q=${gpsLat},${gpsLng}`)
  }
  if (plate) {
    lines.push(
      `Plaque: ${plate.plateNumber} - ${plate.label}${plate.district ? ` (${plate.district})` : ''}`,
    )
  }
  if (assignedTo) lines.push(`Service assigné: ${assignedTo}`)
  lines.push(`Date: ${createdAt.toISOString()}`)
  return lines.join('\n')
}

/**
 * Construit le message WhatsApp de confirmation à destination du citoyen
 * qui vient de créer le signalement. Rassure le citoyen, donne la référence
 * courte (#xxxxxx) et le service assigné.
 */
function buildCitizenConfirmationMessage(opts: {
  category: string | null
  type: string
  incidentId: string
  assignedTo: string | null
}): string {
  const { category, type, incidentId, assignedTo } = opts
  const sujet = category || type
  const lines: string[] = ['✅ SIGNALEMENT CONFIRMÉ']
  lines.push(`Votre signalement "${sujet}" a été enregistré.`)
  lines.push(`Référence: #${incidentId.slice(-6)}`)
  if (assignedTo) lines.push(`Service assigné: ${assignedTo}`)
  lines.push('Vous serez notifié(e) de la résolution.')
  return lines.join('\n')
}

/** Construit une URL wa.me. Si phone est null/empty → wa.me/?text=… (ouvre
 * le sélecteur de contact WhatsApp avec le message pré-rempli). */
function buildWhatsappUrl(phone: string | null, message: string): string {
  const encoded = encodeURIComponent(message)
  if (phone) return `https://wa.me/${phone}?text=${encoded}`
  return `https://wa.me/?text=${encoded}`
}

// ---------------------------------------------------------------
// GET — liste des incidents (avec plaque liée)
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') ?? '100', 10) || 100,
    200,
  )

  const where: { status?: string; type?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status
  if (type && VALID_TYPES.has(type)) where.type = type

  const incidents = await db.cityIncident.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      plate: {
        select: {
          id: true,
          plateNumber: true,
          label: true,
          district: true,
        },
      },
    },
  })

  const serialized = incidents.map((i) => ({
    id: i.id,
    plateId: i.plateId,
    plate: i.plate
      ? {
          id: i.plate.id,
          plateNumber: i.plate.plateNumber,
          label: i.plate.label,
          district: i.plate.district,
        }
      : null,
    qrToken: i.qrToken,
    type: i.type,
    category: i.category,
    description: i.description,
    gpsLat: i.gpsLat,
    gpsLng: i.gpsLng,
    status: i.status,
    assignedTo: i.assignedTo,
    staffName: i.staffName,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    // SLA photos (transparence citoyenne)
    arrivedAt: i.arrivedAt ? i.arrivedAt.toISOString() : null,
    beforePhoto: i.beforePhoto ?? null,
    afterPhoto: i.afterPhoto ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }))

  return ok({ incidents: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer un incident depuis un scan citoyen
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    qrToken?: string
    type?: string
    category?: string
    description?: string
    gpsLat?: number
    gpsLng?: number
    // Téléphone citoyen (optionnel) : si fourni, on génère un message
    // WhatsApp de confirmation à destination du citoyen. Sinon, on tente
    // d'extraire un numéro depuis la description.
    citizenPhone?: string
    // Téléphone agent (optionnel) : surcharge du destinataire de la
    // notification agent. Par défaut, on génère un lien wa.me/?text=…
    // (sélecteur de contact) car aucun téléphone par service n'est stocké.
    agentPhone?: string
  }

  // type obligatoire
  if (typeof b.type !== 'string' || !VALID_TYPES.has(b.type)) {
    return fail(
      'type invalide : doit être emergency, report, orientation, artisan ou mairie',
      400,
    )
  }
  const type = b.type as string

  // category optionnelle (max 60)
  let category: string | null = null
  if (b.category !== undefined && b.category !== null) {
    if (typeof b.category !== 'string') {
      return fail('category invalide', 400)
    }
    const trimmed = b.category.trim()
    if (trimmed.length > 60) {
      return fail('category trop longue (max. 60 caractères)', 400)
    }
    category = trimmed || null
  }

  // description optionnelle (max 1000)
  let description: string | null = null
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== 'string') {
      return fail('description invalide', 400)
    }
    const trimmed = b.description.trim()
    if (trimmed.length > 1000) {
      return fail('description trop longue (max. 1000 caractères)', 400)
    }
    description = trimmed || null
  }

  // citizenPhone optionnel (chaîne)
  if (b.citizenPhone !== undefined && b.citizenPhone !== null) {
    if (typeof b.citizenPhone !== 'string') {
      return fail('citizenPhone invalide', 400)
    }
  }

  // agentPhone optionnel (chaîne)
  if (b.agentPhone !== undefined && b.agentPhone !== null) {
    if (typeof b.agentPhone !== 'string') {
      return fail('agentPhone invalide', 400)
    }
  }

  // GPS optionnel
  let gpsLat: number | null = null
  let gpsLng: number | null = null
  if (b.gpsLat !== undefined && b.gpsLat !== null) {
    const parsed =
      typeof b.gpsLat === 'number' ? b.gpsLat : parseFloat(String(b.gpsLat))
    if (Number.isNaN(parsed) || parsed < -90 || parsed > 90) {
      return fail('gpsLat invalide (latitude -90..90)', 400)
    }
    gpsLat = parsed
  }
  if (b.gpsLng !== undefined && b.gpsLng !== null) {
    const parsed =
      typeof b.gpsLng === 'number' ? b.gpsLng : parseFloat(String(b.gpsLng))
    if (Number.isNaN(parsed) || parsed < -180 || parsed > 180) {
      return fail('gpsLng invalide (longitude -180..180)', 400)
    }
    gpsLng = parsed
  }

  // ---------------------------------------------------------------
  // 1. Résolution de la plaque (si qrToken fourni)
  // ---------------------------------------------------------------
  let plateId: string | null = null
  let qrTokenResolved: string | null = null

  if (b.qrToken && typeof b.qrToken === 'string') {
    const token = b.qrToken.trim()
    if (token.length === 0) {
      return fail('qrToken vide', 400)
    }

    const plate = await db.cityPlate.findUnique({
      where: { qrToken: token },
      select: { id: true, plateNumber: true, label: true, scanCount: true },
    })

    if (!plate) {
      return fail(
        'Plaque introuvable pour ce qrToken. Le QR code est peut-être non installé ou désactivé.',
        404,
      )
    }

    plateId = plate.id
    qrTokenResolved = token

    // Incrémentation scanCount + maj lastScanAt (transaction atomique).
    await db.cityPlate.update({
      where: { id: plate.id },
      data: {
        scanCount: { increment: 1 },
        lastScanAt: new Date(),
      },
    })

    console.log(
      `[city-incidents] 📲 Plaque ${plate.plateNumber} scannée — scanCount=${plate.scanCount + 1}`,
    )
  }

  // ---------------------------------------------------------------
  // 2. Routage automatique selon type + category
  // ---------------------------------------------------------------
  const assignedTo = resolveAssignedTo(type, category)
  // Pour "emergency", on passe directement en "assigned" (pas de pending).
  const initialStatus = type === 'emergency' ? 'assigned' : 'pending'

  // ---------------------------------------------------------------
  // 3. Création de l'incident
  // ---------------------------------------------------------------
  const incident = await db.cityIncident.create({
    data: {
      plateId,
      qrToken: qrTokenResolved,
      type,
      category,
      description,
      gpsLat,
      gpsLng,
      status: initialStatus,
      assignedTo,
    },
    include: {
      plate: {
        select: {
          id: true,
          plateNumber: true,
          label: true,
          district: true,
        },
      },
    },
  })

  console.log(
    `[city-incidents] 🆕 Incident ${incident.type} créé (#${incident.id.slice(-6)})` +
      (assignedTo ? ` → assigné à ${assignedTo}` : '') +
      (incident.plate ? ` | Plaque ${incident.plate.plateNumber}` : ''),
  )

  // ---------------------------------------------------------------
  // 4. Notifications WhatsApp (agent assigné + confirmation citoyen)
  // ---------------------------------------------------------------
  // On construit deux deep links wa.me (V1 manuelle, zéro coût API) :
  //   - agentWhatsappUrl : message détaillé à destination de l'agent
  //     (Police / Senelec / ONAS / Mairie). Si agentPhone fourni → wa.me
  //     direct, sinon wa.me/?text=… (ouvre le sélecteur de contact).
  //   - citizenWhatsappUrl : message de confirmation à destination du
  //     citoyen (référence + service assigné), seulement si un téléphone
  //     est disponible (citizenPhone fourni OU extrait de la description).
  // Les URLs + messages bruts sont renvoyés dans la réponse pour que le
  // frontend puisse les ouvrir dans un nouvel onglet (comme notify-resolution).
  const plateForMsg = incident.plate
    ? {
        plateNumber: incident.plate.plateNumber,
        label: incident.plate.label,
        district: incident.plate.district,
      }
    : null

  const agentMessage = buildAgentNotificationMessage({
    type: incident.type,
    category: incident.category,
    description: incident.description,
    gpsLat: incident.gpsLat,
    gpsLng: incident.gpsLng,
    plate: plateForMsg,
    assignedTo: incident.assignedTo,
    createdAt: incident.createdAt,
  })
  const agentPhoneNormalized = normalizePhone(b.agentPhone)
  const agentWhatsappUrl = buildWhatsappUrl(agentPhoneNormalized, agentMessage)

  // Téléphone citoyen : priorité au champ explicite, sinon extraction depuis
  // la description (un citoyen laisse souvent son numéro pour être rappelé).
  const citizenPhoneNormalized =
    normalizePhone(b.citizenPhone) ?? extractPhoneFromText(incident.description)

  let citizenWhatsappUrl: string | null = null
  let citizenMessage: string | null = null
  if (citizenPhoneNormalized) {
    citizenMessage = buildCitizenConfirmationMessage({
      category: incident.category,
      type: incident.type,
      incidentId: incident.id,
      assignedTo: incident.assignedTo,
    })
    citizenWhatsappUrl = buildWhatsappUrl(citizenPhoneNormalized, citizenMessage)
    console.log(
      `[city-incidents] 💬 Confirmation citoyen générée → ${citizenPhoneNormalized}`,
    )
  }

  // ---------------------------------------------------------------
  // 5. Réponse
  // ---------------------------------------------------------------
  return ok(
    {
      incident: {
        id: incident.id,
        plateId: incident.plateId,
        plate: incident.plate
          ? {
              id: incident.plate.id,
              plateNumber: incident.plate.plateNumber,
              label: incident.plate.label,
              district: incident.plate.district,
            }
          : null,
        qrToken: incident.qrToken,
        type: incident.type,
        category: incident.category,
        description: incident.description,
        gpsLat: incident.gpsLat,
        gpsLng: incident.gpsLng,
        status: incident.status,
        assignedTo: incident.assignedTo,
        staffName: incident.staffName,
        resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
      },
      // URLs WhatsApp (deep links wa.me) — à ouvrir côté frontend dans un
      // nouvel onglet. L'envoi reste manuel (V1 zéro coût API).
      whatsapp: {
        agent: {
          phone: agentPhoneNormalized,
          message: agentMessage,
          url: agentWhatsappUrl,
        },
        citizen: citizenPhoneNormalized
          ? {
              phone: citizenPhoneNormalized,
              message: citizenMessage,
              url: citizenWhatsappUrl,
            }
          : null,
      },
    },
    201,
  )
}
