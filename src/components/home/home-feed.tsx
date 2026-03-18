"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { APIProvider, Map as GoogleMap, AdvancedMarker } from "@vis.gl/react-google-maps"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { distanceMeters } from "@/lib/geo"
import { BottomNav } from "@/components/navigation/bottom-nav"
import { PriceCard, type PriceCardConfidence } from "@/components/home/cards/price-card"
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

type NearbyPlace = {
  id: string
  name: string
  lat: number
  lng: number
  vicinity?: string
  distanceMeters: number
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

export type HomeFeedRenderMode = "live" | "blurred"

type HomeFeedProps = {
  renderMode?: HomeFeedRenderMode
  googleMapsKey?: string
}

export default function HomeFeed({ renderMode = "live", googleMapsKey }: HomeFeedProps) {
  const router = useRouter()
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const isLive = renderMode === "live"
  const canRenderMap = isLive && typeof googleMapsKey === "string" && googleMapsKey.trim().length > 0

  const [userLocation, setUserLocation] = React.useState<LatLng | null>(
    isLive ? null : { lat: 42.9858, lng: -82.4051 },
  )
  const [locationMode, setLocationMode] = React.useState<"phone" | "manual">("phone")
  const [manualLocationInput, setManualLocationInput] = React.useState("")
  const [locationError, setLocationError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [stores, setStores] = React.useState<StoreRow[]>([])
  const [itemsById, setItemsById] = React.useState<Record<string, ItemRow>>({})

  const [cheapestByStoreId, setCheapestByStoreId] = React.useState<
    Record<string, { price: number; reportedAt: string; itemId: string; verified: boolean }>
  >({})

  const [recentVerified, setRecentVerified] = React.useState<PriceReportRow[]>([])

  const [locationLabel, setLocationLabel] = React.useState("Near You")

  const [nearbyPlaces, setNearbyPlaces] = React.useState<NearbyPlace[]>([])
  const [nearbyPlacesLoading, setNearbyPlacesLoading] = React.useState(false)
  const [nearbyPlacesBucket, setNearbyPlacesBucket] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!isLive) return
      if (locationMode !== "phone") return
      setLocationError(null)
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
        setLocationLabel("Near You")
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      } catch {
        if (cancelled) return
        setLocationLabel("Near You")
        setUserLocation(fallback)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [locationMode, isLive])

  async function resolveManualLocation() {
    if (!isLive) return
    const address = manualLocationInput.trim()
    if (!address) return

    setLocationError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "geocode",
          params: { address },
        }),
      })

      const json = await res.json()
      const status = json?.status
      const ok = res.ok && status === "OK"

      const loc = json?.results?.[0]?.geometry?.location
      const formattedAddress = typeof json?.results?.[0]?.formatted_address === "string" ? json.results[0].formatted_address : null

      if (!ok || !loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
        const msg =
          typeof json?.error_message === "string"
            ? json.error_message
            : typeof status === "string"
              ? `Geocode failed: ${status}`
              : "Geocode failed"
        throw new Error(msg)
      }

      setUserLocation({ lat: loc.lat, lng: loc.lng })
      const label = formattedAddress ? formattedAddress : address
      setLocationLabel(`Near ${label}`)
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : "Could not resolve that location.")
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    if (!userLocation) return
    if (!isLive) return

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
  }, [supabase, userLocation, isLive])

  React.useEffect(() => {
    if (!isLive) return
    if (!userLocation) return

    const bucketKey = `${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`
    if (nearbyPlacesBucket === bucketKey) return

    let cancelled = false

    const run = async () => {
      setNearbyPlacesLoading(true)
      setNearbyPlaces([])
      try {
        const radiusMeters = 3000

        const types: string[] = ["gas_station", "convenience_store", "liquor_store"]

        const responses = await Promise.all(
          types.map(async (type) => {
            const res = await fetch("/api/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "nearbySearch",
                params: { lat: userLocation.lat, lng: userLocation.lng, radius: radiusMeters, type },
              }),
            })
            return res.json()
          }),
        )

        if (cancelled) return

        const merged: NearbyPlace[] = []
        const seen = new Set<string>()

        for (const json of responses) {
          const results = Array.isArray(json?.results) ? (json.results as any[]) : []
          for (const p of results) {
            const placeId = typeof p?.place_id === "string" ? p.place_id : null
            const loc = p?.geometry?.location
            const lat = typeof loc?.lat === "number" ? loc.lat : null
            const lng = typeof loc?.lng === "number" ? loc.lng : null
            const name = typeof p?.name === "string" ? p.name : null
            if (!placeId || lat == null || lng == null || !name) continue
            if (seen.has(placeId)) continue
            seen.add(placeId)

            const distM = distanceMeters(
              { lat: userLocation.lat, lng: userLocation.lng },
              { lat, lng },
            )

            merged.push({
              id: placeId,
              name,
              lat,
              lng,
              vicinity: typeof p?.vicinity === "string" ? p.vicinity : undefined,
              distanceMeters: distM,
            })
          }
        }

        merged.sort((a, b) => a.distanceMeters - b.distanceMeters)
        setNearbyPlaces(merged.slice(0, 10))
        setNearbyPlacesBucket(bucketKey)
      } catch {
        if (cancelled) return
        setNearbyPlaces([])
      } finally {
        if (cancelled) return
        setNearbyPlacesLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [isLive, userLocation, nearbyPlacesBucket])

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

  const storesWithin1MiCount = React.useMemo(() => {
    if (!userLocation) return 0
    const withinM = 1609.34
    return stores.reduce((acc, s) => acc + ((userDistanceByStoreId[s.id] ?? Infinity) <= withinM ? 1 : 0), 0)
  }, [stores, userLocation, userDistanceByStoreId])

  const storesWithin5MiCount = React.useMemo(() => {
    if (!userLocation) return 0
    const withinM = 8046.72
    return stores.reduce((acc, s) => acc + ((userDistanceByStoreId[s.id] ?? Infinity) <= withinM ? 1 : 0), 0)
  }, [stores, userLocation, userDistanceByStoreId])

  const closestVerifiedDeal = React.useMemo(() => {
    if (!userLocation) return null

    let best:
      | null
      | {
          store: StoreRow
          item?: ItemRow
          price: number
          distanceMeters: number
        } = null

    for (const s of stores) {
      const cheapest = cheapestByStoreId[s.id]
      if (!cheapest) continue
      const distM = userDistanceByStoreId[s.id] ?? Infinity
      if (!best || distM < best.distanceMeters) {
        best = {
          store: s,
          item: itemsById[cheapest.itemId],
          price: cheapest.price,
          distanceMeters: distM,
        }
      }
    }
    return best
  }, [stores, userLocation, cheapestByStoreId, itemsById, userDistanceByStoreId])

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
              <div className="text-sm font-medium text-muted-foreground">Location</div>
              <div className="truncate text-2xl font-black tracking-tight">{locationLabel}</div>

                {isLive ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={locationMode === "phone" ? "default" : "outline"}
                        className="h-8 rounded-xl px-3 text-base"
                        onClick={() => setLocationMode("phone")}
                        disabled={loading}
                      >
                        Phone
                      </Button>
                      <Button
                        type="button"
                        variant={locationMode === "manual" ? "default" : "outline"}
                        className="h-8 rounded-xl px-3 text-base"
                        onClick={() => setLocationMode("manual")}
                        disabled={loading}
                      >
                        City/Area
                      </Button>
                    </div>

                    {locationMode === "manual" ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          value={manualLocationInput}
                          onChange={(e) => setManualLocationInput(e.target.value)}
                          placeholder="City or area (e.g. Detroit)"
                          className="h-8 text-base"
                          disabled={loading}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return
                            resolveManualLocation()
                          }}
                        />
                        <Button
                          type="button"
                          className="h-8 rounded-xl px-3 text-base"
                          onClick={resolveManualLocation}
                          disabled={loading || manualLocationInput.trim().length === 0}
                        >
                          Set
                        </Button>
                      </div>
                    ) : null}

                    {locationError ? <div className="mt-1 text-xs text-red-300">{locationError}</div> : null}
                  </>
                ) : null}
            </div>

            <Button variant="ghost" className="rounded-xl px-3" onClick={() => router.push("/map")}>
              View Map
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
        {/* Nearby map (always shown on Near You / Home). */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/60 backdrop-blur">
          <div className="flex items-end justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-base font-semibold">Near you</div>
              <div className="text-xs text-muted-foreground">Pins are stores (or real nearby places)</div>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full px-3 py-0.5 text-xs ring-1 ring-magenta-400/30 shadow-[0_0_18px_rgba(217,70,239,0.25)]"
            >
              {!loading && hotWins.length > 0 ? "Verified only" : "Nearby places"}
            </Badge>
          </div>

          <div className="h-52 sm:h-56">
            {canRenderMap ? (
              <APIProvider apiKey={googleMapsKey ?? ""}>
                <GoogleMap
                  zoom={13}
                  center={userLocation ?? { lat: 42.9858, lng: -82.4051 }}
                  gestureHandling="greedy"
                  disableDefaultUI
                  onClick={() => undefined}
                  mapId="pricedash-map"
                >
                  {!loading && hotWins.length > 0
                    ? stores.map((s) => {
                        const cheapest = cheapestByStoreId[s.id]
                        const hasPrice = typeof cheapest?.price === "number"
                        const pinColor = hasPrice ? "#22c55e" : "#94a3b8"
                        return (
                          <AdvancedMarker
                            key={s.id}
                            position={{ lat: Number(s.lat), lng: Number(s.lng) }}
                          >
                            <div
                              className="relative -translate-y-1 rounded-full ring-2 ring-white/80 shadow-md"
                              style={{
                                width: 34,
                                height: 34,
                                background: "rgba(0,0,0,0.25)",
                                display: "grid",
                                placeItems: "center",
                              }}
                            >
                              <div
                                className="rounded-full"
                                style={{ width: 14, height: 14, background: pinColor }}
                              />
                            </div>
                          </AdvancedMarker>
                        )
                      })
                    : nearbyPlaces.map((p) => (
                        <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }}>
                          <div
                            className="relative -translate-y-1 rounded-full ring-2 ring-white/80 shadow-md"
                            style={{
                              width: 32,
                              height: 32,
                              background: "rgba(0,0,0,0.25)",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <div
                              className="rounded-full"
                              style={{ width: 12, height: 12, background: "#f59e0b" }}
                            />
                          </div>
                        </AdvancedMarker>
                      ))}
                </GoogleMap>
              </APIProvider>
            ) : (
              <div className="h-full animate-pulse bg-muted/40" />
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">🔥 Hot Wins Near You</div>
              <div className="text-xs text-muted-foreground">Verified deals that are actually cheap</div>
              <div className="text-xs text-muted-foreground">
                {closestVerifiedDeal
                  ? `Closest verified: ${formatDistance(closestVerifiedDeal.distanceMeters)} • $${closestVerifiedDeal.price.toFixed(2)}`
                  : "Closest verified: —"}
              </div>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full px-3 py-0.5 text-xs ring-1 ring-magenta-400/30 shadow-[0_0_18px_rgba(217,70,239,0.25)]"
            >
              Best price-first
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
              {hotWins.length === 0 ? (
                <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">No verified deals yet.</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {nearbyPlacesLoading
                      ? "Finding nearby places..."
                      : nearbyPlaces.length > 0
                        ? "Here are real nearby places you can start reporting prices for."
                        : "No cached places yet—try again in a moment."}
                  </div>

                  {nearbyPlacesLoading ? (
                    <div className="mt-3 space-y-2">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx} className="h-6 w-full animate-pulse rounded-lg bg-muted/40" />
                      ))}
                    </div>
                  ) : nearbyPlaces.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {nearbyPlaces.slice(0, 5).map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-card/50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDistance(p.distanceMeters)}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="rounded-full px-2 text-[11px] ring-1 ring-yellow-300/20 shadow-[0_0_18px_rgba(255,214,0,0.12)]"
                          >
                            Nearby
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
              <div className="text-base font-semibold">🏆 Win Raids</div>
              <div className="text-xs text-muted-foreground">Snap receipts, earn points, improve prices</div>
            </div>
            <Badge
              variant="outline"
              className="rounded-full px-3 py-0.5 text-xs ring-1 ring-yellow-300/20 shadow-[0_0_18px_rgba(255,214,0,0.18)]"
            >
              Community mode
            </Badge>
          </div>

          <Card className="rounded-2xl border border-white/10 bg-card/60 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Start a raid nearby</div>
                <div className="mt-1 text-xs text-muted-foreground">Pick a store and go. Verified only.</div>
              </div>
              <Button
                type="button"
                className="rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-5 py-2 text-base font-bold text-white shadow-[0_0_18px_rgba(217,70,239,0.35)] hover:opacity-95 active:scale-[0.99] transition"
                onClick={() => router.push("/raids")}
                disabled={!isLive}
              >
                See Raids
              </Button>
            </div>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">🏪 Stores Near You</div>
              <div className="text-xs text-muted-foreground">
                Where we track verified prices • Within 1 mi: {storesWithin1MiCount} • Within 5 mi:{" "}
                {storesWithin5MiCount}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isLive
              ? storesSection.map((x) => (
                  <StoreCard
                    key={x.s.id}
                    storeName={x.s.name}
                    trackedItems={x.tracked}
                    lastUpdateText={x.lastUpdateText}
                    distanceText={x.distanceText}
                  />
                ))
              : Array.from({ length: 4 }).map((_, idx) => (
                  <Card key={idx} className="h-44 animate-pulse bg-muted/40" />
                ))}
          </div>
        </section>

        <section className="space-y-3 pb-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">📊 Recently Updated Prices</div>
              <div className="text-xs text-muted-foreground">Someone just W’d this</div>
            </div>
          </div>

          <div className="space-y-3">
            {isLive
              ? activityFeed.map((row) => {
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
                    />
                  )
                })
              : Array.from({ length: 4 }).map((_, idx) => (
                  <Card key={idx} className="h-24 animate-pulse bg-muted/40" />
                ))}
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  )
}

