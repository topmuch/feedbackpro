'use client'

// ============================================================
// <AirportStaffView /> — PWA employé (QR Staff Only)
// ------------------------------------------------------------
// L'employé scanne un QR "Staff Only" et arrive sur cette page.
// 3 actions possibles :
//   1. TAKE_CHARGE : "Je prends en charge" + photo AVANT
//   2. RESOLVE : "J'ai fini" + photo APRÈS → voix wallboard
//   3. REPORT_ISSUE : "Manque de papier" / "Clim en panne" → voix wallboard + email manager
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, AlertTriangle, Loader2, Send, X, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Phase = 'menu' | 'take_charge' | 'resolve' | 'report_issue' | 'success'
type StaffViewProps = { staffTag: string; onExit: () => void }

export function AirportStaffView({ staffTag, onExit }: StaffViewProps) {
  const [phase, setPhase] = useState<Phase>('menu')
  const [message, setMessage] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [reportId, setReportId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const rid = params.get('report')
    if (rid) setReportId(rid)
  }, [])

  async function onPhotoChoisie(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (fichier.size > 5 * 1024 * 1024) return
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append('photo', fichier)
      const res = await fetch('/api/public/upload', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok && json.data?.url) setPhotoUrl(json.data.url)
    } catch { /* ignore */ } finally { setPhotoUploading(false) }
  }

  async function submitAction(action: 'TAKE_CHARGE' | 'RESOLVE' | 'REPORT_ISSUE') {
    setSubmitting(true)
    try {
      const res = await fetch('/api/airport/staff-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffTag, action, reportId, photoUrl, message: message.trim() || null, staffName: staffName.trim() || undefined }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setSuccessMsg(
          action === 'TAKE_CHARGE' ? 'Prise en charge enregistrée. Le wallboard a été notifié.'
          : action === 'RESOLVE' ? 'Incident résolu. Denise a annoncé la résolution dans le wallboard.'
          : 'Signalement interne envoyé. Denise a alerté le wallboard et le manager par email.'
        )
        setPhase('success')
      }
    } catch { /* ignore */ } finally { setSubmitting(false) }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-emerald-50/40">
      <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[#5257C9]/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-[#4CC96B]/15 blur-3xl" />

      <header className="relative z-10 bg-gradient-to-r from-[#5257C9] to-[#4CC96B] text-white shadow-lg">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm"><Wrench className="size-4 text-white" /></div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/90">Staff Only</span>
          </div>
          <button onClick={onExit} aria-label="Quitter" className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25"><X className="size-5" /></button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        {phase === 'menu' && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-white/70 shadow-lg ring-1 ring-white/60"><Wrench className="size-8 text-[#5257C9]" /></div>
              <h1 className="mt-3 text-2xl font-black text-[#1E1E2E]">Espace employé</h1>
              <p className="mt-1 text-sm text-[#9A9AAE]">QR staff : <span className="font-mono font-bold">{staffTag}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-[#9A9AAE]">Votre nom (optionnel)</Label>
              <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Ex: Marc, Sophie…" className="rounded-xl border-2 border-white bg-white/70 ring-1 ring-white/60" />
            </div>
            <div className="space-y-3">
              {reportId && (<>
                <button onClick={() => setPhase('take_charge')} className="flex w-full items-center gap-3 rounded-2xl border-2 border-[#5257C9]/20 bg-white/70 p-4 shadow-md ring-1 ring-white/60 hover:border-[#5257C9]">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#5257C9] to-[#4549b8] text-white"><Camera className="size-6" /></div>
                  <div className="text-left"><p className="text-sm font-bold text-[#1E1E2E]">Prendre en charge</p><p className="text-xs text-[#9A9AAE]">Photo avant intervention</p></div>
                </button>
                <button onClick={() => setPhase('resolve')} className="flex w-full items-center gap-3 rounded-2xl border-2 border-[#4CC96B]/20 bg-white/70 p-4 shadow-md ring-1 ring-white/60 hover:border-[#4CC96B]">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4CC96B] to-[#3aa856] text-white"><CheckCircle2 className="size-6" /></div>
                  <div className="text-left"><p className="text-sm font-bold text-[#1E1E2E]">Incident résolu</p><p className="text-xs text-[#9A9AAE]">Photo après → Denise annonce la résolution</p></div>
                </button>
              </>)}
              <button onClick={() => setPhase('report_issue')} className="flex w-full items-center gap-3 rounded-2xl border-2 border-[#E8B54D]/20 bg-white/70 p-4 shadow-md ring-1 ring-white/60 hover:border-[#E8B54D]">
                <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#E8B54D] to-[#d4a040] text-white"><AlertTriangle className="size-6" /></div>
                <div className="text-left"><p className="text-sm font-bold text-[#1E1E2E]">Signaler un problème interne</p><p className="text-xs text-[#9A9AAE]">Manque de papier, clim en panne → Denise alerte le wallboard</p></div>
              </button>
            </div>
          </div>
        )}

        {(phase === 'take_charge' || phase === 'resolve') && (
          <div className="space-y-4">
            <button onClick={() => setPhase('menu')} className="text-xs font-bold text-[#5257C9]">← Retour</button>
            <h1 className="text-xl font-black text-[#1E1E2E]">{phase === 'take_charge' ? 'Photo AVANT intervention' : 'Photo APRÈS résolution'}</h1>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onPhotoChoisie} className="sr-only" />
            {!photoUrl ? (
              <button onClick={() => fileInputRef.current?.click()} disabled={photoUploading} className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#5257C9]/30 bg-white/60 p-8 hover:border-[#5257C9]">
                {photoUploading ? <Loader2 className="size-8 animate-spin text-[#5257C9]" /> : <Camera className="size-8 text-[#5257C9]" />}
                <span className="text-sm font-bold text-[#1E1E2E]">{photoUploading ? 'Upload…' : 'Prendre une photo'}</span>
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border-2 border-white shadow-lg ring-1 ring-white/60">
                <img src={photoUrl} alt="Photo" className="h-48 w-full object-cover" />
                <button onClick={() => setPhotoUrl(null)} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-xl bg-black/60 text-white"><X className="size-4" /></button>
              </div>
            )}
            <Button onClick={() => void submitAction(phase === 'take_charge' ? 'TAKE_CHARGE' : 'RESOLVE')} disabled={submitting || (!photoUrl && phase === 'take_charge')} className="w-full rounded-2xl bg-gradient-to-r from-[#5257C9] to-[#4549b8] py-5 text-base font-bold text-white shadow-lg">
              {submitting ? <Loader2 className="size-5 animate-spin" /> : phase === 'take_charge' ? 'Confirmer la prise en charge' : 'Confirmer la résolution'}
            </Button>
          </div>
        )}

        {phase === 'report_issue' && (
          <div className="space-y-4">
            <button onClick={() => setPhase('menu')} className="text-xs font-bold text-[#5257C9]">← Retour</button>
            <h1 className="text-xl font-black text-[#1E1E2E]">Signaler un problème interne</h1>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wide text-[#9A9AAE]">Quel problème ?</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} placeholder="Ex: Manque de papier toilette, clim en panne…" className="rounded-xl border-2 border-white bg-white/70 ring-1 ring-white/60" />
            </div>
            <div className="flex flex-wrap gap-2">
              {['Manque de papier', 'Manque de savon', 'Clim en panne', 'Distributeur HS', 'Porte cassée'].map((s) => (
                <button key={s} onClick={() => setMessage(s)} className="rounded-full border border-[#E8B54D]/30 bg-[#E8B54D]/10 px-3 py-1.5 text-xs font-bold text-[#1E1E2E] hover:bg-[#E8B54D]/20">{s}</button>
              ))}
            </div>
            <Button onClick={() => void submitAction('REPORT_ISSUE')} disabled={submitting || !message.trim()} className="w-full rounded-2xl bg-gradient-to-r from-[#E8B54D] to-[#d4a040] py-5 text-base font-bold text-white shadow-lg">
              {submitting ? <Loader2 className="size-5 animate-spin" /> : <><Send className="size-4 mr-1.5" /> Envoyer le signalement</>}
            </Button>
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="relative">
              <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-[#4CC96B]/30 to-[#3aa856]/20 blur-2xl" />
              <div className="relative flex size-20 items-center justify-center rounded-3xl bg-white/70 shadow-xl ring-1 ring-white/60"><CheckCircle2 className="size-12 text-[#4CC96B]" strokeWidth={2.5} /></div>
            </div>
            <h1 className="text-2xl font-black text-[#1E1E2E]">C'est fait !</h1>
            <p className="text-sm text-[#9A9AAE]">{successMsg}</p>
            <Button onClick={onExit} className="rounded-2xl bg-gradient-to-r from-[#5257C9] to-[#4549b8] px-8 py-3 font-bold text-white">Terminer</Button>
          </div>
        )}
      </main>
    </div>
  )
}
