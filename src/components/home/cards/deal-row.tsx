"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { DealCardSkeleton, type DealCardSize } from "./deal-card"

type DealRowItem = {
  id: string
  render: (size: DealCardSize) => React.ReactNode
}

export function DealRow({
  title,
  subtitle,
  badgeLabel,
  items,
  cardSize = "compact",
  skeletonCount = 6,
  loading,
}: {
  title: string
  subtitle?: string
  badgeLabel?: string
  items: DealRowItem[]
  cardSize?: DealCardSize
  skeletonCount?: number
  loading: boolean
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-base font-semibold text-white/95">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        {badgeLabel ? (
          <Badge
            variant="secondary"
            className="rounded-full px-3 py-0.5 text-xs ring-1 ring-magenta-400/30 shadow-[0_0_18px_rgba(217,70,239,0.25)] bg-white/5"
          >
            {badgeLabel}
          </Badge>
        ) : null}
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-[linear-gradient(to_right,rgba(0,0,0,0.55),transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-[linear-gradient(to_left,rgba(0,0,0,0.55),transparent)]" />

        <div className="relative overflow-x-auto pb-2">
          <div className={cn("flex gap-3", items.length > 0 ? "px-1" : "px-1")}>
            {loading
              ? Array.from({ length: skeletonCount }).map((_, idx) => (
                  <DealCardSkeleton key={idx} size={cardSize} />
                ))
              : items.map((it) => <React.Fragment key={it.id}>{it.render(cardSize)}</React.Fragment>)}
          </div>
        </div>
      </div>
    </section>
  )
}

