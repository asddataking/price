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
      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10">
        <div className="flex flex-1 flex-col gap-14">
          {/* Hero */}
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
                <span className="inline-block h-2 w-2 rounded-full bg-magenta-400 shadow-[0_0_18px_rgba(217,70,239,0.85)]" />
                Verified local prices, instantly.
              </div>

              <h1 className="mt-6 text-5xl font-black tracking-tight text-white">
                WPrice
              </h1>
              <p className="mt-4 text-pretty text-sm leading-relaxed text-white/70">
                The modern price intel app. Browse deals by gas + groceries + liquor,
                backed by photo proof. On mobile, you get the full experience right away.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  asChild
                  className="h-12 rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-7 text-base font-bold text-white shadow-[0_0_26px_rgba(217,70,239,0.45)] hover:opacity-95 active:scale-[0.99] transition"
                >
                  <Link href="/app">Open the app</Link>
                </Button>

                <Button asChild variant="outline" className="h-12 rounded-xl border-white/20 bg-white/5 px-6 text-base text-white/85 hover:bg-white/10">
                  <Link href="/map">Browse the map</Link>
                </Button>
              </div>

              <ul className="mt-8 grid gap-2 text-sm text-white/80">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <span className="inline-block size-2 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(255,214,0,0.65)]" />
                  </span>
                  Photo-proof verification (no guessing).
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <span className="inline-block size-2 rounded-full bg-magenta-400 shadow-[0_0_14px_rgba(217,70,239,0.65)]" />
                  </span>
                  Gas + common retail categories (starter).
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <span className="inline-block size-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.6)]" />
                  </span>
                  “Win Raids” to help the community find better prices.
                </li>
              </ul>
            </div>

            {/* Hero imagery */}
            <div className="relative">
              <div className="absolute -inset-10 bg-[radial-gradient(circle_at_30%_20%,rgba(217,70,239,0.35),transparent_55%),radial-gradient(circle_at_75%_35%,rgba(255,214,0,0.22),transparent_50%)] blur-2xl" />

              <div className="relative rounded-3xl border border-white/10 bg-black/35 p-3 shadow-[0_0_45px_rgba(217,70,239,0.12)] backdrop-blur">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-white/70">Preview</div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full bg-magenta-400" />
                      <span className="inline-block size-2 rounded-full bg-yellow-300" />
                      <span className="inline-block size-2 rounded-full bg-cyan-300" />
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    <div className="grid grid-cols-2 gap-2 p-3">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/55">Hot wins</div>
                        <div className="mt-2 text-lg font-black text-white">$—</div>
                        <div className="mt-1 text-[10px] text-white/60">Verified</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/55">Gas stations</div>
                        <div className="mt-2 text-lg font-black text-white">Near you</div>
                        <div className="mt-1 text-[10px] text-white/60">Tap to raid</div>
                      </div>
                      <div className="col-span-2 rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/55">Receipts with photo proof</div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-sm font-semibold text-white/90">Scan. Win. Save.</div>
                          <img
                            src="/window.svg"
                            alt=""
                            className="h-6 w-6 saturate-150 brightness-200 contrast-125"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between px-2 text-[10px] text-white/55">
                  <span>Desktop: quick landing</span>
                  <span>Mobile: full app</span>
                </div>
              </div>

              {/* Trust strip */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="text-[10px] font-semibold text-white/55">Works with modern infrastructure</div>
                <div className="flex items-center gap-3">
                  {[
                    { src: "/vercel.svg", label: "Vercel" },
                    { src: "/next.svg", label: "Next.js" },
                    { src: "/globe.svg", label: "Local" },
                    { src: "/file.svg", label: "Receipts" },
                  ].map((x) => (
                    <div key={x.label} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                      <img
                        src={x.src}
                        alt={x.label}
                        className="h-4 w-4 opacity-90 saturate-150 brightness-200 contrast-150"
                      />
                      <span className="text-[10px] font-semibold text-white/70">{x.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <section aria-label="Features" className="grid gap-3 md:grid-cols-3">
            {[
              {
                title: "Verified price intel",
                desc: "Community-submitted pricing backed by photo proof so you can trust the number.",
                icon: "/file.svg",
              },
              {
                title: "Near-you cards first",
                desc: "Homepage is card-first: see hot wins and what’s worth raiding, instantly.",
                icon: "/globe.svg",
              },
              {
                title: "Gas + common retail",
                desc: "Start with gas, grocery, and liquor. Add more sources later without rewriting the pipeline.",
                icon: "/window.svg",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="flex items-center gap-3">
                  <img
                    src={f.icon}
                    alt=""
                    className="h-7 w-7 opacity-90 saturate-160 brightness-180 contrast-140"
                  />
                  <div className="text-sm font-semibold text-white">{f.title}</div>
                </div>
                <div className="mt-3 text-sm leading-relaxed text-white/70">{f.desc}</div>
              </div>
            ))}
          </section>

          {/* How it works */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-white/70">How it works</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-white">Get from “what’s the price?” to “I saved.”</div>
              </div>
              <div className="text-sm text-white/60 sm:max-w-[340px]">
                Desktop gets the fast landing. Mobile gets the full app.
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { n: "01", t: "Open the app", d: "Tap the CTA on desktop to get the native-feel UI." },
                { n: "02", t: "See nearby wins", d: "Browse Hot Wins and store cards—price first, verified." },
                { n: "03", t: "Raid + save", d: "Snap receipts, earn points, and push better prices to the map." },
              ].map((s) => (
                <div key={s.n} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                  <div className="text-xs font-black text-white/75">{s.n}</div>
                  <div className="mt-2 text-base font-semibold text-white">{s.t}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/70">{s.d}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Final CTA */}
          <section className="rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-white/70">Ready to save locally?</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-white">
                  Open WPrice on mobile for the full experience.
                </div>
                <div className="mt-2 text-sm text-white/65">Verified pricing + Win Raids. Built for quick decisions.</div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="h-12 rounded-xl bg-[linear-gradient(90deg,rgba(217,70,239,1),rgba(255,214,0,0.95))] px-7 text-base font-bold text-white shadow-[0_0_26px_rgba(217,70,239,0.45)] hover:opacity-95 active:scale-[0.99] transition"
                >
                  <Link href="/app">Open the app</Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-xl border-white/20 bg-white/5 px-6 text-base text-white/85 hover:bg-white/10">
                  <Link href="/map">See deals</Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </WPriceBrandingShell>
  )
}
