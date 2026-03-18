"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function RaidsPage() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Card className="border bg-card/60 p-4 shadow-sm backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Raids</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Win Raids show up on the Home feed. Start one from “Win Raids Nearby”.
          </div>
          <Button type="button" className="w-full" onClick={() => router.push("/")}>
            Go to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

