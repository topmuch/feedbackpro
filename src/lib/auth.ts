// Cookie-based session helpers for FeedbackPro
import { createHash, createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SESSION_SECRET = process.env.SESSION_SECRET || 'feedbackpro-dev-secret-change-me'
const COOKIE_NAME = 'fp_session'

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function sign(payload: string): string {
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf('.')
  if (idx === -1) return null
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  if (sig !== expected) return null
  return payload
}

export function createSessionToken(userId: string): string {
  const payload = JSON.stringify({ uid: userId, iat: Date.now() })
  return sign(Buffer.from(payload).toString('base64url'))
}

export function readSessionToken(token: string): { uid: string } | null {
  const payloadB64 = verify(token)
  if (!payloadB64) return null
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
    if (typeof payload?.uid !== 'string') return null
    return { uid: payload.uid }
  } catch {
    return null
  }
}

export const SESSION_COOKIE = COOKIE_NAME

export async function getCurrentUser() {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = readSessionToken(token)
  if (!session) return null
  const user = await db.user.findUnique({
    where: { id: session.uid },
    include: { etablissements: true },
  })
  return user
}
