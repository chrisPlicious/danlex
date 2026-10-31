"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

const RPC_ERRORS: Record<string, string> = {
  DIVISION_FULL: "Sorry — all slots in this division were just taken.",
  REGISTRATION_CLOSED: "Registration for this division is closed.",
  DIVISION_NOT_FOUND: "This division no longer exists.",
  ALREADY_REGISTERED: "This email is already registered in this division.",
  PARTNER_REQUIRED: "Doubles needs your partner's name.",
  PROOF_REQUIRED: "Please upload your payment screenshot.",
};

const PROOF_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

async function divisionGate(divisionId: string): Promise<Fail | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("divisions")
    .select("slot_cap, confirmed_count, registration_open, tournaments!inner(status)")
    .eq("id", divisionId)
    .maybeSingle<{
      slot_cap: number;
      confirmed_count: number;
      registration_open: boolean;
      tournaments: { status: string };
    }>();
  if (error || !data) return fail(RPC_ERRORS.DIVISION_NOT_FOUND);
  if (data.tournaments.status !== "open" || !data.registration_open) return fail(RPC_ERRORS.REGISTRATION_CLOSED);
  if (data.confirmed_count >= data.slot_cap) return fail(RPC_ERRORS.DIVISION_FULL);
  return null;
}

/** Step 1 of submit: hand the browser a one-time signed URL so the image skips our function body limit. */
export async function startProofUpload(
  divisionId: string,
): Promise<{ ok: true; path: string; token: string } | Fail> {
  if (!z.uuid().safeParse(divisionId).success) return fail(RPC_ERRORS.DIVISION_NOT_FOUND);
  const gate = await divisionGate(divisionId);
  if (gate) return gate;

  const path = `${divisionId}/${crypto.randomUUID()}.jpg`;
  const { data, error } = await createServiceClient().storage.from("payment-proofs").createSignedUploadUrl(path);
  if (error || !data) return fail("Could not prepare the upload. Please try again.");
  return { ok: true, path: data.path, token: data.token };
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid mobile number")
  .max(20)
  .regex(/^[0-9+()\-\s]+$/, "Enter a valid mobile number");

const RegistrationInput = z.object({
  divisionId: z.uuid(),
  kind: z.enum(["singles", "doubles"]),
  player1Name: z.string().trim().min(2, "Enter your full name").max(80),
  player1Phone: phone,
  player1Email: z.email("Enter a valid email").max(120),
  player2Name: optional(80),
  player2Phone: optional(20),
  player2Email: optional(120),
  teamName: optional(60),
  paymentRef: optional(60),
  proofPath: z.string().regex(PROOF_PATH, "Please upload your payment screenshot."),
  website: z.string().max(0).optional(), // honeypot — humans never see it
});

export type RegistrationInput = z.input<typeof RegistrationInput>;
export type RegistrationResult = { ok: true; code: string } | (Fail & { fields?: Record<string, string> });

/** Step 2 of submit: verify the uploaded proof and atomically claim the slot. */
export async function completeRegistration(input: RegistrationInput): Promise<RegistrationResult> {
  const parsed = RegistrationInput.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fields };
  }
  const v = parsed.data;
  if (v.kind === "doubles" && !v.player2Name) {
    return { ok: false, error: RPC_ERRORS.PARTNER_REQUIRED, fields: { player2Name: "Enter your partner's name" } };
  }
  if (!v.proofPath.startsWith(`${v.divisionId}/`)) return fail(RPC_ERRORS.PROOF_REQUIRED);

  const sb = createServiceClient();
  const proofs = sb.storage.from("payment-proofs");
  const fileName = v.proofPath.split("/")[1];
  const { data: found } = await proofs.list(v.divisionId, { search: fileName, limit: 1 });
  if (!found?.some((f) => f.name === fileName)) return fail(RPC_ERRORS.PROOF_REQUIRED);

  const { data, error } = await sb
    .rpc("register_entry", {
      p_division_id: v.divisionId,
      p_player1_name: v.player1Name,
      p_player1_phone: v.player1Phone,
      p_player1_email: v.player1Email,
      p_player2_name: v.kind === "doubles" ? v.player2Name : null,
      p_player2_phone: v.kind === "doubles" ? v.player2Phone : null,
      p_player2_email: v.kind === "doubles" ? v.player2Email : null,
      p_team_name: v.kind === "doubles" ? v.teamName : null,
      p_payment_proof_path: v.proofPath,
      p_payment_ref: v.paymentRef,
    })
    .single<{ id: string; confirmation_code: string }>();

  if (error || !data) {
    await proofs.remove([v.proofPath]);
    const known = error && Object.keys(RPC_ERRORS).find((k) => error.message.includes(k));
    return fail(known ? RPC_ERRORS[known] : "Something went wrong. Your slot was not taken — please try again.");
  }
  return { ok: true, code: data.confirmation_code };
}
