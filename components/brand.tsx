import Image from "next/image";
import { cn } from "@/components/ui";
import logo from "@/public/brand/danlex-logo.webp";

/** Header lockup: the full logo is too detailed at icon size, so the ball stands in for it. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BallIcon className="size-8 text-ball" />
      <span className="display text-xl text-fg">
        Danlex <span className="hidden min-[420px]:inline">Pickle Court</span>
      </span>
    </span>
  );
}

export function HeroLogo({ className }: { className?: string }) {
  return (
    <Image
      src={logo}
      alt="Danlex Pickle Court — Dan and Alex"
      sizes="(min-width: 1024px) 26rem, 22rem"
      preload
      placeholder="blur"
      className={cn("h-auto drop-shadow-[0_12px_24px_var(--color-logo-shadow)]", className)}
    />
  );
}

/** Latitude in degrees, hole count, and longitude offset as a fraction of one step. Adds up to a 40-hole ball. */
const BALL_RINGS = [
  [18, 10, 0],
  [-18, 10, 0.5],
  [52, 8, 0.25],
  [-52, 8, 0.75],
  [80, 2, 0],
  [-80, 2, 0.5],
] as const;

const BALL_TILT_X = 0.5;
const BALL_TILT_Y = -0.45;
const HOLE_RADIUS = 5.4;

/** Tilts the rings, keeps the holes facing the viewer, and flattens each one by how far it has turned away. */
const BALL_HOLES = BALL_RINGS.flatMap(([latitude, count, offset]) => {
  const lat = (latitude * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) => {
    const lon = ((i + offset) / count) * 2 * Math.PI;
    const x = Math.cos(lat) * Math.sin(lon);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(lon);
    const y2 = y * Math.cos(BALL_TILT_X) - z * Math.sin(BALL_TILT_X);
    const z2 = y * Math.sin(BALL_TILT_X) + z * Math.cos(BALL_TILT_X);
    const x3 = x * Math.cos(BALL_TILT_Y) + z2 * Math.sin(BALL_TILT_Y);
    const z3 = -x * Math.sin(BALL_TILT_Y) + z2 * Math.cos(BALL_TILT_Y);
    return { x: x3, y: y2, facing: z3 };
  });
})
  .filter((hole) => hole.facing > 0.12)
  .map(({ x, y, facing }) => {
    const cx = (50 + x * 48).toFixed(2);
    const cy = (50 - y * 48).toFixed(2);
    const angle = ((Math.atan2(-y, x) * 180) / Math.PI).toFixed(1);
    return { cx, cy, rx: (HOLE_RADIUS * facing).toFixed(2), transform: `rotate(${angle} ${cx} ${cy})` };
  });

export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="48" fill="currentColor" />
      <g className="fill-pine-950">
        {BALL_HOLES.map((hole) => (
          <ellipse key={hole.transform} cx={hole.cx} cy={hole.cy} rx={hole.rx} ry={HOLE_RADIUS} transform={hole.transform} />
        ))}
      </g>
    </svg>
  );
}
