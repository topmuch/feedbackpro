"use client"

// ============================================================
// FeedbackPro — Landing "Accueil Premium B2B" (refonte complète)
// ------------------------------------------------------------
// Design unifié crème #FAFAF7 + or #C9A961 + anthracite #1A1A1A.
// Typographie : Playfair Display (titres, italique doré pour les
// accents) + Inter (corps). Playfair/Inter sont chargées globalement
// dans src/app/layout.tsx (link runtime, jamais au build).
//
// Sections (ordre) :
//   1. NAV fixe verre crème (scrolled -> ombre), CTA démo
//   2. HERO : badge "Nouveau Denise", titre serif avec
//      "Établissements" en italique doré, 2 CTA, trust row,
//      photo épurée + 3 bulles flottantes lisibles (animées)
//   3. SECTEURS : 6 cartes unifiées (crème + bordure dorée +
//      barre latérale dorée animée au hover) -> pages secteur
//   4. DENISE : message commercial + visualisation Denise
//      (avatar, statut "Écoute active", annonce, méta)
//   5. PREUVES : 3 stats avec libellés explicites + icônes
//      + hover, puis 3 témoignages (avatars, noms, rôles, étoiles)
//   6. CTA FINAL : dégradé bleu profond + halos dorés subtils
//   7. FOOTER : newsletter + badge "Denise veille 24/7"
//      + "Piloté par Denise"
//
// Interactions : nav scrolled (scrollY > 50), smooth scroll vers
// les ancres, reveals IntersectionObserver (cartes/témoignages),
// toast newsletter. Toutes les classes CSS sont préfixées `fh-`
// pour éviter toute fuite vers le reste de l'app.
// ============================================================

import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  BellRing,
  Check,
  Clock,
  Eye,
  HeartPulse,
  Hotel,
  Landmark,
  MapPin,
  Mic,
  Plane,
  Star,
  Target,
  TrainFront,
  Trophy,
  Utensils,
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
  --gold: #C9A961;
  --gold-light: #E5D4A8;
  --gold-deep: #A8893F;
  --anthracite: #1A1A1A;
  --anthracite-soft: #2C2C2C;
  --cream: #FAFAF7;
  --cream-dark: #F0EDE5;
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
  max-width: 1280px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.fh-nav-logo {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--anthracite);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.fh-nav-logo-icon {
  width: 32px;
  height: 32px;
  background: var(--gold);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1rem;
  flex-shrink: 0;
}
.fh-nav-links { display: flex; gap: 2rem; align-items: center; }
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
}
.fh-nav-link:hover { color: var(--gold); }
.fh-nav-link::after {
  content: '';
  position: absolute;
  bottom: -4px;
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
}
.fh-nav-login:hover { opacity: 1; color: var(--gold); }
.fh-nav-cta {
  background: var(--anthracite);
  color: var(--cream);
  padding: 0.7rem 1.5rem;
  border-radius: 50px;
  border: none;
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
  color: var(--anthracite);
  transform: translateY(-2px);
}

