"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { APIProvider, Map as GoogleMap, AdvancedMarker } from "@vis.gl/react-google-maps"

import { SearchHeader } from "@/components/home/search/search-header"
import { DealCard, type DealBadge, type DealCardSize } from "@/components/home/cards/deal-card"
import { DealRow } from "@/components/home/cards/deal-row"
import { SavedListCard } from "@/components/home/cards/saved-list-card"
import { badgesFromObservedAt as badgesFromObservedAtTrusted } from "@/lib/badges/trustBadges"

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

type StoreBestSnapshotRow = {
  store_id: string
  item_id: string
  best_price: string | number
  best_observed_at: string
  is_stale?: boolean
}

type NearbyPlace = {
  id: string
  name: string
  lat: number
  lng: number
  vicinity?: string
  distanceMeters: number
}

type GasPriceStation = {
  name?: string
  price?: number
  lat?: number
  lng?: number
  distanceMeters?: number
  raw?: any
}

type NearbyCategory = "all" | "gas" | "tobacco" | "liquor" | "grocery"

type UserItemPreferenceRow = {
  item_id: string
  count: number
}

type SearchOffer = {
  store: {
    id: string
    name: string
    lat: number
    lng: number
    address?: string | null
    category?: string | null
  }
  item: {
    id: string
    name: string
    category?: string | null
  }
  price: number
  observedAt: string
  distanceMeters: number
  source: "snapshot" | "kroger"
  verificationType?: string
}

type RecentSearchChip = {
  query: string
  bestPrice?: number
}

type HotWinDeal = {
  store: StoreRow
  item?: ItemRow
  price: number
  reportedAt: string
  distanceMeters: number
  verified: boolean
  verificationType?: string
}

