import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { signIn } from "../actions/settings";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="display text-4xl">Admin</h1>
      <p className="mt-2 text-ink">Organisers only.</p>
      <ActionForm action={signIn} className="mt-8 space-y-4 rounded-md bg-panel p-6">
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
