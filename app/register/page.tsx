import type { Metadata } from "next";
import { Suspense } from "react";
import { DivisionCards } from "@/components/division-cards";
import { Skeleton } from "@/components/ui";
import { getActiveTournament } from "@/lib/queries";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-electric-soft">Step 1 of 4</p>
      <h1 className="display mt-2 text-5xl">Choose your division</h1>
      <p className="mt-3 text-ink">Slots update live. Once a division is full, registration closes automatically.</p>
      <div className="mt-8">
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          }
        >
          <Picker />
        </Suspense>
      </div>
    </div>
  );
}

async function Picker() {
  const data = await getActiveTournament();
  if (!data) return <p className="text-ink">No tournament is open for registration right now.</p>;
  return <DivisionCards tournament={data.tournament} divisions={data.divisions} />;
}
