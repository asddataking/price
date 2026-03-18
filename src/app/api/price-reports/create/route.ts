import { NextResponse } from "next/server"
import crypto from "crypto"

import { createSupabaseServerClient } from "@/lib/supabase"
import { distanceMeters } from "@/lib/geo"

const RECEIPTS_BUCKET = "price-dash-receipts"
const VERIFIED_MAX_DISTANCE_METERS = 1200

function parseRequiredNumber(value: FormDataEntryValue | null, name: string) {
  if (typeof value !== "string") {
    throw new Error(`Missing ${name}.`)
  }
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${name}.`)
  }
  return n
}

function getString(value: FormDataEntryValue | null, name: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${name}.`)
  }
  return value.trim()
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()

  try {
    const store_id = getString(formData.get("store_id"), "store_id")
    const item_id = getString(formData.get("item_id"), "item_id")
    const price = parseRequiredNumber(formData.get("price"), "price")
    if (price < 0) throw new Error("Price must be >= 0.")

    const lat = parseRequiredNumber(formData.get("lat"), "lat")
    const lng = parseRequiredNumber(formData.get("lng"), "lng")

    const location_trust_raw = formData.get("location_trust")
    const location_trust =
      typeof location_trust_raw === "string" && location_trust_raw === "true"

    const ratingRaw = formData.get("rating")
    const rating =
      typeof ratingRaw === "string" && ratingRaw.trim() !== ""
        ? Number(ratingRaw)
        : 0

    const commentEntry = formData.get("comment")
    const comment =
      typeof commentEntry === "string" ? commentEntry : ""

    const photo = formData.get("photo")
    if (!(photo instanceof File)) {
      return NextResponse.json(
        { error: "Photo is required." },
        { status: 400 },
      )
    }

    const fileType = photo.type || "image/jpeg"
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"]
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json(
        { error: "Unsupported photo type. Use JPG/PNG/WebP." },
        { status: 400 },
      )
    }

    // Load store coords for verification distance check.
    const {
      data: store,
      error: storeError,
    } = await supabase
      .from("stores")
      .select("lat,lng")
      .eq("id", store_id)
      .single()

    if (storeError || !store) {
      return NextResponse.json(
        { error: "Invalid store." },
        { status: 400 },
      )
    }

    const storeLat = Number((store as any).lat)
    const storeLng = Number((store as any).lng)
    const dist = distanceMeters({ lat, lng }, { lat: storeLat, lng: storeLng })

    const verified = location_trust
      ? dist <= VERIFIED_MAX_DISTANCE_METERS
      : false

    const ext =
      fileType === "image/png"
        ? "png"
        : fileType === "image/webp"
          ? "webp"
          : "jpg"

    const safeName = (photo.name || "receipt")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 80)

    const objectPath = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${ext}`

    const uploadRes = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(objectPath, photo, {
        contentType: fileType,
        upsert: false,
      })

    if (uploadRes.error) {
      return NextResponse.json(
        { error: uploadRes.error.message },
        { status: 500 },
      )
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(objectPath)

    const {
      data: report,
      error: reportError,
    } = await supabase
      .from("price_reports")
      .insert({
        item_id,
        store_id,
        price,
        reporter_id: user.id,
        photo_url: publicUrl,
        lat,
        lng,
        verified,
      })
      .select("*")
      .single()

    if (reportError || !report) {
      return NextResponse.json(
        { error: reportError?.message ?? "Failed to create report." },
        { status: 500 },
      )
    }

    // Optional rating/review
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
      const trimmed = comment.trim()
      const hasAnyText = trimmed.length > 0

      const reviewRes = await supabase.from("reviews").insert({
        price_report_id: report.id,
        user_id: user.id,
        rating: Math.round(rating),
        comment: hasAnyText ? trimmed : null,
      })

      if (reviewRes.error) {
        // Report creation succeeded; do not fail the request for a review write.
      }
    }

    return NextResponse.json({ report, verified, dist })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Invalid request." },
      { status: 400 },
    )
  }
}

