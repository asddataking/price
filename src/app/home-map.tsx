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
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserMenu } from "@/components/auth/user-menu"
import ReportSheet from "@/components/reports/report-sheet"

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

type PriceReportRow = {
  id: string
  store_id: string
  item_id: string
  price: string | number
  reported_at: string
  reporter_id: string
  photo_url: string
  lat: string | number
  lng: string | number
  verified: boolean
  created_at: string
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

  const [userLocation, setUserLocation] = React.useState<LatLng | null>(null)
  const [bounds, setBounds] = React.useState<google.maps.LatLngBoundsLiteral | null>(null)
  const [stores, setStores] = React.useState<StoreRow[]>([])

  // Map hover/select state for tooltip/cards.
  const [hoverStoreId, setHoverStoreId] = React.useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null)

  const toastId = useStableToastId("price-updates")

  const [reportOpen, setReportOpen] = React.useState(false)

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

      // We only care about recent-ish verified reports for a responsive UI.
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from("price_reports")
        .select("store_id,item_id,price,reported_at,verified")
        .in("store_id", storeIds)
        .eq("verified", true)
        .gte("reported_at", cutoff)
        .order("reported_at", { ascending: false })

      if (error) {
        toast.error("Failed to load prices.")
        return
      }

      const next: Record<
        string,
        { price: number; reportedAt: string; itemId: string; verified: boolean }
      > = {}

      for (const row of (data ?? []) as PriceReportRow[]) {
        const storeId = row.store_id
        const existing = next[storeId]

        // For the marker, we want the cheapest price seen for that store in the time window.
        if (!existing || Number(row.price) < existing.price) {
          next[storeId] = {
            price: Number(row.price),
            reportedAt: row.reported_at,
            itemId: row.item_id,
            verified: row.verified,
          }
        }
      }

      setCheapestByStoreId(next)
    },
    [supabase],
  )

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

  // Realtime: update pins on new verified reports.
  React.useEffect(() => {
    if (!supabase) return
    let channel: any | null = null
    let cancelled = false

    const start = async () => {
      channel = supabase
        .channel("price-dash-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "price_reports",
          },
          async (payload: any) => {
            if (cancelled) return
            const newRow = payload?.new as PriceReportRow | undefined
            if (!newRow?.store_id) return
            if (newRow.verified !== true) return

            // Best-effort refresh: only recompute for currently visible store IDs.
            const storeIds = stores.map((s) => s.id)
            if (!storeIds.includes(newRow.store_id)) return

            await fetchCheapestInView(storeIds)
            const storeName = stores.find((s) => s.id === newRow.store_id)?.name ?? "a store"
            toast.success(`Squad just W'd verified prices at ${storeName}!`)
          },
        )
        .subscribe()
    }

    start()

    return () => {
      cancelled = true
      channel?.unsubscribe()
    }
  }, [fetchCheapestInView, supabase, stores])

  const activeStoreId = hoverStoreId ?? selectedStoreId
  const defaultReportStoreId = activeStoreId ?? (stores[0]?.id ?? null)

  const onOptimisticReport = React.useCallback(
    (payload: {
      storeId: string
      itemId: string
      price: number
      reportedAtISO: string
      verified: boolean
    }) => {
      if (!payload.verified) return

      setCheapestByStoreId((prev) => {
        const existing = prev[payload.storeId]
        if (existing && payload.price >= existing.price) return prev

        return {
          ...prev,
          [payload.storeId]: {
            price: payload.price,
            reportedAt: payload.reportedAtISO,
            itemId: payload.itemId,
            verified: true,
          },
        }
      })
    },
    [],
  )

  const refreshCheapest = React.useCallback(
    async (storeIds: string[]) => {
      await fetchCheapestInView(storeIds)
    },
    [fetchCheapestInView],
  )

  const storeCheapestPrices = stores
    .map((s) => cheapestByStoreId[s.id]?.price)
    .filter((p): p is number => typeof p === "number")

  const minPrice = storeCheapestPrices.length ? Math.min(...storeCheapestPrices) : null
  const maxPrice = storeCheapestPrices.length ? Math.max(...storeCheapestPrices) : null

  const dealsCard = (
    <Card className="border bg-background/80 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nearby verified deals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stores.length === 0 ? (
          <div className="text-sm text-muted-foreground">Move the map to load stores.</div>
        ) : stores.length > 0 && Object.keys(cheapestByStoreId).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No verified prices yet in this area. Be the first to report with photo proof.
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
                      {cheapest?.verified ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Unverified</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
      </CardContent>
    </Card>
  )

  const hasGoogleKey =
    typeof googleMapsKey === "string" && googleMapsKey.trim().length > 0

  if (!hasGoogleKey) {
    return (
      <main className="relative min-h-screen bg-background p-4">
        <div className="mx-auto max-w-lg pt-12">
          <h1 className="text-balance text-3xl font-semibold tracking-tight">
            WPrice – Real-time local wins
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in this deployment.
          </p>
        </div>
      </main>
    )
  }

  return (
    <APIProvider apiKey={googleMapsKey}>
      <div className="relative min-h-screen">
        <div className="absolute left-4 top-4 z-40">
          <UserMenu />
        </div>
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
                      {cheapest?.verified ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No verified</Badge>
                      )}
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

        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="w-full max-w-xl pointer-events-auto">{dealsCard}</div>
        </div>

        <div className="absolute bottom-6 right-6 z-30">
          <Button
            type="button"
            className="size-14 rounded-full shadow-lg"
            onClick={() => setReportOpen(true)}
          >
            <Plus className="size-5" />
          </Button>
        </div>

        <ReportSheet
          open={reportOpen}
          onOpenChange={setReportOpen}
          defaultStoreId={defaultReportStoreId}
          stores={stores}
          itemsById={itemsById}
          onOptimisticReport={onOptimisticReport}
          onRefreshCheapest={refreshCheapest}
        />
      </div>
    </APIProvider>
  )
}

