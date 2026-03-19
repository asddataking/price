import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Streams the generated hero mock image back to the browser.
// Note: the image is produced by the GenerateImage tool into Cursor's internal `assets/` folder.
// If you later move the file into `public/`, this route can be removed and the landing page can use `/landing-hero-mock.png` directly.
export async function GET(_req: NextRequest) {
  const filePath = path.join(
    os.homedir(),
    ".cursor",
    "projects",
    "c-Users-danog-Desktop-Code-2-price",
    "assets",
    "landing-hero-mock.png",
  )

  try {
    const buf = await fs.readFile(filePath)
    return new NextResponse(buf, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return new NextResponse("Hero mock not found", { status: 404 })
  }
}

