import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock-unicom-tic.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy_anon_key"
  );
}
