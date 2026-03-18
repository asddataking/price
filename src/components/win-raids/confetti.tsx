"use client"

import * as React from "react"

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function ConfettiBurst({ active }: { active: boolean }) {
  const pieces = React.useMemo(() => {
    return Array.from({ length: 90 }).map((_, i) => {
      const left = rand(0, 100)
      const hue = rand(0, 360)
      const delayMs = i * 12
      const size = rand(6, 10)
      return { i, left, hue, delayMs, size }
    })
  }, [])

  if (!active) return null

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={p.i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              ["--hue" as any]: p.hue,
              ["--delayMs" as any]: p.delayMs,
              ["--size" as any]: `${p.size}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

