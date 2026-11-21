import type { Metadata, Viewport } from "next";
import { Barlow, Kanit, Shrikhand } from "next/font/google";
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
  title: { default: "Danlex Pickle Court", template: "%s · Danlex Pickle Court" },
  description:
    "Book the Danlex pickleball court by the hour, join open play, register for tournaments and follow the live double-elimination bracket.",
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
      {/* browser extensions often stamp attributes on <body> before React loads; ignore those on this tag only */}
      {/* Each section brings its own header: the public site in app/(site), the organiser pages in app/admin. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
