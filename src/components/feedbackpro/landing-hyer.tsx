"use client"

// ============================================================
// FeedbackPro — Landing « Hyer Aviation » (design system Refero)
// ------------------------------------------------------------
// Reconstruction du landing accueil dans le langage visuel Hyer :
// éditorial luxe voyage, monochrome Deep Ink avec UNE note chaude
// (Clay Ember), typographie architecturale 700 à tracking serré,
// pills 1000px, cartes 0px radius, AUCUNE ombre, oscillation
// blanc ↔ bandes sombres, titres terminés par un point.
//
// Tokens (styles.refero.design / Hyer Aviation) :
//   Deep Ink #000d10 · Pure White #ffffff · Cool Ash #8e8e95
//   Pebble #d5d3d4 · Midnight Hull #0f0f1c · Charcoal Deck #151623
//   Clay Ember #bc7155 (UNE carte carrée par page, jamais deux)
// Typo : HelveticaNowDisplay → fallback Helvetica Neue / Inter.
//   wordmark 131px/-2.62 · headline 60px/-1.26 · section 52px
//   feature 23px/-0.23 · corps 18px/1.61 · caption 17px.
// Layout : max 1200px · gap section 80px · card 22px · clay 53/59.
//
// Contenu FeedbackPro préservé à l'identique (hero, 6 secteurs,
// Denise, stats, témoignages, CTA, footer, newsletter) — images
// produit générées IA (public/hyer/*) sur blanc pur / ciel d'aube.
//
// Toutes les classes sont préfixées `hy-` pour éviter toute fuite.
// ============================================================

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Menu, X } from "lucide-react"

// ------------------------------------------------------------
// Types — mêmes cibles de navigation que l'accueil premium
// ------------------------------------------------------------

/** Pages SPA internes atteignables depuis l'accueil. */
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
// CSS — préfixe hy-, tokens Hyer Aviation
// ------------------------------------------------------------

