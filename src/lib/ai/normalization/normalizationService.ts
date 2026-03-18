import crypto from "crypto"

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any
    eq: (column: string, value: any) => any
    maybeSingle: () => Promise<{ data: any; error: any }>
    upsert: (rows: any, opts?: any) => any
  }
}

export type NormalizationRequest = {
  inputText: string
  methodHint?: "rule" | "fuzzy" | "ai_fallback"
}

export type NormalizationResponse = {
  normalizedText: string
  method: "rule" | "fuzzy" | "ai_fallback"
  confidence: number
}

/**
 * Supabase-backed normalization with result caching.
 *
 * Speed/accuracy goals:
 * - deterministic cleanup is used first (fast, consistent)
 * - any expensive/fallback normalization is still cached by input hash
 * - normalization results are never recomputed for the same text twice
 */
export async function normalizeWithAi({
  req,
  supabase,
}: {
  req: NormalizationRequest
  supabase: SupabaseLike
}): Promise<NormalizationResponse> {
  const inputText = typeof req?.inputText === "string" ? req.inputText : ""
  const methodHint = req?.methodHint ?? "ai_fallback"

  const cleaned = cleanForNormalization(inputText)
  const inputHash = computeInputHash(cleaned)

  // 1) Cache read
  const { data: cached, error: cacheReadError } = await supabase
    .from("normalization_cache")
    .select("normalized_output, method, confidence, input_text")
    .eq("input_hash", inputHash)
    .maybeSingle()

  if (cacheReadError) throw cacheReadError

  if (cached?.normalized_output) {
    const normalizedText = cached?.normalized_output?.normalizedText ?? cached?.normalized_output?.normalized_text
    if (typeof normalizedText === "string") {
      return {
        normalizedText,
        method: cached?.method as NormalizationResponse["method"],
        confidence: typeof cached?.confidence === "number" ? cached.confidence : 0.5,
      }
    }
  }

  // 2) Deterministic normalization
  const result = normalizeDeterministically(cleaned, methodHint)

  // 3) Cache write (upsert by input_hash)
  const { error: cacheWriteError } = await supabase
    .from("normalization_cache")
    .upsert(
      {
        input_text: cleaned,
        input_hash: inputHash,
        normalized_output: { normalizedText: result.normalizedText },
        method: result.method,
        confidence: result.confidence,
      },
      { onConflict: "input_hash" },
    )

  if (cacheWriteError) throw cacheWriteError

  return result
}

function cleanForNormalization(inputText: string) {
  return inputText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9$.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function computeInputHash(cleanedText: string) {
  return crypto.createHash("sha256").update(cleanedText).digest("hex")
}

function normalizeDeterministically(cleanedText: string, methodHint: NormalizationRequest["methodHint"]): NormalizationResponse {
  // At this stage we keep the “AI” wrapper as an expensive fallback placeholder.
  // Deterministic cleanup is fast and consistent, which improves accuracy.
  if (methodHint === "rule") {
    return { normalizedText: cleanedText, method: "rule", confidence: 0.95 }
  }

  if (methodHint === "fuzzy") {
    // We can expand this later with lemmatization, token rewrite, etc.
    return { normalizedText: cleanedText, method: "fuzzy", confidence: 0.85 }
  }

  // ai_fallback: no external call yet (cost control).
  // Confidence remains low enough that later pipeline stages can choose to re-check.
  return { normalizedText: cleanedText, method: "ai_fallback", confidence: 0.35 }
}

