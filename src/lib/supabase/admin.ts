import { createClient } from "@supabase/supabase-js";
import { AppError } from "../errors/app-error";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock-unicom-tic.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy_service_role_key";
  if (!serviceRoleKey || /dummy|your[_-]/.test(serviceRoleKey)) throw new AppError("STORAGE_NOT_CONFIGURED", "Admissions database credentials need administrator configuration.", 503, {}, false, "contact_admissions");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }) },
  });
}
