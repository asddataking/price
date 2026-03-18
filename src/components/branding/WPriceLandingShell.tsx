import type * as React from "react"

export default function WPriceLandingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07070b] text-white">
      {/* Brand gradients (clean + app-store/storefront style). */}
      <div
        className="pointer-events-none absolute inset-0 opacity-95"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 10%, rgba(255,61,0,0.28), transparent 45%), radial-gradient(circle at 80% 22%, rgba(255,214,0,0.18), transparent 50%), radial-gradient(circle at 55% 92%, rgba(217,70,239,0.10), transparent 55%)",
        }}
        aria-hidden="true"
      />

      {/* Subtle dot-grid (no neon CRT grid). */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          backgroundPosition: "0 0",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0))",
        }}
        aria-hidden="true"
      />

      <div className="relative">{children}</div>
    </div>
  )
}

