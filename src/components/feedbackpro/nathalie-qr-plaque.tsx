'use client'

// ============================================================
// Nathalie QR Plaque — plaque luxe pour QR codes du Salon VIP
// ------------------------------------------------------------
// Direction artistique (chevalet d'accueil produit) :
//   · Socle marbre Nero Marquina (noir profond, veines ivoire)
//   · Plaque aluminium noir anodisé mat, effet brossé
//   · Filets & crochets d'or champagne brossé (#C9A961)
//   · QR gravé sur médaillon ivoire — modules anthracite
//     #2C2C2C (lisibilité scan optimale, pas de noir pur)
//   · Typographie épurée en haut et en bas (serif)
// ------------------------------------------------------------
// Exports :
//   NathalieQrPlaque  — rendu DOM (cartes dashboard, drawer, dialog)
//   plaquePngDataUrl  — composition SVG→canvas → PNG haute résolution
//   downloadPlaquePng — téléchargement de la plaque complète
//   printPlaque       — feuille d'impression luxe (chevalet)
// ============================================================

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------
// Matières (CSS)
// ------------------------------------------------------------

/** Marbre Nero Marquina : fond noir + veines ivoire subtiles */
const MARBLE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><rect width='420' height='420' fill='#131315'/><g fill='none' stroke='#f2efe6' stroke-opacity='0.075' stroke-width='1.15'><path d='M-20 70 C 70 52 150 118 440 84'/><path d='M-20 196 C 96 176 210 246 440 190'/><path d='M-20 306 C 110 290 220 340 440 300'/></g><g fill='none' stroke='#f2efe6' stroke-opacity='0.05' stroke-width='0.8'><path d='M96 -20 C 122 96 66 208 130 440'/><path d='M286 -20 C 316 92 246 216 318 440'/><path d='M212 -20 C 234 60 190 150 236 440'/></g><g fill='none' stroke='#c8c4b8' stroke-opacity='0.06' stroke-width='0.6'><path d='M-20 130 C 90 112 190 168 440 128'/><path d='M-20 254 C 120 238 230 292 440 248'/></g></svg>`

const MARBLE_BG = `url("data:image/svg+xml,${encodeURIComponent(MARBLE_SVG)}")`

/** Aluminium noir anodisé brossé : micro-stries + lumière rasante */
const BRUSHED =
  'repeating-linear-gradient(112deg, rgba(255,255,255,0.032) 0px, rgba(255,255,255,0.032) 1px, transparent 1px, transparent 4px)'

const SHEEN =
  'radial-gradient(130% 90% at 18% 0%, rgba(255,255,255,0.075), transparent 55%)'

/** Médaillon ivoire (support de gravure du QR) */
const MEDALLION = 'linear-gradient(155deg, #FDFAF1 0%, #F6F0DF 55%, #EFE8D3 100%)'

const SERIF: React.CSSProperties = { fontFamily: 'Georgia, "Playfair Display", serif' }

// ------------------------------------------------------------
// Génération QR locale (build navigateur de `qrcode`)
// modules #2C2C2C sur ivoire — identique à la gravure produit
// ------------------------------------------------------------

export function qrLocalDataUrl(data: string, width = 512): Promise<string> {
  return QRCode.toDataURL(data, {
    width,
    margin: 1,
    errorCorrectionLevel: 'Q',
    color: { dark: '#2C2C2C', light: '#FBF7EC' },
  })
}

function useQrPng(data: string, width: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    qrLocalDataUrl(data, width)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [data, width])
  return url
}

// ------------------------------------------------------------
// Composant DOM
// ------------------------------------------------------------

export type PlaqueOptions = {
  /** URL encodée dans le QR */
  data: string
  /** Nom affiché sous le QR (ex. « Accueil du salon », zone, table…) */
  label: string
  /** Typographie du haut (défaut : SALON VIP) */
  kicker?: string
  /** Typographie du bas (défaut : NATHALIE · VOTRE GUIDE PERSONNEL) */
  signature?: string
}

type PlaqueSize = 'xs' | 'sm' | 'md'

const SIZE_CFG: Record<PlaqueSize, { qr: string; px: number; kicker: string; label: string; signature: string; pad: string; medal: string }> = {
  md: {
    qr: 'h-44 w-44',
    px: 512,
    kicker: 'text-[10px] tracking-[0.42em]',
    label: 'text-[15px]',
    signature: 'text-[8px] tracking-[0.34em]',
    pad: 'px-4 pb-4 pt-5',
    medal: 'p-2.5 mt-3.5',
  },
  sm: {
    qr: 'h-32 w-32',
    px: 384,
    kicker: 'text-[9px] tracking-[0.38em]',
    label: 'text-[13px]',
    signature: 'text-[7px] tracking-[0.3em]',
    pad: 'px-3.5 pb-3.5 pt-4',
    medal: 'p-2 mt-3',
  },
  xs: {
    qr: 'h-24 w-24',
    px: 256,
    kicker: 'text-[8px] tracking-[0.32em]',
    label: 'text-[12px]',
    signature: 'text-[6.5px] tracking-[0.26em]',
    pad: 'px-3 pb-3 pt-3.5',
    medal: 'p-1.5 mt-2.5',
  },
}

export function NathalieQrPlaque({
  data,
  label,
  kicker = 'SALON VIP',
  signature = 'NATHALIE · VOTRE GUIDE PERSONNEL',
  size = 'md',
  className,
}: PlaqueOptions & { size?: PlaqueSize; className?: string }) {
  const cfg = SIZE_CFG[size]
  const qr = useQrPng(data, cfg.px)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[20px] shadow-[0_18px_40px_rgba(20,20,22,0.32)]',
        className,
      )}
      style={{ backgroundColor: '#131315', backgroundImage: MARBLE_BG, backgroundSize: '420px 420px' }}
      aria-label={`Plaque QR — ${label}`}
    >
      {/* Plaque aluminium noir anodisé */}
      <div
        className={cn('relative rounded-[14px] text-center', cfg.pad)}
        style={{
          background: 'linear-gradient(150deg, #343437 0%, #232326 45%, #151517 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(0,0,0,0.35), 0 2px 10px rgba(0,0,0,0.5)',
        }}
      >
        {/* Brossé métallique + lumière rasante */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[14px]"
          style={{ backgroundImage: `${SHEEN}, ${BRUSHED}` }}
        />
        {/* Filet or champagne */}
        <div className="pointer-events-none absolute inset-[7px] rounded-[10px] border border-[#C9A961]/55 shadow-[inset_0_0_14px_rgba(201,169,97,0.10)]" />

        {/* Typographie — haut */}
        <p
          className={cn('relative font-semibold uppercase text-[#C9A961]', cfg.kicker)}
          style={SERIF}
        >
          {kicker}
        </p>

        {/* Emblème géométrique : médaillon ivoire + crochets d'or */}
        <div className="relative mx-auto w-fit">
          <div
            className={cn('relative rounded-[5px] border border-[#C9A961]/50', cfg.medal)}
            style={{ background: MEDALLION, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.22), 0 1px 2px rgba(255,255,255,0.05)' }}
          >
            {qr ? (
              <img src={qr} alt={`QR — ${label}`} className={cn('block', cfg.qr)} />
            ) : (
              <div className={cn('animate-pulse rounded bg-[#2C2C2C]/10', cfg.qr)} />
            )}
            {/* Crochets d'or de l'emblème */}
            <span className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 border-l-2 border-t-2 border-[#C9A961]" />
            <span className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 border-r-2 border-t-2 border-[#C9A961]" />
            <span className="absolute -left-1.5 -bottom-1.5 h-3.5 w-3.5 border-b-2 border-l-2 border-[#C9A961]" />
            <span className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 border-b-2 border-r-2 border-[#C9A961]" />
          </div>
        </div>

        {/* Séparateur losange */}
        <div className="relative mx-auto mt-3 flex items-center gap-2 px-2">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#C9A961]/55" />
          <span className="text-[7px] leading-none text-[#C9A961]" aria-hidden>
            ◆
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#C9A961]/55" />
        </div>

        {/* Typographie — bas */}
        <p className={cn('relative mt-2 truncate text-[#EDE6D4]', cfg.label)} style={SERIF}>
          {label}
        </p>
        <p className={cn('relative mt-1 truncate uppercase text-[#C9A961]/85', cfg.signature)}>
          {signature}
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Export PNG — plaque complète rendue en SVG puis rasterisée
// ------------------------------------------------------------

const W = 640
const H = 920
const FONT_STACK = 'Georgia, Playfair Display, serif'

type SvgOpts = PlaqueOptions & { qrPng: string }

/** SVG autoportant (aucune ressource externe) — rasterisable en canvas */
export function plaqueSvgString({ data, label, kicker = 'SALON VIP', signature = 'NATHALIE · VOTRE GUIDE PERSONNEL', qrPng }: SvgOpts): string {
  // QR fraîchement généré en haute définition pour l'export
  const plate = { x: 160, y: 208, s: 320 } // médaillon ivoire
  const br = 12 // dépassement des crochets
  const { x, y, s } = plate
  const x1 = x + s
  const y1 = y + s

  const veins = `<g fill='none' stroke='#f2efe6' stroke-opacity='0.075' stroke-width='1.6'><path d='M-20 130 C 140 100 260 220 660 160'/><path d='M-20 380 C 160 350 300 470 660 360'/><path d='M-20 610 C 180 580 320 680 660 600'/><path d='M-20 830 C 160 800 300 900 660 820'/></g><g fill='none' stroke='#f2efe6' stroke-opacity='0.05' stroke-width='1.1'><path d='M170 -20 C 210 170 110 360 220 940'/><path d='M500 -20 C 540 160 430 380 550 940'/><path d='M340 -20 C 370 110 310 260 380 940'/></g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="alu" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#343437"/>
      <stop offset="0.45" stop-color="#232326"/>
      <stop offset="1" stop-color="#151517"/>
    </linearGradient>
    <linearGradient id="medal" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#FDFAF1"/>
      <stop offset="0.55" stop-color="#F6F0DF"/>
      <stop offset="1" stop-color="#EFE8D3"/>
    </linearGradient>
    <linearGradient id="or" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E3C985"/>
      <stop offset="0.5" stop-color="#C9A961"/>
      <stop offset="1" stop-color="#A98B4B"/>
    </linearGradient>
  </defs>

  <!-- socle marbre Nero Marquina -->
  <rect width="${W}" height="${H}" fill="#131315"/>
  ${veins}

  <!-- plaque aluminium noir anodisé -->
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="20" fill="url(#alu)"/>
  <!-- brossé -->
  <g stroke="#ffffff" stroke-opacity="0.03">
    ${Array.from({ length: 34 }, (_, i) => `<line x1="${34 + i * 17}" y1="40" x2="${20 + i * 17}" y2="${H - 40}" stroke-width="1"/>`).join('')}
  </g>
  <!-- filets or champagne -->
  <rect x="38" y="38" width="${W - 76}" height="${H - 76}" rx="14" fill="none" stroke="url(#or)" stroke-width="1.6" stroke-opacity="0.7"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" rx="11" fill="none" stroke="#C9A961" stroke-opacity="0.22" stroke-width="0.8"/>

  <!-- typographie haut -->
  <text x="${W / 2}" y="140" text-anchor="middle" font-family="${FONT_STACK}" font-size="24" letter-spacing="12" fill="#C9A961" font-weight="600">${esc(kicker.toUpperCase())}</text>

  <!-- emblème : médaillon ivoire + crochets d'or -->
  <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="8" fill="url(#medal)" stroke="#C9A961" stroke-opacity="0.55" stroke-width="1.4"/>
  <image href="${qrPng}" x="${x + 14}" y="${y + 14}" width="${s - 28}" height="${s - 28}"/>
  <g stroke="url(#or)" stroke-width="5" fill="none" stroke-linecap="square">
    <path d="M ${x - br} ${y + 46} L ${x - br} ${y - br} L ${x + 46} ${y - br}"/>
    <path d="M ${x1 - 46} ${y - br} L ${x1 + br} ${y - br} L ${x1 + br} ${y + 46}"/>
    <path d="M ${x1 + br} ${y1 - 46} L ${x1 + br} ${y1 + br} L ${x1 - 46} ${y1 + br}"/>
    <path d="M ${x + 46} ${y1 + br} L ${x - br} ${y1 + br} L ${x - br} ${y1 - 46}"/>
  </g>

  <!-- séparateur losange -->
  <line x1="196" y1="580" x2="296" y2="580" stroke="#C9A961" stroke-opacity="0.55" stroke-width="1"/>
  <path d="M ${W / 2} 572 L ${W / 2 + 8} 580 L ${W / 2} 588 L ${W / 2 - 8} 580 Z" fill="url(#or)"/>
  <line x1="344" y1="580" x2="444" y2="580" stroke="#C9A961" stroke-opacity="0.55" stroke-width="1"/>

  <!-- typographie bas -->
  <text x="${W / 2}" y="646" text-anchor="middle" font-family="${FONT_STACK}" font-size="32" fill="#EDE6D4">${esc(label)}</text>
  <text x="${W / 2}" y="700" text-anchor="middle" font-family="${FONT_STACK}" font-size="14" letter-spacing="6" fill="#C9A961" fill-opacity="0.9">${esc(signature.toUpperCase())}</text>
