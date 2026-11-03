import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublicKey, supabaseServiceKey, supabaseUrl } from "@/lib/env";

/** Cookie-bound client: acts as the signed-in admin (RLS applies). */
export async function createSessionClient() {
  // supabase-js reads the clock while validating the session; keep that out of prerendering
  await connection();
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // called from a Server Component — the proxy refreshes the session instead
        }
      },
    },
  });
}

/** Anonymous client without cookies, for public reads (RLS applies). */
export function createPublicClient() {
  return createPlainClient(supabaseUrl(), supabasePublicKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client: bypasses RLS. Only for registration RPC, proof storage and lookups by code. */
export function createServiceClient() {
  return createPlainClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
