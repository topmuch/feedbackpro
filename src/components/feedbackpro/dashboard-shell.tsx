'use client'

import { useFpStore } from '@/store/feedbackpro-store'
import { RetoursTab } from '@/components/feedbackpro/retours-tab'
import { OverviewTab } from '@/components/feedbackpro/overview-tab'
import { PersonnelTab } from '@/components/feedbackpro/personnel-tab'
import { ParametresTab } from '@/components/feedbackpro/parametres-tab'
import { Button } from '@/components/ui/button'
import { MessageSquare, LayoutDashboard, MessageCircleWarning, Users, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DashboardShell() {
  const { user, activeTab, setTab, logout, detailRetourId, retours } = useFpStore()

  const tabs = [
    { id: 'overview' as const, label: 'Vue d’ensemble', icon: LayoutDashboard },
    { id: 'retours' as const, label: 'Retours', icon: MessageCircleWarning, badge: retours.filter((r) => r.statut === 'NOUVEAU').length },
    { id: 'personnel' as const, label: 'Personnel', icon: Users },
    { id: 'parametres' as const, label: 'Paramètres', icon: Settings },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="font-semibold">FeedbackPro</span>
            {user?.etablissements?.[0] && (
              <span className="hidden sm:inline text-sm text-muted-foreground">
                · {user.etablissements[0].nom}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              <LogOut className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
        {/* Tabs nav */}
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = activeTab === t.id && !detailRetourId
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.badge && t.badge > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground">
                    {t.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && !detailRetourId && <OverviewTab />}
        {activeTab === 'retours' && <RetoursTab />}
        {activeTab === 'personnel' && !detailRetourId && <PersonnelTab />}
        {activeTab === 'parametres' && !detailRetourId && <ParametresTab />}
      </main>

      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        FeedbackPro · Espace Pro · {new Date().getFullYear()}
      </footer>
    </div>
  )
}
