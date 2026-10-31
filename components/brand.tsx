import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";

/** Drop the official logo at public/brand/danlex-logo.png; until then a type-only lockup is shown. */
const LOGO_SRC = "/brand/danlex-logo.png";
const hasLogo = existsSync(path.join(process.cwd(), "public", LOGO_SRC));

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      {hasLogo ? (
        <Image src={LOGO_SRC} alt="" width={36} height={36} className="size-9" priority />
      ) : (
        <BallIcon className="size-8 text-ball drop-shadow-[0_0_8px_rgb(255_226_26/0.5)]" />
      )}
      <span className="display text-lg">
        <span className="text-flame">Danlex</span> <span className="text-chrome">Pickle Court</span>
      </span>
    </span>
  );
}

export function HeroLogo() {
  if (hasLogo) {
    return (
      <Image
        src={LOGO_SRC}
        alt="Danlex Pickle Court"
        width={520}
        height={520}
        priority
        className="mx-auto w-full max-w-[22rem] drop-shadow-[0_20px_60px_rgb(255_46_139/0.35)] sm:max-w-md"
      />
    );
  }
  return (
    <div className="relative mx-auto grid aspect-square w-full max-w-[20rem] place-items-center rounded-full border-4 border-ball bg-gradient-to-br from-electric via-navy-800 to-magenta shadow-[0_0_80px_rgb(255_46_139/0.35)]">
      <div className="halftone absolute inset-0 rounded-full" />
      <div className="relative text-center">
        <BallIcon className="mx-auto mb-3 size-20 text-ball" />
        <p className="display text-5xl text-flame">Danlex</p>
        <p className="display mt-1 text-2xl text-chrome">Pickle Court</p>
      </div>
    </div>
  );
}

export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-3 4.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm-8.2 5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6ZM9 15.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"
      />
    </svg>
  );
}
