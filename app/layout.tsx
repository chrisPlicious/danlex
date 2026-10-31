import type { Metadata, Viewport } from "next";
import { Barlow, Kanit } from "next/font/google";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import "./globals.css";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin"],
  weight: ["600", "800", "900"],
  style: ["normal", "italic"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Danlex Pickle Court — Tournament", template: "%s · Danlex Pickle Court" },
  description: "Register for Danlex Pickle Court tournaments and follow the live double-elimination bracket.",
};

export const viewport: Viewport = {
  themeColor: "#060a22",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${kanit.variable} ${barlow.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-navy-950/80 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            <Link href="/" className="shrink-0" aria-label="Danlex Pickle Court home">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-1 text-sm font-semibold">
              <Link href="/bracket" className="rounded-md px-3 py-2 text-ink transition hover:text-chrome">
                Bracket
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-ball px-3 py-2 font-bold text-navy-950 transition hover:brightness-110"
              >
                Register
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/5 py-8 text-center text-xs text-ink">
          <p>Danlex Pickle Court · Tournament registration &amp; brackets</p>
        </footer>
      </body>
    </html>
  );
}