/* ============================================ */
/* HERO                                         */
/* ============================================ */
.fh-hero {
  padding: 9rem 2rem 6rem;
  max-width: 1280px;
  margin: 0 auto;
  text-align: center;
  position: relative;
}
.fh-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(201, 169, 97, 0.1);
  border: 1px solid rgba(201, 169, 97, 0.3);
  padding: 0.5rem 1.2rem;
  border-radius: 50px;
  font-size: 0.8rem;
  font-weight: 500;
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
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.fh-hero-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 600;
  line-height: 1.1;
  color: var(--anthracite);
  margin: 0 auto 1.5rem;
  letter-spacing: -0.02em;
  max-width: 900px;
  animation: fh-fadeInUp 0.8s ease 0.2s both;
}
.fh-hero-title em { font-style: italic; color: var(--gold); }
.fh-hero-subtitle {
  font-size: clamp(1rem, 2vw, 1.2rem);
  color: var(--anthracite);
  opacity: 0.7;
  max-width: 600px;
  margin: 0 auto 2.5rem;
  line-height: 1.6;
  animation: fh-fadeInUp 0.8s ease 0.4s both;
}
.fh-hero-ctas {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 3rem;
  animation: fh-fadeInUp 0.8s ease 0.6s both;
}
.fh-btn-primary {
  background: var(--gold);
  color: var(--anthracite);
  padding: 1rem 2rem;
  border-radius: 50px;
  border: 2px solid var(--gold);
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  min-height: 44px;
}
.fh-btn-primary:hover {
  background: var(--gold-deep);
  border-color: var(--gold-deep);
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(201, 169, 97, 0.3);
}
.fh-btn-secondary {
  background: transparent;
  color: var(--anthracite);
  padding: 1rem 2rem;
  border-radius: 50px;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 2px solid rgba(26, 26, 26, 0.2);
  cursor: pointer;
  min-height: 44px;
}
.fh-btn-secondary:hover {
  border-color: var(--anthracite);
  background: var(--anthracite);
  color: var(--cream);
}
.fh-hero-trust {
  display: flex;
  gap: 2rem;
  justify-content: center;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--anthracite);
  opacity: 0.6;
  animation: fh-fadeInUp 0.8s ease 0.8s both;
}
.fh-hero-trust span { display: flex; align-items: center; gap: 0.4rem; }
.fh-hero-trust svg { color: var(--gold); flex-shrink: 0; }

.fh-hero-image {
  margin-top: 4rem;
  position: relative;
  animation: fh-fadeInUp 1s ease 1s both;
}
.fh-hero-image-main {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0,0,0,0.15);
  position: relative;
}
.fh-hero-image-main img {
  width: 100%;
  height: 500px;
  object-fit: cover;
  display: block;
}
.fh-hero-image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(26,26,26,0.2) 0%, rgba(26,26,26,0.6) 100%);
}
.fh-bubble {
  position: absolute;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 1rem 1.2rem;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.8rem;
  animation: fh-float 3s ease-in-out infinite;
  text-align: left;
}
.fh-bubble-1 { top: 15%; left: -4%; animation-delay: 0s; }
.fh-bubble-2 { top: 25%; right: -4%; animation-delay: 1s; }
.fh-bubble-3 { bottom: 20%; left: 8%; animation-delay: 2s; }
@keyframes fh-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes fh-fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fh-fadeInDown {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}
.fh-bubble-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.fh-bubble-icon.fh-green { background: rgba(74, 124, 89, 0.15); color: #4A7C59; }
.fh-bubble-icon.fh-gold { background: rgba(201, 169, 97, 0.18); color: var(--gold-deep); }
.fh-bubble-icon.fh-slate { background: rgba(51, 65, 85, 0.1); color: #334155; }
.fh-bubble-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--anthracite);
  line-height: 1.3;
}
.fh-bubble-sub {
  font-size: 0.75rem;
  color: var(--anthracite);
  opacity: 0.6;
  font-weight: 400;
}

