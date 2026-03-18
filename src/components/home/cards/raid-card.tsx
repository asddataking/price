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
    <Card className="w-full border border-white/20 bg-card/80 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] active:scale-[0.99] duration-150">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="rounded-full bg-primary px-2 text-[11px]">
            Win Raid
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full px-2 text-[12px] ring-1 ring-yellow-300/30 shadow-[0_0_16px_rgba(255,214,0,0.18)] text-yellow-200/90"
          >
            {distanceText}
          </Badge>
        </div>
        <CardTitle className="mt-3 text-lg">{storeName}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-3xl font-black tracking-tight">{rewardPoints} pts</div>
            <div className="mt-1 text-base text-muted-foreground">{captureCopy}</div>
          </div>

          <Button
            type="button"
            className="rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-5 py-2.5 text-base font-bold text-white shadow-[0_0_18px_rgba(217,70,239,0.35)] hover:opacity-95 active:scale-[0.99] transition"
            onClick={onStartRaid}
          >
            Start Raid
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

