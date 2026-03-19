"use client"

import * as React from "react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { distanceMeters } from "@/lib/geo"
import { Badge } from "@/components/ui/badge"
import { Star, StarOff, Upload } from "lucide-react"

import type { StoreRow, ItemRow } from "./types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStoreId: string | null
  stores: StoreRow[]
  itemsById: Record<string, ItemRow>
  onOptimisticReport: (payload: {
    storeId: string
    itemId: string
    price: number
    reportedAtISO: string
    verified: boolean
  }) => void
  onRefreshCheapest: (storeIds: string[]) => Promise<void>
}

const RECEIPTS_MAX_DISTANCE_METERS = 1200

function timeBucketFromLocalTime(now: Date = new Date()): "morning" | "lunch" | "evening" | "night" {
  const h = now.getHours()
  // Lightweight time-of-day buckets to make the feed feel situational.
  if (h >= 5 && h < 11) return "morning"
  if (h >= 11 && h < 15) return "lunch"
  if (h >= 15 && h < 21) return "evening"
  return "night"
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not available"))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 15_000,
    })
  })
}

export default function ReportSheet({
  open,
  onOpenChange,
  defaultStoreId,
  stores,
  itemsById,
  onOptimisticReport,
  onRefreshCheapest,
}: Props) {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  const items = React.useMemo(() => Object.values(itemsById), [itemsById])

  const [category, setCategory] = React.useState<string>("gas")
  const [storeId, setStoreId] = React.useState<string | null>(defaultStoreId)
  const [itemId, setItemId] = React.useState<string | null>(null)
  const [price, setPrice] = React.useState<string>("")

  const [rating, setRating] = React.useState<number>(0)
  const [comment, setComment] = React.useState<string>("")

  const [photoFile, setPhotoFile] = React.useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = React.useState<string | null>(
    null,
  )

  const [submitting, setSubmitting] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const reset = React.useCallback(() => {
    setCategory("gas")
    setStoreId(defaultStoreId)
    setItemId(null)
    setPrice("")
    setRating(0)
    setComment("")
    setPhotoFile(null)
    setSearch("")
    setPhotoPreviewUrl(null)
  }, [defaultStoreId])

  React.useEffect(() => {
    if (!open) return
    reset()

    // Choose a sensible default category based on current store selection (first item).
    const first = Object.values(itemsById)[0]
    if (first?.category) setCategory(first.category)

    // Default item to first item within category.
    const catItems = items.filter((it) => it.category === (first?.category ?? "gas"))
    if (catItems.length > 0) {
      setItemId(catItems[0].id)
      setCategory(catItems[0].category)
    }
  }, [open, reset, items, itemsById])

  React.useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(photoFile)
    setPhotoPreviewUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [photoFile])

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((it) => it.category === category)
      .filter((it) => (q ? it.name.toLowerCase().includes(q) : true))
  }, [items, category, search])

  const selectedStore = React.useMemo(() => {
    if (!storeId) return null
    return stores.find((s) => s.id === storeId) ?? null
  }, [storeId, stores])

  const selectedItem = React.useMemo(() => {
    if (!itemId) return null
    return itemsById[itemId] ?? null
  }, [itemId, itemsById])

  const recordItemIntent = React.useCallback(
    async (intentItemId: string) => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData?.user) return

        const bucket = timeBucketFromLocalTime()

        // MVP approach: read-modify-write for count increment.
        const { data: existing } = await supabase
          .from("user_item_preferences")
          .select("count")
          .eq("user_id", userData.user.id)
          .eq("item_id", intentItemId)
          .eq("time_bucket", bucket)
          .maybeSingle()

        const nextCount = (existing?.count ?? 0) + 1

        await supabase.from("user_item_preferences").upsert(
          {
            user_id: userData.user.id,
            item_id: intentItemId,
            time_bucket: bucket,
            count: nextCount,
          },
          { onConflict: "user_id,item_id,time_bucket" },
        )
      } catch {
        // Intent tracking is non-critical; ignore failures.
      }
    },
    [supabase],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0">
        <div className="px-4 pb-4 pt-3">
          <SheetHeader className="px-2">
            <SheetTitle>Report a WPrice</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2 px-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gas">Gas</SelectItem>
                  <SelectItem value="cigarettes">Cigarettes</SelectItem>
                  <SelectItem value="liquor">Liquor</SelectItem>
                  <SelectItem value="groceries">Groceries</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 px-2">
              <Label>Item</Label>
              <Command className="rounded-xl border bg-background/60">
                <CommandInput
                  placeholder={`Search ${category}...`}
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  {filteredItems.length === 0 ? (
                    <CommandEmpty>No matches.</CommandEmpty>
                  ) : (
                    <CommandGroup heading="Results">
                      {filteredItems.slice(0, 20).map((it) => (
                        <CommandItem
                          key={it.id}
                          onSelect={() => {
                            setItemId(it.id)
                            // Track user intent as soon as they select an item.
                            // Do not block the UI on this network call.
                            void recordItemIntent(it.id)
                          }}
                          value={it.name}
                          aria-selected={it.id === itemId}
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{it.name}</span>
                            {it.variants?.length ? (
                              <span className="text-xs text-muted-foreground">
                                {it.variants[0]}
                              </span>
                            ) : null}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>

            <div className="space-y-2 px-2">
              <Label>Store</Label>
              <Select
                value={storeId ?? undefined}
                onValueChange={(v) => setStoreId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No stores in view
                    </SelectItem>
                  ) : (
                    stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 px-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder="e.g. 5.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div className="space-y-2 px-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Photo proof (required)</Label>
                <Badge variant="secondary">Receipt/shelf tag</Badge>
              </div>

              <div className="rounded-xl border bg-background/40 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Upload className="size-5" />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        setPhotoFile(f)
                      }}
                    />
                    {photoFile ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {photoFile.name}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Choose an image to submit.
                      </div>
                    )}
                  </div>
                </div>

                {photoPreviewUrl ? (
                  <img
                    src={photoPreviewUrl}
                    alt="Receipt preview"
                    className="mt-3 w-full rounded-lg border bg-background"
                  />
                ) : null}
              </div>
            </div>

            <div className="space-y-2 px-2">
              <Label>Optional rating</Label>
              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const value = idx + 1
                  const active = rating >= value
                  return (
                    <button
                      key={value}
                      type="button"
                      className="rounded-full p-1 hover:bg-muted"
                      onClick={() => setRating(value)}
                      aria-pressed={active}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    >
                      {active ? (
                        <Star className="size-6 fill-primary text-primary" />
                      ) : (
                        <StarOff className="size-6 text-muted-foreground" />
                      )}
                    </button>
                  )
                })}

                {rating > 0 ? (
                  <button
                    type="button"
                    className="ml-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                    onClick={() => setRating(0)}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 px-2">
              <Label htmlFor="comment">Optional review</Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything helpful about this price?"
                className="min-h-20"
              />
            </div>

            <div className="px-2">
              <Button
                type="button"
                className="w-full"
                disabled={submitting || !storeId || !itemId}
                onClick={async () => {
                  if (!storeId) {
                    toast.error("Choose a store.")
                    return
                  }
                  if (!itemId) {
                    toast.error("Choose an item.")
                    return
                  }
                  if (!selectedStore) {
                    toast.error("Invalid store selection.")
                    return
                  }

                  const parsedPrice = Number(price)
                  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
                    toast.error("Enter a valid price.")
                    return
                  }

                  if (!photoFile) {
                    toast.error("Photo proof is required.")
                    return
                  }

                  setSubmitting(true)
                  const { data: { user }, error: userError } = await supabase.auth.getUser()
                  if (userError || !user) {
                    toast.error("Create an account to report prices.")
                    setSubmitting(false)
                    window.location.href = "/auth/signup"
                    return
                  }

                  let locationTrusted = false
                  let reportLat = Number(selectedStore.lat)
                  let reportLng = Number(selectedStore.lng)

                  try {
                    const pos = await getCurrentPosition()
                    locationTrusted = true
                    reportLat = pos.coords.latitude
                    reportLng = pos.coords.longitude
                  } catch {
                    locationTrusted = false
                  }

                  const expectedDist = distanceMeters(
                    { lat: reportLat, lng: reportLng },
                    { lat: Number(selectedStore.lat), lng: Number(selectedStore.lng) },
                  )
                  const expectedVerified =
                    locationTrusted && expectedDist <= RECEIPTS_MAX_DISTANCE_METERS

                  onOptimisticReport({
                    storeId,
                    itemId,
                    price: parsedPrice,
                    reportedAtISO: new Date().toISOString(),
                    verified: expectedVerified,
                  })

                  try {
                    const fd = new FormData()
                    fd.append("store_id", storeId)
                    fd.append("item_id", itemId)
                    fd.append("price", String(parsedPrice))
                    fd.append("lat", String(reportLat))
                    fd.append("lng", String(reportLng))
                    fd.append("location_trust", locationTrusted ? "true" : "false")
                    if (rating >= 1 && rating <= 5) fd.append("rating", String(rating))
                    if (comment.trim().length > 0) fd.append("comment", comment.trim())
                    fd.append("photo", photoFile)

                    const res = await fetch("/api/price-reports/create", {
                      method: "POST",
                      body: fd,
                    })

                    if (!res.ok) {
                      const j = await res.json().catch(() => ({}))
                      throw new Error(j?.error ?? "Failed to submit report.")
                    }

                    const data = await res.json()
                    toast.success(
                      data?.verified
                        ? "WPrice verified! W'd the report. Thanks!"
                        : "Submitted for WPrice verification.",
                    )
                    onRefreshCheapest([storeId])
                    onOpenChange(false)
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed to submit report.")
                    await onRefreshCheapest([storeId])
                  } finally {
                    setSubmitting(false)
                  }
                }}
              >
                {submitting ? "Submitting..." : "Submit report"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

