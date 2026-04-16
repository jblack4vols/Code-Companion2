// src/lib/supabase.ts
// Supabase client singleton for crm.tristarpt.com.
// Server-side queries use the service role key (never exposed to the browser).
// Client-side queries use the anon key via the public environment variable.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// Public client — safe to use in browser and Server Components that don't
// need elevated privileges. Respects Row Level Security policies.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client — server-only. Bypasses RLS. Only import in server-side code.
// Never expose supabaseServiceKey to the client bundle.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})
