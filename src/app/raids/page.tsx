"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { distanceMeters } from "@/lib/geo"
import { RaidCard } from "@/components/home/cards/raid-card"
import { BottomNav } from "@/components/navigation/bottom-nav"

export default function RaidsPage() {
  const router = useRouter()

  type LatLng = { lat: number; lng: number }
  type StoreRow = {
    id: string
    name: string
    lat: string | number
    lng: string | number
  }

  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  const [userLocation, setUserLocation] = React.useState<LatLng | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [stores, setStores] = React.useState<StoreRow[]>([])

  function formatDistance(meters: number) {
    if (!Number.isFinite(meters) || meters < 0) return "—"
    if (meters < 1000) return `${Math.round(meters)}m`
    const miles = meters / 1609.34
    if (miles < 10) return `${miles.toFixed(1)}mi`
    return `${Math.round(miles)}mi`
  }

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

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      const fallback = { lat: 42.9858, lng: -82.4051 }

      try {
        if (!navigator.geolocation) throw new Error("No geolocation")

        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
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

      // Bounding-box store query to keep UX snappy.
      const radiusMeters = 25_000
      const latDelta = radiusMeters / 111_000
      const lngDelta = radiusMeters / (111_000 * Math.cos((userLocation.lat * Math.PI) / 180))

      const { data: storesData, error } = await supabase
        .from("stores")
        .select("id,name,lat,lng")
        .gte("lat", userLocation.lat - latDelta)
        .lte("lat", userLocation.lat + latDelta)
        .gte("lng", userLocation.lng - lngDelta)
        .lte("lng", userLocation.lng + lngDelta)

      if (cancelled) return
      if (error) {
        setStores([])
        setLoading(false)
        return
      }

      setStores((storesData ?? []) as StoreRow[])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [supabase, userLocation])

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

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-muted-foreground">Raids</div>
              <div className="truncate text-2xl font-black tracking-tight">Win Raids Nearby</div>
            </div>
            <Button variant="ghost" className="rounded-xl px-3" onClick={() => router.push("/")}>
              Back
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">⚡ Choose a store to raid</div>
              <div className="text-xs text-muted-foreground">Distance shown by your phone location</div>
            </div>
            <Badge
              variant="outline"
              className="rounded-full px-3 py-0.5 text-xs ring-1 ring-yellow-300/20 shadow-[0_0_18px_rgba(255,214,0,0.18)]"
            >
              Capture 8 snaps • 3 steps
            </Badge>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx} className="h-28 animate-pulse bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {raidCards.length === 0 ? (
                <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                  No stores nearby yet. Try a different location.
                </div>
              ) : (
                raidCards.map((c) => (
                  <RaidCard
                    key={c.store.id}
                    storeName={c.store.name}
                    rewardPoints={150}
                    distanceText={c.distanceText}
                    captureCopy="Capture 8 snaps (3 steps)"
                    onStartRaid={() => router.push(`/raid/${c.store.id}`)}
                  />
                ))
              )}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  )
}