const HY_CSS = `
.hy-root {
  --ink: #000d10;
  --white: #ffffff;
  --ash: #8e8e95;
  --pebble: #d5d3d4;
  --hull: #0f0f1c;
  --deck: #151623;
  --clay: #bc7155;
  --max: 1200px;
  --gap-section: 80px;
  font-family: 'HelveticaNowDisplay', 'Helvetica Neue', 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: var(--white);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  min-height: 100vh;
}
.hy-root button { font-family: inherit; }
.hy-root * { box-shadow: none !important; }

/* ---- Pilles ---- */
.hy-btn {
  border-radius: 1000px;
  padding: 15px 22px 16px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  border: 1px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease, opacity 0.25s ease;
  min-height: 44px;
}
.hy-btn-ink { background: var(--ink); color: var(--white); }
.hy-btn-ink:hover { background: #10222a; }
.hy-btn-ghost-light { background: transparent; color: var(--white); border-color: rgba(255,255,255,0.85); }
.hy-btn-ghost-light:hover { background: rgba(255,255,255,0.12); }
.hy-btn-ghost-ink { background: transparent; color: var(--ink); border-color: var(--ink); }
.hy-btn-ghost-ink:hover { background: rgba(0,13,16,0.06); }
.hy-btn-ghost-white { background: transparent; color: var(--white); border-color: rgba(255,255,255,0.6); }
.hy-btn-ghost-white:hover { border-color: var(--white); }
.hy-btn-clay { background: var(--clay); color: var(--white); }
.hy-btn-clay:hover { background: #a96046; }

.hy-circle {
  width: 44px; height: 44px;
  border-radius: 100%;
  background: var(--ink);
  color: var(--white);
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hy-circle:hover { background: #10222a; }

/* ---- Conteneur ---- */
.hy-container { max-width: var(--max); margin: 0 auto; padding: 0 24px; }

/* ---- Nav (transparente sur le hero) ---- */
.hy-nav {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 40;
  background: transparent;
}
.hy-nav-inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.hy-nav-logo {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--ink);
  background: none; border: none; padding: 0; cursor: pointer;
  display: inline-flex; align-items: center; gap: 2px;
}
.hy-nav-logo sup { font-size: 11px; line-height: 1; }
.hy-nav-links { display: flex; align-items: center; gap: 32px; }
.hy-nav-link {
  font-size: 17px;
  font-weight: 400;
  color: var(--ink);
  background: none; border: none; padding: 6px 0; cursor: pointer;
  transition: opacity 0.25s ease;
  min-height: 44px;
  display: inline-flex; align-items: center;
}
.hy-nav-link:hover { opacity: 0.6; }
.hy-nav-right { display: flex; align-items: center; gap: 12px; }
.hy-nav-login {
  font-size: 17px;
  font-weight: 400;
  color: var(--ink);
  background: none; border: none; padding: 6px 10px; cursor: pointer;
  min-height: 44px;
  display: inline-flex; align-items: center;
  transition: opacity 0.25s ease;
}
.hy-nav-login:hover { opacity: 0.6; }

/* Menu mobile */
.hy-menu-panel {
  position: fixed; inset: 0; z-index: 60;
  background: var(--white);
  padding: 20px 24px 40px;
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.hy-menu-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.hy-menu-list { display: flex; flex-direction: column; gap: 8px; }
.hy-menu-item {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--ink);
  background: none;
  border: 1px solid var(--pebble);
  border-radius: 1000px;
  padding: 16px 24px;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
}
.hy-menu-item:hover { border-color: var(--ink); }

/* ---- HERO ---- */
.hy-hero {
  position: relative;
  min-height: 92vh;
  overflow: hidden;
  /* Ciel d'aube en CSS — raccord invisible avec le rendu produit */
  background: linear-gradient(180deg, #d9e5ee 0%, #f4e7d7 62%, #ffffff 100%);
}
.hy-hero-bg {
  position: absolute;
  bottom: 0;
  left: 38%;
  transform: translateX(-50%);
  height: 72%;
  width: auto;
  max-width: none;
  object-fit: cover;
  object-position: 50% 8%;
  /* Fondu haut/bas + côtés : le rendu se fond dans le ciel CSS, sans cadre */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 30%, black 86%, transparent 100%);
  mask-image:
    linear-gradient(to bottom, transparent 0%, black 30%, black 86%, transparent 100%),
    linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}
.hy-hero-fade {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(255,255,255,0) 55%, rgba(255,255,255,0.55) 82%, #ffffff 100%);
  pointer-events: none;
}
.hy-hero-content {
  position: relative;
  z-index: 2;
  max-width: 1360px;
  margin: 0 auto;
  padding: 96px 24px 56px;
  display: flex;
  flex-direction: column;
  min-height: 92vh;
}
.hy-wordmark {
  font-size: clamp(56px, 11vw, 131px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 0.95;
  color: var(--ink);
  margin: 0;
}
.hy-wordmark sup { font-size: 30%; vertical-align: super; }
.hy-hero-headline {
  font-size: clamp(34px, 4vw, 54px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.0;
  color: var(--ink);
  text-align: right;
  max-width: 62%;
  margin: 28px 0 0 auto;
}
.hy-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  align-self: flex-end;
  border: 1px solid var(--ink);
  border-radius: 1000px;
  padding: 9px 16px;
  font-size: 17px;
  font-weight: 400;
  color: var(--ink);
  margin-top: 20px;
}
.hy-hero-badge-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--clay);
  flex-shrink: 0;
}
.hy-hero-bottom {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding-top: 48px;
}
.hy-hero-ctas { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hy-hero-trust {
  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
  font-size: 17px;
  color: var(--ash);
}
.hy-hero-img-mobile { display: none; }

/* ---- Bandes ---- */
.hy-section { padding: var(--gap-section) 0; }
.hy-band-white { background: var(--white); }
.hy-band-hull { background: var(--hull); color: var(--white); }

.hy-eyebrow {
  font-size: 17px;
  color: var(--ash);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 16px;
}
.hy-head-right {
  text-align: right;
  max-width: 640px;
  margin-left: auto;
}
.hy-h2 {
  font-size: clamp(32px, 4.6vw, 52px);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.0;
  margin: 0;
}
.hy-h2 .hy-clay-dot { color: var(--clay); }
.hy-lede {
  font-size: 18px;
  line-height: 1.61;
  color: var(--ash);
  margin: 20px 0 0;
}
.hy-band-hull .hy-lede { color: rgba(255,255,255,0.72); }

/* ---- SECTEURS ---- */
.hy-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-top: 56px;
}
.hy-card {
  background: var(--white);
  border-radius: 0;
  border: none;
  text-align: left;
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  border-top: 1px solid var(--pebble);
  transition: border-color 0.25s ease;
}
.hy-card:hover { border-top-color: var(--ink); }
.hy-card-icon { font-size: 28px; line-height: 1; }
.hy-card-title {
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin: 0;
}
.hy-card-desc {
  font-size: 18px;
  line-height: 1.61;
  color: var(--ash);
  margin: 0;
}
.hy-card-link {
  margin-top: auto;
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 17px; font-weight: 700; color: var(--ink);
  padding-top: 8px;
}
/* Carte clay — LA note chaude unique de la page */
.hy-card-clay {
  background: var(--clay);
  color: var(--white);
  border-top: none;
  padding: 53px 59px;
  grid-row: span 2;
  grid-column: span 1;
}
.hy-card-clay:hover { border-top: none; background: #a96046; }
.hy-card-clay .hy-card-title { font-size: clamp(27px, 3.4vw, 37px); letter-spacing: -0.01em; color: var(--white); }
.hy-card-clay .hy-card-desc { color: rgba(255,255,255,0.85); }
.hy-card-clay .hy-card-icon { font-size: 34px; }
.hy-card-badge {
  font-size: 17px;
  font-weight: 700;
  color: var(--white);
  border: 1px solid rgba(255,255,255,0.7);
  border-radius: 1000px;
  padding: 7px 14px;
}
.hy-card-clay .hy-card-link { color: var(--white); }

/* ---- PRODUITS ---- */
.hy-grid-3-products { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 56px; }
.hy-product-media {
  border-radius: 45px;
  overflow: hidden;
  background: var(--white);
  border: 1px solid var(--pebble);
  aspect-ratio: 1 / 1;
  display: flex; align-items: center; justify-content: center;
}
.hy-product-media img { width: 100%; height: 100%; object-fit: cover; }

/* ---- DENISE (bande sombre) ---- */
.hy-denise-grid {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 64px;
  align-items: center;
  margin-top: 8px;
}
.hy-denise-panel {
  background: var(--deck);
  border-radius: 0;
  padding: 22px;
  display: flex; flex-direction: column; gap: 16px;
}
.hy-denise-head { display: flex; align-items: center; gap: 14px; }
.hy-denise-avatar {
  width: 44px; height: 44px; border-radius: 100%;
  background: var(--clay);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.hy-denise-name { font-size: 17px; font-weight: 700; color: var(--white); }
.hy-denise-status { font-size: 17px; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 8px; }
.hy-denise-dot { width: 8px; height: 8px; border-radius: 50%; background: #7fce94; display: inline-block; }
.hy-denise-label { font-size: 17px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); }
.hy-denise-quote {
  font-size: 18px;
  line-height: 1.61;
  color: var(--white);
  margin: 0;
}
.hy-denise-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 17px; color: rgba(255,255,255,0.6); }
.hy-denise-meta span { display: inline-flex; align-items: center; gap: 6px; }
.hy-features { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 28px 0 32px; }
.hy-feature-check { display: flex; align-items: center; gap: 12px; font-size: 18px; line-height: 1.3; color: var(--white); }
.hy-check-badge {
  width: 28px; height: 28px; border-radius: 100%;
  background: rgba(255,255,255,0.12);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

/* ---- PREUVES ---- */
.hy-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 56px; }
.hy-stat {
  border-top: 1px solid var(--pebble);
  padding: 22px 0 0;
  display: flex; flex-direction: column; gap: 10px;
}
.hy-stat-value {
  font-size: clamp(40px, 5vw, 63px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ink);
}
.hy-stat-label { font-size: 18px; line-height: 1.61; color: var(--ash); }
.hy-testimonials { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 64px; }
.hy-testimonial {
  border-top: 1px solid var(--pebble);
  padding: 22px 0 0;
  margin: 0;
  display: flex; flex-direction: column; gap: 14px;
}
.hy-t-stars { display: inline-flex; gap: 3px; color: var(--ink); }
.hy-t-text { font-size: 18px; line-height: 1.61; color: var(--ink); margin: 0; }
.hy-t-author { display: flex; align-items: center; gap: 14px; margin-top: auto; }
.hy-t-avatar {
  width: 44px; height: 44px; border-radius: 100%;
  background: var(--deck); color: var(--white);
  font-size: 15px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.hy-t-name { font-size: 17px; font-weight: 700; color: var(--ink); }
.hy-t-role { font-size: 17px; color: var(--ash); }

/* ---- CTA ---- */
.hy-cta-wrap { text-align: right; max-width: 720px; margin-left: auto; }
.hy-cta-trust {
  display: flex; justify-content: flex-end; gap: 24px; flex-wrap: wrap;
  font-size: 17px; color: var(--ash); margin-top: 24px;
}
.hy-cta-actions { display: flex; justify-content: flex-end; margin-top: 32px; }

/* ---- FOOTER ---- */
.hy-footer { background: var(--ink); color: var(--white); padding: 80px 0 40px; }
.hy-footer-mark {
  font-size: clamp(40px, 6vw, 63px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--white);
  margin: 0;
}
.hy-footer-mark sup { font-size: 30%; }
.hy-footer-desc { font-size: 18px; line-height: 1.61; color: var(--ash); max-width: 420px; margin: 20px 0 0; }
.hy-footer-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 48px;
  align-items: start;
}
.hy-footer-title { font-size: 17px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); margin-bottom: 16px; }
.hy-footer-links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.hy-footer-links button {
  font-size: 20px;
  font-weight: 400;
  color: var(--ash);
  background: none; border: none; padding: 4px 0; cursor: pointer;
  text-align: left;
  transition: color 0.25s ease;
  min-height: 44px;
  display: inline-flex; align-items: center;
}
.hy-footer-links button:hover { color: var(--white); }
.hy-newsletter {
  border-top: 1px solid rgba(255,255,255,0.14);
  margin-top: 56px;
  padding-top: 40px;
  display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;
}
.hy-newsletter-text { font-size: 18px; line-height: 1.5; color: var(--white); }
.hy-newsletter-text span { display: block; color: var(--ash); font-size: 17px; }
.hy-newsletter-form { display: flex; gap: 12px; flex-wrap: wrap; }
.hy-newsletter-input {
  border-radius: 1000px;
  border: 1px solid rgba(255,255,255,0.3);
  background: transparent;
  color: var(--white);
  font-size: 17px;
  padding: 14px 22px;
  min-width: 280px;
  min-height: 44px;
  outline: none;
}
.hy-newsletter-input:focus { border-color: var(--white); }
.hy-newsletter-input::placeholder { color: rgba(255,255,255,0.4); }
.hy-footer-bottom {
  border-top: 1px solid rgba(255,255,255,0.14);
  margin-top: 40px;
  padding-top: 28px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  font-size: 17px;
  color: var(--ash);
}
.hy-footer-denise { display: inline-flex; align-items: center; gap: 10px; }
.hy-footer-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: #7fce94; }

/* ---- Toast ---- */
.hy-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 80;
  background: var(--ink);
  color: var(--white);
  border-radius: 1000px;
  padding: 14px 26px;
  font-size: 17px;
  font-weight: 700;
}

/* ---- Reveal (sans ombre, discret) ---- */
.hy-reveal { opacity: 0; transform: translateY(14px); transition: opacity 0.6s ease, transform 0.6s ease; }
.hy-reveal.hy-visible { opacity: 1; transform: none; }

/* ---- Responsive ---- */
@media (max-width: 1024px) {
  .hy-nav-links, .hy-nav-login { display: none; }
  .hy-grid-3, .hy-grid-3-products, .hy-stats, .hy-testimonials { grid-template-columns: 1fr 1fr; }
  .hy-card-clay { grid-row: span 1; grid-column: span 2; padding: 40px 32px; }
  .hy-denise-grid { grid-template-columns: 1fr; gap: 40px; }
  .hy-hero { min-height: auto; }
  .hy-hero-bg { display: none; }
  .hy-hero-fade { display: none; }
  .hy-hero-content { min-height: auto; padding-bottom: 24px; }
  .hy-hero-headline { text-align: left; max-width: 100%; margin: 20px 0 0; }
  .hy-hero-badge { align-self: flex-start; }
  .hy-hero-bottom { flex-direction: column; align-items: stretch; }
  .hy-hero-img-mobile {
    display: block;
    width: calc(100% + 48px);
    margin: 8px -24px -24px;
    height: 300px;
    object-fit: cover;
    object-position: 50% 0%;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 18%, black 100%);
  }
  .hy-cta-wrap, .hy-head-right { text-align: left; margin-left: 0; }
  .hy-cta-actions { justify-content: flex-start; }
  .hy-cta-trust { justify-content: flex-start; }
  .hy-footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
  .hy-nav-right .hy-btn { display: none; }
  .hy-grid-3, .hy-grid-3-products, .hy-stats, .hy-testimonials { grid-template-columns: 1fr; }
  .hy-card-clay { grid-column: span 1; padding: 34px 28px; }
  .hy-features { grid-template-columns: 1fr; }
  .hy-footer-grid { grid-template-columns: 1fr; gap: 32px; }
  .hy-newsletter-form { width: 100%; }
  .hy-newsletter-input { min-width: 0; flex: 1; }
  .hy-section { padding: 56px 0; }
}
`

