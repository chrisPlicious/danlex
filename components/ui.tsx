import type { ComponentProps, ReactNode } from "react";

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-flame text-navy-950 shadow-[0_6px_24px_-6px_rgb(255_107_26/0.6)] hover:brightness-110",
  secondary: "border border-white/15 bg-white/5 text-chrome hover:bg-white/10",
  ghost: "text-ink hover:bg-white/5 hover:text-chrome",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
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
      className={cn("rounded-2xl border border-white/10 bg-navy-900/70 shadow-xl shadow-black/20", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "court" | "ball" | "danger" | "electric" | "magenta";
const tones: Record<Tone, string> = {
  neutral: "bg-white/10 text-ink",
  court: "bg-court/15 text-court",
  ball: "bg-ball/15 text-ball",
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
      <span className="mb-1.5 block text-sm font-semibold text-chrome">{label}</span>
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
  "block h-11 w-full rounded-lg border border-white/15 bg-navy-950/60 px-3 text-chrome placeholder:text-ink/60 focus:border-ball focus:outline-none";

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
    ball: "border-ball/40 bg-ball/10 text-ball",
  };
  return (
    <div role="alert" className={cn("rounded-lg border px-4 py-3 text-sm font-semibold", styles[tone])}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/5", className)} />;
}

/** Pips for small caps, a bar for big ones. */
export function SlotMeter({ cap, taken, accent }: { cap: number; taken: number; accent: "electric" | "magenta" }) {
  const left = Math.max(0, cap - taken);
  const fill = accent === "electric" ? "bg-electric" : "bg-magenta";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="display text-3xl">
          {left === 0 ? <span className="text-danger">Full</span> : <span className="text-flame">{left}</span>}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink">
          {left === 0 ? `${cap} / ${cap} taken` : `of ${cap} slots left`}
        </span>
      </div>
      {cap <= 16 ? (
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: cap }, (_, i) => (
            <span key={i} className={cn("h-2.5 flex-1 rounded-full", i < taken ? fill : "bg-white/10")} />
          ))}
        </div>
      ) : (
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className={cn("h-full rounded-full", fill)} style={{ width: `${(taken / Math.max(cap, 1)) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
