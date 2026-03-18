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
    <Card className="w-full border bg-card/80 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              confidence.className ?? "",
            )}
          >
            {confidence.label}
          </Badge>
          {verified ? (
            <Badge variant="default" className="rounded-full bg-emerald-600 hover:bg-emerald-600 text-[10px]">
              Verified
            </Badge>
          ) : (
            <Badge variant="secondary" className="rounded-full text-[10px]">
              Unverified
            </Badge>
          )}
        </div>
        <CardTitle className="mt-2 text-base">
          {itemName}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-muted-foreground">
              {storeName}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {distanceText} • Last W’d {Math.max(0, Math.round(lastWdnMinutesAgo))}m ago
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-black tracking-tight">
              ${price.toFixed(2)}
            </div>
            {onPrimaryAction && primaryActionLabel ? (
              <Button
                type="button"
                className="mt-2 rounded-xl bg-primary px-3 py-2 text-sm"
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

