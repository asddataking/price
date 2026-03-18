"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { usePathname } from "next/navigation"

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reducedMotion = useReducedMotion()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={
          reducedMotion
            ? { opacity: 1, y: 0 }
            : {
                opacity: 0,
                y: 10,
              }
        }
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
        style={{ willChange: reducedMotion ? undefined : "transform, opacity" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

