/**
 * Stable JSON stringify: sorts object keys recursively.
 * This is used to compute deterministic payload hashes.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  const stringifyInner = (v: unknown): string => {
    if (v === null) return "null"
    if (typeof v === "number" || typeof v === "boolean") return String(v)
    if (typeof v === "string") return JSON.stringify(v)
    if (typeof v === "undefined") return "null"

    if (Array.isArray(v)) {
      return `[${v.map((x) => stringifyInner(x)).join(",")}]`
    }

    if (typeof v === "object") {
      const obj = v as Record<string, unknown>
      if (seen.has(obj)) {
        // Deterministic fallback for cyclic graphs.
        return JSON.stringify("[Circular]")
      }
      seen.add(obj)

      const keys = Object.keys(obj).sort()
      return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyInner(obj[k])}`).join(",")}}`
    }

    // BigInt, functions, symbols, etc. are rare in our payloads; serialize as string.
    return JSON.stringify(String(v))
  }

  return stringifyInner(value)
}

