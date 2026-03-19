"use client"

import * as React from "react"
import {
  APIProvider,
  Map,
  InfoWindow,
  AdvancedMarker,
  useAdvancedMarkerRef,
} from "@vis.gl/react-google-maps"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { UserMenu } from "@/components/auth/user-menu"

type LatLng = { lat: number; lng: number }

type StoreRow = {
  id: string
  name: string
  lat: string | number
  lng: string | number
  address: string | null
  category: string
}

type ItemRow = {
  id: string
  name: string
  category: string
  variants: string[]
}

type StoreBestSnapshotRow = {
  store_id: string
  item_id: string
  best_price: string | number
  best_observed_at: string
  is_stale?: boolean
}

function useStableToastId(prefix: string) {
  const idRef = React.useRef<string | null>(null)
  if (!idRef.current) idRef.current = `${prefix}-${Math.random().toString(16).slice(2)}`
  return idRef.current
}

function timeAgo(ts: string) {
  const then = new Date(ts).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getBoundsFromJson(bounds: google.maps.LatLngBoundsLiteral) {
  return {
    north: bounds.north,
    south: bounds.south,
    east: bounds.east,
    west: bounds.west,
  }
}

function pinColorFromRatio(ratio: number) {
  // 0 => green, 1 => red with a gentle middle amber.
  if (ratio <= 0.33) return "#22c55e"
  if (ratio <= 0.66) return "#f59e0b"
  return "#ef4444"
}

function pinScaleFromRecencyMinutes(minutesAgo: number) {
  // Most recent reports get the biggest pins.
  if (minutesAgo <= 60) return 1.35
  if (minutesAgo <= 6 * 60) return 1.15
  if (minutesAgo <= 24 * 60) return 1.0
  return 0.9
}

function StoreMarker({
  store,
  pinColor,
  pinScale,
  content,
  onHover,
  onSelect,
  active,
}: {
  store: StoreRow
  pinColor: string
  pinScale: number
  content: React.ReactNode
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  active: boolean
}) {
  const [markerRef, marker] = useAdvancedMarkerRef()

  const colorStyle = {
    width: `${Math.round(32 * pinScale)}px`,
    height: `${Math.round(32 * pinScale)}px`,
  }

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: Number(store.lat), lng: Number(store.lng) }}
        clickable
        onMouseEnter={() => onHover(store.id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onSelect(store.id)}
      >
        <div
          style={colorStyle}
          className="relative -translate-y-1 rounded-full ring-2 ring-white/80 shadow-md"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: pinColor }}
          />
          <div className="absolute bottom-[-6px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 rotate-45 rounded-[2px] bg-white/10" style={{ background: pinColor }} />
          <div className="absolute inset-0 rounded-full ring-1 ring-black/10" />
        </div>
      </AdvancedMarker>

      {active && marker ? (
        <InfoWindow anchor={marker} pixelOffset={[0, -10]}>
          <div className="min-w-[240px] max-w-[280px] rounded-xl border bg-background p-3 shadow-lg">
            {content}
          </div>
        </InfoWindow>
      ) : null}
    </>
  )
}

