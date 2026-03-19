"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type RecentChip = {
  query: string
}

export function SearchHeader({
  locationLabel,
  value,
  onChange,
  onSubmit,
  loading,
  recentSearches,
  quickActions,
  onQuickAction,
  onRecentTap,
  locationControls,
}: {
  locationLabel: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  recentSearches: RecentChip[]
  quickActions: Array<{ key: string; label: string }>
  onQuickAction: (key: string) => void
  onRecentTap: (query: string) => void
  locationControls?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-50 bg-background/75 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-muted-foreground">Location</div>
            <div className="truncate text-xl font-black tracking-tight">{locationLabel}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-xs bg-white/5 ring-1 ring-white/10">
              Daily deals
            </Badge>
          </div>
        </div>

        <div className="mt-3">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault()
              if (loading) return
              onSubmit()
            }}
          >
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/50">
              <SearchIcon className="size-4" />
            </div>
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Search products, drinks, groceries, tools near you..."
              disabled={loading}
              className={cn("h-12 rounded-2xl border-white/10 bg-white/5 pl-10 pr-3 text-base placeholder:text-white/40 focus-visible:ring-magenta-400/30")}
            />
            <Button
              type="submit"
              disabled={loading || value.trim().length === 0}
              className="absolute right-1.5 top-1.5 h-9 rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-4 text-base font-bold text-white shadow-[0_0_18px_rgba(217,70,239,0.22)] hover:opacity-95 active:scale-[0.99] transition"
            >
              {loading ? "..." : "Search"}
            </Button>
          </form>
        </div>

        {locationControls ? <div className="mt-3">{locationControls}</div> : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-muted-foreground">Quick actions</div>
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-2">
          {quickActions.map((a) => (
            <Button
              key={a.key}
              type="button"
              variant="secondary"
              className="h-9 shrink-0 rounded-2xl bg-white/5 px-3 text-[13px] text-white/90 ring-1 ring-white/10 hover:bg-white/10"
              onClick={() => onQuickAction(a.key)}
              disabled={loading}
            >
              {a.label}
            </Button>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-muted-foreground">Recent exact searches</div>
            {recentSearches.length > 0 ? (
              <div className="text-[11px] text-white/45">Tap to rerun</div>
            ) : (
              <div className="text-[11px] text-white/45">Start typing to search</div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
            {recentSearches.length === 0 ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-9 w-[120px] animate-pulse rounded-2xl bg-muted/40 ring-1 ring-white/10" />
              ))
            ) : (
              recentSearches.slice(0, 8).map((r) => (
                <button
                  key={r.query}
                  type="button"
                  onClick={() => onRecentTap(r.query)}
                  className="h-9 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-[13px] text-white/90 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.99] whitespace-nowrap"
                >
                  {r.query}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

