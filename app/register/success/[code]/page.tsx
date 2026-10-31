import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonClass, Skeleton } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/types";

export const metadata: Metadata = { title: "You're in", robots: { index: false } };

export default function SuccessPage({ params }: PageProps<"/register/success/[code]">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Confirmation params={params} />
      </Suspense>
    </div>
  );
}

async function Confirmation({ params }: { params: PageProps<"/register/success/[code]">["params"] }) {
  await connection();
  const { code } = await params;
  if (!/^DLX-[0-9A-F]{8}$/.test(code)) notFound();

  // Only non-contact fields are read back; the code itself is the unguessable key.
  const { data } = await createServiceClient()
    .from("registrations")
    .select("confirmation_code, status, player1_name, player2_name, team_name, divisions(name, kind)")
    .eq("confirmation_code", code)
    .maybeSingle<{
      confirmation_code: string;
      status: string;
      player1_name: string;
      player2_name: string | null;
      team_name: string | null;
      divisions: { name: string; kind: string };
    }>();
  if (!data) notFound();

  const confirmed = data.status === "confirmed";

  return (
    <div className="overflow-hidden rounded-3xl border border-court/40 bg-navy-900/80 text-center">
      <div className="halftone bg-court/15 px-6 py-10">
        <p className="display text-6xl text-flame">{confirmed ? "You're in!" : "Entry update"}</p>
        <p className="mt-3 text-ink">
          {confirmed
            ? "Your slot is confirmed. See you on court."
            : "This entry was not accepted. Please contact the organisers."}
        </p>
      </div>
      <div className="space-y-4 px-6 py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink">Confirmation code</p>
          <p className="display mt-1 text-4xl tracking-wider text-ball">{data.confirmation_code}</p>
          <p className="mt-1 text-xs text-ink">Screenshot this page and show it at check-in.</p>
        </div>
        <dl className="mx-auto max-w-sm space-y-2 border-t border-white/10 pt-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink">Division</dt>
            <dd className="font-bold">{data.divisions.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink">{data.divisions.kind === "doubles" ? "Team" : "Player"}</dt>
            <dd className="text-right font-bold">{displayName(data)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/bracket" className={buttonClass("secondary")}>
            View bracket
          </Link>
          <Link href="/" className={buttonClass("ghost")}>
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
