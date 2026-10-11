// ============================================================
// FeedbackPro - Middleware d'authentification (Session 2, §4)
// - Protège /dashboard/*  → redirige vers /login si non connecté
// - Protège /superadmin/* → redirige vers /login si non connecté
//   (le contrôle de rôle SUPERADMIN est fait côté serveur via
//   requireAdmin() et côté client via la session)
// ============================================================
// NOTE ARCHITECTURE : l'authentification repose sur un cookie de
// session httpOnly (fp_session) validé en base à chaque requête API
// (voir src/lib/session.ts et src/lib/guards.ts). En middleware Edge,
// on ne peut pas interroger SQLite : on vérifie la PRÉSENCE du cookie.
// La validité réelle de la session reste vérifiée par /api/auth/me et
// les guards serveur — le middleware agit comme premier filtre.

import { NextRequest, NextResponse } from "next/server"

const COOKIE_SESSION = "fp_session"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const connecte = !!req.cookies.get(COOKIE_SESSION)?.value

  if (connecte) return NextResponse.next()

  // Non connecté → redirection vers /login avec l'URL de retour
  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.search = `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  // Uniquement les zones protégées : tout le reste (landing, scan public,
  // pages légales, API) reste accessible sans session.
  matcher: ["/dashboard/:path*", "/superadmin/:path*"],
}
