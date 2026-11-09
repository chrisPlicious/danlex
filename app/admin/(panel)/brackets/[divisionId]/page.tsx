import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getAdminBracket, getAdminTournament } from "@/lib/queries";
import { BracketAdmin } from "./bracket-admin";

export default function AdminBracketPage({ params }: PageProps<"/admin/brackets/[divisionId]">) {
  return (
    <div className="space-y-6">
      <Link href="/admin/brackets" className="text-sm font-semibold text-ink hover:text-fg">
        ← All brackets
      </Link>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: PageProps<"/admin/brackets/[divisionId]">["params"] }) {
  await requireAdmin();
  const { divisionId } = await params;
  const data = await getAdminTournament();
  const division = data?.divisions.find((d) => d.id === divisionId);
  if (!data || !division) notFound();
  const bundle = await getAdminBracket(division.id);

  return <BracketAdmin division={division} bundle={bundle} />;
}
