import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../actions/settings";
import { AdminHeader } from "../header";
import { AdminNav, NavLinks } from "./nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <AdminHeader
        nav={
          <Suspense fallback={<NavLinks />}>
            <AdminNav />
          </Suspense>
        }
        actions={
          <form action={signOut}>
            <button className="rounded-md px-2 py-2 whitespace-nowrap text-ink transition hover:text-fg sm:px-3">
              Sign out
            </button>
          </form>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Guard>{children}</Guard>
        </Suspense>
      </main>
    </>
  );
}

async function Guard({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
