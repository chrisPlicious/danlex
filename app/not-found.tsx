import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { buttonClass } from "@/components/ui";

/** Unmatched URLs render outside every route group, so this brings the public header itself. */
export default function NotFound() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="display text-6xl text-accent">Out!</p>
        <p className="mt-3 text-ink">That page landed outside the lines.</p>
        <Link href="/" className={`${buttonClass()} mt-6`}>
          Back to court
        </Link>
      </div>
    </SiteShell>
  );
}
