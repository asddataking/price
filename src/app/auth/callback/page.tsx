"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { toast } from "sonner"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Card } from "@/components/ui/card"

export default function AuthCallbackPage() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()

  const [status, setStatus] = React.useState<"loading" | "done">("loading")
  const POST_LOGIN_PATH_KEY = "wprice:postLoginPath"

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const error = params.get("error_description")
        if (error && error.trim() !== "") {
          toast.error(decodeURIComponent(error))
          router.replace("/auth/signin")
          return
        }

        const code = params.get("code")

        if (code && code.trim() !== "") {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            toast.error(exchangeError.message)
            router.replace("/auth/signin")
            return
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          toast.error(sessionError.message)
          router.replace("/auth/signin")
          return
        }

        if (!session) {
          router.replace("/auth/signin")
          return
        }

        toast.success("You’re signed in.")

        const pending = (() => {
          try {
            return window.localStorage.getItem(POST_LOGIN_PATH_KEY)
          } catch {
            return null
          }
        })()

        if (pending) {
          try {
            window.localStorage.removeItem(POST_LOGIN_PATH_KEY)
          } catch {
            // ignore
          }
          router.replace(pending)
          return
        }

        router.replace("/")
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to complete sign-in.")
        router.replace("/auth/signin")
      } finally {
        if (!cancelled) setStatus("done")
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [router, supabase])

  return (
    <Card className="border bg-card/60 p-4 shadow-sm backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Signing you in…</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {status === "loading"
            ? "Finishing magic link authorization."
            : "If this page is stuck, try signing in again."}
        </p>
      </CardContent>
    </Card>
  )
}

