import { headers } from "next/headers"
import Link from "next/link"

import HomeFeed from "@/components/home/home-feed"
import WPriceLandingShell from "@/components/branding/WPriceLandingShell"
import WPriceBrandingShell from "@/components/branding/WPriceBrandingShell"
import { Button } from "@/components/ui/button"
import { isNativeMobileUserAgent } from "@/lib/device/isNativeMobile"

export default async function Home() {
  const ua = (await headers()).get("user-agent")
  const isNativeMobile = isNativeMobileUserAgent(ua)
  const year = new Date().getFullYear()

  if (isNativeMobile) {
    return (
      <WPriceBrandingShell>
        <HomeFeed />
      </WPriceBrandingShell>
    )
  }

  return (
    <WPriceLandingShell>
      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10">
        <div className="flex flex-1 flex-col gap-14">
          <header className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <img src="/window.svg" alt="" className="h-5 w-5 opacity-90" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight text-white">WPrice</span>
                  <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-0.5 text-[10px] font-semibold text-white/70 sm:inline-flex">
                    Photo-proof pricing
                  </span>
                </div>
                <div className="text-[11px] text-white/55">Verified local price intel</div>
              </div>
            </div>

            <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
              <a href="#features" className="hover:text-white/90">
                Features
              </a>
              <a href="#how" className="hover:text-white/90">
                How it works
              </a>
              <a href="#testimonials" className="hover:text-white/90">
                Stories
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <Button asChild variant="outline" className="h-11 rounded-xl border-white/20 bg-white/5 px-6 text-base text-white/85 hover:bg-white/10">
                  <Link href="/app">Browse the app</Link>
              </Button>
              <Button
                asChild
                className="h-11 rounded-xl bg-[linear-gradient(90deg,rgba(255,61,0,1),rgba(255,214,0,0.95))] px-7 text-base font-bold text-white shadow-[0_0_26px_rgba(255,61,0,0.25)] hover:opacity-95 active:scale-[0.99] transition"
              >
                <Link href="/app">Open app</Link>
              </Button>
            </div>
          </header>

          {/* Hero */}
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_18px_rgba(255,61,0,0.85)]" />
                Verified deals. Zero guessing.
              </div>

              <h1 className="mt-6 text-6xl font-black tracking-tight md:text-7xl text-white">
                WPrice
              </h1>
              <p className="mt-4 text-pretty text-base leading-relaxed sm:text-lg text-white/70">
                Find real local prices fast. Browse deals by gas, groceries, and liquor backed by photo proof—then
                tap to go.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  asChild
                  className="h-12 rounded-xl bg-[linear-gradient(90deg,rgba(255,61,0,1),rgba(255,214,0,0.95))] px-7 text-base font-bold text-white shadow-[0_0_26px_rgba(255,61,0,0.25)] hover:opacity-95 active:scale-[0.99] transition"
                >
                  <Link href="/app">Open the app</Link>
                </Button>

                <Button asChild variant="outline" className="h-12 rounded-xl border-white/20 bg-white/5 px-6 text-base text-white/85 hover:bg-white/10">
                  <Link href="/app">Browse the app</Link>
                </Button>
              </div>

              <ul className="mt-8 grid gap-2 text-sm text-white/80">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <span className="inline-block size-2 rounded-full bg-yellow-300 shadow-[0_0_14px_rgba(255,214,0,0.65)]" />
                  </span>
                  Photo-proof verification (evidence, not vibes).
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <span className="inline-block size-2 rounded-full bg-red-500 shadow-[0_0_14px_rgba(255,61,0,0.65)]" />
                  </span>
                  Card-first browsing: hot wins near you.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <span className="inline-block size-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.6)]" />
                  </span>
                  Win Raids: community pricing that keeps improving.
                </li>
              </ul>
            </div>

            {/* Hero imagery */}
            <div className="relative">
              <div className="absolute -inset-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,61,0,0.30),transparent_55%),radial-gradient(circle_at_75%_35%,rgba(255,214,0,0.22),transparent_50%)] blur-2xl" />

                <div className="relative rounded-3xl border border-white/10 bg-black/35 p-3 shadow-[0_0_45px_rgba(255,61,0,0.12)] backdrop-blur">
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-white/70">App preview</div>
                        <div className="mt-1 text-[10px] text-white/55">Near-you deals with photo proof</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block size-2 rounded-full bg-red-500" />
                        <span className="inline-block size-2 rounded-full bg-yellow-300" />
                        <span className="inline-block size-2 rounded-full bg-cyan-300" />
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      <div className="relative aspect-9/16">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,61,0,0.22),transparent_44%),radial-gradient(circle_at_80%_35%,rgba(255,214,0,0.18),transparent_52%)]" />
                        <img
                          src="/api/landing-hero-mock"
                          alt="WPrice app preview"
                          className="absolute inset-0 h-full w-full object-cover opacity-95"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.0)_70%)]" />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/55">Hot wins</div>
                        <div className="mt-1 text-lg font-black text-white">$—</div>
                        <div className="mt-1 text-[10px] text-white/60">Verified</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/55">Near you</div>
                        <div className="mt-1 text-lg font-black text-white">Tap</div>
                        <div className="mt-1 text-[10px] text-white/60">Browse cards</div>
                      </div>
                    </div>
                  </div>
                </div>

              {/* Trust strip */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="text-[10px] font-semibold text-white/55">Built for speed + proof</div>
                <div className="flex items-center gap-3">
                  {[
                    { src: "/vercel.svg", label: "Vercel" },
                    { src: "/next.svg", label: "Next.js" },
                    { src: "/globe.svg", label: "Near-you" },
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
          <section id="features" aria-label="Features" className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-white/70">Features</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-white">
                  Verified pricing you can act on
                </div>
              </div>
              <div className="text-sm text-white/60 sm:max-w-[380px]">
                Photo-proof verification, card-first browsing, and community Win Raids—built for quick decisions.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
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
                  desc: "Start where people buy most. Expand categories without breaking the UX.",
                  icon: "/window.svg",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/7"
                >
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
            </div>
          </section>

          {/* How it works */}
          <section id="how" className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-white/70">How it works</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-white">
                  Get from “what’s the price?” to “I saved.”
                </div>
              </div>
              <div className="text-sm text-white/60 sm:max-w-[340px]">Instant on desktop. Deep feed on mobile.</div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                { n: "01", t: "Open the app", d: "Tap the CTA on desktop to get the native-feel UI." },
                { n: "02", t: "See nearby wins", d: "Browse Hot Wins and store cards—price first, verified." },
                { n: "03", t: "Raid + save", d: "Snap receipts, earn points, and push better prices to the map." },
              ].map((s) => (
                <div key={s.n} className="rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:-translate-y-0.5 hover:bg-black/35">
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-black text-white/75">{s.n}</div>
                    <div className="h-1.5 w-12 rounded-full bg-[linear-gradient(90deg,rgba(255,61,0,1),rgba(255,214,0,0.95))] shadow-[0_0_18px_rgba(255,61,0,0.25)]" />
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">{s.t}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/70 md:text-base">{s.d}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Testimonials */}
          <section id="testimonials" className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-white/70">Testimonials</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-white">
                  People save with verified local pricing
                </div>
              </div>
              <div className="text-sm text-white/60 sm:max-w-[340px]">Real receipts. Real wins. No guessing.</div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                {
                  name: "Jules R.",
                  role: "Weekend raider",
                  quote:
                    "WPrice feels like Uber for deals. I open it, see what’s closest + verified, and I’m out the door.",
                },
                {
                  name: "Marco T.",
                  role: "Budget shopper",
                  quote:
                    "The photo proof is the difference. I stopped second-guessing prices and started trusting the numbers.",
                },
                {
                  name: "Sam K.",
                  role: "Community contributor",
                  quote:
                    "Win Raids are fun, and the map actually reflects what people are reporting. It updates like it should.",
                },
              ].map((t) => (
                <div
                  key={t.name}
                  className="rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:-translate-y-0.5 hover:bg-black/35"
                >
                  <div className="text-2xl font-black leading-none text-yellow-200/90">“</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/75 md:text-base">{t.quote}</div>
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-white/60">{t.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Trust */}
          <section id="trust" className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-white/70">Trust</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-white">Built for speed, privacy, and photo proof</div>
              </div>
              <div className="text-sm text-white/60 sm:max-w-[340px]">A clean verified-pricing pipeline—optimized for reads and built to scale.</div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: "Photo-proof verification", desc: "Receipts are captured with evidence, not vibes." },
                { title: "Fast nearby reads", desc: "Cached snapshots so your screen loads instantly." },
                { title: "Private location access", desc: "We only use your location to compute nearby buckets." },
                { title: "Modern infrastructure", desc: "Supabase + Vercel for realtime and scalable ingestion." },
              ].map((x) => (
                <div
                  key={x.title}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:bg-black/30"
                >
                  <div className="text-base font-semibold text-white">{x.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-white/70">{x.desc}</div>
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
                  Open WPrice on mobile for the full feed.
                </div>
                <div className="mt-2 text-sm text-white/65">Verified pricing + Win Raids, built for quick decisions.</div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="h-12 rounded-xl bg-[linear-gradient(90deg,rgba(255,61,0,1),rgba(255,214,0,0.95))] px-7 text-base font-bold text-white shadow-[0_0_26px_rgba(255,61,0,0.25)] hover:opacity-95 active:scale-[0.99] transition"
                >
                  <Link href="/app">Open the app</Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-xl border-white/20 bg-white/5 px-6 text-base text-white/85 hover:bg-white/10">
                  <Link href="/app">See deals</Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="pb-10 text-center text-xs text-white/55">
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>© {year} WPrice. Verified local price intel.</div>
              <div className="flex items-center justify-center gap-4">
                <Link href="/app" className="hover:text-white/80">
                  Open the app
                </Link>
                <Link href="/app" className="hover:text-white/80">
                  Near you
                </Link>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-white/45">Built with Supabase + Vercel. Verified pricing powered by proof.</div>
          </footer>
        </div>
      </main>
    </WPriceLandingShell>
  )
}
