import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/** Public header and footer around every visitor page. Admin pages use their own header instead. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-fg/10 bg-page/95 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 min-[360px]:px-4">
          <Link href="/" className="shrink-0" aria-label="Danlex Pickle Court home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-0.5 text-sm font-semibold sm:gap-1">
            <Link href="/play" className="rounded-md px-2 py-2 whitespace-nowrap text-ink transition hover:text-fg sm:px-3">
              Open play
            </Link>
            <Link
              href="/register"
              className="hidden rounded-md px-2 py-2 text-ink transition hover:text-fg min-[420px]:block sm:px-3"
            >
              Tournament
            </Link>
            <Link
              href="/bracket"
              className="hidden rounded-md px-2 py-2 text-ink transition hover:text-fg sm:px-3 md:block"
            >
              Bracket
            </Link>
            <Link
              href="/book"
              className="rounded-md bg-ball px-3 py-2 font-bold whitespace-nowrap text-pine-950 transition hover:brightness-110"
            >
              Book<span className="hidden sm:inline"> court</span>
            </Link>
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-fg/10 bg-foot py-8 text-center text-xs text-ink">
        <p>Danlex Pickle Court rentals, open play, tournaments and live brackets</p>
      </footer>
    </>
  );
}
