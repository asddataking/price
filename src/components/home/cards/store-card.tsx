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
  onRaidHere: () => void
}

export function StoreCard({
  storeName,
  trackedItems,
  lastUpdateText,
  distanceText,
  onRaidHere,
}: Props) {
  return (
    <Card className="w-full min-w-[180px] border bg-card/80 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
            {distanceText}
          </Badge>
          <Badge variant="outline" className="rounded-full px-2 text-[10px]">
            {trackedItems} items
          </Badge>
        </div>
        <CardTitle className="mt-2 text-base">{storeName}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="text-xs text-muted-foreground">{lastUpdateText}</div>
        <Button
          type="button"
          className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-sm"
          onClick={onRaidHere}
        >
          Raid here
        </Button>
      </CardContent>
    </Card>
  )
}

