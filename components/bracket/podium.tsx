import { Stripes } from "@/components/club";
import type { Podium as PodiumData } from "@/lib/bracket";

export function Podium({ podium, names }: { podium: PodiumData; names: Record<string, string> }) {
  if (!podium.first) return null;
  const place = (id: string | null) => (id ? (names[id] ?? "—") : "—");
  return (
    <div className="overflow-hidden rounded-md bg-ticket text-pine-950">
      <Stripes className="h-5" />
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end sm:gap-8 sm:p-6">
        <div className="min-w-0">
          <p className="text-sm font-bold">Champion</p>
          <p className="display mt-1 text-5xl break-words text-pine-900">{place(podium.first)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold">Runner-up</p>
          <p className="display mt-1 text-2xl break-words text-pine-900">{place(podium.second)}</p>
        </div>
        {podium.third && (
          <div className="min-w-0">
            <p className="text-sm font-bold">Third</p>
            <p className="display mt-1 text-2xl break-words text-pine-900">{place(podium.third)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
