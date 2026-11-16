'use client'

import { create } from 'zustand'
import type { ProUser, Retour, RecompenseConfig, Recommandation } from '@/lib/feedbackpro/types'

type Tab = 'overview' | 'retours' | 'personnel' | 'parametres'

type State = {
  // Auth
  user: ProUser | null
  authLoading: boolean
  authError: string | null

  // Navigation (SPA)
  activeTab: Tab
  detailRetourId: string | null // quand set → affiche la page détail

  // Data
  retours: Retour[]
  retoursLoading: boolean
  recompense: RecompenseConfig | null

  // Per-retour coach recommandation (cache)
  recommandations: Record<string, Recommandation>
  recommandationLoadingId: string | null
}

type Actions = {
  // Auth
  fetchMe: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>

  // Navigation
  setTab: (t: Tab) => void
  openDetail: (id: string) => void
  closeDetail: () => void

  // Data
  fetchRetours: () => Promise<void>
  fetchRecompense: () => Promise<void>
  majRetour: (id: string, patch: Partial<Retour>) => Promise<boolean>
  supprimerRetour: (id: string) => Promise<boolean>

  // Coach IA
  fetchRecommandation: (retourId: string) => Promise<Recommandation | null>
}

export type Store = State & Actions

export const useFpStore = create<Store>((set, get) => ({
  user: null,
  authLoading: true,
  authError: null,

  activeTab: 'retours',
  detailRetourId: null,

  retours: [],
  retoursLoading: false,
  recompense: null,

  recommandations: {},
  recommandationLoadingId: null,

  async fetchMe() {
    set({ authLoading: true, authError: null })
    try {
      const res = await fetch('/api/me', { credentials: 'include' })
      const data = await res.json()
      set({ user: data.user ?? null, authLoading: false })
    } catch {
      set({ user: null, authLoading: false })
    }
  },

  async login(email, password) {
    set({ authLoading: true, authError: null })
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        set({ authLoading: false, authError: data?.error ?? 'Erreur de connexion' })
        return false
      }
      set({ user: data.user, authLoading: false })
      return true
    } catch {
      set({ authLoading: false, authError: 'Erreur réseau' })
      return false
    }
  },

  async logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    set({ user: null, retours: [], detailRetourId: null, recommandations: {} })
  },

  setTab(t) {
    set({ activeTab: t, detailRetourId: null })
  },

  openDetail(id) {
    set({ detailRetourId: id })
  },

  closeDetail() {
    set({ detailRetourId: null })
  },

  async fetchRetours() {
    set({ retoursLoading: true })
    try {
      const res = await fetch('/api/retours', { credentials: 'include' })
      const data = await res.json()
      set({ retours: data?.retours ?? [], retoursLoading: false })
    } catch {
      set({ retoursLoading: false })
    }
  },

  async fetchRecompense() {
    try {
      const res = await fetch('/api/recompense', { credentials: 'include' })
      const data = await res.json()
      set({ recompense: data?.recompense ?? null })
    } catch {
      // ignore
    }
  },

  async majRetour(id, patch) {
    try {
      const res = await fetch(`/api/retours/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      })
      if (!res.ok) return false
      const data = await res.json()
      // MAJ locale
      const updated = data?.retour
      set((s) => ({
        retours: s.retours.map((r) =>
          r.id === id
            ? {
                ...r,
                statut: updated?.statut ?? r.statut,
                actionPrise: updated?.actionPrise ? parseAction(updated.actionPrise) : r.actionPrise,
                reponseGerant: updated?.reponseGerant ?? r.reponseGerant,
                dateReponseGerant: updated?.dateReponseGerant ?? r.dateReponseGerant,
                recompenseUtilisee: updated?.recompenseUtilisee ?? r.recompenseUtilisee,
                dateRecompenseUtilisee: updated?.dateRecompenseUtilisee ?? r.dateRecompenseUtilisee,
              }
            : r
        ),
      }))
      return true
    } catch {
      return false
    }
  },

  async supprimerRetour(id) {
    try {
      const res = await fetch(`/api/retours/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) return false
      set((s) => ({
        retours: s.retours.filter((r) => r.id !== id),
        detailRetourId: s.detailRetourId === id ? null : s.detailRetourId,
      }))
      return true
    } catch {
      return false
    }
  },

  async fetchRecommandation(retourId) {
    set({ recommandationLoadingId: retourId })
    try {
      const r = get().retours.find((x) => x.id === retourId)
      const body = r
        ? { id: r.id, nps: r.nps, tags: r.tags, commentaire: r.commentaire, zone: r.zone, isRecidive: r.isRecidive }
        : { id: retourId, nps: 3, tags: [] }
      const res = await fetch('/api/pro/coach/recommandation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      const reco = data?.recommandation ?? null
      if (reco) {
        set((s) => ({ recommandations: { ...s.recommandations, [retourId]: reco } }))
      }
      set({ recommandationLoadingId: null })
      return reco
    } catch {
      set({ recommandationLoadingId: null })
      return null
    }
  },
}))

function parseAction(raw: unknown): { tags: string[]; commentaire: string } | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw as { tags: string[]; commentaire: string }
}
