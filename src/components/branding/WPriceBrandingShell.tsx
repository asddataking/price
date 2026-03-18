import type * as React from "react"

export default function WPriceBrandingShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="wprice-shell relative min-h-screen overflow-hidden bg-black">
      <div className="wprice-neon-bg" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  )
}

