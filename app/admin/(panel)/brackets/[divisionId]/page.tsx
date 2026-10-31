import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAdminBracket, getAdminTournament } from "@/lib/queries";
import { BracketAdmin } from "./bracket-admin";

export default async function AdminBracketPage({ params }: PageProps<"/admin/brackets/[divisionId]">) {
  await requireAdmin();
  const { divisionId } = await params;
  const data = await getAdminTournament();
  const division = data?.divisions.find((d) => d.id === divisionId);
  if (!data || !division) notFound();
  const bundle = await getAdminBracket(division.id);

  return (
    <div className="space-y-6">
      <Link href="/admin/brackets" className="text-sm font-semibold text-ink hover:text-chrome">
        ← All brackets
      </Link>
      <BracketAdmin division={division} bundle={bundle} />
    </div>
  );
}
