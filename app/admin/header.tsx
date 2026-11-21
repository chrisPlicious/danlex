import Link from "next/link";
import { BallIcon } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Organiser header. It stays scoreboard-dark in both themes so the admin side never passes for the public site,
 * and it carries the admin tabs in place of the visitor links.
 */
export function AdminHeader({ nav, actions }: { nav?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="on-board sticky top-0 z-30 bg-board shadow-[0_1px_0_rgb(0_0_0/0.4)]">
      <div className="stripes h-1.5" aria-hidden />
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4">
        <Link href="/admin" className="flex shrink-0 items-center gap-2" aria-label="Admin dashboard">
          <BallIcon className="size-7 text-ball" />
          <span className="display hidden text-lg text-fg min-[380px]:inline">Danlex</span>
          <span className="rounded bg-ball px-1.5 py-0.5 text-[11px] font-bold tracking-widest text-pine-950 uppercase">
            Admin
          </span>
        </Link>
        <div className="flex items-center gap-0.5 text-sm font-semibold sm:gap-1">
          <Link href="/" className="rounded-md px-2 py-2 whitespace-nowrap text-ink transition hover:text-fg sm:px-3">
            View site
          </Link>
          {actions}
          <ThemeToggle />
        </div>
      </div>
      {nav && <div className="mx-auto max-w-7xl overflow-x-auto px-4 pb-2">{nav}</div>}
    </header>
  );
}
