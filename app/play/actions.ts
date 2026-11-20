"use server";

import { after } from "next/server";
import { z } from "zod";
import { normalizePhone, SIGNUP_CODE } from "@/lib/open-play";
import type { OpenPlayEmailKind } from "@/lib/open-play-email";
import { isPaymentRef, PAYMENT_REF_ERROR } from "@/lib/payment-ref";
import { sendOfferEmails, sendSignupEmail } from "@/lib/send-confirmation";
import { siteOrigin } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/server";
import type { SignupStatus } from "@/lib/types";

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

// raise exception codes from join_session / confirm_session_signup / cancel_session_signup
const RPC_ERRORS: Record<string, string> = {
  SESSION_NOT_FOUND: "This session isn't taking players any more.",
  SIGNUPS_CLOSED: "Sign-ups for this session are closed.",
  SESSION_STARTED: "This session has already started.",
  BAD_PHONE: "Enter a valid mobile number.",
  BAD_LEVEL: "Pick your level.",
  BAD_EMAIL: "Enter a valid email.",
  ALREADY_JOINED: "That mobile number is already signed up for this session. Check your email for your code.",
  SIGNUP_NOT_FOUND: "This spot can no longer be paid for. Please join again.",
  PROOF_REQUIRED: "Please upload your payment screenshot.",
  PHONE_MISMATCH: "That isn't the mobile number used for this sign-up.",
  NOT_ACTIVE: "This sign-up is already cancelled or has lapsed.",
};

const friendly = (message: string | undefined, fallback: string) => (message && RPC_ERRORS[message]) || fallback;

function fieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0])] ??= issue.message;
  return fields;
}

/** Emails after the response; the page already shows everything, so failures only get logged. */
async function emailLater(signupId: string, kind: OpenPlayEmailKind, code: string) {
  const origin = await siteOrigin();
  after(async () => {
    const sent = await sendSignupEmail(signupId, kind, origin);
    if (!sent.ok) console.error(`Open play ${kind} email for ${code} not sent: ${sent.error}`);
  });
}

/** A spot just freed up may have gone to the waitlist; tell them now rather than on the next cron tick. */
async function emailOffersLater() {
  const origin = await siteOrigin();
  after(async () => {
    const r = await sendOfferEmails(origin);
    if (r.error) console.error(`Open play offer emails failed: ${r.error}`);
  });
}

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+()\-\s]+$/, "Enter a valid mobile number")
  .refine((v) => normalizePhone(v).length >= 7, "Enter a valid mobile number");

const JoinInput = z.object({
  sessionId: z.uuid(),
  name: z.string().trim().min(2, "Enter your full name").max(80),
  phone,
  email: z.email("Enter a valid email").trim().max(120),
  level: z.number().int().min(1, "Pick your level").max(3),
  website: z.string().max(0).optional(), // honeypot
});

export type JoinInput = z.input<typeof JoinInput>;
export type JoinResult =
  | {
      ok: true;
      signupId: string;
      code: string;
      status: Extract<SignupStatus, "held" | "waitlisted">;
      holdToken: string;
      /** Time left on the hold, measured on the server so a wrong device clock can't change it. */
      msLeft: number;
      amount: number;
    }
  | (Fail & { fields?: Record<string, string> });

/** Take a spot (held 15 minutes while they pay) or a place on the waitlist when it's full. */
export async function joinSession(input: JoinInput): Promise<JoinResult> {
  const parsed = JoinInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  const v = parsed.data;

  const { data, error } = await createServiceClient()
    .rpc("join_session", {
      p_session_id: v.sessionId,
      p_name: v.name,
      p_phone: v.phone,
      p_email: v.email,
      p_level: v.level,
    })
    .single<{ id: string; code: string; status: SignupStatus; hold_token: string; hold_expires_at: string | null; amount: number | string }>();
  if (error || !data) return fail(friendly(error?.message, "Could not save your spot. Please try again."));
  if (data.status !== "held" && data.status !== "waitlisted") return fail(RPC_ERRORS.ALREADY_JOINED);

  if (data.status === "waitlisted") await emailLater(data.id, "waitlisted", data.code);
  return {
    ok: true,
    signupId: data.id,
    code: data.code,
    status: data.status,
    holdToken: data.hold_token,
    msLeft: data.hold_expires_at ? Math.max(0, Date.parse(data.hold_expires_at) - Date.now()) : 0,
    amount: Number(data.amount),
  };
}

const Ticket = z.object({ signupId: z.uuid(), holdToken: z.uuid() });

/** A one-time signed URL so the screenshot goes straight to storage. */
export async function startSignupProofUpload(
  signupId: string,
  holdToken: string,
): Promise<{ ok: true; path: string; token: string } | Fail> {
  if (!Ticket.safeParse({ signupId, holdToken }).success) return fail(RPC_ERRORS.SIGNUP_NOT_FOUND);

  const sb = createServiceClient();
  const { data: signup } = await sb
    .from("session_signups")
    .select("status, payment_proof_path")
    .eq("id", signupId)
    .eq("hold_token", holdToken)
    .maybeSingle<{ status: SignupStatus; payment_proof_path: string | null }>();
  if (!signup || !["held", "offered", "expired"].includes(signup.status) || signup.payment_proof_path) {
    return fail(RPC_ERRORS.SIGNUP_NOT_FOUND);
  }

  const { data, error } = await sb.storage
    .from("payment-proofs")
    .createSignedUploadUrl(`signups/${signupId}/${crypto.randomUUID()}.jpg`);
  if (error || !data) return fail("Could not prepare the upload. Please try again.");
  return { ok: true, path: data.path, token: data.token };
}

