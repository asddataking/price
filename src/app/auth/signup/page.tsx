"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

export default function SignUpPage() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "/auth/callback"

  const errorFromQuery = searchParams.get("error_description")

  React.useEffect(() => {
    if (!errorFromQuery) return
    toast.error(decodeURIComponent(errorFromQuery))
  }, [errorFromQuery])

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-muted-foreground">
          We’ll send you a magic link to confirm your email.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Magic link</Badge>
          <span className="text-xs text-muted-foreground">
            No password required.
          </span>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!email.trim()) {
              toast.error("Enter your email.")
              return
            }

            setLoading(true)
            const { data, error } = await supabase.auth.signInWithOtp({
              email: email.trim(),
              options: {
                emailRedirectTo: redirectTo,
                shouldCreateUser: true,
              },
            })

            setLoading(false)

            if (error) {
              toast.error(error.message)
              return
            }

            if (!data?.user && !data?.session) {
              toast.success("Check your email for the confirm magic link.")
              router.push("/auth/signup")
              return
            }

            toast.success("Check your email to complete sign up.")
            router.push("/auth/signup")
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send confirm link"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/auth/signin"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  )
}

