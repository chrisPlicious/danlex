"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { adminClient } from "@/lib/auth";
import { sendConfirmation } from "@/lib/send-confirmation";

const fail = (error: string): ActionState => ({ ok: false, error });
const done = (message: string): ActionState => ({ ok: true, message });

function friendly(error: { message: string; code?: string }) {
  if (error.code === "23505") return "This email already has a confirmed entry in that division.";
  if (error.code === "23503") {
    return "This entrant is placed in a bracket. Delete or redraw the bracket first (or record a walkover).";
  }
  return error.message;
}

function revalidate() {
  revalidatePath("/", "layout");
}

const blankToNull = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

const Details = z.object({
  player1_name: z.string().trim().min(2).max(80),
  player1_phone: z.string().trim().min(5).max(20),
  player1_email: z.email().trim().toLowerCase(),
  player2_name: blankToNull,
  player2_phone: blankToNull,
  player2_email: blankToNull,
  team_name: blankToNull,
  payment_ref: blankToNull,
  admin_notes: blankToNull,
});

export async function setRegistrationStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const status = z.enum(["confirmed", "rejected", "withdrawn"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return fail("Invalid request");
  const sb = await adminClient();
  const { error } = await sb
    .from("registrations")
    .update({ status: status.data, reviewed_at: new Date().toISOString() })
    .eq("id", id.data);
  if (error) return fail(friendly(error));
  revalidate();
  return done(status.data === "confirmed" ? "Entry restored." : "Entry removed.");
}

export async function updateRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const parsed = Details.safeParse(Object.fromEntries(fd));
  if (!id.success) return fail("Invalid request");
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join(" · "));
  const sb = await adminClient();
  const { error } = await sb.from("registrations").update(parsed.data).eq("id", id.data);
  if (error) return fail(friendly(error));
  revalidate();
  return done("Saved.");
}

/** Walk-in / manual entry. Ignores the open/closed switch. */
export async function addRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  const divisionId = z.uuid().safeParse(fd.get("division_id"));
  const parsed = Details.safeParse(Object.fromEntries(fd));
  if (!divisionId.success) return fail("Pick a division");
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join(" · "));

  const sb = await adminClient();
  const { data: division } = await sb.from("divisions").select("kind").eq("id", divisionId.data).single();
  if (division?.kind === "doubles" && !parsed.data.player2_name) return fail("Doubles needs a partner name.");

  const code = `DLX-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const { error } = await sb.from("registrations").insert({
    ...parsed.data,
    division_id: divisionId.data,
    confirmation_code: code,
    source: "admin",
    reviewed_at: new Date().toISOString(),
  });
  if (error) return fail(friendly(error));
  revalidate();
  return done(`Added — code ${code}.`);
}

export async function resendConfirmation(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid request");
  await adminClient();
  const sent = await sendConfirmation(id.data);
  return sent.ok ? done("Confirmation email sent.") : fail(sent.error);
}

export async function deleteRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid request");
  const sb = await adminClient();
  const { data, error } = await sb
    .from("registrations")
    .delete()
    .eq("id", id.data)
    .select("payment_proof_path")
    .maybeSingle();
  if (error) return fail(friendly(error));
  if (data?.payment_proof_path) await sb.storage.from("payment-proofs").remove([data.payment_proof_path]);
  revalidate();
  return done("Deleted.");
}
