"use client";

import { Button } from "@/components/ui";

/** Shared body for the error.tsx boundaries, which sit inside each section's layout so its header stays up. */
export function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="display text-5xl text-accent">Fault!</p>
      <p className="mt-3 text-ink">Something went wrong loading this page. Please try again.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
