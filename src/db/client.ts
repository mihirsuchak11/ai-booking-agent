import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Supabase not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
      );
    }

    supabaseInstance = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabaseInstance;
}

// Export a getter that initializes on first use
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  },
});
