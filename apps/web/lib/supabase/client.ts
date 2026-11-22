import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

let cachedClient: SupabaseClient | undefined;

/** Browser-safe Supabase client. Uses the anon key only. */
export function getSupabaseClient(): SupabaseClient {
  if (!cachedClient) {
    const env = getPublicEnv();
    cachedClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return cachedClient;
}

