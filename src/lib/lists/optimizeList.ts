import type { SupabaseClient } from "@supabase/supabase-js"

import { distanceMeters } from "@/lib/geo"

export type OptimizationMode = "lowest_total" | "closest" | "least_driving" | "best_single_store" | "best_combo"

export type OptimizationAssignment = {
  productId: string
  storeId: string
  price: number
  lastObservedAt: string
  verificationType: string
}

export type OptimizationPreview = {
  optimizationMode: OptimizationMode
  chosenStores: string[]
  assignments: OptimizationAssignment[]
  totalPrice: number | null
  coverageCount: number
  totalDistanceApprox: number
}

type OfferDetail = {
  price: number
  lastObservedAt: string
  verificationType: string
}

const VALID_MODES: OptimizationMode[] = [
  "lowest_total",
  "closest",
  "least_driving",
  "best_single_store",
  "best_combo",
]

function assertMode(mode: string): OptimizationMode {
  if (!VALID_MODES.includes(mode as OptimizationMode)) throw new Error(`Invalid optimization_mode: ${mode}`)
  return mode as OptimizationMode
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr))
}

function routeHeuristic(user: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  // Approx "driving-ish" loop length by straight-line segments, using the shorter of the two visitation orders.
  const order1 = distanceMeters(user, a) + distanceMeters(a, b)
  const order2 = distanceMeters(user, b) + distanceMeters(b, a)
  return Math.min(order1, order2)
}