function hashToHue(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

function formatDistanceMeters(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "—"
  if (meters < 1000) return `${Math.round(meters)}m`
  const miles = meters / 1609.34
  if (miles < 10) return `${miles.toFixed(1)}mi`
  return `${Math.round(miles)}mi`
}

function badgesFromObservedAt(
  observedAt: string,
  _source: "snapshot" | "kroger",
  verificationType?: string | null,
): DealBadge[] {
  return badgesFromObservedAtTrusted({ observedAt, verificationType })
}

function valueScore(deal: HotWinDeal, minP: number, maxP: number, minD: number, maxD: number) {
  const norm = (v: number, min: number, max: number) => (max === min ? 0 : (v - min) / (max - min))
  const pN = norm(deal.price, minP, maxP)
  const dN = norm(deal.distanceMeters, minD, maxD)
  // Lower score is better: distance-first with some price weighting.
  return dN * 0.55 + pN * 0.45
}

function isHomeProjectName(name: string) {
  const n = name.toLowerCase()
  return /(paint|tool|drill|hammer|screw|wrench|sanding|lumber|tile|adhesive|nail|saw)/i.test(n)
}

export default function PremiumHomeUI({
  isLive,
  loading,
  locationLabel,
  locationMode,
  onSetLocationMode,
  manualLocationInput,
  onSetManualLocationInput,
  locationError,
  onResolveManualLocation,

  searchQuery,
  onSetSearchQuery,
  searchLoading,
  searchOffers,
  recentSearchInsight,
  recentChipsForUI,
  onSearchExact,
  onQuickAction,
  onRecentTap,

  canRenderMap,
  googleMapsKey,
  userLocation,
  stores,
  itemsById,
  cheapestByStoreId,
  hotWinsPrioritized,
  recommendedHotWins,
  recentVerified,
  nearbyCategory,
  nearbyPlaces,
  nearbyPlacesLoading,
  gasPrices,
  gasPricesLoading,
  gasPricesError,

  retailerFilter,
  onSetRetailerFilter,
  mapExpanded,
  onSetMapExpanded,
  trackedRetailers,

  userId,
  recommendedItems,
  preferencesLoading,
  onDealTapRaid,
  onSignUp,
}: {
  isLive: boolean
  loading: boolean
  locationLabel: string
  locationMode: "phone" | "manual"
  onSetLocationMode: (m: "phone" | "manual") => void
  manualLocationInput: string
  onSetManualLocationInput: (v: string) => void
  locationError: string | null
  onResolveManualLocation: () => void

  searchQuery: string
  onSetSearchQuery: (v: string) => void
  searchLoading: boolean
  searchOffers: SearchOffer[]
  recentSearchInsight: string | null
  recentChipsForUI: RecentSearchChip[]
  onSearchExact: (query: string) => void
  onQuickAction: (key: string) => void
  onRecentTap: (query: string) => void

  canRenderMap: boolean
  googleMapsKey: string
  userLocation: LatLng | null
  stores: StoreRow[]
  itemsById: Record<string, ItemRow>
  cheapestByStoreId: Record<
    string,
    { price: number; reportedAt: string; itemId: string; verified: boolean }
  >
  hotWinsPrioritized: HotWinDeal[]
  recommendedHotWins: HotWinDeal[]
  recentVerified: StoreBestSnapshotRow[]
  nearbyCategory: NearbyCategory
  nearbyPlaces: NearbyPlace[]
  nearbyPlacesLoading: boolean
  gasPrices: {
    cached?: boolean
    nearest: GasPriceStation | null
    stations: GasPriceStation[]
    stateCode?: string
  } | null
  gasPricesLoading: boolean
  gasPricesError: string | null

  retailerFilter: string
  onSetRetailerFilter: (v: string) => void
  mapExpanded: boolean
  onSetMapExpanded: (v: boolean) => void
  trackedRetailers: string[]

  userId: string | null
  recommendedItems: UserItemPreferenceRow[]
  preferencesLoading: boolean
  onDealTapRaid: (storeId: string, itemId?: string) => void
  onSignUp: () => void
}) {
  const isLoggedIn = Boolean(userId)

  const storesWithActivePrices = React.useMemo(() => {
    return stores.filter((s) => Boolean(cheapestByStoreId[s.id]?.price))
  }, [stores, cheapestByStoreId])

  const storesWithActivePricesForRetailer = React.useMemo(() => {
    if (retailerFilter === "all") return storesWithActivePrices
    return storesWithActivePrices.filter((s) => s.name === retailerFilter)
  }, [storesWithActivePrices, retailerFilter])

  const hotWinsForRetailer = React.useMemo(() => {
    if (retailerFilter === "all") return hotWinsPrioritized
    return hotWinsPrioritized.filter((d) => d.store.name === retailerFilter)
  }, [hotWinsPrioritized, retailerFilter])

  const recommendedHotWinsForRetailer = React.useMemo(() => {
    if (retailerFilter === "all") return recommendedHotWins
    return recommendedHotWins.filter((d) => d.store.name === retailerFilter)
  }, [recommendedHotWins, retailerFilter])

  const heroDeals = React.useMemo(() => {
    const safeHot = hotWinsForRetailer
    const safeRecommended = recommendedHotWinsForRetailer
    const out: Array<{ id: string; render: (size: DealCardSize) => React.ReactNode }> = []

    const deals = safeHot.length ? safeHot : []

    const bestSearch = (() => {
      const offers = retailerFilter === "all" ? searchOffers : searchOffers.filter((o) => o.store.name === retailerFilter)
      return offers[0] ?? null
    })()

    const bestPriceDeal = deals.slice().sort((a, b) => a.price - b.price)[0] ?? null

    const closestGoodValueDeal = (() => {
      if (!deals.length) return null
      const prices = deals.map((d) => d.price)
      const dists = deals.map((d) => d.distanceMeters)
      const minP = Math.min(...prices)
      const maxP = Math.max(...prices)
      const minD = Math.min(...dists)
      const maxD = Math.max(...dists)
      return deals.slice().sort((a, b) => valueScore(a, minP, maxP, minD, maxD) - valueScore(b, minP, maxP, minD, maxD))[0] ?? null
    })()

    const familiarStoreDeal = (() => {
      const source = isLoggedIn && safeRecommended.length ? safeRecommended : deals
      if (!source.length) return null
      const counts = new Map<string, number>()
      for (const d of source) counts.set(d.store.name, (counts.get(d.store.name) ?? 0) + 1)
      const familiarName = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      if (!familiarName) return null
      const matches = deals.filter((d) => d.store.name === familiarName)
      if (!matches.length) return null
      return matches.slice().sort((a, b) => a.price - b.price)[0] ?? null
    })()

    const deDupSeen = new Set<string>()
    const pushUnique = (key: string, node: (size: DealCardSize) => React.ReactNode) => {
      if (deDupSeen.has(key)) return
      deDupSeen.add(key)
      out.push({ id: key, render: node })
    }

    const onDealTap = (storeId: string, itemId?: string) => onDealTapRaid(storeId, itemId)

    if (bestSearch) {
      const badges: DealBadge[] = [
        ...(recentSearchInsight
          ? [{ label: "Now cheaper", tone: "success" as const }]
          : [{ label: "Searched", tone: "brand" as const }]),
        ...badgesFromObservedAt(bestSearch.observedAt, bestSearch.source, bestSearch.verificationType),
      ]

      pushUnique(`search:${bestSearch.item.id}:${bestSearch.store.id}`, (size) => (
        <DealCard
          size={size}
          productName={bestSearch.item.name}
          retailerName={bestSearch.store.name}
          distanceText={formatDistanceMeters(bestSearch.distanceMeters)}
          price={bestSearch.price}
          badges={badges}
          insight={recentSearchInsight ?? "Best nearby match"}
          imageSeed={bestSearch.item.name}
          onClick={() => onDealTap(bestSearch.store.id, bestSearch.item.id)}
        />
      ))
    }

    if (bestPriceDeal) {
      pushUnique(`bestPrice:${bestPriceDeal.store.id}:${bestPriceDeal.item?.id ?? "x"}`, (size) => (
        <DealCard
          size={size}
          productName={bestPriceDeal.item?.name ?? "Item"}
          retailerName={bestPriceDeal.store.name}
          distanceText={formatDistanceMeters(bestPriceDeal.distanceMeters)}
          price={bestPriceDeal.price}
          badges={[
            { label: "Best price", tone: "brand" },
            ...badgesFromObservedAt(bestPriceDeal.reportedAt, "snapshot", bestPriceDeal.verificationType ?? null),
          ]}
          insight="Best move right now"
          imageSeed={bestPriceDeal.item?.name ?? bestPriceDeal.store.name}
          onClick={() => onDealTap(bestPriceDeal.store.id, bestPriceDeal.item?.id)}
        />
      ))
    }

    if (closestGoodValueDeal) {
      pushUnique(`closestValue:${closestGoodValueDeal.store.id}:${closestGoodValueDeal.item?.id ?? "x"}`, (size) => (
        <DealCard
          size={size}
          productName={closestGoodValueDeal.item?.name ?? "Item"}
          retailerName={closestGoodValueDeal.store.name}
          distanceText={formatDistanceMeters(closestGoodValueDeal.distanceMeters)}
          price={closestGoodValueDeal.price}
          badges={[
            { label: "Closest value", tone: "success" },
            ...badgesFromObservedAt(
              closestGoodValueDeal.reportedAt,
              "snapshot",
              closestGoodValueDeal.verificationType ?? null,
            ),
          ]}
          insight="Fast pickup, strong price"
          imageSeed={closestGoodValueDeal.item?.name ?? closestGoodValueDeal.store.name}
          onClick={() => onDealTap(closestGoodValueDeal.store.id, closestGoodValueDeal.item?.id)}
        />
      ))
    }

    if (familiarStoreDeal) {
      pushUnique(`familiarStore:${familiarStoreDeal.store.id}:${familiarStoreDeal.item?.id ?? "x"}`, (size) => (
        <DealCard
          size={size}
          productName={familiarStoreDeal.item?.name ?? "Item"}
          retailerName={familiarStoreDeal.store.name}
          distanceText={formatDistanceMeters(familiarStoreDeal.distanceMeters)}
          price={familiarStoreDeal.price}
          badges={[
            { label: "From a familiar store", tone: "brand" },
            ...badgesFromObservedAt(familiarStoreDeal.reportedAt, "snapshot", familiarStoreDeal.verificationType ?? null),
          ]}
          insight="You tend to shop here"
          imageSeed={familiarStoreDeal.item?.name ?? familiarStoreDeal.store.name}
          onClick={() => onDealTap(familiarStoreDeal.store.id, familiarStoreDeal.item?.id)}
        />
      ))
    }

    return out.slice(0, 4)
  }, [
    hotWinsForRetailer,
    recommendedHotWinsForRetailer,
    retailerFilter,
    searchOffers,
    recentSearchInsight,
    onDealTapRaid,
    isLoggedIn,
  ])

  const toDealRowItems = React.useCallback(
    (deals: HotWinDeal[], extraBadgeLabel?: string) => {
      return deals.slice(0, 8).map((d) => ({
        id: `${d.store.id}:${d.item?.id ?? "x"}:${d.reportedAt}`,
        render: (size: DealCardSize) => (
          <DealCard
            size={size}
            productName={d.item?.name ?? "Item"}
            retailerName={d.store.name}
            distanceText={formatDistanceMeters(d.distanceMeters)}
            price={d.price}
            badges={[
              ...(extraBadgeLabel ? [{ label: extraBadgeLabel, tone: "brand" as const }] : []),
                ...badgesFromObservedAt(d.reportedAt, "snapshot", d.verificationType ?? null),
            ]}
            insight="Tap to raid"
            imageSeed={d.item?.name ?? d.store.name}
            onClick={() => onDealTapRaid(d.store.id, d.item?.id)}
          />
        ),
      }))
    },
    [onDealTapRaid],
  )

  const morningDeals = isLoggedIn && recommendedHotWinsForRetailer.length
    ? recommendedHotWinsForRetailer
    : hotWinsForRetailer
  const lunchDeals = hotWinsForRetailer.filter((d) => d.item?.category === "groceries")
  const groceryStaples = hotWinsForRetailer.filter((d) => {
    const n = (d.item?.name ?? "").toLowerCase()
    return d.item?.category === "groceries" || /(milk|egg|yogurt|cheese|bread|butter|juice)/i.test(n)
  })
  const homeProjectDeals = hotWinsForRetailer.filter((d) => isHomeProjectName(d.item?.name ?? ""))
  const bestDealsRightNow = hotWinsForRetailer.slice().sort((a, b) => a.price - b.price)

  const heroLoading = loading || (hotWinsForRetailer.length === 0 && searchOffers.length === 0)

  const savedListCards = React.useMemo(() => {
    if (!isLoggedIn) return []

    const itemIdsInOrder = recommendedItems.map((r) => r.item_id)
    const groceryIds = itemIdsInOrder.filter((id) => itemsById[id]?.category === "groceries")
    const projectIds = itemIdsInOrder.filter((id) => isHomeProjectName(itemsById[id]?.name ?? ""))

    const weeklyGroceryItemIds = groceryIds.slice(0, 4)
    const homeRenovationItemIds = (projectIds.length ? projectIds : groceryIds).slice(0, 4)
    const wishListItemIds = itemIdsInOrder.slice(0, 4)

    type ListDef = { key: string; title: string; itemIds: string[]; badgeLabel: string }
    const lists: ListDef[] = [
      { key: "weekly-grocery", title: "Weekly Grocery List", itemIds: weeklyGroceryItemIds, badgeLabel: "Grocery AI" },
      { key: "home-renovation", title: "Home Renovation", itemIds: homeRenovationItemIds, badgeLabel: "Project Picks" },
      { key: "wish-list", title: "Wish List", itemIds: wishListItemIds, badgeLabel: "Saved Finds" },
    ]

    const storeById = new Map<string, string>()
    for (const s of stores) storeById.set(s.id, s.name)

    const pickBestStoresForItems = (itemIds: string[]) => {
      if (!itemIds.length) return { bestStore: null as string | null, comboStores: [] as string[], bestTotal: null as number | null }
      const itemSet = new Set(itemIds)
      const totals = new Map<string, number>()
      const seen = new Set<string>()

      for (const row of recentVerified) {
        if (!itemSet.has(row.item_id)) continue
        const k = `${row.store_id}:${row.item_id}`
        if (seen.has(k)) continue
        seen.add(k)
        const price = Number(row.best_price)
        if (!Number.isFinite(price)) continue
        totals.set(row.store_id, (totals.get(row.store_id) ?? 0) + price)
      }

      const sorted = Array.from(totals.entries()).sort((a, b) => a[1] - b[1])
      const bestStore = sorted[0]?.[0] ?? null
      const comboStores = sorted.slice(0, 2).map((x) => x[0])
      const bestTotal = sorted[0]?.[1] ?? null
      return { bestStore, comboStores, bestTotal }
    }

    return lists.map((l) => {
      const { bestStore, comboStores } = pickBestStoresForItems(l.itemIds)
      const bestStoreName = bestStore ? storeById.get(bestStore) ?? "Nearby store" : null
      const comboNames = comboStores.map((id) => storeById.get(id) ?? "Nearby store")
      return {
        key: l.key,
        title: l.title,
        badgeLabel: l.badgeLabel,
        itemsCount: Math.max(2, l.itemIds.length),
        metaLine: bestStoreName ? `Lowest total today: ${bestStoreName}` : "Add items to optimize today",
        insightLine:
          comboNames.length >= 2
            ? `Best combo: ${comboNames[0]} + ${comboNames[1]}`
            : "Optimized with your nearby tracked prices",
      }
    })
  }, [isLoggedIn, recommendedItems, itemsById, stores, recentVerified])

  const tracksLabel = `${storesWithActivePricesForRetailer.length} nearby stores with active price data`

  return (
    <div className="min-h-screen pb-28">
      <SearchHeader
        locationLabel={locationLabel}
        value={searchQuery}
        onChange={(v) => {
          onSetSearchQuery(v)
        }}
        onSubmit={() => onSearchExact(searchQuery)}
        loading={loading || searchLoading}
        recentSearches={recentChipsForUI}
        quickActions={[
          { key: "morning_boost", label: "Morning Boost" },
          { key: "lunch_deals", label: "Lunch Deals" },
          { key: "grocery_staples", label: "Grocery Staples" },
          { key: "near_me", label: "Near Me" },
        ]}
        onQuickAction={onQuickAction}
        onRecentTap={onRecentTap}
        locationControls={
          isLive ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={locationMode === "phone" ? "default" : "outline"}
                  className="h-8 rounded-xl px-3 text-base"
                  onClick={() => onSetLocationMode("phone")}
                  disabled={loading}
                >
                  Phone
                </Button>
                <Button
                  type="button"
                  variant={locationMode === "manual" ? "default" : "outline"}
                  className="h-8 rounded-xl px-3 text-base"
                  onClick={() => onSetLocationMode("manual")}
                  disabled={loading}
                >
                  City/Area
                </Button>
              </div>

              {locationMode === "manual" ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={manualLocationInput}
                    onChange={(e) => onSetManualLocationInput(e.target.value)}
                    placeholder="City or area (e.g. Detroit)"
                    className="h-8 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-magenta-400/30"
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return
                      onResolveManualLocation()
                    }}
                  />
                  <Button
                    type="button"
                    className="h-8 rounded-xl px-3 text-base"
                    onClick={onResolveManualLocation}
                    disabled={loading || manualLocationInput.trim().length === 0}
                  >
                    Set
                  </Button>
                </div>
              ) : null}

              {locationError ? <div className="mt-1 text-xs text-red-300">{locationError}</div> : null}
            </>
          ) : null
        }
      />

      <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
        {/* 2) Premium map card */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/60 backdrop-blur">
          <div className="px-4 pt-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-white/95">Tracked prices near you</div>
                <div className="mt-1 text-xs text-muted-foreground">{tracksLabel}</div>
              </div>
              <Badge variant="secondary" className="rounded-full px-3 py-0.5 text-xs bg-white/5 ring-1 ring-white/10">
                {retailerFilter === "all" ? "All tracked" : retailerFilter}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 pb-3">
              <Button
                type="button"
                variant={retailerFilter === "all" ? "secondary" : "outline"}
                className="h-8 rounded-2xl px-3 text-[13px]"
                onClick={() => onSetRetailerFilter("all")}
                disabled={loading}
              >
                All tracked
              </Button>
              {trackedRetailers.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant={retailerFilter === name ? "secondary" : "outline"}
                  className="h-8 rounded-2xl px-3 text-[13px]"
                  onClick={() => onSetRetailerFilter(name)}
                  disabled={loading}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>

          <div className={`px-4 pb-4 ${mapExpanded ? "h-80" : "h-60"} transition`}>
            <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
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
                    {!loading
                      ? storesWithActivePricesForRetailer.map((s) => {
                          const cheapest = cheapestByStoreId[s.id]
                          const pinColor = cheapest?.price ? "#22c55e" : "#94a3b8"
                          return (
                            <AdvancedMarker key={s.id} position={{ lat: Number(s.lat), lng: Number(s.lng) }}>
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
                                  style={{
                                    width: 14,
                                    height: 14,
                                    background: pinColor,
                                  }}
                                />
                              </div>
                            </AdvancedMarker>
                          )
                        })
                      : null}
                  </GoogleMap>
                </APIProvider>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="max-w-[320px]">
                    <div className="text-sm font-medium text-muted-foreground">Maps disabled</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Enable Google Maps to see pins. You can still discover the best nearby deals.
                    </div>
                  </div>
                </div>
              )}

              {loading ? <div className="absolute inset-0 animate-pulse bg-muted/30" /> : null}
            </div>
          </div>

          {/* Gas callout inside the map card */}
          {nearbyCategory === "gas" ? (
            <div className="px-4 pb-4 pt-0">
              {gasPricesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, idx) => (
                    <div key={idx} className="h-14 animate-pulse rounded-2xl bg-muted/40 ring-1 ring-white/10" />
                  ))}
                </div>
              ) : gasPricesError ? (
                <div className="rounded-2xl border bg-card/60 p-4 text-sm text-muted-foreground">{gasPricesError}</div>
              ) : gasPrices?.nearest ? (
                <div className="rounded-2xl border border-white/10 bg-card/60 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{gasPrices.nearest.name ?? "Nearest station"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDistanceMeters(gasPrices.nearest.distanceMeters ?? 0)} away
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black tracking-tight">
                        {typeof gasPrices.nearest.price === "number" ? `$${gasPrices.nearest.price.toFixed(2)}` : "—"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{gasPrices.cached ? "Cached" : "Live"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-card/60 p-4 text-sm text-muted-foreground">
                  Finding gas stations nearby...
                </div>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-0">
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-2xl px-4 text-base bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
              onClick={() => onSetMapExpanded(!mapExpanded)}
            >
              {mapExpanded ? "Hide stores nearby" : "See stores nearby"}
            </Button>
            <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs ring-1 ring-magenta-400/20 shadow-[0_0_18px_rgba(217,70,239,0.18)] bg-transparent">
              {mapExpanded ? "Details" : "Quick peek"}
            </Badge>
          </div>

          {mapExpanded ? (
            <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-2">
              {storesWithActivePricesForRetailer.length === 0 ? (
                <div className="rounded-2xl border bg-card/60 p-4 text-sm text-muted-foreground">
                  No active price data in this area yet.
                </div>
              ) : (
                storesWithActivePricesForRetailer
                  .slice()
                  .sort((a, b) => {
                    // Approx ordering for the expanded list.
                    const da = a.id in cheapestByStoreId ? 0 : 0
                    void da
                    return 0
                  })
                  .slice(0, 6)
                  .map((s) => {
                    const cheapest = cheapestByStoreId[s.id]
                    const itemName = cheapest ? itemsById[cheapest.itemId]?.name ?? "Item" : "Item"
                    const price = cheapest?.price
                    const distanceText = "Nearby"
                    return (
                      <button
                        key={s.id}
                        type="button"
                          onClick={() => onDealTapRaid(s.id, cheapest?.itemId)}
                        className="w-full rounded-2xl border border-white/10 bg-card/50 p-3 text-left transition hover:bg-card/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white/95">{s.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground truncate">{itemName}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">{distanceText}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-black tracking-tight text-white/95">
                              {typeof price === "number" ? `$${price.toFixed(2)}` : "—"}
                            </div>
                            <div className="mt-1 text-[11px] text-white/60">Tap to raid</div>
                          </div>
                        </div>
                      </button>
                    )
                  })
              )}
            </div>
          ) : null}
        </section>

        {/* 3) Hero rail */}
        <div id="hero-rail">
          <DealRow
            title="Best move right now"
            subtitle="What are the smartest buys near you right now?"
            badgeLabel="Premium picks"
            loading={heroLoading}
            cardSize="hero"
            skeletonCount={4}
            items={heroDeals}
          />
        </div>

        {/* 4) Discovery rows */}
        <div id="morning-boost">
          <DealRow
            title="Morning Boost"
            subtitle={isLoggedIn ? "Built from your recent picks" : "Early-day local trends"}
            badgeLabel={isLoggedIn ? "Personalized" : "Trending"}
            loading={loading}
            cardSize="medium"
            skeletonCount={6}
            items={toDealRowItems(morningDeals.length ? morningDeals : hotWinsForRetailer).slice(0, 6)}
          />
        </div>

        <div id="lunch-near-you">
          <DealRow
            title="Lunch Near You"
            subtitle="Fast stops with strong prices"
            badgeLabel="Nearby"
            loading={loading}
            cardSize="medium"
            skeletonCount={6}
            items={toDealRowItems(lunchDeals.length ? lunchDeals : hotWinsForRetailer).slice(0, 6)}
          />
        </div>

        <div id="grocery-staples">
          <DealRow
            title="Grocery Staples"
            subtitle="Reorder-friendly essentials"
            badgeLabel="Save mode"
            loading={loading}
            cardSize="medium"
            skeletonCount={6}
            items={toDealRowItems(groceryStaples.length ? groceryStaples : hotWinsForRetailer).slice(0, 6)}
          />
        </div>

        <div id="home-project-picks">
          <DealRow
            title="Home Project Picks"
            subtitle="Tools + fixes that look worth it"
            badgeLabel="Practical"
            loading={loading}
            cardSize="medium"
            skeletonCount={6}
            items={toDealRowItems(homeProjectDeals.length ? homeProjectDeals : hotWinsForRetailer).slice(0, 6)}
          />
        </div>

        <div id="best-deals-right-now">
          <DealRow
            title="Best Deals Right Now"
            subtitle="Cheapest wins in your radius"
            badgeLabel="Price-first"
            loading={loading}
            cardSize="compact"
            skeletonCount={8}
            items={toDealRowItems(bestDealsRightNow.length ? bestDealsRightNow : hotWinsForRetailer).slice(0, 8)}
          />
        </div>

        {/* 5) Smart list preview */}
        <section className="space-y-3 pt-2">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="text-base font-semibold text-white/95">Smart lists</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {isLoggedIn ? "Your saved moments, optimized with local prices" : "Save lists to get daily picks"}
              </div>
            </div>
            <Badge
              variant="outline"
              className="rounded-full px-3 py-0.5 text-xs ring-1 ring-magenta-400/20 shadow-[0_0_18px_rgba(217,70,239,0.18)] bg-transparent"
            >
              {isLoggedIn ? "Ready" : "Teaser"}
            </Badge>
          </div>

          {isLoggedIn ? (
            preferencesLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-44 animate-pulse rounded-2xl bg-muted/40 ring-1 ring-white/10" />
                ))}
              </div>
            ) : savedListCards.length ? (
              <div className="grid grid-cols-2 gap-3">
                {savedListCards.map((l) => (
                  <SavedListCard
                    key={l.key}
                    title={l.title}
                    itemsCount={l.itemsCount}
                    metaLine={l.metaLine}
                    insightLine={l.insightLine}
                    badgeLabel={l.badgeLabel}
                    onClick={() => {
                      document.getElementById("hero-rail")?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card className="rounded-3xl border border-white/10 bg-card/60 p-4 shadow-sm">
                <div className="text-sm font-semibold text-white/95">Add your first saves</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Tap any item card to build smarter daily lists.
                </div>
              </Card>
            )
          ) : (
            <Card className="rounded-3xl border border-white/10 bg-card/60 p-4 shadow-sm">
              <div className="text-sm font-semibold text-white/95">Save lists that adapt daily</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Sign in to get personalized morning boost, smarter list totals, and best-store combos.
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-2xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-4 text-base font-bold text-white shadow-[0_0_18px_rgba(217,70,239,0.22)] hover:opacity-95 active:scale-[0.99] transition"
                  onClick={onSignUp}
                >
                  Sign up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-2xl border-white/15 bg-white/5 px-4 text-base text-white/90 hover:bg-white/10"
                  onClick={() => document.getElementById("grocery-staples")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Explore now
                </Button>
              </div>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

