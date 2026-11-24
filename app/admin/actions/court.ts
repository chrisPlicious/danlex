"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { adminClient } from "@/lib/auth";
import { courtInstant } from "@/lib/court";
import { cleanMobile, MOBILE_11 } from "@/lib/payee";
import { sendBookingConfirmation } from "@/lib/send-confirmation";

export async function resendBookingConfirmation(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Invalid request" };
  await adminClient();
  const sent = await sendBookingConfirmation(id.data);
  return sent.ok ? { ok: true, message: "Booking email sent." } : { ok: false, error: sent.error };
}

const fail = (error: string): ActionState => ({ ok: false, error });
const done = (message: string): ActionState => ({ ok: true, message });

function issues(e: z.ZodError) {
  return e.issues.map((i) => `${String(i.path[0] ?? "")}: ${i.message}`).join(" · ");
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

const blankToNull = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

// ---------------------------------------------------------------------------
// court settings + payment QR
// ---------------------------------------------------------------------------

const SettingsInput = z
  .object({
    bookings_open: z.literal("on").optional(),
    open_hour: z.coerce.number().int().min(0).max(23),
    close_hour: z.coerce.number().int().min(1).max(24),
    max_hours: z.coerce.number().int().min(1).max(12),
    days_ahead: z.coerce.number().int().min(1).max(90),
    currency: z.string().trim().toUpperCase().length(3),
    payment_instructions: blankToNull,
    payment_name: z.string().trim().max(60).optional().transform((v) => v || null),
    payment_number: z
      .string()
      .optional()
      .transform((v) => cleanMobile(v ?? ""))
      .refine((v) => v === "" || MOBILE_11.test(v), "use an 11-digit mobile number, e.g. 09171234567")
      .transform((v) => v || null),
  })
  .refine((v) => v.close_hour > v.open_hour, { message: "closing time must be after opening time", path: ["close_hour"] });

export async function saveCourtSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = SettingsInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const { bookings_open, ...v } = parsed.data;

  const sb = await adminClient();
  const { error } = await sb
    .from("court_settings")
    .update({ ...v, bookings_open: bookings_open === "on" })
    .eq("id", true);
  if (error) return fail(error.message);
  revalidateAll();
  return done("Court settings saved.");
}

