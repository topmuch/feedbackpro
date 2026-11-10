"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

/**
 * Toggle du mode sombre.
 * tone="dark"  → bouton sur fond bleu foncé (dashboards) : texte blanc forcé.
 * tone="light" → bouton sur fond clair (landing/auth) : texte standard.
 *
 * next-themes ne connaît le thème qu'après montage côté client. On évite le
 * mismatch d'hydration en rendant un placeholder neutre tant que
 * `resolvedTheme` est indéfini (état initial SSR + premier render client).
 */
export function ThemeToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { setTheme, resolvedTheme } = useTheme()

  const isDark = resolvedTheme === "dark"
  const isReady = resolvedTheme !== undefined
  const label = isDark ? "Passer en mode clair" : "Passer en mode sombre"

  const colorClass =
    tone === "dark"
      ? "text-white hover:bg-white/15 hover:text-white"
      : "text-foreground hover:bg-muted"

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={colorClass}
      suppressHydrationWarning
    >
      {isReady ? (
        isDark ? (
          <Moon className="h-4 w-4" aria-hidden />
        ) : (
          <Sun className="h-4 w-4" aria-hidden />
        )
      ) : (
        // Placeholder neutre avant résolution côté client (évite le mismatch SSR)
        <Sun className="h-4 w-4 opacity-0" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