/* ============================================ */
/* SECTEURS                                     */
/* ============================================ */
.fh-sectors { padding: 6rem 2rem; background: white; scroll-margin-top: 5rem; }
.fh-container { max-width: 1280px; margin: 0 auto; }
.fh-label {
  font-size: 0.75rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--gold);
  text-align: center;
  margin-bottom: 1rem;
  font-weight: 600;
}
.fh-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  text-align: center;
  color: var(--anthracite);
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
}
.fh-subtitle {
  text-align: center;
  color: var(--anthracite);
  opacity: 0.6;
  max-width: 600px;
  margin: 0 auto 4rem;
  line-height: 1.6;
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
  padding: 2rem;
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
  background: var(--gold);
  transition: height 0.4s ease;
}
.fh-sector-card:hover {
  transform: translateY(-5px);
  border-color: var(--gold);
  box-shadow: 0 20px 40px rgba(201, 169, 97, 0.15);
}
.fh-sector-card:hover::before { height: 100%; }
.fh-sector-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(201, 169, 97, 0.15) 0%, rgba(201, 169, 97, 0.05) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gold-deep);
  margin-bottom: 1.5rem;
}
.fh-sector-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: var(--anthracite);
}
.fh-sector-desc {
  font-size: 0.9rem;
  color: var(--anthracite);
  opacity: 0.7;
  margin: 0 0 1.5rem;
  line-height: 1.5;
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
  padding: 6rem 2rem;
  background: var(--anthracite);
  color: var(--cream);
  position: relative;
  overflow: hidden;
  scroll-margin-top: 5rem;
}
.fh-denise::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.1) 0%, transparent 70%);
  border-radius: 50%;
}
.fh-denise-grid {
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
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
  line-height: 1.7;
  opacity: 0.8;
  margin: 0 0 2rem;
}
.fh-denise-features {
  display: flex;
  gap: 2rem;
  margin: 0 0 2rem;
  flex-wrap: wrap;
}
.fh-denise-feature {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
  font-weight: 500;
}
.fh-denise-dot {
  width: 8px;
  height: 8px;
  background: var(--gold);
  border-radius: 50%;
  flex-shrink: 0;
}
.fh-denise-visual {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 20px;
  padding: 2rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.fh-denise-header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(201, 169, 97, 0.15);
}
.fh-denise-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--gold);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--anthracite);
  flex-shrink: 0;
}
.fh-denise-name {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.1rem;
  font-weight: 600;
}
.fh-denise-status {
  font-size: 0.75rem;
  opacity: 0.6;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.fh-status-dot {
  width: 6px;
  height: 6px;
  background: #4A7C59;
  border-radius: 50%;
  animation: fh-pulse 2s infinite;
  flex-shrink: 0;
}
.fh-denise-msglabel {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 0.5rem;
  font-weight: 600;
}
.fh-denise-message {
  background: rgba(201, 169, 97, 0.1);
  border-left: 3px solid var(--gold);
  padding: 1.2rem;
  border-radius: 0 12px 12px 0;
  font-style: italic;
  line-height: 1.6;
  margin: 0 0 1rem;
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
.fh-proof { padding: 6rem 2rem; background: var(--cream); scroll-margin-top: 5rem; }
.fh-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  margin-bottom: 4rem;
}
.fh-stat-card {
  background: white;
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 20px;
  padding: 2.5rem 2rem;
  text-align: center;
  transition: all 0.3s ease;
  height: 100%;
}
.fh-stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(201, 169, 97, 0.1);
  border-color: var(--gold);
}
.fh-stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(201, 169, 97, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gold-deep);
  margin: 0 auto 1.5rem;
}
.fh-stat-value {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 3.5rem;
  font-weight: 700;
  color: var(--anthracite);
  line-height: 1;
  margin-bottom: 0.8rem;
}
.fh-stat-label {
  font-size: 0.95rem;
  color: var(--anthracite);
  opacity: 0.7;
  line-height: 1.5;
}

/* Témoignages */
.fh-testimonials {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 4rem;
}
.fh-testimonial {
  background: white;
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 20px;
  padding: 2rem;
  height: 100%;
}
.fh-t-stars {
  color: var(--gold);
  margin-bottom: 1rem;
  display: flex;
  gap: 0.15rem;
}
.fh-t-text {
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--anthracite);
  margin: 0 0 1.5rem;
  font-style: italic;
}
.fh-t-author { display: flex; align-items: center; gap: 1rem; }
.fh-t-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%);
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
  padding: 6rem 2rem;
  background: linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%);
  color: var(--cream);
  text-align: center;
  position: relative;
  overflow: hidden;
}
.fh-cta::before {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.15) 0%, transparent 70%);
  border-radius: 50%;
}
.fh-cta::after {
  content: '';
  position: absolute;
  top: -30%;
  right: -10%;
  width: 500px;
  height: 500px;
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
  display: inline-block;
  background: white;
  color: var(--anthracite);
  padding: 0.6rem 1.5rem;
  border-radius: 50px;
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 1.1rem;
  margin-bottom: 2rem;
}
.fh-cta-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 600;
  margin: 0 0 1.5rem;
  line-height: 1.2;
}
.fh-cta-sub {
  font-size: 1.05rem;
  opacity: 0.8;
  margin: 0 0 2.5rem;
  line-height: 1.6;
}
.fh-cta-trust {
  display: flex;
  gap: 2rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 2rem;
  font-size: 0.85rem;
  opacity: 0.7;
}
.fh-cta-trust span { display: flex; align-items: center; gap: 0.4rem; }

