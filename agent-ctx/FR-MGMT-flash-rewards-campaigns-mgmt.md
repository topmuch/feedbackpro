# FR-MGMT — Flash Rewards Campaigns Management

**Agent**: Z.ai Code (fullstack-dev)
**Task ID**: FR-MGMT
**Date**: 2025
**File modified**: `src/components/feedbackpro/admin-flash-rewards-tab.tsx`

## Summary

Added a "Campagnes" management sub-tab (FIRST tab) to the Flash Rewards admin
section. Users can now list, edit, delete, pause/activate, and prolong existing
Flash Reward campaigns. Previously, once a campaign was created there was no
way to manage it.

## What was created/modified

### 1. Imports (top of file)
- Added Lucide icons: `Pencil`, `Trash2`, `Pause`, `Play`, `Clock`
- Added shadcn `AlertDialog` component family (AlertDialog, AlertDialogAction,
  AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle)
- Updated file header comment: 4 → 5 sub-sections

### 2. Main component `AdminFlashRewardsTab`
- Converted from stateless return to stateful component
- Added state: `activeTab` (default `"campaigns"`), `editingCampaign` (FlashRewardCampaign | null)
- Added handlers: `handleEditCampaign` (sets editingCampaign + switches to create tab),
  `handleCancelEdit` (clears editingCampaign + switches back to campaigns tab)
- Tabs changed from `defaultValue="create"` to controlled `value={activeTab} onValueChange={setActiveTab}`
- TabsList grid changed from `grid-cols-2 sm:grid-cols-4` → `grid-cols-5` (5 tabs now)
- Added FIRST TabsTrigger `value="campaigns"` with Gift icon + "Campagnes" label
- Added TabsContent for "campaigns" rendering `<CampaignsListSection onEditCampaign={handleEditCampaign} />`
- CreateCampaignSection now receives `editingCampaign` + `onCancelEdit` props

### 3. `CreateCampaignSection` (Section A — Créer)
- Signature changed to accept `{ editingCampaign?, onCancelEdit? }` props
- Added `useEffect` on `editingCampaign` that prefills the entire form
  (converts campaign fields back to form state: numbers → strings, ISO endDate →
  YYYY-MM-DD for the date input via `.slice(0, 10)`)
- Submit logic now branches:
  - `isEditing = !!editingCampaign`
  - URL: PATCH `/api/airport/flash-rewards/[id]` vs POST `/api/airport/flash-rewards`
  - Method: PATCH vs POST
  - Toast title: "Campagne modifiée" vs "Campagne créée"
  - On PATCH success: calls `onCancelEdit?.()` to return to list
- Title now dynamic: "Modifier la campagne" (with Pencil icon) vs
  "Créer une campagne Flash Reward" (with Plus icon)
- CardDescription also dynamic
- Submit button label: "Enregistrer les modifications" vs "Enregistrer"
- Added "Annuler" button (only visible when editing) — resets form to EMPTY_FORM
  and calls onCancelEdit
- `useCallback` deps for submit updated: added `editingCampaign`, `onCancelEdit`

