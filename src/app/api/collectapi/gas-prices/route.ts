import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type CollectApiGasPriceStation = {
  name?: string
  price?: number
  lat?: number
  lng?: number
  address?: string
  raw?: any
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const COLLECTAPI_KEY = process.env.COLLECTAPI_API_KEY ?? process.env.COLLECTAPI_KEY ?? ""

function quantizeStateCode(stateCode: string) {
  return stateCode.trim().toUpperCase()
}

function isFiniteNumber(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n)
}

function tryParseLatLng(raw: any): { lat?: number; lng?: number } {
  const lat = raw?.lat ?? raw?.latitude ?? raw?.Lat
  const lng = raw?.lng ?? raw?.longitude ?? raw?.Lng
  const out: { lat?: number; lng?: number } = {}
  if (isFiniteNumber(lat)) out.lat = lat
  if (isFiniteNumber(lng)) out.lng = lng
  return out
}

function tryParsePrice(raw: any): number | undefined {
  const p =
    raw?.price ??
    raw?.Price ??
    raw?.value ??
    raw?.Value ??
    raw?.gasPrice ??
    raw?.GasPrice ??
    undefined
  const n = typeof p === "string" ? Number(p) : p
  if (!Number.isFinite(n)) return undefined
  return n
}

function getCacheKey(stateCode: string) {
  return `collectapi:gasPrice:state:${quantizeStateCode(stateCode)}`
}

async function getCache(supabase: any, cacheKey: string) {
  const { data, error } = await supabase
    .from("google_cache")
    .select("response_json,expires_at")
    .eq("key", cacheKey)
    .maybeSingle()

  if (error) return null
  if (!data) return null

  const expiresAt = new Date(data.expires_at).getTime()
  if (!Number.isFinite(expiresAt)) return null
  if (Date.now() >= expiresAt) return null

  return data.response_json
}

async function setCache(supabase: any, cacheKey: string, responseJson: unknown, ttlSeconds: number) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  const { error } = await supabase
    .from("google_cache")
    .upsert(
      {
        key: cacheKey,
        response_json: responseJson as any,
        expires_at: expiresAt,
      },
      { onConflict: "key" },
    )

  return !error
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars." }, { status: 500 })
  }
  if (!COLLECTAPI_KEY) {
    return NextResponse.json({ error: "Missing COLLECTAPI_API_KEY env var." }, { status: 500 })
  }

  const body = (await req.json()) as {
    lat?: number
    lng?: number
    stateCode?: string
  }

  const lat = body.lat
  const lng = body.lng
  const stateCode = typeof body.stateCode === "string" ? body.stateCode.trim() : ""

  if (!stateCode) {
    return NextResponse.json({ error: "Missing stateCode." }, { status: 400 })
  }
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return NextResponse.json({ error: "Missing lat/lng." }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any

  const cacheKey = getCacheKey(stateCode)
  const cached = await getCache(supabase, cacheKey)
  if (cached) return NextResponse.json({ stateCode: quantizeStateCode(stateCode), cached: true, ...cached })

  const url = `https://api.collectapi.com/gasPrice/stateUsaPrice?state=${encodeURIComponent(stateCode)}`

  // CollectAPI expects the key in an `authorization` header (per your snippet).
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: COLLECTAPI_KEY,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    return NextResponse.json(
      { error: "CollectAPI request failed.", status: res.status, details: text?.slice(0, 500) },
      { status: 502 },
    )
  }

  const json = (await res.json()) as any
  // Keep TTL relatively short; gas prices fluctuate.
  await setCache(supabase, cacheKey, json, 6 * 60 * 60)

  // Try to normalize the response into a stations array with best-effort lat/lng and price.
  const rawList: any[] = Array.isArray(json?.result)
    ? json.result
    : Array.isArray(json?.results)
      ? json.results
      : Array.isArray(json)
        ? json
        : []

  const user = { lat, lng }

  const stations: CollectApiGasPriceStation[] = rawList.map((r) => {
    const { lat: rLat, lng: rLng } = tryParseLatLng(r)
    const price = tryParsePrice(r)
    const name = typeof r?.name === "string" ? r.name : typeof r?.station === "string" ? r.station : undefined
    return {
      name,
      price,
      lat: rLat,
      lng: rLng,
      address: typeof r?.address === "string" ? r.address : typeof r?.location === "string" ? r.location : undefined,
      raw: r,
    }
  })

  function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    // Haversine (good enough for ranking).
    const R = 6371000
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const lat1 = (a.lat * Math.PI) / 180
    const lat2 = (b.lat * Math.PI) / 180
    const s1 = Math.sin(dLat / 2) ** 2
    const s2 = Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(s1 + Math.cos(lat1) * Math.cos(lat2) * s2), Math.sqrt(1 - (s1 + Math.cos(lat1) * Math.cos(lat2) * s2)))
    return R * c
  }

  // Compute distance only when lat/lng exists.
  const enriched = stations
    .filter((s) => isFiniteNumber(s.lat) && isFiniteNumber(s.lng))
    .map((s) => ({
      ...s,
      distanceMeters: distanceMeters(user, { lat: s.lat as number, lng: s.lng as number }),
    }))
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))

  const nearest = enriched[0] ?? null
  const top = enriched.length > 0 ? enriched.slice(0, 6) : stations.slice(0, 6)

  // Fallback: if CollectAPI doesn't provide station coordinates in the response,
  // still show prices (but we can't rank true “nearest”).
  const nearestFallback = nearest ?? (top[0] ?? null)

  return NextResponse.json({
    stateCode: quantizeStateCode(stateCode),
    cached: false,
    nearest: nearestFallback,
    stations: top,
  })
}

