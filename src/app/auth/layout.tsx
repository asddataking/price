import * as React from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "WPrice — Account",
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm font-medium text-foreground/90 hover:text-foreground"
          >
            WPrice
          </Link>
          <Link
            href="/auth/signin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
        </div>

        <Card className="border bg-card/60 p-4 shadow-sm backdrop-blur sm:p-6">
          {children}
        </Card>
      </div>
    </main>
  )
}

