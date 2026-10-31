import type { Podium as PodiumData } from "@/lib/bracket";

export function Podium({ podium, names }: { podium: PodiumData; names: Record<string, string> }) {
  if (!podium.first) return null;
  const place = (id: string | null) => (id ? (names[id] ?? "—") : "—");
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ball/50 bg-navy-900 p-6">
      <div aria-hidden className="halftone bg-flame absolute inset-0 opacity-15" />
      <div className="relative grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-ball">Champion</p>
          <p className="display mt-1 text-5xl text-flame">{place(podium.first)}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-ink">Runner-up</p>
          <p className="display text-xl">{place(podium.second)}</p>
        </div>
        {podium.third && (
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-ink">Third</p>
            <p className="display text-xl">{place(podium.third)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
