import type { Metadata, Viewport } from "next";
import { Barlow, Kanit, Shrikhand } from "next/font/google";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const shrikhand = Shrikhand({
  variable: "--font-shrikhand",
  subsets: ["latin"],
  weight: "400",
});

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin"],
  weight: "800",
  style: "italic",
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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d3b2e" },
    { media: "(prefers-color-scheme: light)", color: "#fbf3de" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${shrikhand.variable} ${kanit.variable} ${barlow.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-fg/10 bg-page/95 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 min-[360px]:px-4">
            <Link href="/" className="shrink-0" aria-label="Danlex Pickle Court home">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-0.5 text-sm font-semibold sm:gap-1">
              <Link href="/bracket" className="rounded-md px-2 py-2 text-ink transition hover:text-fg sm:px-3">
                Bracket
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-ball px-3 py-2 font-bold text-pine-950 transition hover:brightness-110"
              >
                Register
              </Link>
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-fg/10 bg-foot py-8 text-center text-xs text-ink">
          <p>Danlex Pickle Court tournament registration and brackets</p>
        </footer>
      </body>
    </html>
  );
}
