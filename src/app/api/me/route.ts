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
      name: user.name,
      etablissements: user.etablissements.map((e) => ({
        id: e.id,
        nom: e.nom,
        type: e.type,
      })),
    },
  })
}
