import { cn } from "@/components/ui";

export function Stripes({ className }: { className?: string }) {
  return <div aria-hidden className={cn("stripes", className)} />;
}

const BEND = [
  { y: -68, radius: 150, color: "var(--color-ball)" },
  { y: -42, radius: 176, color: "var(--color-flame)" },
  { y: -16, radius: 202, color: "var(--color-magenta)" },
];

/**
 * Stripes that run in from the left and bend up out of the top.
 * Drawn outward from a single point so they keep their size at any width: position it with
 * `absolute` where the bend starts, inside a parent chain that ends in `overflow-hidden`.
 */
export function StripeBend({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      width="1"
      height="1"
      fill="none"
      strokeWidth="22"
      className={cn("pointer-events-none overflow-visible", className)}
    >
      {BEND.map(({ y, radius, color }) => (
        <path key={color} stroke={color} d={`M-4000 ${y}H0a${radius} ${radius} 0 0 0 ${radius}-${radius}V-4000`} />
      ))}
    </svg>
  );
}

/** Cream ticket, topped with the division's colour. */
export function ticketClass(accent: "electric" | "magenta", className?: string) {
  return cn(
    "rounded-md border-t-[10px] bg-ticket p-4 text-pine-950 sm:p-5 [&_:focus-visible]:outline-pine-900",
    accent === "electric" ? "border-t-electric" : "border-t-magenta",
    className,
  );
}
