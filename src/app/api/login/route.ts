import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSessionToken, SESSION_COOKIE } from '@/lib/auth'

export const runtime = 'nodejs'

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
      include: { etablissements: true },
    })

    if (!user || user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: 'Identifiants invalides.' }, { status: 401 })
    }

    const token = createSessionToken(user.id)
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        etablissements: user.etablissements.map((e) => ({
          id: e.id,
          nom: e.nom,
          type: e.type,
        })),
      },
    })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 jours
    })
    return res
  } catch (e) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
