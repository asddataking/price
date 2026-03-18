import { createBrowserClient, createServerClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment.")
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.")
}

export const createSupabaseBrowserClient = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey)

export const createSupabaseServerClient = () =>
  createServerClient(supabaseUrl, supabaseAnonKey, {
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
  })

