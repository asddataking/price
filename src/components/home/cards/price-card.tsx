"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type PriceCardConfidence = {
  label: string
  className?: string
}

type Props = {
  storeName: string
  itemName: string
  price: number
  lastWdnMinutesAgo: number
  distanceText: string
  verified: boolean
  confidence: PriceCardConfidence
  onPrimaryAction?: () => void
  primaryActionLabel?: string
}

export function PriceCard({
  storeName,
  itemName,
  price,
  lastWdnMinutesAgo,
  distanceText,
  verified,
  confidence,
  onPrimaryAction,
  primaryActionLabel,
}: Props) {
  return (
    <Card className="w-full border border-white/20 bg-card/80 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] active:scale-[0.99] duration-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", confidence.className ?? "")}
          >
            {confidence.label}
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full px-2 py-0.5 text-[11px] ring-1 ring-yellow-300/30 shadow-[0_0_16px_rgba(255,214,0,0.18)] text-yellow-200/90"
          >
            {distanceText}
          </Badge>
          {verified ? (
            <Badge variant="default" className="rounded-full bg-emerald-600 hover:bg-emerald-600 text-[11px]">
              Verified
            </Badge>
          ) : (
            <Badge variant="secondary" className="rounded-full text-[11px]">
              Unverified
            </Badge>
          )}
        </div>
      <CardTitle className="mt-3 text-lg">
          {itemName}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
          <div className="truncate text-base font-medium text-muted-foreground">
              {storeName}
            </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Last W’d {Math.max(0, Math.round(lastWdnMinutesAgo))}m ago
          </div>
          </div>

          <div className="text-right">
          <div className="text-3xl font-black tracking-tight">
              ${price.toFixed(2)}
            </div>
            {onPrimaryAction && primaryActionLabel ? (
              <Button
                type="button"
              className="mt-3 rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-4 py-2.5 text-base font-bold text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] hover:opacity-95 active:scale-[0.99] transition"
                onClick={onPrimaryAction}
              >
                {primaryActionLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

