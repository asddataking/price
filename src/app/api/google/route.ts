import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type GoogleAction = "geocode" | "autocomplete" | "nearbySearch"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const GOOGLE_KEY =
  process.env.GOOGLE_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api"

function normalizeText(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ")
}

function quantizeCoord(n: number, decimals: number) {
  const factor = Math.pow(10, decimals)
  return Math.round(n * factor) / factor
}

function bucketRadiusMeters(radius: number) {
  if (!Number.isFinite(radius) || radius <= 0) return 1000
  // Keep the bucket count small so cache hit-rate stays high.
  const buckets = [100, 300, 500, 1000, 1500, 2000, 3000, 5000]
  let best = buckets[0]
  let bestDist = Infinity
  for (const b of buckets) {
    const d = Math.abs(b - radius)
    if (d < bestDist) {
      bestDist = d
      best = b
    }
  }
  return best
}

function ttlSecondsForAction(action: GoogleAction) {
  // Conservative TTLs based on how often users typically change these inputs.
  if (action === "geocode") return 30 * 24 * 60 * 60 // 30 days
  if (action === "autocomplete") return 2 * 60 * 60 // 2 hours
  return 15 * 60 // 15 minutes for nearby search
}

function makeCacheKey(action: GoogleAction, params: any) {
  if (action === "geocode") {
    const address = typeof params?.address === "string" ? normalizeText(params.address) : ""
    return `geocode:${address}`
  }

  if (action === "autocomplete") {
    const input = typeof params?.input === "string" ? normalizeText(params.input) : ""
    const lat = typeof params?.lat === "number" ? quantizeCoord(params.lat, 3) : null
    const lng = typeof params?.lng === "number" ? quantizeCoord(params.lng, 3) : null
    const radius = typeof params?.radius === "number" ? bucketRadiusMeters(params.radius) : 0
    return `autocomplete:${input}:${lat ?? "no_bias"}:${lng ?? "no_bias"}:${radius}`
  }

  // nearbySearch
  const lat = typeof params?.lat === "number" ? quantizeCoord(params.lat, 3) : 0
  const lng = typeof params?.lng === "number" ? quantizeCoord(params.lng, 3) : 0
  const radius = typeof params?.radius === "number" ? bucketRadiusMeters(params.radius) : 1000
  const type = typeof params?.type === "string" ? normalizeText(params.type) : ""
  const keyword = typeof params?.keyword === "string" ? normalizeText(params.keyword) : ""
  const language = typeof params?.language === "string" ? normalizeText(params.language) : "en"
  return `nearby:${lat}:${lng}:${radius}:${type}:${keyword}:${language}`
}

async function getCache(
  supabase: any,
  cacheKey: string,
) {
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

async function setCache(
  supabase: any,
  cacheKey: string,
  responseJson: unknown,
  ttlSeconds: number,
) {
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
    return NextResponse.json(
      { error: "Missing Supabase env vars." },
      { status: 500 },
    )
  }
  if (!GOOGLE_KEY) {
    return NextResponse.json(
      { error: "Missing Google Maps API key." },
      { status: 500 },
    )
  }

  const body = (await req.json()) as {
    action: GoogleAction
    params: any
    maxAgeSeconds?: number
  }

  if (!body?.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any

  const cacheKey = makeCacheKey(body.action, body.params)
  const cached = await getCache(supabase, cacheKey)
  if (cached) return NextResponse.json(cached)

  const ttl = body.maxAgeSeconds ?? ttlSecondsForAction(body.action)

  const url = new URL(
    body.action === "geocode"
      ? `${GOOGLE_BASE}/geocode/json`
      : body.action === "autocomplete"
        ? `${GOOGLE_BASE}/place/autocomplete/json`
        : `${GOOGLE_BASE}/place/nearbysearch/json`,
  )

  url.searchParams.set("key", GOOGLE_KEY)
  if (body.action === "geocode") {
    if (typeof body.params?.address !== "string" || body.params.address.trim() === "") {
      return NextResponse.json(
        { error: "Missing address." },
        { status: 400 },
      )
    }
    url.searchParams.set("address", body.params.address)
    url.searchParams.set("language", "en")
  }

  if (body.action === "autocomplete") {
    if (typeof body.params?.input !== "string" || body.params.input.trim() === "") {
      return NextResponse.json(
        { error: "Missing input." },
        { status: 400 },
      )
    }
    url.searchParams.set("input", body.params.input)
    url.searchParams.set("language", "en")

    if (typeof body.params?.lat === "number" && typeof body.params?.lng === "number") {
      const radius = typeof body.params?.radius === "number" ? body.params.radius : 2000
      url.searchParams.set("location", `${body.params.lat},${body.params.lng}`)
      url.searchParams.set("radius", String(radius))
    }

    // Optional: constrain suggestions when caller provides a bias.
    if (typeof body.params?.types === "string") {
      url.searchParams.set("types", body.params.types)
    }
  }

  if (body.action === "nearbySearch") {
    if (typeof body.params?.lat !== "number" || typeof body.params?.lng !== "number") {
      return NextResponse.json(
        { error: "Missing lat/lng." },
        { status: 400 },
      )
    }
    const radius = typeof body.params?.radius === "number" ? body.params.radius : 1000
    url.searchParams.set("location", `${body.params.lat},${body.params.lng}`)
    url.searchParams.set("radius", String(radius))

    if (typeof body.params?.type === "string" && body.params.type.trim() !== "") {
      url.searchParams.set("type", body.params.type)
    }
    if (typeof body.params?.keyword === "string" && body.params.keyword.trim() !== "") {
      url.searchParams.set("keyword", body.params.keyword)
    }
    url.searchParams.set("language", "en")
  }

  const googleRes = await fetch(url.toString(), { method: "GET" })
  const json = await googleRes.json()

  // Store both successful and error payloads briefly to prevent retry storms.
  await setCache(supabase, cacheKey, json, ttl)

  return NextResponse.json(json)
}

