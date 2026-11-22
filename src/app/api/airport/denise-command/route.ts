// ============================================================
// POST /api/airport/denise-command
// ------------------------------------------------------------
// Proxy serveur pour `processVoiceCommand()` (lib denise-conversation).
//
// Le wallboard (client) ne peut pas importer directement la lib
// `denise-conversation.ts` car elle exécute des requêtes Prisma
// (côté serveur uniquement). On expose donc un endpoint qui :
//   1. reçoit `{ text: string }` (transcription SpeechRecognition)
//   2. appelle `processVoiceCommand(text)` côté serveur
//   3. renvoie `{ ok, data: { response, action? } }`
//
// Le wallboard énonce ensuite `data.response` via `parler()` (voix
// Nathalie) et branche l'éventuel `data.action` (ex: 'crisis').
// ============================================================

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/session'
import { processVoiceCommand } from '@/lib/denise-conversation'
import { limiteTaux } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CommandBody = { text?: unknown }

export async function POST(req: NextRequest) {
  // Endpoint public LLM (coût par requête) : 20 / min / IP.
  const bloque = limiteTaux(req, "denise-command", { max: 20, fenetreMs: 60_000 })
  if (bloque) return bloque

  let body: CommandBody
  try {
    body = (await req.json()) as CommandBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return fail('`text` est requis (transcription vocale)', 400)
  }

  const result = await processVoiceCommand(text)
  return ok(result)
}
