"use client"

// ============================================================
// FeedVoice — Landing "Accueil Premium B2B — Focus Salon VIP"
// ------------------------------------------------------------
// Refonte v2 (maquette utilisateur) : le hero passe en 2 colonnes
// avec une PREVIEW NATHALIE (interface Wi-Fi + services + bulles
// flottantes) au lieu de la photo centrée. Focus commercial mis
// sur le Salon VIP (carte secteur "featured" sombre + badge
// Premium) et les 6 secteurs unifiés.
//
// Design unifié crème #ffffff + or #bc7155 + anthracite #0f0f1c.
// Typographie : Playfair Display (titres, italique doré pour les
// accents) + Inter (corps). Playfair/Inter sont chargées globalement
// dans src/app/layout.tsx (link runtime, jamais au build).
//
// Sections (ordre) :
//   1. NAV fixe verre crème (scrolled -> ombre), Se connecter + CTA démo
//   2. HERO 2 colonnes :
//      - gauche : badge "Nouveau : Nathalie", titre Playfair avec
//        "Établissements" en italique doré souligné, 2 CTA, trust row
//      - droite : preview Nathalie (en-tête photo sombre "Bonsoir,
//        Cher Hôte.", carte Wi-Fi avec bouton Copier, 4 services,
//        bulles flottantes animées Denise/incident)
//   3. SECTEURS : 6 cartes unifiées (crème + bordure dorée + barre
//      latérale dorée animée au hover) dont SALON VIP en featured
//      (fond anthracite, badge Premium, icône dorée)
//   4. DENISE : message commercial adapté au salon VIP (mode
//      discret) + visualisation Denise "Écoute active · Salon VIP Terra"
//   5. PREUVES : 3 stats avec unités en italique doré + icônes
//      + hover, puis 3 témoignages (avatars dorés, noms, rôles)
//   6. CTA FINAL : dégradé bleu profond + halos dorés subtils
//   7. FOOTER : newsletter + badge "Denise veille 24/7"
//      + "Piloté par Denise"
//
// Interactions : nav scrolled (scrollY > 50), smooth scroll vers
// les ancres, reveals IntersectionObserver (cartes/témoignages),
// copie Wi-Fi avec feedback "✓ Copié !" 2s, toast newsletter.
// Toutes les classes CSS sont préfixées `fh-` pour éviter toute
// fuite vers le reste de l'app.
// ============================================================

import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  BellRing,
  Check,
  Clock,
  Eye,
  MapPin,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react"

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Pages SPA internes atteignables depuis l'accueil premium. */
type NavTarget =
  | "restaurant"
  | "aeroport"
  | "hotel"
  | "gare"
  | "hopital"
  | "erp"
  | "apropos"
  | "contact"

// ------------------------------------------------------------
// CSS — préfixe fh-, injecté une seule fois par ce composant
// ------------------------------------------------------------

