"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"

export function SavedListCard({
  title,
  itemsCount,
  metaLine,
  insightLine,
  badgeLabel,
  onClick,
}: {
  title: string
  itemsCount: number
  metaLine: string
  insightLine: string
  badgeLabel?: string
  onClick?: () => void
}) {
  const clickable = Boolean(onClick)

  return (
    <motion.div
      whileHover={clickable ? { y: -2, boxShadow: "0 0 34px rgba(217,70,239,0.16)" } : undefined}
      whileTap={clickable ? { scale: 0.99 } : undefined}
      className="rounded-2xl ring-1 ring-white/10 bg-card/60 backdrop-blur overflow-hidden"
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        className={[
          "w-full text-left p-4",
          "disabled:cursor-default",
          clickable ? "cursor-pointer" : "cursor-default",
        ].join(" ")}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(217,70,239,0.20),transparent_60%),radial-gradient(circle_at_90%_70%,rgba(255,214,0,0.14),transparent_60%)] blur-2xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_55%)]" />
        </div>

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {badgeLabel ? (
                <Badge variant="secondary" className="rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-0.5 text-xs">
                  {badgeLabel}
                </Badge>
              ) : null}
              <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs ring-1 ring-yellow-300/20 text-yellow-200/90 bg-transparent">
                {itemsCount} items
              </Badge>
            </div>

            <div className="mt-3 text-lg font-black tracking-tight text-white/95">{title}</div>
            <div className="mt-1 text-xs text-white/60">{metaLine}</div>
          </div>
        </div>

        <div className="relative mt-4 text-sm font-semibold text-emerald-200/95">{insightLine}</div>
      </button>
    </motion.div>
  )
}

