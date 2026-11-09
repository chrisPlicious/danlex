import type { ComponentProps, ReactNode } from "react";
import type { DivisionKind } from "@/lib/types";

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ticket";

const variants: Record<Variant, string> = {
  primary: "bg-ball text-pine-950 hover:brightness-110",
  secondary: "border border-fg/60 text-fg hover:bg-fg/10",
  ghost: "text-ink hover:bg-fg/5 hover:text-fg",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
  ticket: "bg-pine-900 text-cream hover:bg-pine-700",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" && "h-8 px-3 text-sm",
    size === "md" && "h-11 px-5 text-sm",
    size === "lg" && "h-13 px-7 text-base",
    variants[variant],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-md border border-fg/10 bg-panel/70 shadow-xl shadow-black/20", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "court" | "ball" | "danger" | "electric" | "magenta";
const tones: Record<Tone, string> = {
  neutral: "bg-fg/10 text-ink",
  court: "bg-court/15 text-court",
  ball: "bg-ball/15 text-accent",
  danger: "bg-danger/15 text-danger",
  electric: "bg-electric/20 text-electric-soft",
  magenta: "bg-magenta/15 text-magenta-soft",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-fg">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "block h-11 w-full rounded-lg border border-fg/15 bg-well px-3 text-fg placeholder:text-ink/60 focus:border-ball focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "appearance-auto", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-24 py-2", className)} {...props} />;
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "court" | "ball"; children: ReactNode }) {
  const styles = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    court: "border-court/40 bg-court/10 text-court",
    ball: "border-ball/40 bg-ball/10 text-accent",
  };
  return (
    <div role="alert" className={cn("rounded-lg border px-4 py-3 text-sm font-semibold", styles[tone])}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-fg/5", className)} />;
}

/** Flip-board tiles, one per character. Hidden from screen readers, so pair them with text. */
export function Tiles({ value }: { value: string }) {
  return (
    <span className="flex gap-1.5" aria-hidden>
      {[...value].map((char, i) => (
        <span
          key={i}
          className="score relative rounded bg-board px-2.5 py-2 text-3xl text-ball after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-black"
        >
          {char}
        </span>
      ))}
    </span>
  );
}

export function EntryCount({ count, kind }: { count: number; kind: DivisionKind }) {
  const noun = kind === "doubles" ? "team" : "player";
  return (
    <div>
      <Tiles value={String(count).padStart(2, "0")} />
      <p className="mt-2 text-sm font-semibold">
        <span className="sr-only">{count} </span>
        {count === 1 ? noun : `${noun}s`} registered
      </p>
    </div>
  );
}
