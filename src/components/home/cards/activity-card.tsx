"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  storeName: string
  itemName: string
  price: number
  lastWdnMinutesAgo: number
  distanceText: string
  onClick?: () => void
}

export function ActivityCard({
  storeName,
  itemName,
  price,
  lastWdnMinutesAgo,
  distanceText,
  onClick,
}: Props) {
  return (
    <Card
      className="w-full border border-white/20 bg-card/80 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] active:scale-[0.99] duration-150"
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === "Enter" || e.key === " ") onClick()
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="default"
            className="rounded-full bg-emerald-600 hover:bg-emerald-600 px-2 text-[11px] shadow-[0_0_16px_rgba(16,185,129,0.25)]"
          >
            Verified
          </Badge>
          <Badge variant="secondary" className="rounded-full px-2 text-[11px]">
            Fresh
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full px-2 text-[11px] ring-1 ring-yellow-300/30 shadow-[0_0_16px_rgba(255,214,0,0.18)] text-yellow-200/90"
          >
            {distanceText}
          </Badge>
        </div>
        <CardTitle className="mt-3 text-lg">{itemName}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-base font-medium text-muted-foreground">{storeName}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Someone just W’d this {Math.max(0, Math.round(lastWdnMinutesAgo))}m ago
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black tracking-tight">${price.toFixed(2)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

