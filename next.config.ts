import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        // URL courte imprimée sur les QR codes : /r/<qrToken>
        // Sert la page unique (SPA) qui lit le token côté client.
        source: "/r/:token",
        destination: "/?scan=:token",
      },
      {
        // Session 2 : page de login dédiée (/login)
        source: "/login",
        destination: "/?auth=login",
      },
      {
        // Session 2 : page d'inscription dédiée (/register)
        source: "/register",
        destination: "/?auth=register",
      },
      {
        // Session 5 : dashboard superadmin (/superadmin)
        source: "/superadmin",
        destination: "/?admin=1",
      },
      {
        // Session 5 : sections superadmin (/superadmin/commercants, etc.)
        source: "/superadmin/:tab",
        destination: "/?admin=1&tabAdmin=:tab",
      },
      {
        // Dashboard Pro : /dashboard → vue d'ensemble
        source: "/dashboard",
        destination: "/?tab=overview",
      },
      {
        // Sections du dashboard : /dashboard/retours, /dashboard/qr-code,
        // /dashboard/equipe, /dashboard/stats, /dashboard/parametres…
        // Le slug est résolu côté client (SPA route unique).
        source: "/dashboard/:tab",
        destination: "/?tab=:tab",
      },
    ];
  },
};

export default nextConfig;