export default function HomeMap({ googleMapsKey }: { googleMapsKey: string }) {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const hasGoogleKey = typeof googleMapsKey === "string" && googleMapsKey.trim().length > 0

  const [userLocation, setUserLocation] = React.useState<LatLng | null>(null)
  const [bounds, setBounds] = React.useState<google.maps.LatLngBoundsLiteral | null>(null)
  const [stores, setStores] = React.useState<StoreRow[]>([])

  // Map hover/select state for tooltip/cards.
  const [hoverStoreId, setHoverStoreId] = React.useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null)

  const toastId = useStableToastId("price-updates")

  const [itemsById, setItemsById] = React.useState<Record<string, ItemRow>>({})
  const [cheapestByStoreId, setCheapestByStoreId] = React.useState<
    Record<
      string,
      { price: number; reportedAt: string; itemId: string; verified: boolean }
    >
  >({})

  // Request geolocation once (privacy-focused; no continuous tracking).
  React.useEffect(() => {
    if (!navigator.geolocation) {
      toast.error("Location not available in this browser.")
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      (_err) => {
        toast.error("Location permission denied. You can still browse the map.")
        setUserLocation({ lat: 42.9858, lng: -82.4051 })
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 },
    )
  }, [toastId])

  // Load item catalog once (used in marker tooltips).
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from("items").select("*")
      if (cancelled) return
      if (error) {
        toast.error("Failed to load items.")
        return
      }
      const map: Record<string, ItemRow> = {}
      for (const item of data as ItemRow[]) map[item.id] = item
      setItemsById(map)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const fetchStoresInBounds = React.useCallback(
    async (b: google.maps.LatLngBoundsLiteral) => {
      const north = b.north
      const south = b.south
      const east = b.east
      const west = b.west

      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .gte("lat", south)
        .lte("lat", north)
        .gte("lng", west)
        .lte("lng", east)

      if (error) {
        toast.error("Failed to load nearby stores.")
        setStores([])
        return []
      }

      const rows = (data ?? []) as StoreRow[]
      setStores(rows)
      return rows.map((s) => s.id)
    },
    [supabase],
  )

  const fetchCheapestInView = React.useCallback(
    async (storeIds: string[]) => {
      if (storeIds.length === 0) {
        setCheapestByStoreId({})
        return
      }

      const { data, error } = await supabase
        .from("retail_location_products")
        .select("retail_location_id,product_id,price,last_observed_at,verification_type,is_live,is_stale,fuel_type")
        .in("retail_location_id", storeIds)
        .order("last_observed_at", { ascending: false })

      if (error) {
        toast.error("Failed to load prices.")
        return
      }

      const next: Record<
        string,
        { price: number; reportedAt: string; itemId: string; verified: boolean }
      > = {}

      for (const row of (data ?? []) as Array<{
        retail_location_id: string
        product_id: string
        price: string | number
        last_observed_at: string
        verification_type: string
      }>) {
        const storeId = row.retail_location_id
        const existing = next[storeId]

        const rowPrice = Number(row.price)
        if (!Number.isFinite(rowPrice)) continue

        // For the marker, we want the cheapest last-known price for that store.
        if (!existing || rowPrice < existing.price) {
          next[storeId] = {
            price: rowPrice,
            reportedAt: row.last_observed_at,
            itemId: row.product_id,
            verified: String(row.verification_type ?? "").includes("api"),
          }
        }
      }

      setCheapestByStoreId(next)
    },
    [supabase],
  )

  // If the Google Maps JS key is missing, still show the cards UI by loading all stores once.
  // We compute deals across all stores (small seed set) rather than relying on map bounds.
  React.useEffect(() => {
    if (hasGoogleKey) return
    let cancelled = false

    ;(async () => {
      const { data, error } = await supabase.from("stores").select("*")
      if (cancelled) return

      if (error) {
        toast.error("Failed to load nearby stores.")
        setStores([])
        return
      }

      const rows = (data ?? []) as StoreRow[]
      setStores(rows)
      const ids = rows.map((s) => s.id)
      await fetchCheapestInView(ids)
    })()

    return () => {
      cancelled = true
    }
  }, [fetchCheapestInView, hasGoogleKey, supabase])

  // Debounced bounds -> stores/prices fetch.
  const fetchSeqRef = React.useRef(0)
  const debouncedTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!bounds) return
    const b = getBoundsFromJson(bounds)

    fetchSeqRef.current += 1
    const seq = fetchSeqRef.current

    if (debouncedTimerRef.current) window.clearTimeout(debouncedTimerRef.current)
    debouncedTimerRef.current = window.setTimeout(async () => {
      if (seq !== fetchSeqRef.current) return

      const storeIds = await fetchStoresInBounds(b)
      await fetchCheapestInView(storeIds)
    }, 900)

    return () => {
      if (debouncedTimerRef.current) window.clearTimeout(debouncedTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, fetchStoresInBounds, fetchCheapestInView])

  const activeStoreId = hoverStoreId ?? selectedStoreId
  // MVP snapshot-driven UI: no realtime "report new price" updates.

  const storeCheapestPrices = stores
    .map((s) => cheapestByStoreId[s.id]?.price)
    .filter((p): p is number => typeof p === "number")

  const minPrice = storeCheapestPrices.length ? Math.min(...storeCheapestPrices) : null
  const maxPrice = storeCheapestPrices.length ? Math.max(...storeCheapestPrices) : null

  const dealsCard = (
    <Card className="border bg-background/80 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nearby best deals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stores.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading nearby stores...</div>
        ) : stores.length > 0 && Object.keys(cheapestByStoreId).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No snapshot prices yet in this area. Try again after ingestion runs.
          </div>
        ) : null}

        {stores
          .filter((s) => cheapestByStoreId[s.id])
          .sort((a, b) => (cheapestByStoreId[a.id]?.price ?? Infinity) - (cheapestByStoreId[b.id]?.price ?? Infinity))
          .slice(0, 5)
          .map((s) => {
            const cheapest = cheapestByStoreId[s.id]
            const item = cheapest ? itemsById[cheapest.itemId] : undefined
            const reportAge = cheapest ? timeAgo(cheapest.reportedAt) : ""

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStoreId(s.id)}
                className={cn(
                  "w-full rounded-xl border bg-card/40 p-3 text-left transition hover:bg-card/60",
                  selectedStoreId === s.id && "ring-2 ring-primary/30",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="line-clamp-1 font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item?.name ?? "Item"} • {reportAge}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      ${cheapest?.price?.toFixed(2)}
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                        Snapshot
                      </Badge>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
      </CardContent>
    </Card>
  )

  return (
    <div className="relative isolate min-h-dvh flex flex-col">
      {/* Map area (phone-sized). */}
      <div className="relative h-[58vh] sm:h-[62vh] overflow-hidden">
        <div className="absolute left-4 top-4" style={{ zIndex: 100000 }}>
          <UserMenu />
        </div>

        {hasGoogleKey ? (
          <APIProvider apiKey={googleMapsKey}>
            <div className="absolute inset-0 z-0">
              <Map
                zoom={13}
                center={userLocation ?? { lat: 42.9858, lng: -82.4051 }}
                gestureHandling="greedy"
                disableDefaultUI
                onIdle={(ev) => {
                  const b = (ev?.detail as any)?.bounds as google.maps.LatLngBoundsLiteral | undefined
                  if (!b) return
                  setBounds(b)
                }}
                onClick={() => setSelectedStoreId(null)}
                mapId="pricedash-map"
              >
                {stores.map((s) => {
                  const cheapest = cheapestByStoreId[s.id]
                  const price = cheapest?.price ?? null

                  let ratio = 0.5
                  if (minPrice != null && maxPrice != null && price != null) {
                    if (maxPrice === minPrice) ratio = 0
                    else ratio = (price - minPrice) / (maxPrice - minPrice)
                  }

                  const minutesAgo = cheapest?.reportedAt
                    ? (Date.now() - new Date(cheapest.reportedAt).getTime()) / 60000
                    : 999999
                  const scale = cheapest ? pinScaleFromRecencyMinutes(minutesAgo) : 0.9

                  const pinColor = price != null ? pinColorFromRatio(ratio) : "#94a3b8"

                  const item = cheapest ? itemsById[cheapest.itemId] : undefined
                  const reportAge = cheapest ? timeAgo(cheapest.reportedAt) : "—"

                  return (
                    <StoreMarker
                      key={s.id}
                      store={s}
                      pinColor={pinColor}
                      pinScale={scale}
                      active={activeStoreId === s.id}
                      onHover={(id) => setHoverStoreId(id)}
                      onSelect={(id) => setSelectedStoreId(id)}
                      content={
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="line-clamp-1 font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {item?.name ?? "No item price"} • {reportAge}
                              </div>
                            </div>
                            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                              Snapshot
                            </Badge>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">Current cheapest</div>
                            <div className="text-base font-semibold">
                              {cheapest?.price != null ? `$${cheapest.price.toFixed(2)}` : "—"}
                            </div>
                          </div>
                        </div>
                      }
                    />
                  )
                })}
              </Map>
            </div>
          </APIProvider>
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/20 via-background to-background">
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),rgba(255,255,255,0))]" />
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <div className="max-w-md">
                <div className="text-sm font-medium text-muted-foreground">Maps disabled</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">
                  Enable the Google Maps API key to see pins
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  You can still browse best deals. Reporting is hidden in this MVP.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reporting is intentionally hidden in snapshots MVP. */}
      </div>

      {/* Deals card under the map (app-like stack). */}
      <div className="relative z-10 px-4 pb-6">
        <div className="mx-auto w-full max-w-xl">{dealsCard}</div>
      </div>

      {/* Reporting sheet removed for snapshots MVP. */}
    </div>
  )
}

