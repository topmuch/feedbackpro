# Task 6 — City Wallboard Mobile Responsive

**File**: `/home/z/my-project/src/app/city-wallboard/page.tsx`
**Goal**: Make the TV/desktop wallboard responsive on mobile (375px / iPhone SE).

## What was done

CSS/Tailwind responsive class fixes ONLY — no TypeScript logic, state, refs, or callbacks changed. All polling, TTS, audio unlock, ding logic untouched.

### 1. Root wrapper
- Added `overflow-x-hidden` to prevent horizontal scroll on small viewports.

### 2. Header
- Container padding: `px-6 py-4` → `gap-2 p-3 md:gap-4 md:p-6`
- Left icon tile: `h-14 w-14` → `h-10 w-10 md:h-14 md:w-14`; Building2 icon `h-8 w-8` → `h-5 w-5 md:h-8 md:w-8`
- Title: `text-xl md:text-3xl` → `text-2xl md:text-4xl`
- Subtitle: `text-[11px]` → `text-[10px] md:text-xs`
- Right side (clock + sound toggle): stacks vertically on mobile via `flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-4`
- Clock icon `h-5 w-5` → `h-4 w-4 md:h-5 md:w-5`; clock time `text-2xl` → `text-xl md:text-3xl`; clock date `text-[10px]` → `text-[9px] md:text-[11px]`
- Toggle button: `h-14 w-14` → `h-10 w-10 md:h-14 md:w-14`; Volume icons `h-7 w-7` → `h-5 w-5 md:h-7 md:w-7`

### 3. KPI cards grid
- Grid: `grid-cols-2 gap-3 px-6 py-4 md:grid-cols-3 lg:grid-cols-6` → `grid-cols-2 gap-2 px-3 py-2 sm:grid-cols-3 md:gap-3 md:px-6 md:py-4 lg:grid-cols-6`
- KpiCard padding: `gap-3 p-4` → `gap-2 p-2 md:gap-3 md:p-4`
- Icon tile: `h-12 w-12` → `h-8 w-8 md:h-12 md:w-12`; icon `h-6 w-6` → `h-4 w-4 md:h-6 md:w-6`
- Value text: `text-2xl` → `text-xl md:text-3xl` (prevents overflow in 2-col mobile grid)
- Badge: `h-7 min-w-[28px] text-xs` → `h-6 min-w-[24px] text-[10px] md:h-7 md:min-w-[28px] md:text-xs`

### 4. Bandeau contextuel (live status)
- `gap-4 px-6 text-xs` → `gap-2 px-3 text-[10px] md:gap-4 md:px-6 md:text-xs`

### 5. Main grid
- `gap-4 px-6 py-4` → `gap-3 px-3 py-3 md:px-6 md:py-4` (stacks to 1 col on mobile, already `grid-cols-1 lg:grid-cols-[2fr_1fr]`)

### 6. Panel headers (incidents + urgences + signalements)
- All three: `px-4 py-3` → `px-3 py-2 md:px-4 md:py-3`

### 7. Incidents table
- Scroll container max-height: `max-h-[calc(100vh-380px)] p-3` → `max-h-[55vh] p-2 md:max-h-[calc(100vh-380px)] md:p-3` (mobile uses 55vh since page stacks and scrolls naturally)
- Empty/loading states: `p-8 text-sm` → `p-4 text-xs md:p-8 md:text-sm`
- Row: `gap-3 p-3` → `gap-2 p-2 md:gap-3 md:p-3`
- Icon tile: `h-10 w-10` → `h-8 w-8 md:h-10 md:w-10`; icon `h-5 w-5` → `h-4 w-4 md:h-5 md:w-5`
- Category text: `text-sm` → `text-xs md:text-sm`
- Location text: `text-xs` → `text-[10px] md:text-xs`
- District suffix: hidden on mobile via `<span className="hidden md:inline"> · {district}</span>` (plate label stays, less important district hidden)
- Status badge: `px-2 py-1 text-[10px]` → `px-1.5 py-0.5 text-[9px] md:px-2 md:py-1 md:text-[10px]`
- Time-ago: `text-xs minWidth 38px` → `text-[10px] md:text-xs minWidth 32px`

### 8. Alerts panels (urgences + signalements)
- Count badges: `h-6 min-w-[24px] text-[11px]` → `h-5 min-w-[20px] text-[10px] md:h-6 md:min-w-[24px] md:px-2 md:text-[11px]`
- Scroll containers: `max-h-[calc(50vh-90px)] p-3` → `max-h-[250px] p-2 md:max-h-[calc(50vh-90px)] md:p-3`
- Empty states: `p-3 text-xs` → `p-2 text-[10px] md:p-3 md:text-xs`
- Rows: `gap-2 p-2` → `gap-1.5 p-1.5 md:gap-2 md:p-2`
- Icon tiles: `h-8 w-8` → `h-7 w-7 md:h-8 md:w-8`; icons `h-4 w-4` → `h-3 w-3 md:h-4 md:w-4`
- Category: `text-xs` → `text-[10px] md:text-xs`
- Location: `text-[10px]` → `text-[9px] md:text-[10px]`
- Time: `text-[10px]` → `text-[9px] md:text-[10px]`

### 9. Footer
- Container: `gap-2 px-6 py-3 text-xs` → `gap-1 px-3 py-2 text-[10px] md:gap-2 md:px-6 md:py-3 md:text-xs`
- Stats span: split from one continuous string into separate `<span>` chips with `flex flex-wrap` so they wrap nicely on narrow screens
- Second line: `text-[10px]` → `text-[9px] md:text-xs`

## Verification
- `bun run lint`: no new errors introduced (only pre-existing unrelated error in `city-dashboard.tsx`).
- Dev server compiles cleanly.
- All inline color styles (YELLOW/BLUE/RED/etc.) preserved — only sizes/padding/gaps changed via responsive Tailwind classes.
- No TypeScript logic, state, refs, callbacks, or polling/TTS/audio code modified.

## Breakpoints used
- `sm:` (640px+) — KPI grid goes 2→3 cols
- `md:` (768px+) — restores desktop sizing (padding, font sizes, icon tiles, badge sizes)
- `lg:` (1024px+) — main grid splits into 2 cols, KPI grid goes to 6 cols
