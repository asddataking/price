"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { WinRaidCamera } from "@/components/win-raids/win-raid-camera"

const POST_LOGIN_PATH_KEY = "wprice:postLoginPath"

export default function RaidPage() {
  const router = useRouter()
  const params = useParams<{ storeId: string }>()
  const storeId = params?.storeId

  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  const [checkingAuth, setCheckingAuth] = React.useState(true)
  const [isAuthed, setIsAuthed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      setCheckingAuth(true)
      const { data, error } = await supabase.auth.getUser()
      if (cancelled) return

      if (error || !data?.user) {
        setIsAuthed(false)
        setCheckingAuth(false)
        return
      }

      setIsAuthed(true)
      setCheckingAuth(false)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const onSignIn = () => {
    if (typeof window !== "undefined" && storeId) {
      window.localStorage.setItem(POST_LOGIN_PATH_KEY, `/raid/${storeId}`)
    }
    router.push("/auth/signin")
  }

  if (!storeId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Missing raid store.</div>
      </div>
    )
  }

  if (checkingAuth || !isAuthed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <Card className="border bg-card/60 p-4 shadow-sm backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">You’re one step away</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Sign in to start this Win Raid and earn points.
            </div>
            <Button type="button" className="w-full" onClick={onSignIn}>
              Join the squad
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={() => router.push("/")}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <WinRaidCamera storeId={storeId} />
}

