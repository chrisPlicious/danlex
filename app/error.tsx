"use client";

import { Button } from "@/components/ui";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
