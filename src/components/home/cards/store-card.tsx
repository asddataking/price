"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  storeName: string
  trackedItems: number
  lastUpdateText: string
  distanceText: string
  onRaidHere?: () => void
}

export function StoreCard({
  storeName,
  trackedItems,
  lastUpdateText,
  distanceText,
  onRaidHere,
}: Props) {
  return (
    <Card className="w-full min-w-[180px] border border-white/20 bg-card/80 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] active:scale-[0.99] duration-200">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full px-2 text-[12px] ring-1 ring-yellow-300/30 shadow-[0_0_16px_rgba(255,214,0,0.18)] text-yellow-200/90"
          >
            {distanceText}
          </Badge>
          <Badge variant="outline" className="rounded-full px-2 text-[11px]">
            {trackedItems} items
          </Badge>
        </div>
        <CardTitle className="mt-3 text-lg">{storeName}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="text-sm text-muted-foreground">{lastUpdateText}</div>
        {onRaidHere ? (
          <Button
            type="button"
            className="mt-4 w-full rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-4 py-2.5 text-base font-bold text-white shadow-[0_0_18px_rgba(217,70,239,0.35)] hover:opacity-95 active:scale-[0.99] transition"
            onClick={onRaidHere}
          >
            Raid here
          </Button>
        ) : (
          <div className="mt-4 text-xs text-muted-foreground">Raids on the raids page</div>
        )}
      </CardContent>
    </Card>
  )
}

