"use client";

import { useRouter } from "next/navigation";
import { useSessionVersion } from "@/components/use-session-version";

/** Re-renders the admin session page whenever anything about the session changes. */
export function LiveRefresh({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  useSessionVersion(sessionId, () => router.refresh(), 30_000);
  return null;
}