const FH_CSS = `
.fh-root {
  --gold: #bc7155;
  --gold-light: #e7c1ae;
  --gold-deep: #A8893F;
  --anthracite: #0f0f1c;
  --anthracite-soft: #2C2C2C;
  --cream: #ffffff;
  --cream-dark: #F0EDE5;
  --sage: #bc7155;
  font-family: 'Inter', sans-serif;
  background: var(--cream);
  color: var(--anthracite);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  min-height: 100vh;
}
.fh-root button { font-family: inherit; }

/* ============================================ */
/* NAVIGATION                                   */
/* ============================================ */
.fh-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  background: rgba(250, 250, 247, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(201, 169, 97, 0.15);
  z-index: 100;
  transition: all 0.3s ease;
}
.fh-nav.fh-scrolled {
  background: rgba(250, 250, 247, 0.98);
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
}
.fh-nav-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.fh-nav-logo {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--anthracite);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.fh-nav-logo-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.1rem;
  box-shadow: 0 4px 12px rgba(201, 169, 97, 0.3);
  flex-shrink: 0;
}
.fh-nav-links { display: flex; gap: 2.5rem; align-items: center; }
.fh-nav-link {
  color: var(--anthracite);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: color 0.3s ease;
  position: relative;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.fh-nav-link:hover { color: var(--gold); }
.fh-nav-link::after {
  content: '';
  position: absolute;
  bottom: 6px;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--gold);
  transition: width 0.3s ease;
}
.fh-nav-link:hover::after { width: 100%; }
.fh-nav-right { display: flex; gap: 1.5rem; align-items: center; }
.fh-nav-login {
  color: var(--anthracite);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  opacity: 0.75;
  transition: opacity 0.3s ease, color 0.3s ease;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.fh-nav-login:hover { opacity: 1; color: var(--gold); }
.fh-nav-cta {
  background: var(--anthracite);
  color: var(--cream);
  padding: 0.7rem 1.5rem;
  border-radius: 50px;
  border: 2px solid var(--anthracite);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
}
.fh-nav-cta:hover {
  background: var(--gold);
  border-color: var(--gold);
  color: var(--anthracite);
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(201, 169, 97, 0.3);
}

/* ============================================ */
/* HERO — FOCUS SALON VIP (2 colonnes)          */
/* ============================================ */
.fh-hero {
  padding: 10rem 2rem 6rem;
  max-width: 1400px;
  margin: 0 auto;
  position: relative;
}
.fh-hero-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 4rem;
  align-items: center;
}
.fh-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: linear-gradient(135deg, rgba(201, 169, 97, 0.15) 0%, rgba(201, 169, 97, 0.05) 100%);
  border: 1px solid rgba(201, 169, 97, 0.3);
  padding: 0.6rem 1.3rem;
  border-radius: 50px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--gold-deep);
  margin-bottom: 2rem;
  animation: fh-fadeInDown 0.8s ease;
}
.fh-hero-badge-dot {
  width: 8px;
  height: 8px;
  background: var(--gold);
  border-radius: 50%;
  animation: fh-pulse 2s infinite;
  flex-shrink: 0;
}
@keyframes fh-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}
.fh-hero-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 600;
  line-height: 1.1;
  color: var(--anthracite);
  margin: 0 0 1.5rem;
  letter-spacing: -0.02em;
  animation: fh-fadeInUp 0.8s ease 0.2s both;
}
.fh-hero-title em {
  font-style: italic;
  color: var(--gold);
  position: relative;
}
.fh-hero-title em::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--gold);
  opacity: 0.3;
}
.fh-hero-subtitle {
  font-size: clamp(1rem, 1.8vw, 1.15rem);
  color: var(--anthracite);
  opacity: 0.7;
  line-height: 1.7;
  margin: 0 0 2.5rem;
  max-width: 540px;
  animation: fh-fadeInUp 0.8s ease 0.4s both;
}
.fh-hero-ctas {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;
  animation: fh-fadeInUp 0.8s ease 0.6s both;
}
.fh-btn-primary {
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%);
  color: white;
  padding: 1.1rem 2.2rem;
  border-radius: 50px;
  border: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  min-height: 44px;
  box-shadow: 0 10px 30px rgba(201, 169, 97, 0.3);
}
.fh-btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 40px rgba(201, 169, 97, 0.4);
}
.fh-btn-secondary {
  background: transparent;
  color: var(--anthracite);
  padding: 1.1rem 2.2rem;
  border-radius: 50px;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border: 2px solid rgba(26, 26, 26, 0.2);
  cursor: pointer;
  min-height: 44px;
}
.fh-btn-secondary:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.fh-hero-trust {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--anthracite);
  opacity: 0.6;
  animation: fh-fadeInUp 0.8s ease 0.8s both;
}
.fh-hero-trust span { display: flex; align-items: center; gap: 0.4rem; }
.fh-hero-trust svg { color: var(--gold); flex-shrink: 0; }

@keyframes fh-fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fh-fadeInDown {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ============================================ */
/* HERO VISUAL — PREVIEW NATHALIE               */
/* ============================================ */
.fh-hero-visual {
  position: relative;
  animation: fh-fadeInUp 1s ease 0.5s both;
}
.fh-nathalie {
  background: white;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0,0,0,0.15);
  border: 1px solid rgba(201, 169, 97, 0.2);
  position: relative;
}
.fh-nathalie-header {
  height: 200px;
  background: linear-gradient(135deg, #0f0f1c 0%, #2c1810 100%);
  position: relative;
  overflow: hidden;
}
.fh-nathalie-header-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.6;
}
.fh-nathalie-header-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  color: white;
}
.fh-nathalie-logo {
  width: 50px;
  height: 50px;
  background: var(--gold);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 10px 30px rgba(201, 169, 97, 0.4);
}
.fh-nathalie-header-content h3 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.3rem;
  font-weight: 600;
  margin: 0 0 0.3rem;
}
.fh-nathalie-header-content p {
  font-size: 0.85rem;
  opacity: 0.8;
  font-style: italic;
  margin: 0;
}
.fh-nathalie-body { padding: 1.5rem; }
.fh-nathalie-wifi {
  background: rgba(201, 169, 97, 0.08);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 12px;
  padding: 0.8rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.2rem;
  font-size: 0.85rem;
}
.fh-nathalie-wifi-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.fh-nathalie-wifi-icon {
  width: 32px;
  height: 32px;
  background: var(--gold);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.fh-nathalie-wifi-text { min-width: 0; }
.fh-nathalie-wifi-text strong {
  display: block;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: var(--gold-deep);
  text-transform: uppercase;
  font-weight: 600;
}
.fh-nathalie-wifi-text span {
  font-weight: 600;
  color: var(--anthracite);
  white-space: nowrap;
}
.fh-nathalie-copy-btn {
  background: white;
  border: 1px solid rgba(201, 169, 97, 0.3);
  padding: 0.4rem 0.9rem;
  border-radius: 20px;
  font-size: 0.75rem;
  color: var(--gold-deep);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 44px;
  flex-shrink: 0;
}
.fh-nathalie-copy-btn:hover {
  border-color: var(--gold);
  background: rgba(201, 169, 97, 0.06);
}
.fh-nathalie-copy-btn.fh-copied {
  background: var(--sage);
  color: white;
  border-color: var(--sage);
}
.fh-nathalie-services {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
.fh-nathalie-service {
  background: var(--cream);
  border: 1px solid rgba(201, 169, 97, 0.15);
  border-radius: 12px;
  padding: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.3s ease;
}
.fh-nathalie-service:hover {
  border-color: var(--gold);
  transform: translateY(-2px);
}
.fh-nathalie-service-icon {
  width: 28px;
  height: 28px;
  background: rgba(201, 169, 97, 0.15);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  flex-shrink: 0;
}

/* Bulles flottantes */
.fh-float {
  position: absolute;
  background: white;
  border-radius: 16px;
  padding: 1rem 1.2rem;
  box-shadow: 0 15px 40px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.8rem;
  animation: fh-float 4s ease-in-out infinite;
  border: 1px solid rgba(201, 169, 97, 0.2);
  z-index: 2;
}
.fh-float-1 { top: 10%; right: -24px; animation-delay: 0s; }
.fh-float-2 { bottom: 15%; left: -24px; animation-delay: 2s; }
@keyframes fh-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.fh-float-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
.fh-float-icon.fh-green { background: rgba(74, 124, 89, 0.15); color: var(--sage); }
.fh-float-icon.fh-gold { background: rgba(201, 169, 97, 0.15); color: var(--gold-deep); }
.fh-float-text {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--anthracite);
  line-height: 1.3;
}
.fh-float-sub {
  font-size: 0.7rem;
  color: var(--anthracite);
  opacity: 0.6;
  font-weight: 400;
}

/* ============================================ */
/* SECTEURS — UNIFIED DESIGN                    */
/* ============================================ */
.fh-sectors { padding: 7rem 2rem; background: white; scroll-margin-top: 5rem; }
.fh-container { max-width: 1400px; margin: 0 auto; }
.fh-label {
  font-size: 0.75rem;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: var(--gold);
  text-align: center;
  margin-bottom: 1rem;
  font-weight: 600;
}
.fh-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 600;
  text-align: center;
  color: var(--anthracite);
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
}
.fh-title em { font-style: italic; color: var(--gold); }
.fh-subtitle {
  text-align: center;
  color: var(--anthracite);
  opacity: 0.6;
  max-width: 600px;
  margin: 0 auto 4rem;
  line-height: 1.7;
  font-size: 1.05rem;
}
.fh-sectors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}
.fh-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
  display: block;
  height: 100%;
}
.fh-reveal.fh-visible { opacity: 1; transform: translateY(0); }
.fh-sector-card {
  background: var(--cream);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 20px;
  padding: 2.2rem;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  text-align: left;
  display: block;
  width: 100%;
  height: 100%;
}
.fh-sector-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 0;
  background: linear-gradient(180deg, var(--gold) 0%, var(--gold-deep) 100%);
  transition: height 0.4s ease;
}
.fh-sector-card:hover {
  transform: translateY(-5px);
  border-color: var(--gold);
  box-shadow: 0 20px 40px rgba(201, 169, 97, 0.15);
  background: white;
}
.fh-sector-card:hover::before { height: 100%; }

/* Variante featured — Salon VIP */
.fh-sector-card.fh-featured {
  background: linear-gradient(135deg, var(--anthracite) 0%, var(--anthracite-soft) 100%);
  color: var(--cream);
  border-color: var(--gold);
}
.fh-sector-card.fh-featured .fh-sector-title,
.fh-sector-card.fh-featured .fh-sector-desc { color: var(--cream); }
.fh-sector-card.fh-featured .fh-sector-desc { opacity: 0.8; }
.fh-sector-card.fh-featured:hover { background: linear-gradient(135deg, var(--anthracite) 0%, var(--anthracite-soft) 100%); }
.fh-sector-card.fh-featured .fh-sector-icon {
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%);
}
.fh-sector-card.fh-featured .fh-sector-link { color: var(--gold); }
.fh-sector-badge {
  position: absolute;
  top: 1.2rem;
  right: 1.2rem;
  background: var(--gold);
  color: var(--anthracite);
  padding: 0.3rem 0.8rem;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.fh-sector-icon {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(201, 169, 97, 0.15) 0%, rgba(201, 169, 97, 0.05) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  margin-bottom: 1.5rem;
}
.fh-sector-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.6rem;
  color: var(--anthracite);
}
.fh-sector-desc {
  font-size: 0.95rem;
  color: var(--anthracite);
  opacity: 0.7;
  margin: 0 0 1.5rem;
  line-height: 1.6;
}
.fh-sector-link {
  color: var(--gold);
  font-weight: 600;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: gap 0.3s ease;
}
.fh-sector-card:hover .fh-sector-link { gap: 0.8rem; }

/* ============================================ */
/* DENISE                                       */
/* ============================================ */
.fh-denise {
  padding: 7rem 2rem;
  background: var(--anthracite);
  color: var(--cream);
  position: relative;
  overflow: hidden;
  scroll-margin-top: 5rem;
}
.fh-denise::before {
  content: '';
  position: absolute;
  top: -30%;
  right: -10%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.12) 0%, transparent 70%);
  border-radius: 50%;
}
.fh-denise::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.08) 0%, transparent 70%);
  border-radius: 50%;
}
.fh-denise-grid {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5rem;
  align-items: center;
  position: relative;
  z-index: 1;
}
.fh-denise-content .fh-label { text-align: left; color: var(--gold); }
.fh-denise-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  line-height: 1.2;
  margin: 0 0 1.5rem;
  letter-spacing: -0.02em;
}
.fh-denise-title em { font-style: italic; color: var(--gold); }
.fh-denise-desc {
  font-size: 1.05rem;
  line-height: 1.8;
  opacity: 0.85;
  margin: 0 0 2rem;
}
.fh-denise-features {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0 0 2.5rem;
}
.fh-denise-feature {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 0.95rem;
  font-weight: 500;
}
.fh-denise-check {
  width: 24px;
  height: 24px;
  background: var(--gold);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--anthracite);
  flex-shrink: 0;
}
.fh-denise-visual {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 24px;
  padding: 2.5rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  position: relative;
}
.fh-denise-visual::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 3px;
  background: var(--gold);
  border-radius: 0 0 3px 3px;
}
.fh-denise-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(201, 169, 97, 0.15);
}
.fh-denise-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  box-shadow: 0 10px 30px rgba(201, 169, 97, 0.3);
  flex-shrink: 0;
}
.fh-denise-name {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.3rem;
  font-weight: 600;
}
.fh-denise-status {
  font-size: 0.8rem;
  opacity: 0.7;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.fh-status-dot {
  width: 8px;
  height: 8px;
  background: var(--sage);
  border-radius: 50%;
  animation: fh-pulse 2s infinite;
  flex-shrink: 0;
}
.fh-denise-msglabel {
  font-size: 0.7rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 1rem;
  font-weight: 600;
}
.fh-denise-message {
  background: rgba(201, 169, 97, 0.08);
  border-left: 3px solid var(--gold);
  padding: 1.5rem;
  border-radius: 0 12px 12px 0;
  font-style: italic;
  line-height: 1.7;
  margin: 0 0 1.5rem;
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.05rem;
}
.fh-denise-meta {
  display: flex;
  gap: 1.5rem;
  font-size: 0.8rem;
  opacity: 0.6;
  flex-wrap: wrap;
}
.fh-denise-meta span { display: flex; align-items: center; gap: 0.4rem; }

/* ============================================ */
/* PREUVE / STATS                               */
/* ============================================ */
.fh-proof { padding: 7rem 2rem; background: var(--cream); scroll-margin-top: 5rem; }
.fh-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  margin-bottom: 5rem;
}
.fh-stat-card {
  background: white;
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 24px;
  padding: 3rem 2rem;
  text-align: center;
  transition: all 0.4s ease;
  position: relative;
  overflow: hidden;
  height: 100%;
}
.fh-stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--gold) 0%, var(--gold-deep) 100%);
  transform: scaleX(0);
  transition: transform 0.4s ease;
}
.fh-stat-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 30px 60px rgba(201, 169, 97, 0.15);
  border-color: var(--gold);
}
.fh-stat-card:hover::before { transform: scaleX(1); }
.fh-stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(201, 169, 97, 0.15) 0%, rgba(201, 169, 97, 0.05) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gold-deep);
  margin: 0 auto 1.5rem;
}
.fh-stat-value {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 4rem;
  font-weight: 700;
  color: var(--anthracite);
  line-height: 1;
  margin-bottom: 1rem;
}
.fh-stat-value em { font-style: italic; color: var(--gold); }
.fh-stat-label {
  font-size: 1rem;
  color: var(--anthracite);
  opacity: 0.7;
  line-height: 1.6;
}

/* Témoignages */
.fh-testimonials {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
}
.fh-testimonial {
  background: white;
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 24px;
  padding: 2.5rem;
  height: 100%;
  transition: all 0.3s ease;
  margin: 0;
}
.fh-testimonial:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(201, 169, 97, 0.1);
  border-color: var(--gold);
}
.fh-t-stars {
  color: var(--gold);
  margin-bottom: 1.2rem;
  display: flex;
  gap: 0.15rem;
  letter-spacing: 0.2em;
}
.fh-t-text {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--anthracite);
  margin: 0 0 1.8rem;
  font-style: italic;
}
.fh-t-author {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(201, 169, 97, 0.15);
}
.fh-t-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 1rem;
  flex-shrink: 0;
}
.fh-t-name { font-weight: 600; font-size: 0.95rem; color: var(--anthracite); }
.fh-t-role { font-size: 0.8rem; color: var(--anthracite); opacity: 0.6; }

/* ============================================ */
/* CTA FINAL                                    */
/* ============================================ */
.fh-cta {
  padding: 8rem 2rem;
  background: linear-gradient(135deg, #0f0f1c 0%, #1E293B 50%, #334155 100%);
  color: var(--cream);
  text-align: center;
  position: relative;
  overflow: hidden;
  scroll-margin-top: 5rem;
}
.fh-cta::before {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.15) 0%, transparent 70%);
  border-radius: 50%;
}
.fh-cta::after {
  content: '';
  position: absolute;
  top: -30%;
  right: -10%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.1) 0%, transparent 70%);
  border-radius: 50%;
}
.fh-cta-inner {
  max-width: 700px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
.fh-cta-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: white;
  color: var(--anthracite);
  padding: 0.7rem 1.5rem;
  border-radius: 50px;
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 1.1rem;
  margin-bottom: 2.5rem;
}
.fh-cta-logo-icon {
  width: 28px;
  height: 28px;
  background: var(--gold);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.9rem;
}
.fh-cta-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 600;
  margin: 0 0 1.5rem;
  line-height: 1.2;
}
.fh-cta-title em { font-style: italic; color: var(--gold); }
.fh-cta-sub {
  font-size: 1.1rem;
  opacity: 0.85;
  margin: 0 0 3rem;
  line-height: 1.7;
}
.fh-cta-trust {
  display: flex;
  gap: 2rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 2.5rem;
  font-size: 0.9rem;
  opacity: 0.75;
}
.fh-cta-trust span { display: flex; align-items: center; gap: 0.5rem; }
.fh-cta-trust svg { color: var(--gold-light); flex-shrink: 0; }

/* ============================================ */
/* FOOTER                                       */
/* ============================================ */
.fh-footer {
  background: var(--anthracite);
  color: var(--cream);
  padding: 5rem 2rem 2rem;
  margin-top: auto;
}
.fh-footer-inner { max-width: 1400px; margin: 0 auto; }
.fh-footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 3rem;
  margin-bottom: 4rem;
}
.fh-footer-brand .fh-nav-logo { color: var(--cream); margin-bottom: 1.2rem; }
.fh-footer-desc {
  font-size: 0.95rem;
  opacity: 0.75;
  line-height: 1.7;
  margin: 0 0 1.8rem;
}
.fh-footer-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(201, 169, 97, 0.1);
  border: 1px solid rgba(201, 169, 97, 0.2);
  padding: 0.6rem 1.2rem;
  border-radius: 50px;
  font-size: 0.85rem;
  color: var(--gold);
  font-weight: 500;
}
.fh-footer-title {
  font-size: 0.75rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 1.8rem;
  font-weight: 600;
}
.fh-footer-links { list-style: none; padding: 0; margin: 0; }
.fh-footer-links li { margin-bottom: 1rem; }
.fh-footer-links button {
  color: var(--cream);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.95rem;
  opacity: 0.75;
  transition: all 0.3s ease;
  text-align: left;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.fh-footer-links button:hover {
  opacity: 1;
  color: var(--gold);
  padding-left: 5px;
}
.fh-newsletter {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 20px;
  padding: 2rem;
  margin-top: 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.fh-newsletter-text { font-size: 0.9rem; }
.fh-newsletter-text strong {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 1rem;
}
.fh-newsletter-text span { opacity: 0.7; font-size: 0.9rem; }
.fh-newsletter-form {
  display: flex;
  gap: 0.6rem;
  flex: 1;
  max-width: 450px;
}
.fh-newsletter-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 50px;
  padding: 0.8rem 1.3rem;
  color: var(--cream);
  font-family: inherit;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.3s ease;
  min-width: 0;
}
.fh-newsletter-input:focus { border-color: var(--gold); }
.fh-newsletter-input::placeholder { color: rgba(245, 245, 240, 0.4); }
.fh-newsletter-btn {
  background: var(--gold);
  color: var(--anthracite);
  border: none;
  padding: 0.8rem 1.8rem;
  border-radius: 50px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  min-height: 44px;
  white-space: nowrap;
}
.fh-newsletter-btn:hover {
  background: var(--gold-light);
  transform: translateY(-2px);
}
.fh-footer-bottom {
  border-top: 1px solid rgba(201, 169, 97, 0.15);
  padding-top: 2.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.9rem;
  opacity: 0.65;
}
.fh-footer-denise {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--gold);
  opacity: 1;
  font-weight: 500;
}
.fh-footer-denise::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--gold);
  border-radius: 50%;
  animation: fh-pulse 2s infinite;
}

/* Toast */
.fh-toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--anthracite);
  color: var(--cream);
  padding: 1rem 2rem;
  border-radius: 50px;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  z-index: 1000;
  border: 1px solid rgba(201, 169, 97, 0.3);
  animation: fh-fadeInUp 0.4s ease;
  max-width: calc(100vw - 2rem);
}

/* Impression / capture pleine page — tout visible */
@media print {
  .fh-reveal { opacity: 1 !important; transform: none !important; }
  .fh-nav { position: static; }
}

/* ============================================ */
/* RESPONSIVE                                   */
/* ============================================ */
@media (max-width: 1200px) {
  .fh-float-1 { right: 0; }
  .fh-float-2 { left: 0; }
}
@media (max-width: 1024px) {
  .fh-hero-grid { grid-template-columns: 1fr; gap: 3rem; }
  .fh-denise-grid { grid-template-columns: 1fr; gap: 3rem; }
  .fh-footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
  .fh-nav-links { display: none; }
  .fh-nav-login { display: none; }
  .fh-hero { padding: 8rem 1.5rem 4rem; }
  .fh-float { display: none; }
  .fh-footer-grid { grid-template-columns: 1fr; }
  .fh-newsletter { flex-direction: column; align-items: stretch; }
  .fh-newsletter-form { max-width: 100%; }
}
@media (max-width: 640px) {
  .fh-sectors, .fh-denise, .fh-proof, .fh-cta { padding-left: 1.25rem; padding-right: 1.25rem; }
  .fh-sectors, .fh-denise, .fh-proof { padding-top: 4rem; padding-bottom: 4rem; }
  .fh-cta { padding-top: 5rem; padding-bottom: 5rem; }
  .fh-hero-ctas { flex-direction: column; align-items: stretch; }
  .fh-btn-primary, .fh-btn-secondary { justify-content: center; }
  .fh-denise-visual { padding: 1.5rem; }
  .fh-testimonial { padding: 1.5rem; }
  .fh-sector-card { padding: 1.7rem; }
}
`