const PROOF_PATH = /^signups\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

const PayInput = Ticket.extend({
  paymentRef: z.string().refine(isPaymentRef, PAYMENT_REF_ERROR),
  proofPath: z.string().regex(PROOF_PATH, RPC_ERRORS.PROOF_REQUIRED),
});

export type PayInput = z.input<typeof PayInput>;
export type PayResult = { ok: true; code: string; status: SignupStatus } | (Fail & { fields?: Record<string, string> });

/**
 * Attach the uploaded proof. "confirmed" when the hold/offer was live or a spot is still free;
 * otherwise "expired" with the payment kept for a refund.
 */
export async function completeSignup(input: PayInput): Promise<PayResult> {
  const parsed = PayInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (!v.proofPath.startsWith(`signups/${v.signupId}/`)) return fail(RPC_ERRORS.PROOF_REQUIRED);

  const sb = createServiceClient();
  const proofs = sb.storage.from("payment-proofs");
  const fileName = v.proofPath.split("/")[2];
  const { data: found } = await proofs.list(`signups/${v.signupId}`, { search: fileName, limit: 1 });
  if (!found?.some((f) => f.name === fileName)) return fail(RPC_ERRORS.PROOF_REQUIRED);

  const { data: before } = await sb
    .from("session_signups")
    .select("payment_proof_path")
    .eq("id", v.signupId)
    .maybeSingle<{ payment_proof_path: string | null }>();

  const { data, error } = await sb
    .rpc("confirm_session_signup", {
      p_signup_id: v.signupId,
      p_hold_token: v.holdToken,
      p_payment_ref: v.paymentRef,
      p_payment_proof_path: v.proofPath,
    })
    .single<{ id: string; code: string; status: SignupStatus }>();

  if (error || !data) {
    await proofs.remove([v.proofPath]);
    return fail(friendly(error?.message, "Something went wrong. Your spot was not confirmed — please try again."));
  }
  // an earlier proof is already attached (a double submit); this upload isn't needed
  if (before?.payment_proof_path) {
    await proofs.remove([v.proofPath]);
    return { ok: true, code: data.code, status: data.status };
  }

  if (data.status === "confirmed") await emailLater(data.id, "confirmed", data.code);
  if (data.status === "expired") await emailLater(data.id, "late", data.code);
  return { ok: true, code: data.code, status: data.status };
}

/** "Start over": free an unpaid hold straight away instead of waiting 15 minutes. */
export async function releaseSignupHold(signupId: string, holdToken: string): Promise<void> {
  if (!Ticket.safeParse({ signupId, holdToken }).success) return;
  const { error } = await createServiceClient().rpc("release_session_hold", { p_signup_id: signupId, p_hold_token: holdToken });
  if (!error) await emailOffersLater();
}

const CodeAndPhone = z.object({
  code: z.string().trim().toUpperCase().regex(SIGNUP_CODE, "That code doesn't look right"),
  phone,
});

export type CancelResult = { ok: true; refund: boolean } | Fail;

/** Self-service cancel with the code + the mobile number used. Paid spots are flagged for refund. */
export async function cancelSignup(code: string, phoneNumber: string): Promise<CancelResult> {
  const parsed = CodeAndPhone.safeParse({ code, phone: phoneNumber });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your details.");

  const { data, error } = await createServiceClient()
    .rpc("cancel_session_signup", { p_code: parsed.data.code, p_phone: parsed.data.phone })
    .single<{ status: SignupStatus; refund_needed: boolean }>();
  if (error || !data) return fail(friendly(error?.message, "Could not cancel. Please try again."));
  await emailOffersLater();
  return { ok: true, refund: data.refund_needed };
}

export type OfferLookup = { ok: true; token: string } | Fail;

/** For a player who lost the offer email: their phone number unlocks the payment link. */
export async function findOffer(code: string, phoneNumber: string): Promise<OfferLookup> {
  const parsed = CodeAndPhone.safeParse({ code, phone: phoneNumber });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your details.");

  const { data } = await createServiceClient()
    .from("session_signups")
    .select("phone, status, hold_token, hold_expires_at")
    .eq("code", parsed.data.code)
    .maybeSingle<{ phone: string; status: SignupStatus; hold_token: string | null; hold_expires_at: string | null }>();
  if (!data || data.phone !== normalizePhone(parsed.data.phone)) return fail(RPC_ERRORS.PHONE_MISMATCH);
  if (data.status !== "offered" || !data.hold_token || !data.hold_expires_at || Date.parse(data.hold_expires_at) <= Date.now()) {
    return fail("There's no spot waiting for payment on this sign-up right now.");
  }
  return { ok: true, token: data.hold_token };
}
