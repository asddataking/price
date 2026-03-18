import { headers } from "next/headers"
import Link from "next/link"

import HomeFeed from "@/components/home/home-feed"
import WPriceBrandingShell from "@/components/branding/WPriceBrandingShell"
import { Button } from "@/components/ui/button"
import { isNativeMobileUserAgent } from "@/lib/device/isNativeMobile"

export default async function Home() {
  const ua = (await headers()).get("user-agent")
  const isNativeMobile = isNativeMobileUserAgent(ua)

  if (isNativeMobile) {
    return (
      <WPriceBrandingShell>
        <HomeFeed />
      </WPriceBrandingShell>
    )
  }

  return (
    <WPriceBrandingShell>
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_18px_rgba(255,60,0,0.85)]" />
            Desktop landing
          </div>

          <h1 className="mt-6 text-5xl font-black tracking-tight text-white">
            WPrice
          </h1>
          <p className="mt-3 text-pretty text-sm text-white/70">
            Real-time verified local deals.
            <span className="block text-white/60">On mobile, you go straight to the app.</span>
          </p>

          <div className="mt-8 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-left backdrop-blur">
              <div className="text-xs font-semibold text-white/70">How it works</div>
              <div className="mt-2 space-y-1 text-sm text-white/85">
                <div>1) Find nearby verified prices</div>
                <div>2) Tap a store to start a Win Raid</div>
                <div>3) Earn points with photo proof</div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <Button
                asChild
                className="h-12 rounded-xl bg-[linear-gradient(90deg,rgba(255,60,0,1),rgba(255,0,140,0.95))] px-6 text-base font-bold text-white shadow-[0_0_26px_rgba(255,60,0,0.55)] hover:opacity-95"
              >
                <Link href="/app">Open the app</Link>
              </Button>
            </div>

            <div className="text-xs text-white/55">
              Tip: for best experience, open on your phone.
            </div>
          </div>
        </div>
      </main>
    </WPriceBrandingShell>
  )
}