// ------------------------------------------------------------
// Données locales
// ------------------------------------------------------------

/**
 * Les 6 secteurs. Le Salon VIP est "featured" (carte sombre + badge
 * Premium) conformément à la maquette. Les secteurs sans page dédiée
 * (Salon VIP, Compagnies Aériennes) renvoient vers la demande de démo.
 */
const SECTORS: {
  key: NavTarget
  icon: string
  title: string
  desc: string
  featured?: boolean
}[] = [
  {
    key: "contact",
    icon: "🥂",
    title: "Salon VIP",
    desc: "Expérience luxe, Nathalie guide personnel, douches smart, conciergerie digitale, discrétion absolue.",
    featured: true,
  },
  {
    key: "aeroport",
    icon: "✈️",
    title: "Aéroports",
    desc: "Sécurité, flux, réactivité ops. Wallboard signalétique, Denise tour de contrôle, radar prédiction.",
  },
  {
    key: "contact",
    icon: "🛫",
    title: "Compagnies Aériennes",
    desc: "Escale, check-in, litiges bagages, portes attitrées. Soutien terrain pour vos équipes au sol.",
  },
  {
    key: "hotel",
    icon: "🏨",
    title: "Hôtellerie",
    desc: "Expérience guest, housekeeping, conciergerie digitale, upselling chambres et services.",
  },
  {
    key: "restaurant",
    icon: "🍽️",
    title: "Restauration",
    desc: "Service fluide, avis maîtrisés, réactivité en salle, gestion des pics d'affluence.",
  },
  {
    key: "erp",
    icon: "🏛️",
    title: "Établissements Publics",
    desc: "Accueil usagers, maintenance, signalétique terrain, gares, mairies, hôpitaux.",
  },
]

