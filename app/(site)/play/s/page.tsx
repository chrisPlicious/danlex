import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Alert, Button, Field, Input, Skeleton } from "@/components/ui";
import { SIGNUP_CODE } from "@/lib/open-play";

export const metadata: Metadata = { title: "Find your spot", robots: { index: false } };

export default function FindSignupPage({ searchParams }: PageProps<"/play/s">) {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <p className="text-sm font-bold text-accent">Open play</p>
      <h1 className="display mt-2 mb-6 text-4xl">Find your spot</h1>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Lookup searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Lookup({ searchParams }: { searchParams: PageProps<"/play/s">["searchParams"] }) {
  const { code } = await searchParams;
  const typed = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (SIGNUP_CODE.test(typed)) redirect(`/play/s/${typed}`);

  return (
    <form action="/play/s" className="space-y-4 rounded-md bg-panel p-5">
      <Field label="Your code" hint="It starts with DLS- and is in your email.">
        <Input name="code" defaultValue={typed} placeholder="DLS-1A2B3C4D" autoComplete="off" required />
      </Field>
      {typed && <Alert>That code doesn&apos;t look right. Check your email and try again.</Alert>}
      <Button type="submit">Find my spot</Button>
    </form>
  );
}
