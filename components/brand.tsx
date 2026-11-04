import Image from "next/image";
import logo from "@/public/brand/danlex-logo.webp";

/** Header lockup: the full logo is too detailed at icon size, so the ball stands in for it. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BallIcon className="size-8 text-ball drop-shadow-[0_0_8px_rgb(255_226_26/0.5)]" />
      <span className="display text-lg">
        <span className="text-flame">Danlex</span>{" "}
        <span className="hidden text-chrome min-[420px]:inline">Pickle Court</span>
      </span>
    </span>
  );
}

export function HeroLogo() {
  return (
    <Image
      src={logo}
      alt="Danlex Pickle Court — Dan and Alex"
      sizes="(min-width: 640px) 28rem, 22rem"
      preload
      placeholder="blur"
      className="mx-auto h-auto w-full max-w-[22rem] drop-shadow-[0_20px_60px_rgb(255_46_139/0.35)] sm:max-w-md"
    />
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
