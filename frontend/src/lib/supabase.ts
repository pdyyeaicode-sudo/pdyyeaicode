import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export type AccessTokenProvider = () => Promise<string | null>;

/** Creates a request-scoped Supabase client authenticated with the active Clerk session. */
export function createSupabaseClient(accessToken: AccessTokenProvider): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new SupabaseConfigurationError(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to frontend/.env.local.",
    );
  }

  return createClient(url, publishableKey, { accessToken });
}
