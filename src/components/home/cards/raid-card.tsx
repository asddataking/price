"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  storeName: string
  rewardPoints: number
  distanceText: string
  captureCopy: string
  onStartRaid: () => void
}

export function RaidCard({ storeName, rewardPoints, distanceText, captureCopy, onStartRaid }: Props) {
  return (
    <Card className="w-full border bg-card/80 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="rounded-full bg-primary px-2 text-[10px]">
            Win Raid
          </Badge>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px]">
            {distanceText}
          </Badge>
        </div>
        <CardTitle className="mt-2 text-base">{storeName}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-2xl font-black tracking-tight">{rewardPoints} pts</div>
            <div className="mt-1 text-sm text-muted-foreground">{captureCopy}</div>
          </div>

          <Button
            type="button"
            className="rounded-xl bg-primary px-4 py-2 text-sm"
            onClick={onStartRaid}
          >
            Start Raid
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

