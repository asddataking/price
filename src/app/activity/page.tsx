"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function ActivityPage() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Card className="border bg-card/60 p-4 shadow-sm backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Recent wins and rewards will appear here.
          </div>
          <Button type="button" className="w-full" onClick={() => router.push("/")}>
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

