"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import Tesseract from "tesseract.js"

import { Button } from "@/components/ui/button"
import { ConfettiBurst } from "./confetti"
import { createSupabaseBrowserClient } from "@/lib/supabase"

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

type CapturedShot = {
  url: string
  blob: Blob
}

const RECEIPTS_BUCKET = "price-dash-receipts"
const TOTAL_SNAPS = 8

const PROMPTS = [
  "Raid the gas signs",
  "Now cigarettes",
  "Liquor shelf",
  "Grocery deals",
  "Find the cents (price digits)",
  "Capture the product name",
  "Look for promo tags / discount",
  "Last sweep: get the best price",
]

const W_FLOATS = [
  { left: "8%", top: "18%", size: 38, delay: 0 },
  { left: "22%", top: "8%", size: 28, delay: 0.6 },
  { left: "72%", top: "14%", size: 34, delay: 0.2 },
  { left: "84%", top: "30%", size: 30, delay: 0.9 },
  { left: "58%", top: "8%", size: 26, delay: 0.4 },
]

export function WinRaidCamera({ storeId }: { storeId: string }) {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const [storeName, setStoreName] = React.useState<string>("your store")
  const [permissionState, setPermissionState] = React.useState<
    "starting" | "ready" | "denied" | "error"
  >("starting")

  const [shots, setShots] = React.useState<CapturedShot[]>([])
  const [capturing, setCapturing] = React.useState(false)
  const [completed, setCompleted] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)
  const [processedSnaps, setProcessedSnaps] = React.useState(0)
  const [itemsRaided, setItemsRaided] = React.useState(0)
  const [pointsAwarded, setPointsAwarded] = React.useState(0)
  const [raidId, setRaidId] = React.useState<string | null>(null)

  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)

  const currentPrompt = shots.length < TOTAL_SNAPS ? PROMPTS[shots.length] : null

  const hasProcessedRef = React.useRef(false)

  const normalizeForMatch = React.useCallback((s: string) => {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9$.\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }, [])

  const extractPrices = React.useCallback(
    (ocrText: string) => {
      const text = normalizeForMatch(ocrText).replace(/,/g, "")
      const prices: number[] = []

      // Try to capture typical receipt decimals like 5.99 / 12.49
      const priceRegex = /(?:\$|usd)?\s*(\d{1,4})\s*[.]\s*(\d{2})/gim

      let match: RegExpExecArray | null = null
      while ((match = priceRegex.exec(text)) !== null) {
        const dollars = Number(match[1])
        const cents = Number(match[2])
        if (!Number.isFinite(dollars) || !Number.isFinite(cents)) continue
        const value = dollars + cents / 100
        if (value > 0 && value < 500) prices.push(value)
      }

      const distinct = Array.from(
        new Set(prices.map((n) => Math.round(n * 100) / 100)),
      ).sort((a, b) => b - a)

      return distinct
    },
    [normalizeForMatch],
  )

  const matchItemsFromText = React.useCallback(
    (ocrText: string, items: ItemRow[]) => {
      const text = normalizeForMatch(ocrText)

      const findItemId = (pred: (it: ItemRow) => boolean) =>
        items.find((it) => pred(it))?.id ?? null

      const candidates: string[] = []

      const gasPremiumId = findItemId(
        (it) => it.category === "gas" && (text.includes("premium") || text.includes("p remium")),
      )
      if (gasPremiumId) candidates.push(gasPremiumId)

      const gasRegularId = findItemId(
        (it) =>
          it.category === "gas" &&
          text.includes("regular") &&
          !text.includes("premium"),
      )
      if (gasRegularId) candidates.push(gasRegularId)

      const marlboroId = findItemId((it) => it.category === "cigarettes" && text.includes("marlboro"))
      if (marlboroId) candidates.push(marlboroId)

      const newportId = findItemId((it) => it.category === "cigarettes" && text.includes("newport"))
      if (newportId) candidates.push(newportId)

      const titoId = findItemId((it) => it.category === "liquor" && (text.includes("tito") || text.includes("titos")))
      if (titoId) candidates.push(titoId)

      const smirnoffId = findItemId((it) => it.category === "liquor" && text.includes("smirnoff"))
      if (smirnoffId) candidates.push(smirnoffId)

      const jackId = findItemId((it) => it.category === "liquor" && text.includes("jack"))
      if (jackId) candidates.push(jackId)

      const milkId = findItemId((it) => it.category === "groceries" && text.includes("milk"))
      if (milkId) candidates.push(milkId)

      const eggsId = findItemId((it) => it.category === "groceries" && text.includes("egg"))
      if (eggsId) candidates.push(eggsId)

      const yogurtId = findItemId(
        (it) => it.category === "groceries" && (text.includes("yogurt") || text.includes("yoghurt")),
      )
      if (yogurtId) candidates.push(yogurtId)

      const uniqueCandidates = Array.from(new Set(candidates))
      if (uniqueCandidates.length > 0) return uniqueCandidates.slice(0, 2)

      // Fuzzy-ish fallback: check if any variant substring hits.
      const scored = items
        .map((it) => {
          let score = 0
          const itemText = normalizeForMatch([it.name, ...it.variants].join(" "))
          if (text.includes(itemText.slice(0, 10))) score += 2
          for (const v of it.variants.slice(0, 4)) {
            const vn = normalizeForMatch(v)
            if (vn.length >= 4 && text.includes(vn)) score += 3
          }
          return { id: it.id, score }
        })
        .sort((a, b) => b.score - a.score)
        .filter((x) => x.score >= 3)
        .slice(0, 2)
        .map((x) => x.id)

      return scored
    },
    [normalizeForMatch],
  )

  const getCurrentLatLng = React.useCallback(async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) reject(new Error("No geolocation"))
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 7000,
          maximumAge: 10_000,
        })
      })

      return { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch {
      return null
    }
  }, [])

  const uploadReceipt = React.useCallback(
    async (blob: Blob) => {
      const ext =
        blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"
      const uuid =
        globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)
      const objectPath = `${uuid}-${Date.now()}.${ext}`

      const uploadRes = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(objectPath, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: false,
        })

      if (uploadRes.error) {
        throw new Error(uploadRes.error.message)
      }

      const { data } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(objectPath)
      return data.publicUrl as string
    },
    [supabase],
  )

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name")
        .eq("id", storeId)
        .maybeSingle()

      if (cancelled) return
      if (error || !data?.name) return
      setStoreName(data.name as string)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, storeId])

  React.useEffect(() => {
    let cancelled = false

    const startCamera = async () => {
      try {
        setPermissionState("starting")

        if (!navigator.mediaDevices?.getUserMedia) {
          setPermissionState("error")
          toast.error("Camera not available on this device.")
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setPermissionState("ready")
      } catch (e: any) {
        if (cancelled) return
        setPermissionState(e?.name === "NotAllowedError" ? "denied" : "error")
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const captureShot = React.useCallback(async () => {
    if (completed) return
    if (capturing) return
    if (shots.length >= TOTAL_SNAPS) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    if (permissionState !== "ready") {
      toast.error("Camera not ready yet.")
      return
    }

    if (video.readyState < 2) {
      toast.error("Camera is still warming up.")
      return
    }

    setCapturing(true)
    try {
      const w = video.videoWidth || 1280
      const h = video.videoHeight || 720
      canvas.width = w
      canvas.height = h

      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Missing 2D canvas context.")

      ctx.drawImage(video, 0, 0, w, h)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
      })

      if (!blob) {
        toast.error("Failed to capture image.")
        return
      }

      const url = URL.createObjectURL(blob)
      setShots((prev) => [...prev, { url, blob }])
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to capture.")
    } finally {
      setCapturing(false)
    }
  }, [capturing, completed, permissionState, shots.length])

  React.useEffect(() => {
    if (hasProcessedRef.current) return
    if (shots.length !== TOTAL_SNAPS) return

    hasProcessedRef.current = true

    stopCamera()
    setCompleted(true)
    setProcessing(true)

    const run = async () => {
      // 1) Auth + fetch store/items for parsing.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        toast.error("Please sign in to complete a Win Raid.")
        setProcessing(false)
        return
      }

      const [{ data: itemsData }, { data: storeData }, userLocation] = await Promise.all([
        supabase.from("items").select("id,name,category,variants"),
        supabase.from("stores").select("id,name,lat,lng").eq("id", storeId).maybeSingle(),
        getCurrentLatLng(),
      ])

      const items = (itemsData ?? []) as ItemRow[]
      const store = (storeData ?? null) as StoreRow | null

      if (!store) {
        toast.error("Raid store not found.")
        setProcessing(false)
        return
      }

      // 2) Create win_raids row (for scoring + completion stats).
      const raidInsert = await supabase
        .from("win_raids")
        .insert({
          user_id: user.id,
          store_id: store.id,
          items_raided: 0,
          points_awarded: 0,
          started_at: new Date().toISOString(),
          completed_at: null,
        })
        .select("id")
        .single()

      if (raidInsert.error) {
        toast.error(raidInsert.error.message)
        setProcessing(false)
        return
      }

      const raidRowId = (raidInsert.data?.id as string) ?? null
      setRaidId(raidRowId)

      const lat = userLocation?.lat ?? Number(store.lat)
      const lng = userLocation?.lng ?? Number(store.lng)

      // 3) OCR per snap, then build price_reports inserts.
      const reportsToInsert: Array<{
        item_id: string
        store_id: string
        price: number
        reporter_id: string
        photo_url: string
        lat: number
        lng: number
        verified: boolean
      }> = []

      const maxTotalInserts = 12

      for (let i = 0; i < shots.length; i += 1) {
        if (reportsToInsert.length >= maxTotalInserts) break

        setProcessedSnaps(i)
        const shot = shots[i]

        try {
          // OCR: on-device only.
          const {
            data: { text },
          } = await Tesseract.recognize(shot.blob, "eng", {
            logger: () => {
              // keep UI lightweight; progress is handled by processedSnaps.
            },
          })

          const matchedItemIds = matchItemsFromText(text, items)
          const priceCandidates = extractPrices(text)

          if (matchedItemIds.length === 0 || priceCandidates.length === 0) {
            continue
          }

          const photoUrl = await uploadReceipt(shot.blob)

          // Pair: up to 2 extracted prices per snap with up to 2 likely items.
          const maxPerSnap = 2
          const usablePrices = priceCandidates.slice(0, maxPerSnap)

          for (let p = 0; p < usablePrices.length; p += 1) {
            if (reportsToInsert.length >= maxTotalInserts) break

            const price = usablePrices[p]
            const item_id = matchedItemIds[p % matchedItemIds.length]

            if (!Number.isFinite(price) || price <= 0 || price >= 500) continue

            reportsToInsert.push({
              item_id,
              store_id: store.id,
              price: Number(price.toFixed(2)),
              reporter_id: user.id,
              photo_url: photoUrl,
              lat,
              lng,
              verified: true,
            })
          }
        } catch (e: any) {
          toast.error(e?.message ?? "OCR failed on one snap. Continuing.")
        } finally {
          setProcessedSnaps(i + 1)
        }
      }

      // 4) Batch insert price reports + update win_raids.
      if (reportsToInsert.length > 0) {
        const insertRes = await supabase
          .from("price_reports")
          .insert(reportsToInsert)

        if (insertRes.error) {
          toast.error(insertRes.error.message)
        }
      }

      const insertedCount = reportsToInsert.length
      const points = insertedCount * 10

      setItemsRaided(insertedCount)
      setPointsAwarded(points)

      if (raidRowId) {
        await supabase
          .from("win_raids")
          .update({
            items_raided: insertedCount,
            points_awarded: points,
            completed_at: new Date().toISOString(),
          })
          .eq("id", raidRowId)
      }

      toast.success(
        insertedCount > 0 ? `Raid done! +${points} points` : "Raid done! No prices found",
      )
      setProcessing(false)
    }

    void run()
  }, [
    extractPrices,
    getCurrentLatLng,
    hasProcessedRef,
    matchItemsFromText,
    setCompleted,
    shots,
    stopCamera,
    storeId,
    supabase,
    uploadReceipt,
  ])

  const onBackToMap = React.useCallback(() => {
    // Keep the flow simple: full reload ensures the realtime map subscription is fresh.
    window.location.href = "/"
  }, [])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <ConfettiBurst active={completed && !processing} />

      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />

      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay */}
      <div className="absolute inset-0 bg-linear-to-b from-black/70 via-black/30 to-black/70" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/90">
              Win Raid at {storeName}
            </div>
            <div className="mt-1 text-xs text-white/60">
              Tokens: {shots.length}/{TOTAL_SNAPS}
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="rounded-full bg-white/10 text-white hover:bg-white/15"
            onClick={onBackToMap}
          >
            Exit
          </Button>
        </div>

        <div className="px-4 pb-4 pt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-white/80 transition-[width] duration-500"
              style={{
                width:
                  shots.length >= TOTAL_SNAPS
                    ? "100%"
                    : `${Math.round((shots.length / TOTAL_SNAPS) * 100)}%`,
              }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white/95">
                {completed
                  ? "Raid complete"
                  : currentPrompt ?? "Take the snap!"}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {completed
                  ? processing
                    ? `OCR in progress... ${processedSnaps}/${TOTAL_SNAPS}`
                    : `Raid complete! +${pointsAwarded} points`
                  : "Tap the button to snap a quick photo (Step 3 will OCR it)."}
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          {W_FLOATS.map((w, idx) => (
            <motion.div
              key={idx}
              className="absolute text-white"
              style={{ left: w.left, top: w.top, width: w.size, height: w.size }}
              initial={{ y: 0, opacity: 0.35, rotate: 0 }}
              animate={{ y: [-10, 12, -10], opacity: [0.25, 0.75, 0.25], rotate: [0, 10, 0] }}
              transition={{ duration: 2.8 + idx * 0.4, repeat: Infinity, delay: w.delay }}
            >
              <div
                className="flex h-full w-full items-center justify-center rounded-full"
                style={{
                  boxShadow: "0 0 22px rgba(255,255,255,0.25)",
                }}
              >
                <span className="text-2xl font-black text-white drop-shadow">
                  W
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Capture control */}
        <div className="relative z-20 mt-auto p-4">
          {!completed ? (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={captureShot}
                disabled={capturing || permissionState !== "ready"}
                className="relative flex size-20 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur transition hover:bg-white/15 active:scale-95 disabled:opacity-60"
                aria-label="Snap photo"
              >
                <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
                <div className="h-10 w-10 rounded-full bg-white/80" />
              </button>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur">
              <div className="text-center">
                <div className="text-sm font-semibold text-white/95">
                  {processing
                    ? "Raid complete! Winning in progress..."
                    : `Raid complete! +${pointsAwarded} points`}
                </div>
                <div className="mt-2 text-sm text-white/70">
                  {processing
                    ? `OCR + match... ${processedSnaps}/${TOTAL_SNAPS} snaps`
                    : `${itemsRaided} prices W'd. Thanks for raiding!`}
                </div>
                <div className="mt-4 text-xs text-white/60">
                  You + 312 others just saved locals ~$87 this week.
                </div>
              </div>
              <div className="mt-5 flex items-center justify-center">
                <Button
                  type="button"
                  onClick={onBackToMap}
                  className="rounded-full bg-white text-black hover:bg-white/90"
                >
                  Back to WPrice map
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