### 4. NEW `CampaignsListSection` + `CampaignCard` (appended at end of file)
- `CAMPAIGN_STATUS_BADGE` constant: active (green #10b981) / paused (orange #f59e0b) /
  expired (red #ef4444)
- `CampaignsListSection({ onEditCampaign })`:
  - Fetches campaigns (`GET /api/airport/flash-rewards`) + stats
    (`GET /api/airport/flash-rewards/stats`) in parallel via `Promise.all`
  - Builds a `Map<campaignId, CampaignStat>` for quick stat lookup per card
  - **Polling every 30s** (`setInterval(load, 30000)`)
  - "Rafraîchir" button at top right (RefreshCw icon, spins while loading)
  - **Empty state**: friendly message "Aucune campagne Flash Reward. Créez votre
    première campagne dans l'onglet « Créer »." with a Gift icon in a gold circle
  - Scrollable list (`max-h-[40rem] overflow-y-auto`) of CampaignCard
  - Action handlers (all use relative fetch paths):
    - `toggleStatus` → PATCH `{ status: "paused" | "active" }`
    - `prolongIndefinitely` → PATCH `{ endDate: null }`
    - `setEndDate` → PATCH `{ endDate: "YYYY-MM-DDT23:59:59.999Z" }`
    - `confirmDelete` → DELETE (after AlertDialog confirmation)
  - Each action shows a toast on success/failure and re-fetches the list
  - `busyId` state tracks which campaign is mid-request (disables its buttons,
    dims the card with `opacity-60`, shows a Loader2 spinner)
  - **Delete confirmation** uses shadcn `AlertDialog` (not native confirm()):
    shows campaign title, "Annuler" / "Supprimer définitivement" (red)
- `CampaignCard({ campaign, stat, busy, onEdit, onDelete, onToggleStatus,
  onProlongIndefinite, onSetEndDate })`:
  - Layout: flex row (image left 120×80, info right) on sm+, stacked on mobile
  - **Image preview** (only if `imageUrl` set): `<img>` 120×80 object-cover
  - **Title** (bold, navy, truncate with title tooltip)
  - **Status badge** (colored pill)
  - **Advertiser** (if advertiserName available)
  - **Reward type + value** (e.g. "Pourcentage 10%", "Montant fixe 2000 FCFA")
  - **Zones** (comma-joined codes, or "Toutes" if empty)
  - **Dates**: startDate → endDate (or "Pas d'expiration")
  - **Stats summary** (if stat available): codes générés / utilisés / revenus
    as small pills with icons
  - **Price per code**: XXX FCFA (navy, bold)
  - **Action buttons** row (with border-top separator):
    - Modifier (Pencil) — calls onEdit → parent switches to create tab
    - Pause/Activer (Pause/Play icon, label depends on current status)
    - Prolonger (Clock) — sets endDate=null (indefinite)
    - Supprimer (Trash2, red) — opens AlertDialog
    - Inline date input + "OK" button (ml-auto) to set a specific new endDate

## Edit flow (end-to-end)
1. User on "Campagnes" tab clicks "Modifier" on a campaign card
2. `onEditCampaign(campaign)` → parent sets `editingCampaign` + `activeTab="create"`
3. CreateCampaignSection's `useEffect([editingCampaign])` fires → prefills form
4. Title/icon/description/button label all switch to "edit mode"
5. "Annuler" button appears
6. User edits fields → clicks "Enregistrer les modifications"
7. Submit sends PATCH to `/api/airport/flash-rewards/[id]`
8. On success: toast "Campagne modifiée", form resets to EMPTY_FORM,
   `onCancelEdit()` called → editingCampaign cleared, tab switches back to "campaigns"
9. CampaignsListSection's next poll (or the `void load()` after action) shows
   the updated campaign

## API endpoints used (all relative paths)
- `GET /api/airport/flash-rewards` — list all campaigns
- `GET /api/airport/flash-rewards/stats` — aggregated stats per campaign
- `POST /api/airport/flash-rewards` — create (existing)
- `PATCH /api/airport/flash-rewards/[id]` — partial update (status, endDate, full edit)
- `DELETE /api/airport/flash-rewards/[id]` — delete (cascade)

## Constraints respected
- `'use client'` at top of file (unchanged)
- TypeScript strict typing throughout (props typed, no `any`)
- All fetch calls use relative paths only (no absolute URLs)
- No test code written
- shadcn/ui components used (Card, Button, Badge, Input, AlertDialog, etc.)
- Lucide icons used (Gift, Pencil, Trash2, Pause, Play, Clock, RefreshCw, etc.)
- `useToast` from `@/hooks/use-toast` for all notifications
- Colors: navy #003399, gold #FCD116 (consistent with existing palette)
- Existing functionality preserved (CreateCampaignSection, CodesGeneratedSection,
  StatsSection, ConversionAdvertiserSection all unchanged in behavior)
- Single file: everything added to `admin-flash-rewards-tab.tsx`

## Verification
- `bun run lint` — 0 errors in `admin-flash-rewards-tab.tsx` (3 pre-existing
  errors in unrelated files scratch-card.tsx and db.ts remain, not introduced
  by this change)
- `bunx tsc --noEmit` — 0 errors (full project type-check passes clean)
- Dev server compiles successfully (checked dev.log)

## Line count
File grew from 1278 lines → 1861 lines (+583 lines for the new
CampaignsListSection + CampaignCard + edit-flow wiring in CreateCampaignSection).