// ------------------------------------------------------------
// Données locales — contenu FeedbackPro préservé
// ------------------------------------------------------------

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

/** Produits FeedbackPro (images générées, crops serrés sur blanc). */
const PRODUCTS = [
  {
    img: "/hyer/chevalet.png",
    alt: "Chevalet QR de table FeedbackPro en marbre blanc avec base terre cuite",
    title: "Chevalet QR de table",
    desc: "Un objet premium posé sur chaque table. Le client scanne, note, repart — zéro application à installer.",
  },
  {
    img: "/hyer/badge.png",
    alt: "Badge QR employé FeedbackPro en encre profonde avec liseré terre cuite",
    title: "Badge QR employé",
    desc: "Chaque employé porte son QR. Les compliments et les alertes suivent la bonne personne, en temps réel.",
  },
  {
    img: "/hyer/tablet.png",
    alt: "Tablette de pilotage FeedbackPro avec tableau de bord encre et accents terre cuite",
    title: "Tablette Ops",
    desc: "Direction et équipes voient tout : incidents, flux, SLA. Le terrain devient un tableau de bord vivant.",
  },
]

// ------------------------------------------------------------
// Composant
// ------------------------------------------------------------

export function LandingHyer({
  navigate,
  onLogin,
}: {
  navigate: (p: NavTarget) => void
  onLogin: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reveals discrets via IntersectionObserver, avec filet de sécurité.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>(".hy-reveal"))
    const revealAll = () => els.forEach((el) => el.classList.add("hy-visible"))
    if (typeof IntersectionObserver === "undefined") {
      revealAll()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("hy-visible")
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    )
    els.forEach((el) => io.observe(el))
    const fallback = setTimeout(revealAll, 2500)
    return () => {
      io.disconnect()
      clearTimeout(fallback)
    }
  }, [])

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
    setMenuOpen(false)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const scrollTop = () => {
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const onNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setEmail("")
    showToast("Merci pour votre inscription !")
  }

  return (
    <div className="hy-root" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: HY_CSS }} />

      {/* ==================== NAV ==================== */}
      <nav className="hy-nav" aria-label="Navigation principale">
        <div className="hy-nav-inner">
          <button className="hy-nav-logo" onClick={scrollTop} aria-label="FeedbackPro — Retour en haut">
            FeedbackPro<sup>®</sup>
          </button>
          <div className="hy-nav-links">
            <button className="hy-nav-link" onClick={() => scrollToId("hy-secteurs")}>Secteurs</button>
            <button className="hy-nav-link" onClick={() => scrollToId("hy-denise")}>Denise</button>
            <button className="hy-nav-link" onClick={() => scrollToId("hy-preuves")}>Résultats</button>
            <button className="hy-nav-link" onClick={() => navigate("contact")}>Contact</button>
          </div>
          <div className="hy-nav-right">
            <button className="hy-nav-login" onClick={onLogin}>Se connecter</button>
            <button className="hy-btn hy-btn-ink" onClick={() => navigate("contact")}>
              Demander une démo
              <ArrowRight size={16} aria-hidden />
            </button>
            <button
              className="hy-circle"
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
              aria-expanded={menuOpen}
            >
              <Menu size={20} aria-hidden />
            </button>
          </div>
        </div>
      </nav>

      {/* Menu plein écran */}
      {menuOpen && (
        <div className="hy-menu-panel" role="dialog" aria-label="Menu de navigation">
          <div className="hy-menu-head">
            <span className="hy-nav-logo" style={{ cursor: "default" }}>
              FeedbackPro<sup>®</sup>
            </span>
            <button className="hy-circle" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
              <X size={20} aria-hidden />
            </button>
          </div>
          <div className="hy-menu-list">
            <button className="hy-menu-item" onClick={() => scrollToId("hy-secteurs")}>Secteurs</button>
            <button className="hy-menu-item" onClick={() => scrollToId("hy-denise")}>Denise</button>
            <button className="hy-menu-item" onClick={() => scrollToId("hy-preuves")}>Résultats</button>
            <button className="hy-menu-item" onClick={() => { setMenuOpen(false); navigate("contact") }}>Contact</button>
            <button className="hy-menu-item" onClick={() => { setMenuOpen(false); navigate("apropos") }}>À propos</button>
            <button className="hy-menu-item" onClick={() => { setMenuOpen(false); onLogin() }}>Se connecter</button>
          </div>
        </div>
      )}

      {/* ==================== HERO ==================== */}
      <header className="hy-hero">
        {/* Rendu produit FeedbackPro sur ciel d'aube (desktop) */}
        <img
          src="/hyer/hero-phone.png?v=2"
          alt="Smartphone premium FeedbackPro flottant sur un ciel d'aube, interface d'avis client avec étoiles terre cuite"
          className="hy-hero-bg"
          loading="eager"
        />
        <div className="hy-hero-fade" aria-hidden />

        <div className="hy-hero-content">
          <h1 className="hy-wordmark">
            FeedbackPro<sup>®</sup>
          </h1>

          {/* Sous-titre en mobile uniquement (desktop : le wordmark porte) */}
          <p className="hy-hero-badge">
            <span className="hy-hero-badge-dot" aria-hidden />
            Nouveau : Nathalie, votre guide personnel VIP
          </p>

          <p className="hy-hero-headline">
            L&apos;Excellence Opérationnelle
            <br />
            pour vos Établissements.
          </p>

          {/* Image produit en mobile (sous le texte) */}
          <img
            src="/hyer/hero-phone.png?v=2"
            alt=""
            aria-hidden
            className="hy-hero-img-mobile"
            loading="eager"
          />

          <div className="hy-hero-bottom">
            <div className="hy-hero-trust">
              <span>4.9/5 — Satisfaction clients</span>
              <span>Setup en 5 minutes</span>
              <span>Sans carte bancaire</span>
            </div>
            <div className="hy-hero-ctas">
              <button className="hy-btn hy-btn-ghost-ink" onClick={() => scrollToId("hy-secteurs")}>
                Découvrir la plateforme
              </button>
              <button className="hy-btn hy-btn-ink" onClick={() => navigate("contact")}>
                Demander une démo personnalisée
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ==================== SECTEURS ==================== */}
      <section className="hy-section hy-band-white" id="hy-secteurs">
        <div className="hy-container">
          <div className="hy-head-right">
            <p className="hy-eyebrow">Un moteur, tous vos terrains</p>
            <h2 className="hy-h2">
              Une seule plateforme. Tous vos terrains<span className="hy-clay-dot">.</span>
            </h2>
            <p className="hy-lede">
              Le même moteur d&apos;intelligence terrain s&apos;adapte aux spécificités de
              chaque environnement, du salon VIP à l&apos;établissement public.
            </p>
          </div>

          <div className="hy-grid-3">
            {SECTORS.map((sector) =>
              sector.featured ? (
                <div className="hy-reveal" key={sector.title}>
                  <button
                    className="hy-card hy-card-clay"
                    onClick={() => navigate(sector.key)}
                    aria-label={`Découvrir le secteur ${sector.title}`}
                  >
                    <span className="hy-card-badge">Premium</span>
                    <span className="hy-card-icon" aria-hidden>{sector.icon}</span>
                    <h3 className="hy-card-title">{sector.title}</h3>
                    <p className="hy-card-desc">{sector.desc}</p>
                    <span className="hy-card-link">
                      Découvrir
                      <ArrowRight size={16} aria-hidden />
                    </span>
                  </button>
                </div>
              ) : (
                <div className="hy-reveal" key={sector.title}>
                  <button
                    className="hy-card"
                    onClick={() => navigate(sector.key)}
                    aria-label={`Découvrir le secteur ${sector.title}`}
                  >
                    <span className="hy-card-icon" aria-hidden>{sector.icon}</span>
                    <h3 className="hy-card-title">{sector.title}</h3>
                    <p className="hy-card-desc">{sector.desc}</p>
                    <span className="hy-card-link">
                      Découvrir
                      <ArrowRight size={16} aria-hidden />
                    </span>
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ==================== PRODUITS ==================== */}
      <section className="hy-section hy-band-white">
        <div className="hy-container">
          <div className="hy-head-right">
            <p className="hy-eyebrow">La technologie</p>
            <h2 className="hy-h2">Trois objets. Un seul moteur.</h2>
            <p className="hy-lede">
              Des interfaces physiques et digitales pensées comme des objets de
              design : discrets, précis, toujours en service.
            </p>
          </div>

          <div className="hy-grid-3-products">
            {PRODUCTS.map((p) => (
              <div className="hy-reveal" key={p.title}>
                <div className="hy-product-media">
                  <img src={p.img} alt={p.alt} loading="lazy" />
                </div>
                <div style={{ paddingTop: 22, borderTop: "none" }}>
                  <h3 className="hy-card-title" style={{ borderTop: "1px solid var(--pebble)", paddingTop: 22 }}>
                    {p.title}
                  </h3>
                  <p className="hy-card-desc" style={{ marginTop: 12 }}>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== DENISE (bande sombre) ==================== */}
      <section className="hy-section hy-band-hull" id="hy-denise">
        <div className="hy-container">
          <div className="hy-head-right">
            <p className="hy-eyebrow" style={{ color: "rgba(255,255,255,0.5)" }}>La voix</p>
            <h2 className="hy-h2">Denise ne dort jamais.</h2>
          </div>

          <div className="hy-denise-grid">
            {/* Colonne gauche : panneau Charcoal Deck */}
            <div className="hy-reveal">
              <div className="hy-denise-panel">
                <div className="hy-denise-head">
                  <span className="hy-denise-avatar" aria-hidden>🎙️</span>
                  <div>
                    <div className="hy-denise-name">Denise</div>
                    <div className="hy-denise-status">
                      <span className="hy-denise-dot" aria-hidden />
                      Écoute active · Salon VIP Terra
                    </div>
                  </div>
                </div>
                <div className="hy-denise-label">Annonce de Denise</div>
                <p className="hy-denise-quote">
                  « Point d&apos;attention : Buffet niveau bas à 35%. Rafraîchissement
                  recommandé. Table T-08 signale bruit excessif, intervention
                  discrète en cours. »
                </p>
                <div className="hy-denise-meta">
                  <span>14:32:08</span>
                  <span>Salon VIP</span>
                  <span>Mode discret</span>
                </div>
              </div>
            </div>

            {/* Colonne droite : contenu */}
            <div className="hy-reveal">
              <p className="hy-lede" style={{ color: "rgba(255,255,255,0.72)" }}>
                Pendant que vos équipes travaillent les mains occupées, Denise
                veille. Chaque signalement est analysé, priorisé et annoncé
                vocalement. Pas d&apos;écran à regarder — juste une voix qui guide,
                adaptée à chaque environnement.
              </p>
              <div className="hy-features">
                <div className="hy-feature-check">
                  <span className="hy-check-badge" aria-hidden>✓</span>
                  100% vocal · mains libres
                </div>
                <div className="hy-feature-check">
                  <span className="hy-check-badge" aria-hidden>✓</span>
                  Ton adaptatif par urgence et secteur
                </div>
                <div className="hy-feature-check">
                  <span className="hy-check-badge" aria-hidden>✓</span>
                  Agrégation intelligente anti-spam
                </div>
                <div className="hy-feature-check">
                  <span className="hy-check-badge" aria-hidden>✓</span>
                  Mode discrétion pour salons VIP
                </div>
              </div>
              <button className="hy-btn hy-btn-ghost-light" onClick={() => navigate("contact")}>
                Voir Denise en action
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PREUVES ==================== */}
      <section className="hy-section hy-band-white" id="hy-preuves">
        <div className="hy-container">
          <div className="hy-head-right">
            <p className="hy-eyebrow">La preuve</p>
            <h2 className="hy-h2">Le signal capté au moment où il sert.</h2>
            <p className="hy-lede">
              FeedbackPro mesure ce que les autres outils ignorent. Les indicateurs
              qui transforment une opération moyenne en opération excellente.
            </p>
          </div>

          <div className="hy-stats">
            <div className="hy-reveal">
              <div className="hy-stat">
                <div className="hy-stat-value">15%</div>
                <div className="hy-stat-label">
                  d&apos;incidents invisibles sans FeedbackPro.
                </div>
              </div>
            </div>
            <div className="hy-reveal">
              <div className="hy-stat">
                <div className="hy-stat-value">÷2</div>
                <div className="hy-stat-label">
                  temps de résolution grâce aux alertes temps réel.
                </div>
              </div>
            </div>
            <div className="hy-reveal">
              <div className="hy-stat">
                <div className="hy-stat-value">4x</div>
                <div className="hy-stat-label">
                  plus de feedbacks collectés vs. enquêtes post-visite.
                </div>
              </div>
            </div>
          </div>

          <div className="hy-testimonials">
            {TESTIMONIALS.map((t) => (
              <div className="hy-reveal" key={t.initials}>
                <figure className="hy-testimonial">
                  <div className="hy-t-stars" aria-label="5 étoiles sur 5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} aria-hidden>★</span>
                    ))}
                  </div>
                  <blockquote className="hy-t-text">« {t.text} »</blockquote>
                  <figcaption className="hy-t-author">
                    <div className="hy-t-avatar" aria-hidden>{t.initials}</div>
                    <div>
                      <div className="hy-t-name">{t.name}</div>
                      <div className="hy-t-role">{t.role}</div>
                    </div>
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CTA FINAL ==================== */}
      <section className="hy-section hy-band-white" id="hy-demo">
        <div className="hy-container">
          <div className="hy-cta-wrap">
            <p className="hy-eyebrow">Démarrer</p>
            <h2 className="hy-h2">
              Transformez vos interactions en données actionnables<span className="hy-clay-dot">.</span>
            </h2>
            <p className="hy-lede">
              Configuration adaptée à votre secteur en 24h. Démo personnalisée avec
              votre équipe.
            </p>
            <div className="hy-cta-actions">
              <button className="hy-btn hy-btn-ink" onClick={() => navigate("contact")}>
                Demander une démo personnalisée
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
            <div className="hy-cta-trust">
              <span>Sans carte bancaire</span>
              <span>Setup en 5 min</span>
              <span>Annulable à tout moment</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="hy-footer">
        <div className="hy-container">
          <div className="hy-footer-grid">
            <div>
              <p className="hy-footer-mark">
                FeedbackPro<sup>®</sup>
              </p>
              <p className="hy-footer-desc">
                L&apos;excellence opérationnelle pour vos établissements. Piloté par
                Denise et Nathalie, vos assistantes intelligentes temps réel.
              </p>
            </div>

            <div>
              <div className="hy-footer-title">Secteurs</div>
              <ul className="hy-footer-links">
                <li><button onClick={() => navigate("contact")}>Salon VIP</button></li>
                <li><button onClick={() => navigate("aeroport")}>Aéroport</button></li>
                <li><button onClick={() => navigate("contact")}>Compagnie Aérienne</button></li>
                <li><button onClick={() => navigate("hotel")}>Hôtel</button></li>
                <li><button onClick={() => navigate("restaurant")}>Restaurant</button></li>
                <li><button onClick={() => navigate("erp")}>Établissements publics</button></li>
              </ul>
            </div>

            <div>
              <div className="hy-footer-title">Société</div>
              <ul className="hy-footer-links">
                <li><button onClick={scrollTop}>Accueil</button></li>
                <li><button onClick={() => navigate("apropos")}>À propos</button></li>
                <li><button onClick={() => navigate("contact")}>Contact</button></li>
                <li><button onClick={onLogin}>Se connecter</button></li>
              </ul>
            </div>

            <div>
              <div className="hy-footer-title">Légal</div>
              <ul className="hy-footer-links">
                <li><button onClick={() => navigate("contact")}>CGU</button></li>
                <li><button onClick={() => navigate("contact")}>Confidentialité</button></li>
                <li><button onClick={() => navigate("contact")}>RGPD</button></li>
                <li><button onClick={() => navigate("contact")}>Cookies</button></li>
              </ul>
            </div>
          </div>

          <div className="hy-newsletter">
            <div className="hy-newsletter-text">
              <strong>Restez informé des nouveautés FeedbackPro</strong>
              <span>Une lettre mensuelle. Pas de spam. Désinscription en un clic.</span>
            </div>
            <form className="hy-newsletter-form" onSubmit={onNewsletterSubmit}>
              <input
                type="email"
                className="hy-newsletter-input"
                placeholder="vous@etablissement.com"
                aria-label="Adresse e-mail pour la newsletter"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className="hy-btn hy-btn-ghost-light">S&apos;abonner</button>
            </form>
          </div>

          <div className="hy-footer-bottom">
            <div>© {new Date().getFullYear()} FeedbackPro. Tous droits réservés.</div>
            <div className="hy-footer-denise">
              <span className="hy-footer-badge-dot" aria-hidden />
              Piloté par Denise
            </div>
          </div>
        </div>
      </footer>

      {/* ==================== TOAST ==================== */}
      {toast && (
        <div className="hy-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
