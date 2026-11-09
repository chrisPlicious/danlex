import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { getActiveTournament, publicAssetUrl, QR_PLACEHOLDER } from "@/lib/queries";
import { RegistrationWizard } from "./wizard";

export default function DivisionRegisterPage({ params }: PageProps<"/register/[divisionId]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <Link href="/register" className="text-sm font-semibold text-ink hover:text-fg">
        ← All divisions
      </Link>
      <h1 className="display mt-3 mb-8 text-5xl">Register</h1>
      <Suspense fallback={<Skeleton className="h-[28rem]" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: PageProps<"/register/[divisionId]">["params"] }) {
  const { divisionId } = await params;
  const data = await getActiveTournament();
  const division = data?.divisions.find((d) => d.id === divisionId);
  if (!data || !division) notFound();

  return (
    <RegistrationWizard
      tournament={data.tournament}
      division={division}
      qrUrl={publicAssetUrl(data.tournament.payment_qr_path) ?? QR_PLACEHOLDER}
    />
  );
}
