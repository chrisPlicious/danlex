import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Stripes } from "@/components/club";
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
    <div className="overflow-hidden rounded-md bg-panel text-center">
      <Stripes className="h-6" />
      <div className="px-6 pt-8 pb-6">
        <p className="display text-6xl">{confirmed ? "You're in!" : "Entry update"}</p>
        <p className="mt-3 text-ink">
          {confirmed
            ? "Your entry is confirmed. See you on court."
            : "This entry was not accepted. Please contact the organisers."}
        </p>
      </div>
      <div className="mx-4 space-y-4 rounded-md bg-ticket p-5 text-pine-950 sm:mx-6">
        <div>
          <p className="text-sm font-bold">Confirmation code</p>
          <p className="score mt-1 text-4xl tracking-wider text-pine-900">{data.confirmation_code}</p>
          <p className="mt-2 text-xs">Screenshot this page and show it at check-in.</p>
        </div>
        <dl className="mx-auto max-w-sm space-y-2 border-t border-dashed border-pine-900/40 pt-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt>Division</dt>
            <dd className="font-bold">{data.divisions.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{data.divisions.kind === "doubles" ? "Team" : "Player"}</dt>
            <dd className="text-right font-bold">{displayName(data)}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap justify-center gap-3 p-6">
        <Link href="/bracket" className={buttonClass("secondary")}>
          View bracket
        </Link>
        <Link href="/" className={buttonClass("ghost")}>
          Home
        </Link>
      </div>
    </div>
  );
}
