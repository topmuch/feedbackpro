import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.email,
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
}
