"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cn } from "@/components/ui";

export type ActionState = { ok: boolean; error?: string; message?: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Server-action form with inline result message and optional confirm prompt. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && (state.error || state.message) && (
        <p
          role="status"
          className={cn("mt-2 basis-full text-sm font-semibold", state.ok ? "text-court" : "text-danger")}
        >
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
