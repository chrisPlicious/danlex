import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

export const isAdminUser = (user: User | null) => user?.app_metadata?.role === "admin";

/** For pages: bounce anyone who is not a signed-in admin to the login screen. */
export async function requireAdmin() {
  const sb = await createSessionClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!isAdminUser(user)) redirect("/admin/login");
  return { sb, user: user! };
}

/** For server actions: same check, but throws instead of redirecting mid-mutation. */
export async function adminClient() {
  const sb = await createSessionClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!isAdminUser(user)) throw new Error("Not authorised");
  return sb;
}
