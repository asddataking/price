import type * as React from "react"

export default function WPriceLandingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07070b] text-white">
      {/* Premium gradient layer (app-store / modern SaaS). */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 22%)," +
            "radial-gradient(circle at 18% 10%, rgba(255,61,0,0.30), transparent 44%)," +
            "radial-gradient(circle at 78% 20%, rgba(255,214,0,0.22), transparent 52%)," +
            "radial-gradient(circle at 52% 92%, rgba(217,70,239,0.14), transparent 52%)",
        }}
      />

      {/* Subtle dot-grid (kept, but softened). */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.95) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "0 0",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0))",
          opacity: 0.12,
        }}
      />

      {/* Fine grain for depth (SVG noise, no external assets). */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='220'%20height='220'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='.9'%20numOctaves='3'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='220'%20height='220'%20filter='url(%23n)'%20opacity='.42'/%3E%3C/svg%3E\")",
          opacity: 0.16,
          mixBlendMode: "overlay",
        }}
      />

      <div className="relative">{children}</div>
    </div>
  )
}

