import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../actions/settings";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <AdminNav />
        <form action={signOut}>
          <button className="text-sm font-semibold text-ink hover:text-chrome">Sign out</button>
        </form>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Guard>{children}</Guard>
      </Suspense>
    </div>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