</svg>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** PNG haute résolution de la plaque (échelle ×2 par défaut → 1280×1840) */
export async function plaquePngDataUrl(opts: PlaqueOptions, scale = 2): Promise<string> {
  const qrPng = await qrLocalDataUrl(opts.data, 1184)
  const svg = plaqueSvgString({ ...opts, qrPng })
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('Rendu SVG impossible'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Télécharge la plaque complète (repli : QR brut si le rendu échoue) */
export async function downloadPlaquePng(opts: PlaqueOptions, filename: string): Promise<void> {
  let href: string
  try {
    href = await plaquePngDataUrl(opts)
  } catch {
    href = await qrLocalDataUrl(opts.data, 800)
  }
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Feuille d'impression luxe — médaillon posé sur marbre, prêt pour le chevalet */
export async function printPlaque(opts: PlaqueOptions, title: string): Promise<void> {
  const png = await plaquePngDataUrl(opts, 2)
  const w = window.open('', '_blank', 'width=520,height=760')
  if (!w) return
  w.document.write(`
    <html><head><title>${escHtml(title)}</title></head>
    <body style="margin:0;background:#F7F3EA;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Georgia,'Playfair Display',serif;">
      <div style="text-align:center;padding:36px 20px;">
        <img src="${png}" alt="Plaque QR" style="width:380px;max-width:92vw;border-radius:18px;box-shadow:0 24px 60px rgba(20,20,22,0.30);" />
        <p style="margin-top:22px;color:#8B6F47;font-size:12px;letter-spacing:4px;text-transform:uppercase;">${escHtml(title)}</p>
        <p style="margin-top:6px;color:#8B6F47;opacity:0.72;font-size:11px;">Salon VIP — Lounge Premium · Service discret, votre confort d&rsquo;abord</p>
      </div>
    </body></html>
  `)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