const TESTIMONIALS = [
  {
    initials: "ML",
    name: "Marie Laurent",
    role: "Directrice · Salon VIP AIBD",
    text: "En 3 mois, notre temps de résolution d'incidents est passé de 18 à 7 minutes. Nathalie a transformé l'expérience de nos clients VIP.",
  },
  {
    initials: "JD",
    name: "Jean Diallo",
    role: "Manager · Hôtel Le Teranga",
    text: "Nous capturons enfin les problèmes avant qu'ils ne deviennent des avis négatifs. Denise est devenue indispensable pour nos équipes terrain.",
  },
  {
    initials: "AS",
    name: "Aminata Sow",
    role: "Directrice · Restaurant Le Bristol",
    text: "L'intégration a pris 5 minutes. En une semaine, nous avions déjà 200 retours clients actionnables et un ROI immédiat.",
  },
]

/** Services affichés dans la preview Nathalie (maquette). */
const NATHALIE_SERVICES = [
  { icon: "🍸", label: "Gastronomie" },
  { icon: "🚿", label: "Douches" },
  { icon: "🛎️", label: "Conciergerie" },
  { icon: "✨", label: "Signaler" },
]

// ------------------------------------------------------------
// Composant
// ------------------------------------------------------------

export function LandingAccueilPremium({
  navigate,
  onLogin,
}: {
  navigate: (p: NavTarget) => void
  onLogin: () => void
}) {
  const [scrolled, setScrolled] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [wifiCopied, setWifiCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wifiTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ombre de la nav au scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Reveals (cartes secteurs, stats, témoignages) via IntersectionObserver.
  // Filet de sécurité : après 2,5 s tout est révélé quoi qu'il arrive
  // (impression, crawlers, captures pleine page, IO improbable).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>(".fh-reveal"))
    const revealAll = () => els.forEach((el) => el.classList.add("fh-visible"))
    if (typeof IntersectionObserver === "undefined") {
      revealAll()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("fh-visible")
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    )
    els.forEach((el) => io.observe(el))
    const fallback = setTimeout(revealAll, 2500)
    return () => {
      io.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  // Cleanup des timers (toast + feedback copie Wi-Fi)
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (wifiTimer.current) clearTimeout(wifiTimer.current)
    }
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const scrollToId = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" })

  // Copie du Wi-Fi affiché dans la preview Nathalie (aperçu marketing).
  // Feedback visible : le bouton passe en "✓ Copié !" (fond sauge) 2 s,
  // plus un toast de confirmation.
  const copyWifi = async () => {
    const value = "SalonVIP-Guest"
    let ok = false
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(value)
        ok = true
      }
    } catch {
      ok = false
    }
    if (ok) {
      setWifiCopied(true)
      showToast("Wi-Fi du Salon copié !")
      if (wifiTimer.current) clearTimeout(wifiTimer.current)
      wifiTimer.current = setTimeout(() => setWifiCopied(false), 2000)
    } else {
      showToast("Copie indisponible sur ce navigateur")
    }
  }

  const onNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setEmail("")
    showToast("Merci pour votre inscription !")
  }

  return (
    <div className="fh-root" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: FH_CSS }} />

      {/* ==================== NAVIGATION ==================== */}
      <nav className={`fh-nav ${scrolled ? "fh-scrolled" : ""}`} aria-label="Navigation principale">
        <div className="fh-nav-container">
          <button className="fh-nav-logo" onClick={scrollTop} aria-label="FeedVoice — Retour en haut">
            <span className="fh-nav-logo-icon" aria-hidden>&#10022;</span>
            FeedVoice
          </button>
          <div className="fh-nav-links">
            <button className="fh-nav-link" onClick={() => scrollToId("fh-secteurs")}>Secteurs</button>
            <button className="fh-nav-link" onClick={() => scrollToId("fh-denise")}>Denise</button>
            <button className="fh-nav-link" onClick={() => scrollToId("fh-preuves")}>Résultats</button>
            <button className="fh-nav-link" onClick={() => navigate("contact")}>Contact</button>
          </div>
          <div className="fh-nav-right">
            <button className="fh-nav-login" onClick={onLogin}>Se connecter</button>
            <button className="fh-nav-cta" onClick={() => navigate("contact")}>
              Demander une démo
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      </nav>

      {/* ==================== HERO — FOCUS SALON VIP ==================== */}
      <section className="fh-hero">
        <div className="fh-hero-grid">
          <div className="fh-hero-content">
            <div className="fh-hero-badge">
              <span className="fh-hero-badge-dot" aria-hidden />
              Nouveau : Nathalie, votre guide personnel VIP
            </div>

            <h1 className="fh-hero-title">
              L&apos;Excellence Opérationnelle
              <br />
              pour vos <em>Établissements</em>
            </h1>

            <p className="fh-hero-subtitle">
              Du salon VIP à l&apos;aéroport, de l&apos;hôtel au restaurant,
              transformez chaque interaction client en donnée actionnable.
              Piloté par Denise et Nathalie, vos assistantes intelligentes
              temps réel.
            </p>

            <div className="fh-hero-ctas">
              <button className="fh-btn-primary" onClick={() => navigate("contact")}>
                Demander une démo personnalisée
                <ArrowRight size={18} aria-hidden />
              </button>
              <button className="fh-btn-secondary" onClick={() => scrollToId("fh-secteurs")}>
                Découvrir la plateforme
              </button>
            </div>

            <div className="fh-hero-trust">
              <span>
                <Star size={14} fill="currentColor" aria-hidden />
                4.9/5 — Satisfaction clients
              </span>
              <span>
                <Check size={14} aria-hidden />
                Setup en 5 minutes
              </span>
              <span>
                <Check size={14} aria-hidden />
                Sans carte bancaire
              </span>
            </div>
          </div>

          {/* Preview Nathalie — interface Wi-Fi + services + bulles */}
          <div className="fh-hero-visual">
            <div className="fh-nathalie">
              <div className="fh-nathalie-header">
                <img
                  src="/hero-premium.png"
                  alt=""
                  aria-hidden
                  className="fh-nathalie-header-img"
                  loading="eager"
                />
                <div className="fh-nathalie-header-content">
                  <div className="fh-nathalie-logo" aria-hidden>🥂</div>
                  <h3>Bonsoir, Cher Hôte.</h3>
                  <p>Je suis Nathalie.</p>
                </div>
              </div>

              <div className="fh-nathalie-body">
                <div className="fh-nathalie-wifi">
                  <div className="fh-nathalie-wifi-left">
                    <span className="fh-nathalie-wifi-icon" aria-hidden>📶</span>
                    <div className="fh-nathalie-wifi-text">
                      <strong>Wi-Fi du Salon</strong>
                      <span>SalonVIP-Guest</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`fh-nathalie-copy-btn ${wifiCopied ? "fh-copied" : ""}`}
                    onClick={copyWifi}
                    aria-label="Copier le nom du réseau Wi-Fi du salon"
                  >
                    {wifiCopied ? "✓ Copié !" : "Copier"}
                  </button>
                </div>

                <div className="fh-nathalie-services">
                  {NATHALIE_SERVICES.map((s) => (
                    <div className="fh-nathalie-service" key={s.label}>
                      <span className="fh-nathalie-service-icon" aria-hidden>{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="fh-float fh-float-1">
              <span className="fh-float-icon fh-gold" aria-hidden>
                <BellRing size={18} />
              </span>
              <div>
                <div className="fh-float-text">Denise alerte l&apos;équipe</div>
                <div className="fh-float-sub">Zone sanitaire · Priorité haute</div>
              </div>
            </div>

            <div className="fh-float fh-float-2">
              <span className="fh-float-icon fh-green" aria-hidden>
                <Check size={18} />
              </span>
              <div>
                <div className="fh-float-text">Incident résolu</div>
                <div className="fh-float-sub">Table T-01 · Il y a 2 min</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SECTEURS ==================== */}
      <section className="fh-sectors" id="fh-secteurs">
        <div className="fh-container">
          <div className="fh-label">Un moteur, tous vos terrains</div>
          <h2 className="fh-title">
            Une seule plateforme. <em>Tous vos terrains.</em>
          </h2>
          <p className="fh-subtitle">
            Le même moteur d&apos;intelligence terrain s&apos;adapte aux
            spécificités de chaque environnement, du salon VIP à
            l&apos;établissement public.
          </p>

          <div className="fh-sectors-grid">
            {SECTORS.map((sector) => (
              <div className="fh-reveal" key={sector.title}>
                <button
                  className={`fh-sector-card ${sector.featured ? "fh-featured" : ""}`}
                  onClick={() => navigate(sector.key)}
                  aria-label={`Découvrir le secteur ${sector.title}`}
                >
                  {sector.featured && <span className="fh-sector-badge">Premium</span>}
                  <span className="fh-sector-icon" aria-hidden>{sector.icon}</span>
                  <h3 className="fh-sector-title">{sector.title}</h3>
                  <p className="fh-sector-desc">{sector.desc}</p>
                  <span className="fh-sector-link">
                    Découvrir
                    <ArrowRight size={16} aria-hidden />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== DENISE ==================== */}
      <section className="fh-denise" id="fh-denise">
        <div className="fh-denise-grid">
          <div className="fh-denise-content">
            <div className="fh-label">La technologie</div>
            <h2 className="fh-denise-title">
              Denise ne dort jamais.
              <br />
              <em>Elle alerte, elle guide, elle centralise.</em>
            </h2>
            <p className="fh-denise-desc">
              Pendant que vos équipes travaillent les mains occupées, Denise
              veille. Chaque signalement est analysé, priorisé et annoncé
              vocalement. Pas d&apos;écran à regarder — juste une voix qui
              guide, adaptée à chaque environnement.
            </p>
            <div className="fh-denise-features">
              <div className="fh-denise-feature">
                <span className="fh-denise-check" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                100% vocal · mains libres
              </div>
              <div className="fh-denise-feature">
                <span className="fh-denise-check" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                Ton adaptatif par urgence et secteur
              </div>
              <div className="fh-denise-feature">
                <span className="fh-denise-check" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                Agrégation intelligente anti-spam
              </div>
              <div className="fh-denise-feature">
                <span className="fh-denise-check" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
                Mode discrétion pour salons VIP
              </div>
            </div>
            <button className="fh-btn-primary" onClick={() => navigate("contact")}>
              Voir Denise en action
              <ArrowRight size={18} aria-hidden />
            </button>
          </div>

          <div className="fh-denise-visual">
            <div className="fh-denise-header">
              <div className="fh-denise-avatar" aria-hidden>🎙️</div>
              <div>
                <div className="fh-denise-name">Denise</div>
                <div className="fh-denise-status">
                  <span className="fh-status-dot" aria-hidden />
                  Écoute active · Salon VIP Terra
                </div>
              </div>
            </div>

            <div className="fh-denise-msglabel">Annonce de Denise</div>
            <div className="fh-denise-message">
              « Point d&apos;attention : Buffet niveau bas à 35%.
              Rafraîchissement recommandé. Table T-08 signale bruit excessif,
              intervention discrète en cours. »
            </div>

            <div className="fh-denise-meta">
              <span>
                <Clock size={13} aria-hidden />
                14:32:08
              </span>
              <span>
                <MapPin size={13} aria-hidden />
                Salon VIP
              </span>
              <span>
                <Target size={13} aria-hidden />
                Mode discret
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PREUVE ==================== */}
      <section className="fh-proof" id="fh-preuves">
        <div className="fh-container">
          <div className="fh-label">La preuve</div>
          <h2 className="fh-title">
            Le signal capté <em>au moment où il sert.</em>
          </h2>
          <p className="fh-subtitle">
            FeedVoice mesure ce que les autres outils ignorent. Les
            indicateurs qui transforment une opération moyenne en opération
            excellente.
          </p>

          <div className="fh-stats-grid">
            <div className="fh-reveal">
              <div className="fh-stat-card">
                <div className="fh-stat-icon" aria-hidden>
                  <Eye size={24} />
                </div>
                <div className="fh-stat-value">
                  15<em>%</em>
                </div>
                <div className="fh-stat-label">
                  d&apos;incidents invisibles
                  <br />
                  sans FeedVoice
                </div>
              </div>
            </div>

            <div className="fh-reveal">
              <div className="fh-stat-card">
                <div className="fh-stat-icon" aria-hidden>
                  <Zap size={24} />
                </div>
                <div className="fh-stat-value">
                  ÷<em>2</em>
                </div>
                <div className="fh-stat-label">
                  temps de résolution
                  <br />
                  grâce aux alertes temps réel
                </div>
              </div>
            </div>

            <div className="fh-reveal">
              <div className="fh-stat-card">
                <div className="fh-stat-icon" aria-hidden>
                  <Trophy size={24} />
                </div>
                <div className="fh-stat-value">
                  4<em>x</em>
                </div>
                <div className="fh-stat-label">
                  plus de feedbacks collectés
                  <br />
                  vs. enquêtes post-visite
                </div>
              </div>
            </div>
          </div>

          <div className="fh-testimonials">
            {TESTIMONIALS.map((t) => (
              <div className="fh-reveal" key={t.initials}>
                <figure className="fh-testimonial">
                  <div className="fh-t-stars" aria-label="5 étoiles sur 5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} size={16} fill="currentColor" aria-hidden />
                    ))}
                  </div>
                  <blockquote className="fh-t-text">
                    « {t.text} »
                  </blockquote>
                  <figcaption className="fh-t-author">
                    <div className="fh-t-avatar" aria-hidden>{t.initials}</div>
                    <div>
                      <div className="fh-t-name">{t.name}</div>
                      <div className="fh-t-role">{t.role}</div>
                    </div>
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CTA FINAL ==================== */}
      <section className="fh-cta" id="fh-demo">
        <div className="fh-cta-inner">
          <div className="fh-cta-logo">
            <span className="fh-cta-logo-icon" aria-hidden>&#10022;</span>
            FeedVoice
          </div>
          <h2 className="fh-cta-title">
            Prêt à transformer vos interactions
            <br />
            en <em>données actionnables</em> ?
          </h2>
          <p className="fh-cta-sub">
            Configuration adaptée à votre secteur en 24h. Démo personnalisée
            avec votre équipe.
          </p>
          <button className="fh-btn-primary" onClick={() => navigate("contact")}>
            Demander une démo personnalisée
            <ArrowRight size={18} aria-hidden />
          </button>
          <div className="fh-cta-trust">
            <span>
              <Check size={14} aria-hidden />
              Sans carte bancaire
            </span>
            <span>
              <Check size={14} aria-hidden />
              Setup en 5 min
            </span>
            <span>
              <Check size={14} aria-hidden />
              Annulable à tout moment
            </span>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="fh-footer">
        <div className="fh-footer-inner">
          <div className="fh-footer-grid">
            <div className="fh-footer-brand">
              <button className="fh-nav-logo" onClick={scrollTop} aria-label="FeedVoice — Retour en haut">
                <span className="fh-nav-logo-icon" aria-hidden>&#10022;</span>
                FeedVoice
              </button>
              <p className="fh-footer-desc">
                L&apos;excellence opérationnelle pour vos établissements.
                Piloté par Denise et Nathalie, vos assistantes intelligentes
                temps réel.
              </p>
              <div className="fh-footer-badge">
                <span className="fh-status-dot" aria-hidden />
                Denise veille · 24/7
              </div>
            </div>

            <div>
              <div className="fh-footer-title">Secteurs</div>
              <ul className="fh-footer-links">
                <li><button onClick={() => navigate("contact")}>Salon VIP</button></li>
                <li><button onClick={() => navigate("aeroport")}>Aéroport</button></li>
                <li><button onClick={() => navigate("contact")}>Compagnie Aérienne</button></li>
                <li><button onClick={() => navigate("hotel")}>Hôtel</button></li>
                <li><button onClick={() => navigate("restaurant")}>Restaurant</button></li>
                <li><button onClick={() => navigate("erp")}>Établissements publics</button></li>
              </ul>
            </div>

            <div>
              <div className="fh-footer-title">Société</div>
              <ul className="fh-footer-links">
                <li><button onClick={scrollTop}>Accueil</button></li>
                <li><button onClick={() => navigate("apropos")}>À propos</button></li>
                <li><button onClick={() => navigate("apropos")}>Équipe</button></li>
                <li><button onClick={() => navigate("contact")}>Contact</button></li>
                <li><button onClick={onLogin}>Se connecter</button></li>
              </ul>
            </div>

            <div>
              <div className="fh-footer-title">Légal</div>
              <ul className="fh-footer-links">
                <li><button onClick={() => navigate("contact")}>CGU</button></li>
                <li><button onClick={() => navigate("contact")}>Confidentialité</button></li>
                <li><button onClick={() => navigate("contact")}>RGPD</button></li>
                <li><button onClick={() => navigate("contact")}>Cookies</button></li>
              </ul>
            </div>
          </div>

          <div className="fh-newsletter">
            <div className="fh-newsletter-text">
              <strong>Restez informé des nouveautés FeedVoice</strong>
              <span>Une lettre mensuelle. Pas de spam. Désinscription en un clic.</span>
            </div>
            <form className="fh-newsletter-form" onSubmit={onNewsletterSubmit}>
              <input
                type="email"
                className="fh-newsletter-input"
                placeholder="vous@etablissement.com"
                aria-label="Adresse e-mail pour la newsletter"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className="fh-newsletter-btn">S&apos;abonner</button>
            </form>
          </div>

          <div className="fh-footer-bottom">
            <div>© {new Date().getFullYear()} FeedVoice. Tous droits réservés.</div>
            <div className="fh-footer-denise">Piloté par Denise</div>
          </div>
        </div>
      </footer>

      {/* ==================== TOAST ==================== */}
      {toast && (
        <div className="fh-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
