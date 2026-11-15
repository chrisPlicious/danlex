"use server";

import { after } from "next/server";
import { z } from "zod";
import { courtInstant } from "@/lib/court";
import { isPaymentRef, PAYMENT_REF_ERROR } from "@/lib/payment-ref";
import { sendBookingConfirmation } from "@/lib/send-confirmation";
import { createServiceClient } from "@/lib/supabase/server";
import type { BookingStatus } from "@/lib/types";

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

// raise exception codes from hold_booking / confirm_booking
const RPC_ERRORS: Record<string, string> = {
  BOOKINGS_CLOSED: "Court bookings are closed right now.",
  PLAY_TYPE_NOT_FOUND: "That play type is no longer offered. Please pick another.",
  RATE_NOT_SET: "That play type isn't priced yet. Please pick another one.",
  BAD_DURATION: "Pick a valid number of hours.",
  BAD_START: "Bookings start on the hour.",
  OUTSIDE_HOURS: "That time is outside court hours.",
  START_IN_PAST: "That time has already started. Please pick a later one.",
  TOO_FAR_AHEAD: "That date is too far ahead to book.",
  TOURNAMENT_DAY: "The court is closed for a tournament that day.",
  TOO_MANY_HOLDS: "You already have 2 bookings waiting for payment. Finish one or wait 15 minutes for it to lapse.",
  SLOT_TAKEN: "Someone just took that time. Please pick another.",
  BOOKING_NOT_FOUND: "This booking can no longer be completed. Please start again.",
  PROOF_REQUIRED: "Please upload your payment screenshot.",
};

const friendly = (message: string | undefined, fallback: string) =>
  (message && RPC_ERRORS[message]) || fallback;

// hold failures the customer fixes by picking another time
const RETIME = new Set(["BAD_DURATION", "BAD_START", "OUTSIDE_HOURS", "START_IN_PAST", "TOO_FAR_AHEAD", "TOURNAMENT_DAY", "SLOT_TAKEN"]);

const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid mobile number")
  .max(20)
  .regex(/^[0-9+()\-\s]+$/, "Enter a valid mobile number");

const HoldInput = z.object({
  playTypeId: z.uuid(),
  day: z.iso.date(),
  hour: z.number().int().min(0).max(23),
  hours: z.number().int().min(1).max(12),
  name: z.string().trim().min(2, "Enter your full name").max(80),
  phone,
  website: z.string().max(0).optional(), // honeypot — humans never see it
});

export type HoldInput = z.input<typeof HoldInput>;
export type HoldResult =
  | { ok: true; bookingId: string; holdToken: string; holdExpiresAt: string; amount: number }
  | (Fail & { fields?: Record<string, string>; retime?: boolean });

/** Step 1: hold the chosen hours for 15 minutes while the customer pays. */
export async function holdBooking(input: HoldInput): Promise<HoldResult> {
  const parsed = HoldInput.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fields };
  }
  const v = parsed.data;
  const sb = createServiceClient();

  // also enforced in hold_booking once 20261115000000_tournament_days_block_court is applied
  const { count } = await sb
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("event_date", v.day)
    .neq("status", "draft");
  if (count) return { ...fail(RPC_ERRORS.TOURNAMENT_DAY), retime: true };

  const { data, error } = await sb
    .rpc("hold_booking", {
      p_play_type_id: v.playTypeId,
      p_starts_at: courtInstant(v.day, v.hour).toISOString(),
      p_hours: v.hours,
      p_name: v.name,
      p_phone: v.phone,
    })
    .single<{ id: string; hold_token: string; hold_expires_at: string; amount: number | string }>();
  if (error || !data) {
    return {
      ...fail(friendly(error?.message, "Could not hold that time. Please try again.")),
      retime: !!error && RETIME.has(error.message),
    };
  }

  return {
    ok: true,
    bookingId: data.id,
    holdToken: data.hold_token,
    holdExpiresAt: data.hold_expires_at,
    amount: Number(data.amount),
  };
}

