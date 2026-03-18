"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

export default function ForgotPasswordPage() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()

  const [email, setEmail] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "/auth/callback"

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          We’ll email a reset link to your inbox.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Email link</Badge>
          <span className="text-xs text-muted-foreground">
            No spam. Unsubscribe-friendly.
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
            const { error } = await supabase.auth.resetPasswordForEmail(
              email.trim(),
              { redirectTo },
            )
            setLoading(false)

            if (error) {
              toast.error(error.message)
              return
            }

            toast.success("Check your email for the reset link.")
            router.push("/auth/signin")
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
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <a
            href="/auth/signin"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  )
}

