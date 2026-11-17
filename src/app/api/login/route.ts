import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { createSession, attachSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { pro: true },
    })

    if (!user || user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: 'Identifiants invalides.' }, { status: 401 })
    }

    // Crée une session en DB (pas un JWT) — getSessionUser peut la retrouver
    const sessionId = await createSession(user.id)
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        etablissements: user.pro
          ? [
              {
                id: user.pro.id,
                nom: user.pro.nomEtablissement,
                type: user.pro.typeEtablissement,
              },
            ]
          : [],
      },
    })
    attachSessionCookie(res, sessionId)
    return res
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
