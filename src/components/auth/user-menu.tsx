"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { LogOut } from "lucide-react"

type ProfilePoints = number

export function UserMenu() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()

  const [email, setEmail] = React.useState<string | null>(null)
  const [points, setPoints] = React.useState<ProfilePoints | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refreshProfilePoints = React.useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .maybeSingle()

      if (error) {
        // Not fatal for auth UX.
        return
      }

      if (data?.points == null) {
        setPoints(0)
        return
      }

      setPoints(data.points as number)
    },
    [supabase],
  )

  React.useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (cancelled) return

      if (!user) {
        setEmail(null)
        setPoints(null)
        setLoading(false)
        return
      }

      setEmail(user.email ?? null)
      await refreshProfilePoints(user.id)
      if (cancelled) return
      setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return
        const nextUser = session?.user ?? null
        if (!nextUser) {
          setEmail(null)
          setPoints(null)
          return
        }

        setEmail(nextUser.email ?? null)
        await refreshProfilePoints(nextUser.id)
      },
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [refreshProfilePoints, supabase])

  if (loading) {
    return (
      <div className="h-10 w-[116px] animate-pulse rounded-full bg-muted/60" />
    )
  }

  if (!email) {
    return (
      <Button asChild variant="secondary" className="rounded-full px-4">
        <Link href="/auth/signin">Sign in</Link>
      </Button>
    )
  }

  const initials = email
    .split("@")[0]
    .split(/[._-]/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("")

  return (
    <div className="flex items-center gap-2 rounded-full border bg-background/70 px-3 py-2 backdrop-blur">
      <Avatar className="size-8">
        <AvatarFallback>{initials || "U"}</AvatarFallback>
      </Avatar>
      <div className="hidden min-w-[0] flex-col sm:flex">
        <div className="truncate text-xs font-medium">{email}</div>
        <div className="text-xs text-muted-foreground">{points ?? 0} pts</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label="Sign out"
        onClick={async () => {
          const { error } = await supabase.auth.signOut()
          if (error) {
            toast.error(error.message)
            return
          }
          toast.success("Signed out")
          router.refresh()
        }}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}

