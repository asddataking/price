"use client"

import * as React from "react"
import { motion } from "framer-motion"

type DealBadgeTone = "brand" | "success" | "warning" | "muted" | "neutral"

export type DealBadge = {
  label: string
  tone: DealBadgeTone
}

export type DealCardSize = "hero" | "medium" | "compact"

export type DealCardProps = {
  size: DealCardSize
  productName: string
  retailerName: string
  distanceText: string
  price: number
  badges?: DealBadge[]
  insight?: string
  isVerified?: boolean
  onClick?: () => void
  imageSeed?: string
}

function toneToClasses(tone: DealBadgeTone) {
  switch (tone) {
    case "brand":
      return "bg-magenta-500/15 text-magenta-200 ring-magenta-400/30"
    case "success":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
    case "warning":
      return "bg-amber-500/15 text-amber-200 ring-amber-400/30"
    case "muted":
      return "bg-white/5 text-white/70 ring-white/10"
    default:
      return "bg-white/5 text-white/70 ring-white/10"
  }
}

function hashToHue(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

function ProductVisual({ seed }: { seed: string }) {
  const s = (seed || "?").trim()
  const initial = s.slice(0, 1).toUpperCase()
  const hue = hashToHue(s)

  return (
    <div
      aria-hidden="true"
      className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/10"
      style={{
        background: `radial-gradient(circle at 30% 20%, hsla(${hue} 90% 60% / 0.35), transparent 55%), radial-gradient(circle at 70% 80%, hsla(${(hue + 60) % 360} 90% 60% / 0.25), transparent 55%), rgba(0,0,0,0.25)`,
      }}
    >
      <div className="absolute inset-0 rounded-2xl bg-[linear-gradient(to_bottom,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="relative z-10 text-xl font-black tracking-tight text-white/90">{initial}</div>
      <div className="absolute bottom-1 right-2 h-2 w-2 rounded-full bg-emerald-400/85 shadow-[0_0_22px_rgba(52,211,153,0.6)]" />
    </div>
  )
}

function DealCardBadge({ badge }: { badge: DealBadge }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${toneToClasses(
        badge.tone,
      )}`}
    >
      {badge.label}
    </span>
  )
}

function SkeletonVisual({ size }: { size: DealCardSize }) {
  const dims = size === "hero" ? "size-16" : size === "medium" ? "size-14" : "size-12"
  return <div className={`shrink-0 rounded-2xl bg-muted/40 ring-1 ring-white/10 ${dims} animate-pulse`} />
}

export function DealCard({
  size,
  productName,
  retailerName,
  distanceText,
  price,
  badges,
  insight,
  onClick,
  imageSeed,
}: DealCardProps) {
  const clickable = Boolean(onClick)
  const rootClasses =
    size === "hero"
      ? "w-[290px] min-h-[230px] rounded-3xl"
      : size === "medium"
        ? "w-[240px] min-h-[200px] rounded-2xl"
        : "w-[180px] min-h-[170px] rounded-2xl"

  const padding = size === "hero" ? "p-4" : size === "medium" ? "p-3" : "p-3"

  const priceClass = size === "hero" ? "text-[30px]" : size === "medium" ? "text-[26px]" : "text-[22px]"

  const productText = size === "hero" ? "text-[15px]" : size === "medium" ? "text-[14px]" : "text-[13px]"

  const subText = size === "hero" ? "text-xs" : "text-[11px]"

  return (
    <motion.button
      type="button"
      whileHover={clickable ? { y: -2, boxShadow: "0 0 40px rgba(217,70,239,0.18)" } : undefined}
      whileTap={clickable ? { scale: 0.99 } : undefined}
      className={[
        "group relative overflow-hidden bg-card/60 backdrop-blur",
        "ring-1 ring-white/10 transition duration-150",
        "hover:bg-card/75",
        clickable ? "cursor-pointer" : "cursor-default",
        rootClasses,
      ].join(" ")}
      onClick={onClick}
      aria-label={clickable ? `${productName} at ${retailerName}` : undefined}
      disabled={!clickable}
    >
      <div className="absolute inset-0">
        <div className="absolute -inset-10 bg-[radial-gradient(circle_at_25%_15%,rgba(217,70,239,0.20),transparent_60%),radial-gradient(circle_at_85%_70%,rgba(255,214,0,0.16),transparent_60%)] blur-2xl" />
      </div>

      <div className={`relative ${padding} flex h-full flex-col`}>
        <div className="flex items-start justify-between gap-3">
          {size === "compact" ? (
            <ProductVisual seed={imageSeed ?? productName} />
          ) : (
            <ProductVisual seed={imageSeed ?? productName} />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {badges?.slice(0, size === "compact" ? 2 : 3).map((b) => (
                <DealCardBadge key={b.label} badge={b} />
              ))}
            </div>

            <div className={`mt-2 truncate font-black tracking-tight text-white/95 ${productText}`}>
              {productName}
            </div>

            <div className={`mt-1 flex items-center gap-2 text-white/60 ${subText}`}>
              <span className="truncate">{retailerName}</span>
              <span className="text-white/25">•</span>
              <span className="whitespace-nowrap">{distanceText}</span>
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            <div className={`font-black tracking-tight text-white ${priceClass}`}>${price.toFixed(2)}</div>
            {insight ? (
              <div className="mt-1 line-clamp-1 text-[11px] font-semibold text-emerald-200/90">
                {insight}
              </div>
            ) : null}
          </div>

          <div className="pointer-events-none">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
              <div className="h-2 w-2 rounded-full bg-magenta-300/90 shadow-[0_0_22px_rgba(217,70,239,0.55)]" />
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

export function DealCardSkeleton({ size }: { size: DealCardSize }) {
  const dims = size === "hero" ? "w-[290px]" : size === "medium" ? "w-[240px]" : "w-[180px]"
  const minH = size === "hero" ? "min-h-[230px]" : size === "medium" ? "min-h-[200px]" : "min-h-[170px]"
  return (
    <div
      className={`${dims} ${minH} rounded-3xl bg-muted/40 ring-1 ring-white/10 animate-pulse`}
      aria-hidden="true"
    >
      <div className="p-4 flex flex-col h-full gap-3">
        <SkeletonVisual size={size} />
        <div className="h-4 w-2/3 rounded-lg bg-muted/60" />
        <div className="h-3 w-1/2 rounded-lg bg-muted/60" />
        <div className="mt-auto h-10 w-2/3 rounded-2xl bg-muted/60" />
      </div>
    </div>
  )
}

