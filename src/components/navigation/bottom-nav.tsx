"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Map as MapIcon, Sparkles, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: <Home className="size-6" /> },
  { href: "/raids", label: "Raids", icon: <Sparkles className="size-6" /> },
  { href: "/map", label: "Map", icon: <MapIcon className="size-6" /> },
  { href: "/activity", label: "Activity", icon: <Clock className="size-6" /> },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-background/80 backdrop-blur border-t border-white/10">
      <div className="mx-auto flex max-w-xl items-center justify-between px-3 py-2">
        {navItems.map((item) => {
          const active = item.href === "/"
            ? pathname === "/"
            : pathname === item.href

          return (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              className={cn(
                "h-12 w-full flex flex-col items-center justify-center gap-1 rounded-xl px-2 transition-transform duration-150 active:scale-[0.98]",
                active &&
                  "bg-muted/60 ring-1 ring-magenta-400/40 shadow-[0_0_18px_rgba(217,70,239,0.35)]",
              )}
            >
              <Link href={item.href} aria-label={item.label}>
                {item.icon}
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-wide",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