export async function previewOptimizeList({
  supabase,
  productIds,
  userLat,
  userLng,
  radiusMeters = 25_000,
  optimizationMode,
}: {
  supabase: SupabaseClient
  productIds: string[]
  userLat: number
  userLng: number
  radiusMeters?: number
  optimizationMode: OptimizationMode
}): Promise<OptimizationPreview> {
  const mode = assertMode(optimizationMode)
  const uniqueProductIds = unique(productIds).slice(0, 20)
  if (uniqueProductIds.length === 0) {
    return {
      optimizationMode: mode,
      chosenStores: [],
      assignments: [],
      totalPrice: null,
      coverageCount: 0,
      totalDistanceApprox: 0,
    }
  }

  const latDelta = radiusMeters / 111_320
  const lngDelta = radiusMeters / (111_320 * Math.cos((userLat * Math.PI) / 180))

  // Candidate stores in bounding box.
  const { data: storesRaw, error: storesErr } = await supabase
    .from("retail_locations")
    .select("id,lat,lng")
    .gte("lat", userLat - latDelta)
    .lte("lat", userLat + latDelta)
    .gte("lng", userLng - lngDelta)
    .lte("lng", userLng + lngDelta)
    .limit(120)

  if (storesErr) throw storesErr
  const stores = (storesRaw ?? []).map((s: any) => ({
    id: s.id as string,
    lat: Number(s.lat),
    lng: Number(s.lng),
  }))

  if (stores.length === 0) {
    return {
      optimizationMode: mode,
      chosenStores: [],
      assignments: [],
      totalPrice: null,
      coverageCount: 0,
      totalDistanceApprox: 0,
    }
  }

  const storeIds = stores.map((s) => s.id)

  // Offer matrix (current-state): last-known price per store+product.
  const { data: offersRaw, error: offersErr } = await supabase
    .from("retail_location_products")
    .select("retail_location_id,product_id,price,last_observed_at,verification_type")
    .in("retail_location_id", storeIds)
    .in("product_id", uniqueProductIds)

  if (offersErr) throw offersErr

  const offers = (offersRaw ?? []) as Array<any>
  const offerByStoreProduct = new Map<string, OfferDetail>()
  for (const o of offers) {
    const storeId = o.retail_location_id as string
    const productId = o.product_id as string
    const price = Number(o.price)
    if (!Number.isFinite(price)) continue
    offerByStoreProduct.set(`${storeId}:${productId}`, {
      price,
      lastObservedAt: o.last_observed_at as string,
      verificationType: String(o.verification_type ?? ""),
    })
  }

  const user = { lat: userLat, lng: userLng }

  // Candidate store selection:
  // Keep stores that have at least one offer, and order them by their cheapest available item.
  const storeMinPrice = new Map<string, number>()
  for (const storeId of storeIds) storeMinPrice.set(storeId, Infinity)
  for (const [key, detail] of offerByStoreProduct.entries()) {
    const [storeId] = key.split(":")
    storeMinPrice.set(storeId, Math.min(storeMinPrice.get(storeId) ?? Infinity, detail.price))
  }

  const storesWithOffers = stores
    .filter((s) => Number.isFinite(storeMinPrice.get(s.id) ?? Infinity) && (storeMinPrice.get(s.id) ?? Infinity) > 0)
    .sort((a, b) => (storeMinPrice.get(a.id) ?? Infinity) - (storeMinPrice.get(b.id) ?? Infinity))

  const topStores = storesWithOffers.slice(0, 8)
  if (topStores.length === 0) {
    return {
      optimizationMode: mode,
      chosenStores: [],
      assignments: [],
      totalPrice: null,
      coverageCount: 0,
      totalDistanceApprox: 0,
    }
  }

  const distanceByStoreId = new Map<string, number>()
  for (const s of topStores) distanceByStoreId.set(s.id, distanceMeters(user, s))

  const getOffer = (storeId: string, productId: string) => offerByStoreProduct.get(`${storeId}:${productId}`)

  const buildAssignmentsForStores = (storeCombo: string[]) => {
    // Assign each product to the cheapest store in the combo where an offer exists.
    const assignments: OptimizationAssignment[] = []
    const chosenByProduct = new Map<string, OptimizationAssignment>()
    for (const pid of uniqueProductIds) {
      let best: OptimizationAssignment | null = null
      for (const sid of storeCombo) {
        const offer = getOffer(sid, pid)
        if (!offer) continue
        if (!best || offer.price < best.price) {
          best = {
            productId: pid,
            storeId: sid,
            price: offer.price,
            lastObservedAt: offer.lastObservedAt,
            verificationType: offer.verificationType,
          }
        }
      }
      if (best) chosenByProduct.set(pid, best)
    }
    for (const a of chosenByProduct.values()) assignments.push(a)
    return assignments
  }

  const comboTotalPrice = (assignments: OptimizationAssignment[]) => {
    let total = 0
    for (const a of assignments) total += a.price
    return total
  }

  const comboCoverageCount = (assignments: OptimizationAssignment[]) => assignments.length

  if (mode === "lowest_total") {
    // Independently pick the cheapest store per product.
    const assignments: OptimizationAssignment[] = []
    for (const pid of uniqueProductIds) {
      let best: OptimizationAssignment | null = null
      for (const sid of topStores.map((s) => s.id)) {
        const offer = getOffer(sid, pid)
        if (!offer) continue
        if (!best || offer.price < best.price) {
          best = {
            productId: pid,
            storeId: sid,
            price: offer.price,
            lastObservedAt: offer.lastObservedAt,
            verificationType: offer.verificationType,
          }
        }
      }
      if (best) assignments.push(best)
    }

    const chosenStores = unique(assignments.map((a) => a.storeId))
    const totalPrice = assignments.length ? comboTotalPrice(assignments) : null
    const totalDistanceApprox = chosenStores.reduce((acc, sid) => acc + (distanceByStoreId.get(sid) ?? 0), 0)

    return {
      optimizationMode: mode,
      chosenStores,
      assignments,
      totalPrice,
      coverageCount: assignments.length,
      totalDistanceApprox,
    }
  }

  if (mode === "best_single_store") {
    let best: { storeId: string; totalPrice: number; route: number; assignments: OptimizationAssignment[] } | null = null
    for (const sid of topStores.map((s) => s.id)) {
      const storeCombo = [sid]
      const assignments = buildAssignmentsForStores(storeCombo)
      if (assignments.length !== uniqueProductIds.length) continue

      const totalPrice = comboTotalPrice(assignments)
      const route = (distanceByStoreId.get(sid) ?? 0) * 2

      if (!best || totalPrice < best.totalPrice || (totalPrice === best.totalPrice && route < best.route)) {
        best = { storeId: sid, totalPrice, route, assignments }
      }
    }

    if (best) {
      return {
        optimizationMode: mode,
        chosenStores: [best.storeId],
        assignments: best.assignments,
        totalPrice: best.totalPrice,
        coverageCount: best.assignments.length,
        totalDistanceApprox: best.route,
      }
    }

    // Fallback to best_combo with up to 2 stores.
  }

  // Pair-based approximations for multi-store modes.
  const storePointsById = new Map<string, { lat: number; lng: number }>(topStores.map((s) => [s.id, s]))

  const tryPair = (a: string, b: string) => {
    const assignments = buildAssignmentsForStores([a, b])
    if (assignments.length === 0) return null
    const coverage = comboCoverageCount(assignments)
    const totalPrice = comboTotalPrice(assignments)

    const routeLen = routeHeuristic(
      user,
      storePointsById.get(a)!,
      storePointsById.get(b)!,
    )
    return { a, b, assignments, coverage, totalPrice, routeLen }
  }

  if (mode === "closest") {
    // Choose the store that covers the most items, then minimizes total cost, then minimizes distance.
    let best: { sid: string; coverage: number; totalPrice: number; maxDist: number; assignments: OptimizationAssignment[] } | null = null
    for (const sid of topStores.map((s) => s.id)) {
      const assignments = buildAssignmentsForStores([sid])
      const coverage = assignments.length
      if (coverage === 0) continue
      const totalPrice = comboTotalPrice(assignments)
      const maxDist = distanceByStoreId.get(sid) ?? Infinity
      if (
        !best ||
        coverage > best.coverage ||
        (coverage === best.coverage && (totalPrice < best.totalPrice || (totalPrice === best.totalPrice && maxDist < best.maxDist)))
      ) {
        best = { sid, coverage, totalPrice, maxDist, assignments }
      }
    }
    if (!best) {
      return {
        optimizationMode: mode,
        chosenStores: [],
        assignments: [],
        totalPrice: null,
        coverageCount: 0,
        totalDistanceApprox: 0,
      }
    }
    return {
      optimizationMode: mode,
      chosenStores: [best.sid],
      assignments: best.assignments,
      totalPrice: best.totalPrice,
      coverageCount: best.coverage,
      totalDistanceApprox: best.maxDist,
    }
  }

  if (mode === "least_driving" || mode === "best_combo") {
    let best: null | {
      a: string
      b: string
      assignments: OptimizationAssignment[]
      coverage: number
      totalPrice: number
      routeLen: number
    } = null

    const ids = topStores.map((s) => s.id)
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const res = tryPair(ids[i], ids[j])
        if (!res) continue
        if (res.coverage === 0) continue

        if (!best) {
          best = res
          continue
        }

        // Coverage first (prefer full coverage), then cost, then route.
        if (res.coverage > best.coverage) {
          best = res
          continue
        }
        if (res.coverage < best.coverage) continue

        if (res.totalPrice < best.totalPrice) {
          best = res
          continue
        }
        if (res.totalPrice > best.totalPrice) continue

        if (mode === "least_driving") {
          if (res.routeLen < best.routeLen) best = res
        } else {
          // best_combo: cost first, then route heuristic
          if (res.routeLen < best.routeLen) best = res
        }
      }
    }

    if (!best) {
      return {
        optimizationMode: mode,
        chosenStores: [],
        assignments: [],
        totalPrice: null,
        coverageCount: 0,
        totalDistanceApprox: 0,
      }
    }

    // If best pair isn't full coverage, optionally also consider single-store best_total for stability.
    const full = best.coverage === uniqueProductIds.length
    const chosenStores = full ? [best.a, best.b] : [best.a, best.b]

    return {
      optimizationMode: mode,
      chosenStores,
      assignments: best.assignments,
      totalPrice: best.totalPrice,
      coverageCount: best.coverage,
      totalDistanceApprox: best.routeLen,
    }
  }

  // Exhaustiveness: should never hit.
  return {
    optimizationMode: mode,
    chosenStores: [],
    assignments: [],
    totalPrice: null,
    coverageCount: 0,
    totalDistanceApprox: 0,
  }
}

