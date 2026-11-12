# Task: Aurora Glass Landing Redesign — landing-view.tsx

## File
- Path: `/home/z/my-project/src/components/feedbackpro/landing-view.tsx`
- Lines: 1432
- Export preserved: `export function LandingView({ onLogin, onSignup })`
- Directive: `"use client"`

## Checks
- ESLint on the file: clean (no output, 0 errors)
- `tsc --noEmit --skipLibCheck`: EXIT 0 (no type errors)
- Dev server: compiles & serves `GET / 200` (no errors in dev.log related to this file)
- Note: `bun run lint` reports 3 pre-existing errors in OTHER files (a scratch-card component + db.ts), none in landing-view.tsx.

## Sections built (9)
1. Header — light glass sticky (logo img + nav + login/signup + mobile Sheet)
2. Hero — Aurora Glass (3 animated blobs, grid overlay, gradient H1, glass browser mockup with looping 6s card/priority animation, 2 floating badges)
3. Problem — dark impact (3 count-up stats: 73% / 12x / 5min)
4. Solution — glass bento (5 tiles, gap-free 3-col layout with tall gamification sidebar)
5. How it works — cinematic timeline (dark, 4 steps, framer-motion scaleX gradient line)
6. Social proof — metrics (3 count-up) + infinite CSS marquee of testimonials
7. Pricing — glass premium (3 plans, mensuel/annuel toggle with -20% badge, Pro highlighted)
8. FAQ — minimal (shadcn Accordion, 6 items)
9. Final CTA (gradient + aurora) + dark footer

## Logo usage
- Header: `<img src="/logo-feedbackpro.png" className="h-8 sm:h-9 w-auto" />`
- Hero left column: logo h-10 with indigo drop-shadow glow
- Mobile Sheet header: logo h-8
- Final CTA: logo h-12 with `brightness-0 invert` (white on gradient)
- Footer: logo h-10 with `brightness-0 invert opacity-60`

## WAHOO effects
- Animated aurora blobs (3, slow 20/25/30s loops, blur-[100px])
- Linear-style grid overlay with radial mask
- Gradient clip-text headlines (indigo->violet->cyan)
- Floating glass browser mockup (rotate-1 -> 0 on hover, fbp-float bob)
- Looping dashboard animation (4 feedback cards stagger in 0/0.3/0.6/0.9s, 3 IA priorities at 1.2/1.5/1.8s, hold, fade, 6s loop)
- Two floating glass badges around mockup (NPS +12, IA active pulse)
- Count-up stats with easeOutCubic + useInView
- Cinematic timeline with scroll-filled gradient line
- Infinite testimonial marquee with edge fade masks + pause-on-hover
- Blur->clear framer-motion reveals on every block
- Dramatic dark sections (#0A0B1A) alternating with light for contrast
- prefers-reduced-motion respected
