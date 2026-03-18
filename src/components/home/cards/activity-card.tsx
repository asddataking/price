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
      className="w-full border bg-card/80 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === "Enter" || e.key === " ") onClick()
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="rounded-full bg-emerald-600 hover:bg-emerald-600 px-2 text-[10px]">
            Verified
          </Badge>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
            Fresh
          </Badge>
        </div>
        <CardTitle className="mt-2 text-base">{itemName}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-muted-foreground">{storeName}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {distanceText} • Someone just W’d this {Math.max(0, Math.round(lastWdnMinutesAgo))}m ago
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black tracking-tight">${price.toFixed(2)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

