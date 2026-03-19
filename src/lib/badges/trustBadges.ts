import type { DealBadge } from "@/components/home/cards/deal-card"

function minutesAgo(ts: string) {
  const then = new Date(ts).getTime()
  const diffMs = Math.max(0, Date.now() - then)
  return diffMs / 60000
}

function badgeToneFromFreshness(m: number): DealBadge["tone"] {
  if (m <= 2 * 60) return "success"
  if (m <= 24 * 60) return "warning"
  return "muted"
}

const LIVE_THRESHOLD_MINUTES = 30
const LAST_KNOWN_MINUTES = 24 * 60

function hasAny(haystack: string, needles: string[]) {
  const s = haystack.toLowerCase()
  return needles.some((n) => s.includes(n.toLowerCase()))
}

export function badgesFromObservedAt({
  observedAt,
  verificationType,
}: {
  observedAt: string
  // Values expected from `retail_location_products.verification_type`:
  // api_live | api_verified | user_reported | user_receipt | mixed | etc.
  verificationType?: string | null
}): DealBadge[] {
  const m = minutesAgo(observedAt)
  const v = String(verificationType ?? "").trim().toLowerCase()

  const userReported = hasAny(v, ["user_reported", "user_receipt"])
  const apiLive = hasAny(v, ["api_live"])
  const apiVerified = hasAny(v, ["api_verified"]) || hasAny(v, ["api verified"])

  const trustBadge: DealBadge =
    userReported
      ? { label: "User Reported", tone: "brand" }
      : apiLive
        ? { label: "Live", tone: "success" }
        : apiVerified
          ? { label: "API Verified", tone: "brand" }
          : m <= LIVE_THRESHOLD_MINUTES
            ? { label: "Live", tone: "success" }
            : { label: "Last Known", tone: "muted" }

  const updatedBadge: DealBadge = {
    label: `Updated ${Math.max(1, Math.round(m))}m ago`,
    tone: badgeToneFromFreshness(m),
  }

  const maybeLastKnown: DealBadge | null = m > LAST_KNOWN_MINUTES ? { label: "Last Known", tone: "muted" } : null

  if (userReported) {
    return maybeLastKnown ? [{ label: "User Reported", tone: "brand" }, updatedBadge, maybeLastKnown] : [{ label: "User Reported", tone: "brand" }, updatedBadge]
  }

  if (apiLive || apiVerified) {
    return maybeLastKnown ? [trustBadge, updatedBadge, maybeLastKnown] : [trustBadge, updatedBadge]
  }

  return maybeLastKnown ? [trustBadge, updatedBadge, maybeLastKnown] : [trustBadge, updatedBadge]
}

