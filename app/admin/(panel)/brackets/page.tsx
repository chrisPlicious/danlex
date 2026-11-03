import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonClass, Card, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getAdminTournament } from "@/lib/queries";
import type { BracketRow } from "@/lib/types";

export const metadata: Metadata = { title: "Brackets" };

export default function BracketsIndex() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BracketsContent />
    </Suspense>
  );
}

async function BracketsContent() {
  const { sb } = await requireAdmin();
  const data = await getAdminTournament();
  if (!data) return <p className="text-ink">Create a tournament first.</p>;
  const { data: brackets } = await sb
    .from("brackets")
    .select("*")
    .in("division_id", data.divisions.map((d) => d.id))
    .returns<BracketRow[]>();

  return (
    <div className="space-y-6">
      <h1 className="display text-4xl">Brackets</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {data.divisions.map((d) => {
          const b = brackets?.find((x) => x.division_id === d.id);
          return (
            <Card key={d.id} className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="display text-2xl">{d.name}</p>
                <Badge tone={!b ? "neutral" : b.status === "draft" ? "ball" : b.status === "completed" ? "court" : "electric"}>
                  {b ? b.status : "not drawn"}
                </Badge>
              </div>
              <p className="text-sm text-ink">{d.confirmed_count} confirmed entries</p>
              <Link href={`/admin/brackets/${d.id}`} className={buttonClass(b ? "secondary" : "primary", "sm")}>
                {b ? "Manage bracket" : "Draw bracket"}
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
