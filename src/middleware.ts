// ============================================================
// FeedbackPro - Middleware d'authentification + sécurité (Session 2, §4)
// - Protège /dashboard/*  → redirige vers /login si non connecté
// - Protège /superadmin/* → redirige vers /login si non connecté
//   (le contrôle de rôle SUPERADMIN est fait côté serveur via
//   requireAdmin() et côté client via la session)
// - Task M5 — Force HTTPS en production (redirige HTTP → HTTPS via
//   l'en-tête x-forwarded-proto, sauf localhost pour le dev local).
// ============================================================
// NOTE ARCHITECTURE : l'authentification repose sur un cookie de
// session httpOnly (fp_session) validé en base à chaque requête API
// (voir src/lib/session.ts et src/lib/guards.ts). En middleware Edge,
// on ne peut pas interroger SQLite : on vérifie la PRÉSENCE du cookie.
// La validité réelle de la session reste vérifiée par /api/auth/me et
// les guards serveur — le middleware agit comme premier filtre.

import { NextRequest, NextResponse } from "next/server"

const COOKIE_SESSION = "fp_session"

/**
 * Task M5 — Détecte si la requête arrive en HTTP (et doit être redirigée
 * vers HTTPS). On se base sur l'en-tête `x-forwarded-proto` (posé par les
 * reverse proxies type Caddy/Nginx/Vercel) — `req.nextUrl.protocol` n'est
 * pas fiable derrière un proxy. localhost est exempté pour le dev local.
 */
function doitForcerHttps(req: NextRequest): boolean {
  const host = req.headers.get("host") ?? ""
  // Dev local : on ne force jamais le HTTPS
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return false
  const proto = req.headers.get("x-forwarded-proto") ?? ""
  // Si l'en-tête contient "http" (et pas "https"), on redirige
  if (proto.includes(",")) {
    // Plusieurs proxies en cascade : on prend le premier
    return proto.split(",")[0]?.trim() === "http"
  }
  return proto === "http"
}

export function middleware(req: NextRequest) {
  // Task M5 — Force HTTPS en production (redirige HTTP → HTTPS, 308 permanent)
  if (doitForcerHttps(req)) {
    const httpsUrl = req.nextUrl.clone()
    httpsUrl.protocol = "https:"
    // 308 = redirect permanent qui préserve la méthode (POST/PUT…)
    return NextResponse.redirect(httpsUrl, 308)
  }

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
  // Le matcher couvre aussi les pages racines (/dashboard, /superadmin)
  // pour que la règle HTTPS s'applique partout — Task M5.
  matcher: ["/dashboard/:path*", "/superadmin/:path*"],
}