const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function uploadCourtQr(_: ActionState, fd: FormData): Promise<ActionState> {
  const file = fd.get("qr");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a QR image.");
  const ext = QR_TYPES[file.type];
  if (!ext) return fail("QR must be PNG, JPG or WebP.");
  if (file.size > 3 * 1024 * 1024) return fail("QR image must be under 3 MB.");

  const sb = await adminClient();
  const { data: s } = await sb.from("court_settings").select("payment_qr_path").eq("id", true).single();
  const path = `qr/court-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("public-assets").upload(path, file, { contentType: file.type });
  if (error) return fail(error.message);

  const { error: uErr } = await sb.from("court_settings").update({ payment_qr_path: path }).eq("id", true);
  if (uErr) return fail(uErr.message);
  if (s?.payment_qr_path) await sb.storage.from("public-assets").remove([s.payment_qr_path]);
  revalidateAll();
  return done("Court payment QR updated.");
}

export async function removeCourtQr(): Promise<ActionState> {
  const sb = await adminClient();
  const { data: s } = await sb.from("court_settings").select("payment_qr_path").eq("id", true).single();
  await sb.from("court_settings").update({ payment_qr_path: null }).eq("id", true);
  if (s?.payment_qr_path) await sb.storage.from("public-assets").remove([s.payment_qr_path]);
  revalidateAll();
  return done("QR removed — the placeholder is shown again.");
}

// ---------------------------------------------------------------------------
// play types (rental modes)
// ---------------------------------------------------------------------------

const PlayTypeInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/, "use 2–40 lowercase letters, numbers and dashes"),
  description: blankToNull,
  rate: z.coerce.number().min(0).max(1_000_000),
  sort_order: z.coerce.number().int().min(0).max(99).default(0),
  active: z.literal("on").optional(),
});

export async function savePlayType(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = PlayTypeInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const { id, active, ...v } = parsed.data;
  const row = { ...v, active: active === "on" };

  const sb = await adminClient();
  const { error } = id
    ? await sb.from("play_types").update(row).eq("id", id)
    : await sb.from("play_types").insert(row);
  if (error) return fail(error.code === "23505" ? "That slug is already used." : error.message);
  revalidateAll();
  return done(id ? "Play type saved." : "Play type added.");
}

export async function deletePlayType(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid play type");
  const sb = await adminClient();
  const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).eq("play_type_id", id.data);
  if (count) return fail(`This play type has ${count} booking(s). Switch it off instead so it stops showing.`);
  const { error } = await sb.from("play_types").delete().eq("id", id.data);
  if (error) return fail(error.message);
  revalidateAll();
  return done("Play type deleted.");
}

// ---------------------------------------------------------------------------
// bookings
// ---------------------------------------------------------------------------

function friendly(error: { message: string; code?: string }) {
  if (error.code === "23P01" || error.message.includes("bookings_no_overlap")) {
    return "That time overlaps another confirmed booking or live hold.";
  }
  if (error.code === "23514" && error.message.includes("bookings_check")) return "The booking must end after it starts.";
  return error.message;
}

export async function setBookingStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const status = z.enum(["confirmed", "cancelled"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return fail("Invalid request");

  const sb = await adminClient();
  const update: Record<string, unknown> = { status: status.data, hold_expires_at: null };
  if (status.data === "confirmed") {
    // a booking restored from cancelled/expired needs a code to show at the court
    const { data: b } = await sb.from("bookings").select("confirmation_code").eq("id", id.data).single();
    if (b && !b.confirmation_code) update.confirmation_code = newCode();
  }
  const { error } = await sb.from("bookings").update(update).eq("id", id.data);
  if (error) return fail(friendly(error));
  revalidateAll();
  return done(status.data === "confirmed" ? "Booking confirmed." : "Booking cancelled — the time is free again.");
}

const Details = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(5).max(20),
  email: z.union([z.email().trim().toLowerCase(), z.literal("")]).transform((v) => v || null),
  amount: z.coerce.number().min(0).max(1_000_000),
  payment_ref: blankToNull,
  admin_notes: blankToNull,
});

export async function updateBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const parsed = Details.safeParse(Object.fromEntries(fd));
  if (!id.success) return fail("Invalid request");
  if (!parsed.success) return fail(issues(parsed.error));
  const sb = await adminClient();
  const { error } = await sb.from("bookings").update(parsed.data).eq("id", id.data);
  if (error) return fail(friendly(error));
  revalidateAll();
  return done("Saved.");
}

export async function deleteBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid request");
  const sb = await adminClient();
  const { data, error } = await sb.from("bookings").delete().eq("id", id.data).select("payment_proof_path").single();
  if (error) return fail(error.message);
  if (data?.payment_proof_path) await sb.storage.from("payment-proofs").remove([data.payment_proof_path]);
  revalidateAll();
  return done("Booking deleted.");
}

const WalkIn = Details.extend({
  play_type_id: z.uuid(),
  day: z.iso.date(),
  hour: z.coerce.number().int().min(0).max(23),
  hours: z.coerce.number().int().min(1).max(12),
  amount: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().min(0).max(1_000_000).nullable()),
}).refine((v) => v.hour + v.hours <= 24, { message: "must end by midnight", path: ["hours"] });

const newCode = () => `DLB-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;

/** Walk-in / phone booking: confirmed straight away, no proof needed. Still can't overlap another booking. */
export async function addBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = WalkIn.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const { day, hour, hours, amount, ...v } = parsed.data;

  const sb = await adminClient();
  const [{ data: pt }, { count: tournaments }] = await Promise.all([
    sb.from("play_types").select("rate").eq("id", v.play_type_id).single(),
    sb.from("tournaments").select("id", { count: "exact", head: true }).eq("event_date", day).neq("status", "draft"),
  ]);
  if (!pt) return fail("Pick a play type.");
  if (tournaments) return fail("That day is a tournament day — the court is closed to rentals.");

  const { error } = await sb.from("bookings").insert({
    ...v,
    amount: amount ?? Number(pt.rate) * hours,
    status: "confirmed",
    source: "admin",
    confirmation_code: newCode(),
    starts_at: courtInstant(day, hour).toISOString(),
    ends_at: courtInstant(day, hour + hours).toISOString(),
  });
  if (error) return fail(friendly(error));
  revalidateAll();
  return done("Booking added.");
}