/* ============================================ */
/* FOOTER                                       */
/* ============================================ */
.fh-footer {
  background: var(--anthracite);
  color: var(--cream);
  padding: 4rem 2rem 2rem;
}
.fh-footer-inner { max-width: 1280px; margin: 0 auto; }
.fh-footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 3rem;
  margin-bottom: 3rem;
}
.fh-footer-brand .fh-nav-logo { color: var(--cream); margin-bottom: 1rem; }
.fh-footer-desc {
  font-size: 0.9rem;
  opacity: 0.7;
  line-height: 1.6;
  margin: 0 0 1.5rem;
}
.fh-footer-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(201, 169, 97, 0.1);
  border: 1px solid rgba(201, 169, 97, 0.2);
  padding: 0.5rem 1rem;
  border-radius: 50px;
  font-size: 0.8rem;
  color: var(--gold);
}
.fh-footer-title {
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 1.5rem;
  font-weight: 600;
}
.fh-footer-links { list-style: none; padding: 0; margin: 0; }
.fh-footer-links li { margin-bottom: 0.8rem; }
.fh-footer-links button {
  color: var(--cream);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.9rem;
  opacity: 0.7;
  transition: all 0.3s ease;
  text-align: left;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.fh-footer-links button:hover { opacity: 1; color: var(--gold); }
.fh-newsletter {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 16px;
  padding: 1.5rem;
  margin-top: 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}
.fh-newsletter-text { font-size: 0.9rem; }
.fh-newsletter-text strong { display: block; margin-bottom: 0.3rem; }
.fh-newsletter-text span { opacity: 0.7; font-size: 0.85rem; }
.fh-newsletter-form {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  max-width: 400px;
  min-width: 260px;
}
.fh-newsletter-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(201, 169, 97, 0.2);
  border-radius: 50px;
  padding: 0.7rem 1.2rem;
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
  padding: 0.7rem 1.5rem;
  border-radius: 50px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  min-height: 44px;
}
.fh-newsletter-btn:hover { background: var(--gold-light); }
.fh-footer-bottom {
  border-top: 1px solid rgba(201, 169, 97, 0.15);
  padding-top: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.85rem;
  opacity: 0.6;
}
.fh-footer-denise {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--gold);
  opacity: 1;
}
.fh-footer-denise::before {
  content: '';
  width: 6px;
  height: 6px;
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
@media (max-width: 968px) {
  .fh-denise-grid { grid-template-columns: 1fr; gap: 3rem; }
  .fh-footer-grid { grid-template-columns: 1fr 1fr; }
  .fh-nav-links { display: none; }
  .fh-nav-login { display: none; }
}
@media (max-width: 640px) {
  .fh-footer-grid { grid-template-columns: 1fr; }
  .fh-newsletter { flex-direction: column; align-items: stretch; }
  .fh-newsletter-form { max-width: 100%; }
  .fh-bubble { display: none; }
  .fh-hero { padding: 8rem 1.25rem 4rem; }
  .fh-hero-image-main img { height: 320px; }
  .fh-sectors, .fh-denise, .fh-proof, .fh-cta { padding-left: 1.25rem; padding-right: 1.25rem; }
  .fh-sectors, .fh-denise, .fh-proof { padding-top: 4rem; padding-bottom: 4rem; }
  .fh-hero-ctas { flex-direction: column; align-items: stretch; }
  .fh-btn-primary, .fh-btn-secondary { justify-content: center; }
  .fh-denise-visual { padding: 1.5rem; }
}
`

// ------------------------------------------------------------
// Données locales
// ------------------------------------------------------------

const SECTORS: {
  key: NavTarget
  icon: typeof Utensils
  title: string
  desc: string
}[] = [
  { key: "restaurant", icon: Utensils, title: "Restauration", desc: "Service fluide, avis maîtrisés, réactivité en salle." },
  { key: "aeroport", icon: Plane, title: "Aéroports", desc: "Sécurité, flux, réactivité ops. Pilotage temps réel." },
  { key: "hotel", icon: Hotel, title: "Hôtellerie", desc: "Expérience guest, housekeeping, conciergerie digitale." },
  { key: "gare", icon: TrainFront, title: "Gares", desc: "Embarquement, information voyageur, flux piétons." },
  { key: "hopital", icon: HeartPulse, title: "Santé", desc: "Hygiène, flux patients, équipements, satisfaction." },
  { key: "erp", icon: Landmark, title: "Établissements Publics", desc: "Accueil usagers, maintenance, signalétique terrain." },
]

const TESTIMONIALS = [
  {
    initials: "ML",
    name: "Marie Laurent",
    role: "Directrice · Hôtel Le Bristol",
    text: "En 3 mois, notre temps de résolution d'incidents est passé de 18 à 7 minutes. Denise a changé notre façon de travailler.",
  },
  {
    initials: "JD",
    name: "Jean Diallo",
    role: "Manager · Salon VIP AIBD",
    text: "Nous captions enfin les problèmes avant qu'ils ne deviennent des avis négatifs. C'est un game-changer pour notre réputation.",
  },
  {
    initials: "AS",
    name: "Aminata Sow",
    role: "Directrice · Restaurant Le Teranga",
    text: "L'intégration a pris 5 minutes. En une semaine, nous avions déjà 200 retours clients actionnables.",
  },
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
  const rootRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Cleanup du timer de toast
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
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
          <button className="fh-nav-logo" onClick={scrollTop} aria-label="FeedbackPro — Retour en haut">
            <span className="fh-nav-logo-icon" aria-hidden>&#10022;</span>
            FeedbackPro
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

      {/* ==================== HERO ==================== */}
      <section className="fh-hero">
        <div className="fh-hero-badge">
          <span className="fh-hero-badge-dot" aria-hidden />
          Nouveau : Denise, votre assistante vocale temps réel
        </div>

        <h1 className="fh-hero-title">
          L&apos;Intelligence Terrain
          <br />
          pour vos <em>Établissements</em>
        </h1>

        <p className="fh-hero-subtitle">
          De la salle de restaurant au tarmac, transformez chaque interaction en
          donnée actionnable. Piloté par Denise, votre assistante vocale temps réel.
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

        <div className="fh-hero-image">
          <div className="fh-hero-image-main">
            <img
              src="/hero-premium.png"
              alt="Salle de restaurant élégante d'un établissement premium équipé de FeedbackPro"
              loading="eager"
            />
            <div className="fh-hero-image-overlay" aria-hidden />

            <div className="fh-bubble fh-bubble-1">
              <span className="fh-bubble-icon fh-green" aria-hidden>
                <Check size={18} />
              </span>
              <div>
                <div className="fh-bubble-text">Incident résolu</div>
                <div className="fh-bubble-sub">Porte B12 · Il y a 2 min</div>
              </div>
            </div>

            <div className="fh-bubble fh-bubble-2">
              <span className="fh-bubble-icon fh-gold" aria-hidden>
                <BellRing size={18} />
              </span>
              <div>
                <div className="fh-bubble-text">Denise alerte l&apos;équipe</div>
                <div className="fh-bubble-sub">Zone sanitaire · Priorité haute</div>
              </div>
            </div>

            <div className="fh-bubble fh-bubble-3">
              <span className="fh-bubble-icon fh-slate" aria-hidden>
                <Zap size={18} />
              </span>
              <div>
                <div className="fh-bubble-text">+47 retours aujourd&apos;hui</div>
                <div className="fh-bubble-sub">Temps moyen : 2m 14s</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SECTEURS ==================== */}
      <section className="fh-sectors" id="fh-secteurs">
        <div className="fh-container">
          <div className="fh-label">Un moteur, tous vos terrains</div>
          <h2 className="fh-title">Une seule plateforme. Tous vos terrains.</h2>
          <p className="fh-subtitle">
            Le même moteur d&apos;intelligence terrain s&apos;adapte aux
            spécificités de chaque environnement.
          </p>

          <div className="fh-sectors-grid">
            {SECTORS.map((sector) => (
              <div className="fh-reveal" key={sector.key}>
                <button
                  className="fh-sector-card"
                  onClick={() => navigate(sector.key)}
                  aria-label={`Découvrir le secteur ${sector.title}`}
                >
                  <span className="fh-sector-icon" aria-hidden>
                    <sector.icon size={26} />
                  </span>
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
              vocalement. Pas d&apos;écran à regarder — juste une voix qui guide.
            </p>
            <div className="fh-denise-features">
              <div className="fh-denise-feature">
                <span className="fh-denise-dot" aria-hidden />
                100% vocal · mains libres
              </div>
              <div className="fh-denise-feature">
                <span className="fh-denise-dot" aria-hidden />
                Agrégation intelligente
              </div>
              <div className="fh-denise-feature">
                <span className="fh-denise-dot" aria-hidden />
                Ton adaptatif par urgence
              </div>
            </div>
            <button className="fh-btn-primary" onClick={() => navigate("contact")}>
              Voir Denise en action
              <ArrowRight size={18} aria-hidden />
            </button>
          </div>

          <div className="fh-denise-visual">
            <div className="fh-denise-header">
              <div className="fh-denise-avatar" aria-hidden>
                <Mic size={18} />
              </div>
              <div>
                <div className="fh-denise-name">Denise</div>
                <div className="fh-denise-status">
                  <span className="fh-status-dot" aria-hidden />
                  Écoute active · Terminal 2
                </div>
              </div>
            </div>

            <div className="fh-denise-msglabel">Annonce de Denise</div>
            <div className="fh-denise-message">
              « Nouvel incident. Zone sanitaires, Terminal 2. Priorité haute.
              Équipe nettoyage alertée. »
            </div>

            <div className="fh-denise-meta">
              <span>
                <Clock size={13} aria-hidden />
                14:32:08
              </span>
              <span>
                <MapPin size={13} aria-hidden />
                Terminal 2
              </span>
              <span>
                <Target size={13} aria-hidden />
                Priorité haute
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PREUVE ==================== */}
      <section className="fh-proof" id="fh-preuves">
        <div className="fh-container">
          <div className="fh-label">La preuve</div>
          <h2 className="fh-title">Le signal capté au moment où il sert.</h2>
          <p className="fh-subtitle">
            FeedbackPro mesure ce que les autres outils ignorent. Les
            indicateurs qui transforment une opération moyenne en opération
            excellente.
          </p>

          <div className="fh-stats-grid">
            <div className="fh-reveal">
              <div className="fh-stat-card">
                <div className="fh-stat-icon" aria-hidden>
                  <Eye size={22} />
                </div>
                <div className="fh-stat-value">15%</div>
                <div className="fh-stat-label">
                  d&apos;incidents invisibles
                  <br />
                  sans FeedbackPro
                </div>
              </div>
            </div>

            <div className="fh-reveal">
              <div className="fh-stat-card">
                <div className="fh-stat-icon" aria-hidden>
                  <Zap size={22} />
                </div>
                <div className="fh-stat-value">÷2</div>
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
                  <Trophy size={22} />
                </div>
                <div className="fh-stat-value">4x</div>
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
          <div className="fh-cta-logo">FeedbackPro</div>
          <h2 className="fh-cta-title">
            Prêt à transformer vos interactions
            <br />
            en données actionnables ?
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
              <button className="fh-nav-logo" onClick={scrollTop} aria-label="FeedbackPro — Retour en haut">
                <span className="fh-nav-logo-icon" aria-hidden>&#10022;</span>
                FeedbackPro
              </button>
              <p className="fh-footer-desc">
                L&apos;intelligence terrain pour vos établissements. Piloté par
                Denise, votre assistante vocale temps réel.
              </p>
              <div className="fh-footer-badge">
                <span className="fh-status-dot" aria-hidden />
                Denise veille · 24/7
              </div>
            </div>

            <div>
              <div className="fh-footer-title">Secteurs</div>
              <ul className="fh-footer-links">
                <li><button onClick={() => navigate("restaurant")}>Restaurant</button></li>
                <li><button onClick={() => navigate("aeroport")}>Aéroport</button></li>
                <li><button onClick={() => navigate("hotel")}>Hôtel</button></li>
                <li><button onClick={() => navigate("gare")}>Gare</button></li>
                <li><button onClick={() => navigate("hopital")}>Santé</button></li>
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
              <strong>Restez informé des nouveautés FeedbackPro</strong>
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
            <div>© {new Date().getFullYear()} FeedbackPro. Tous droits réservés.</div>
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
