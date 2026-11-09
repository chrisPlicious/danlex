import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="display text-6xl text-accent">Out!</p>
      <p className="mt-3 text-ink">That page landed outside the lines.</p>
      <Link href="/" className={`${buttonClass()} mt-6`}>
        Back to court
      </Link>
    </div>
  );
}