const Ticket = z.object({ bookingId: z.uuid(), holdToken: z.uuid() });

/** Step 2a: a one-time signed URL so the screenshot goes straight to storage. */
export async function startBookingProofUpload(
  bookingId: string,
  holdToken: string,
): Promise<{ ok: true; path: string; token: string } | Fail> {
  const parsed = Ticket.safeParse({ bookingId, holdToken });
  if (!parsed.success) return fail(RPC_ERRORS.BOOKING_NOT_FOUND);

  const sb = createServiceClient();
  const { data: booking } = await sb
    .from("bookings")
    .select("status, payment_proof_path")
    .eq("id", bookingId)
    .eq("hold_token", holdToken)
    .maybeSingle<{ status: BookingStatus; payment_proof_path: string | null }>();
  if (!booking || !["held", "expired"].includes(booking.status) || booking.payment_proof_path) {
    return fail(RPC_ERRORS.BOOKING_NOT_FOUND);
  }

  const path = `${bookingId}/${crypto.randomUUID()}.jpg`;
  const { data, error } = await sb.storage.from("payment-proofs").createSignedUploadUrl(path);
  if (error || !data) return fail("Could not prepare the upload. Please try again.");
  return { ok: true, path: data.path, token: data.token };
}

const PROOF_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

const ConfirmInput = Ticket.extend({
  email: z.union([z.email("Enter a valid email").max(120), z.literal("")]).optional(),
  paymentRef: z.string().refine(isPaymentRef, PAYMENT_REF_ERROR),
  proofPath: z.string().regex(PROOF_PATH, RPC_ERRORS.PROOF_REQUIRED),
});

export type ConfirmInput = z.input<typeof ConfirmInput>;
export type ConfirmResult = { ok: true; code: string; status: BookingStatus } | (Fail & { fields?: Record<string, string> });

/**
 * Step 2b: attach the uploaded proof. confirm_booking answers "confirmed", or "expired" when the
 * hold had lapsed and the time was taken or had started — the payment is kept for a refund/rebook.
 */
export async function completeBooking(input: ConfirmInput): Promise<ConfirmResult> {
  const parsed = ConfirmInput.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fields };
  }
  const v = parsed.data;
  if (!v.proofPath.startsWith(`${v.bookingId}/`)) return fail(RPC_ERRORS.PROOF_REQUIRED);

  const sb = createServiceClient();
  const proofs = sb.storage.from("payment-proofs");
  const fileName = v.proofPath.split("/")[1];
  const { data: found } = await proofs.list(v.bookingId, { search: fileName, limit: 1 });
  if (!found?.some((f) => f.name === fileName)) return fail(RPC_ERRORS.PROOF_REQUIRED);

  const { data, error } = await sb
    .rpc("confirm_booking", {
      p_booking_id: v.bookingId,
      p_hold_token: v.holdToken,
      p_email: v.email ?? "",
      p_payment_ref: v.paymentRef,
      p_payment_proof_path: v.proofPath,
    })
    .single<{ id: string; confirmation_code: string | null; status: BookingStatus }>();

  if (error || !data) {
    await proofs.remove([v.proofPath]);
    return fail(friendly(error?.message, "Something went wrong. Your booking was not completed — please try again."));
  }
  // an earlier proof is already attached (a retry after a lapsed hold); this upload isn't needed
  if (!data.confirmation_code) {
    await proofs.remove([v.proofPath]);
    return fail(RPC_ERRORS.BOOKING_NOT_FOUND);
  }

  // The booking is saved and the code is on the success page, so email failures only get logged.
  if (data.status === "confirmed" && v.email) {
    after(async () => {
      const sent = await sendBookingConfirmation(data.id);
      if (!sent.ok) console.error(`Booking email for ${data.confirmation_code} not sent: ${sent.error}`);
    });
  }
  return { ok: true, code: data.confirmation_code, status: data.status };
}
