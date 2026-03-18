import crypto from "crypto"

import { stableStringify } from "./stableStringify"

export function computePayloadHash(payload: unknown): string {
  const stable = stableStringify(payload)
  return crypto.createHash("sha256").update(stable).digest("hex")
}

