"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/sessions", label: "Open play" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/court", label: "Court & rates" },
  { href: "/admin/registrations", label: "Registrations" },
  { href: "/admin/brackets", label: "Brackets" },
  { href: "/admin/settings", label: "Tournament & divisions" },
];

/** Static links; also the Suspense fallback while the pathname is unknown. */
export function NavLinks({ path }: { path?: string }) {
  return (
    // one scrollable row so the sticky header stays short on phones
    <nav className="-mx-1 flex w-max gap-1" aria-label="Admin">
      {LINKS.map((l) => {
        const active = path !== undefined && (l.href === "/admin" ? path === "/admin" : path.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap transition",
              active ? "bg-ball text-pine-950" : "text-ink hover:bg-fg/5 hover:text-fg",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNav() {
  return <NavLinks path={usePathname()} />;
}
