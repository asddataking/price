"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { distanceMeters } from "@/lib/geo"
import { BottomNav } from "@/components/navigation/bottom-nav"
import { PriceCard, type PriceCardConfidence } from "@/components/home/cards/price-card"
import { RaidCard } from "@/components/home/cards/raid-card"
import { StoreCard } from "@/components/home/cards/store-card"
import { ActivityCard } from "@/components/home/cards/activity-card"

type LatLng = { lat: number; lng: number }

type StoreRow = {
  id: string
  name: string
  lat: string | number
  lng: string | number
}

type ItemRow = {
  id: string
  name: string
  category: string
  variants: string[]
}

type PriceReportRow = {
  store_id: string
  item_id: string
  price: string | number
  reported_at: string
  verified: boolean
}

function minutesAgo(ts: string) {
  const then = new Date(ts).getTime()
  const diffMs = Math.max(0, Date.now() - then)
  return diffMs / 60000
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "—"
  if (meters < 1000) return `${Math.round(meters)}m`
  const miles = meters / 1609.34
  if (miles < 10) return `${miles.toFixed(1)}mi`
  return `${Math.round(miles)}mi`
}

function confidenceBadgeFromMinutes(m: number): PriceCardConfidence {
  if (m <= 120) return { label: "Hot", className: "bg-red-600/15 text-red-700 dark:text-red-400" }
  if (m <= 24 * 60) return { label: "Fresh", className: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" }
  return { label: "Verified", className: "bg-primary/10 text-primary" }
}

export default function HomeFeed() {
  const router = useRouter()
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  const [userLocation, setUserLocation] = React.useState<LatLng | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [stores, setStores] = React.useState<StoreRow[]>([])
  const [itemsById, setItemsById] = React.useState<Record<string, ItemRow>>({})

  const [cheapestByStoreId, setCheapestByStoreId] = React.useState<
    Record<string, { price: number; reportedAt: string; itemId: string; verified: boolean }>
  >({})

  const [recentVerified, setRecentVerified] = React.useState<PriceReportRow[]>([])

  const locationLabel = "Near You"

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      const fallback = { lat: 42.9858, lng: -82.4051 }

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error("No geolocation"))
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 15_000,
          })
        })

        if (cancelled) return
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      } catch {
        if (cancelled) return
        setUserLocation(fallback)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    if (!userLocation) return

    const load = async () => {
      setLoading(true)

      // Items for labeling cards.
      const { data: itemsData } = await supabase.from("items").select("*")
      if (cancelled) return
      const map: Record<string, ItemRow> = {}
      for (const item of (itemsData ?? []) as ItemRow[]) map[item.id] = item
      setItemsById(map)

      // Approx radius query (bounding box) to avoid map-bounds UX.
      const radiusMeters = 25_000
      const latDelta = radiusMeters / 111_000
      const lngDelta =
        radiusMeters / (111_000 * Math.cos((userLocation.lat * Math.PI) / 180))

      const { data: storesData } = await supabase
        .from("stores")
        .select("id,name,lat,lng")
        .gte("lat", userLocation.lat - latDelta)
        .lte("lat", userLocation.lat + latDelta)
        .gte("lng", userLocation.lng - lngDelta)
        .lte("lng", userLocation.lng + lngDelta)

      if (cancelled) return
      const storeRows = (storesData ?? []) as StoreRow[]
      setStores(storeRows)

      const storeIds = storeRows.map((s) => s.id)
      if (storeIds.length === 0) {
        setCheapestByStoreId({})
        setRecentVerified([])
        setLoading(false)
        return
      }

      // Hot wins = cheapest verified price seen in last 30 days.
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: hotRows } = await supabase
        .from("price_reports")
        .select("store_id,item_id,price,reported_at,verified")
        .in("store_id", storeIds)
        .eq("verified", true)
        .gte("reported_at", cutoff)
        .order("reported_at", { ascending: false })

      if (cancelled) return
      const nextCheapest: typeof cheapestByStoreId = {}
      for (const row of (hotRows ?? []) as PriceReportRow[]) {
        const storeId = row.store_id
        const p = Number(row.price)
        const existing = nextCheapest[storeId]
        if (!existing || (Number.isFinite(p) && p < existing.price)) {
          nextCheapest[storeId] = {
            price: p,
            reportedAt: row.reported_at,
            itemId: row.item_id,
            verified: row.verified,
          }
        }
      }
      setCheapestByStoreId(nextCheapest)

      // Recent verified feed (social proof).
      const { data: recentRows } = await supabase
        .from("price_reports")
        .select("store_id,item_id,price,reported_at,verified")
        .in("store_id", storeIds)
        .eq("verified", true)
        .order("reported_at", { ascending: false })
        .limit(24)

      if (cancelled) return
      setRecentVerified((recentRows ?? []) as PriceReportRow[])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [supabase, userLocation])

  const userDistanceByStoreId = React.useMemo(() => {
    if (!userLocation) return {}
    const out: Record<string, number> = {}
    for (const s of stores) {
      out[s.id] = distanceMeters(
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat: Number(s.lat), lng: Number(s.lng) },
      )
    }
    return out
  }, [stores, userLocation])

  const hotWins = React.useMemo(() => {
    if (!userLocation) return []
    const out: Array<{
      store: StoreRow
      item?: ItemRow
      price: number
      reportedAt: string
      distanceMeters: number
      verified: boolean
    }> = []

    for (const s of stores) {
      const cheapest = cheapestByStoreId[s.id]
      if (!cheapest) continue
      const item = itemsById[cheapest.itemId]
      const distM = userDistanceByStoreId[s.id] ?? 0
      out.push({
        store: s,
        item,
        price: cheapest.price,
        reportedAt: cheapest.reportedAt,
        distanceMeters: distM,
        verified: cheapest.verified,
      })
    }

    // Cheapest-first so StockX-ish clarity feels good.
    return out
      .sort((a, b) => a.price - b.price)
      .slice(0, 6)
  }, [cheapestByStoreId, itemsById, stores, userDistanceByStoreId, userLocation])

  const raidCards = React.useMemo(() => {
    if (!userLocation) return []
    return stores
      .slice()
      .sort((a, b) => (userDistanceByStoreId[a.id] ?? 0) - (userDistanceByStoreId[b.id] ?? 0))
      .slice(0, 3)
      .map((s) => ({
        store: s,
        distanceText: formatDistance(userDistanceByStoreId[s.id] ?? 0),
      }))
  }, [stores, userLocation, userDistanceByStoreId])

  const storesSection = React.useMemo(() => {
    if (!userLocation) return []
    const trackedItemIdsByStoreId: Record<string, Set<string>> = {}
    for (const row of recentVerified) {
      if (!trackedItemIdsByStoreId[row.store_id]) trackedItemIdsByStoreId[row.store_id] = new Set<string>()
      trackedItemIdsByStoreId[row.store_id].add(row.item_id)
    }

    return stores
      .slice()
      .sort((a, b) => (userDistanceByStoreId[a.id] ?? 0) - (userDistanceByStoreId[b.id] ?? 0))
      .slice(0, 10)
      .map((s) => {
        const tracked = trackedItemIdsByStoreId[s.id]?.size ?? 0
        const distanceText = formatDistance(userDistanceByStoreId[s.id] ?? 0)
        // Keep last update text simple for now.
        const last = recentVerified.find((r) => r.store_id === s.id)
        const lastUpdateText = last ? `Last W’d ${Math.round(minutesAgo(last.reported_at))}m ago` : "Recently updated"
        return { s, tracked, distanceText, lastUpdateText }
      })
  }, [recentVerified, stores, userLocation, userDistanceByStoreId])

  const activityFeed = React.useMemo(() => {
    const out: PriceReportRow[] = []
    const seen = new Set<string>()
    for (const row of recentVerified) {
      const key = `${row.store_id}:${row.item_id}:${row.reported_at}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(row)
      if (out.length >= 8) break
    }
    return out
  }, [recentVerified])

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">Location</div>
              <div className="truncate text-xl font-black tracking-tight">{locationLabel}</div>
            </div>

            <Button variant="ghost" className="rounded-xl px-3" onClick={() => router.push("/map")}>
              View Map
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">🔥 Hot Wins Near You</div>
              <div className="text-xs text-muted-foreground">Verified deals that are actually cheap</div>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-xs">Best price-first</Badge>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx} className="h-28 animate-pulse bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {hotWins.length === 0 ? (
                <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                  No verified deals in range yet. Check back soon.
                </div>
              ) : (
                hotWins.map((d) => {
                  const m = minutesAgo(d.reportedAt)
                  const confidence = confidenceBadgeFromMinutes(m)
                  return (
                    <PriceCard
                      key={d.store.id}
                      storeName={d.store.name}
                      itemName={d.item?.name ?? "Item"}
                      price={d.price}
                      lastWdnMinutesAgo={m}
                      distanceText={formatDistance(d.distanceMeters)}
                      verified={d.verified}
                      confidence={confidence}
                      onPrimaryAction={() => router.push(`/raid/${d.store.id}`)}
                      primaryActionLabel="Start Raid"
                    />
                  )
                })
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">⚡ Win Raids Nearby</div>
              <div className="text-xs text-muted-foreground">Earn points by snapping receipts</div>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs">8 snaps • 3 steps</Badge>
          </div>

          <div className="space-y-3">
            {raidCards.map((c) => (
              <RaidCard
                key={c.store.id}
                storeName={c.store.name}
                rewardPoints={150}
                distanceText={c.distanceText}
                captureCopy="Capture 8 snaps (3 steps)"
                onStartRaid={() => router.push(`/raid/${c.store.id}`)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">🏪 Stores Near You</div>
              <div className="text-xs text-muted-foreground">Where we track verified prices</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {storesSection.map((x) => (
              <StoreCard
                key={x.s.id}
                storeName={x.s.name}
                trackedItems={x.tracked}
                lastUpdateText={x.lastUpdateText}
                distanceText={x.distanceText}
                onRaidHere={() => router.push(`/raid/${x.s.id}`)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3 pb-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">📊 Recently Updated Prices</div>
              <div className="text-xs text-muted-foreground">Someone just W’d this</div>
            </div>
          </div>

          <div className="space-y-3">
            {activityFeed.map((row) => {
              const store = stores.find((s) => s.id === row.store_id)
              const item = itemsById[row.item_id]
              if (!store) return null
              const distM = userDistanceByStoreId[store.id] ?? 0
              return (
                <ActivityCard
                  key={`${row.store_id}:${row.item_id}:${row.reported_at}`}
                  storeName={store.name}
                  itemName={item?.name ?? "Item"}
                  price={Number(row.price)}
                  lastWdnMinutesAgo={minutesAgo(row.reported_at)}
                  distanceText={formatDistance(distM)}
                  onClick={() => router.push(`/raid/${store.id}`)}
                />
              )
            })}
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  )
}

