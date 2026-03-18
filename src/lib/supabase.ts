import { createBrowserClient, createServerClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

export const createSupabaseBrowserClient = () =>
  createBrowserClient(
    (() => {
      if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment.")
      return supabaseUrl
    })(),
    (() => {
      if (!supabaseAnonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.")
      return supabaseAnonKey
    })(),
  )

export const createSupabaseServerClient = () =>
  createServerClient(
    (() => {
      if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment.")
      return supabaseUrl
    })(),
    (() => {
      if (!supabaseAnonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.")
      return supabaseAnonKey
    })(),
    {
    cookies: {
      async get(name) {
        const { cookies } = await import("next/headers")
        const cookieStore = await cookies()
        return cookieStore.get(name)?.value
      },
      async set(name, value, options) {
        const { cookies } = await import("next/headers")
        const cookieStore = await cookies()
        cookieStore.set({ name, value, ...options })
      },
      async remove(name, options) {
        const { cookies } = await import("next/headers")
        const cookieStore = await cookies()
        cookieStore.set({ name, value: "", ...options })
      },
    },
    },
  )

