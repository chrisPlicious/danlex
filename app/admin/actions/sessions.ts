"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { adminClient } from "@/lib/auth";
import { courtDateTime } from "@/lib/open-play";
import { sendOfferEmails, sendSignupEmail } from "@/lib/send-confirmation";
import { siteOrigin } from "@/lib/site-url";

const fail = (error: string): ActionState => ({ ok: false, error });
const done = (message: string): ActionState => ({ ok: true, message });

function issues(e: z.ZodError) {
  return e.issues.map((i) => `${String(i.path[0] ?? "")}: ${i.message}`).join(" · ");
}

// raise exception codes from the admin_* session functions
const RPC_ERRORS: Record<string, string> = {
  NOT_ADMIN: "Not authorised.",
  BAD_TIME: "The session must end after it starts.",
  COURT_TAKEN: "The court is already booked for part of that time. Move or cancel that booking first.",
  SESSION_NOT_FOUND: "That session is gone or already cancelled.",
  SESSION_CANCELLED: "That session is cancelled.",
  TIME_LOCKED: "Players have already paid for this time. Cancel the session and post a new one instead.",
  CAPACITY_TOO_LOW: "More players than that already hold spots.",
  HAS_SIGNUPS: "Players have signed up, so it can't be deleted. Cancel it instead.",
  SIGNUP_NOT_FOUND: "That player is no longer on this session.",
  NOT_CONFIRMED: "Only confirmed players can check in.",
  ON_COURT: "They're on court. Finish or void the game first.",
  NOT_ACTIVE: "That spot isn't active.",
  NOT_PAID: "They never paid, so there's nothing to restore. Add them as a walk-in instead.",
  SESSION_FULL: "The session is full.",
  NOT_WAITLISTED: "They're not on the waitlist.",
  ALREADY_JOINED: "That mobile number already has a spot in this session.",
  BAD_TEAMS: "Pick four different players, two per team.",
  GAME_IN_PROGRESS: "A game is already on court. Finish it first.",
  PLAYER_NOT_READY: "All four must be confirmed, checked in and not resting.",
  GAME_NOT_FOUND: "That game is gone.",
  BAD_SCORE: "Enter both scores, or neither.",
};

function friendly(error: { message: string; code?: string }) {
  if (RPC_ERRORS[error.message]) return RPC_ERRORS[error.message];
  if (error.code === "23514" && error.message.includes("score")) return "Scores must be 0–99.";
  if (error.code === "23514" && error.message.includes("capacity")) return "Capacity must be 4–64.";
  if (error.code === "23514" && error.message.includes("fee")) return "The fee must be more than zero.";
  if (error.code === "23514" && error.message.includes("title")) return "The title must be 2–60 characters.";
  return error.message;
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

/** Spots freed by an admin change may have gone to the waitlist; email those offers now. */
async function emailOffersLater() {
  const origin = await siteOrigin();
  after(async () => {
    const r = await sendOfferEmails(origin);
    if (r.error) console.error(`Open play offer emails failed: ${r.error}`);
  });
}

const blankToNull = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const SessionInput = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    kind: z.enum(["open_play", "beginner"]),
    title: z.string().trim().min(2).max(60),
    day: z.iso.date(),
    start: z.string().regex(TIME, "use HH:MM"),
    end: z.string().regex(TIME, "use HH:MM"),
    capacity: z.coerce.number().int().min(4).max(64),
    fee: z.coerce.number().positive().max(1_000_000),
    level_note: blankToNull,
    notes: blankToNull,
    signups_open: z.literal("on").optional(),
  })
  .refine((v) => v.end > v.start, { message: "must be after the start", path: ["end"] });

/** Create or edit a session. A new session also books the court for its time. */
export async function saveSession(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = SessionInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const v = parsed.data;

  const sb = await adminClient();
  const { count: tournaments } = await sb
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("event_date", v.day)
    .neq("status", "draft");
  if (tournaments) return fail("That day is a tournament day — the court is closed.");

  const { data: id, error } = await sb.rpc("admin_save_session", {
    p_id: v.id ?? null,
    p_kind: v.kind,
    p_title: v.title,
    p_starts_at: courtDateTime(v.day, v.start).toISOString(),
    p_ends_at: courtDateTime(v.day, v.end).toISOString(),
    p_capacity: v.capacity,
    p_fee: v.fee,
    p_level_note: v.level_note ?? "",
    p_notes: v.notes ?? "",
    p_signups_open: v.signups_open === "on",
  });
  if (error) return fail(friendly(error));
  revalidateAll();
  if (!v.id) redirect(`/admin/sessions/${id as string}`);
  await emailOffersLater(); // more capacity offers spots to the waitlist
  return done("Session saved.");
}

const Id = z.object({ id: z.uuid() });

/** Cancels the session, frees the court, and emails every player who held a spot or waitlist place. */
export async function cancelSession(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid request");
  const sb = await adminClient();
  const { data, error } = await sb.rpc("admin_cancel_session", { p_id: parsed.data.id });
  if (error) return fail(friendly(error));

  const ids = ((data ?? []) as (string | { admin_cancel_session: string })[]).map((r) =>
    typeof r === "string" ? r : r.admin_cancel_session,
  );
  const origin = await siteOrigin();
  after(async () => {
    for (const id of ids) {
      const sent = await sendSignupEmail(id, "cancelled", origin);
      if (!sent.ok) console.error(`Open play cancellation email for ${id} not sent: ${sent.error}`);
    }
  });
  revalidateAll();
  return done(
    ids.length ? `Session cancelled. Emailing ${ids.length} player(s); paid ones are flagged for refund.` : "Session cancelled.",
  );
}

export async function deleteSession(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid request");
  const sb = await adminClient();
  const { error } = await sb.rpc("admin_delete_session", { p_id: parsed.data.id });
  if (error) return fail(friendly(error));
  revalidateAll();
  redirect("/admin/sessions");
}

// ---------------------------------------------------------------------------
// players
// ---------------------------------------------------------------------------

const SIGNUP_ACTIONS = ["check_in", "check_out", "pause", "resume", "cancel", "restore", "offer", "refunded"] as const;
const DONE_COPY: Record<(typeof SIGNUP_ACTIONS)[number], string> = {
  check_in: "Checked in.",
  check_out: "Checked out.",
  pause: "Resting — skipped in the rotation.",
  resume: "Back in the rotation.",
  cancel: "Spot cancelled.",
  restore: "Spot restored.",
  offer: "Spot offered. They have up to 60 minutes to pay.",
  refunded: "Marked as refunded.",
};

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const action = z.enum(SIGNUP_ACTIONS).safeParse(fd.get("action"));
  if (!id.success || !action.success) return fail("Invalid request");
  const sb = await adminClient();
  const { error } = await sb.rpc("admin_signup_action", { p_signup_id: id.data, p_action: action.data });
  if (error) return fail(friendly(error));
  if (action.data === "offer" || action.data === "cancel") await emailOffersLater();
  revalidateAll();
  return done(DONE_COPY[action.data]);
}

export async function resendSignupEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid request");
  await adminClient();
  const sent = await sendSignupEmail(id.data, "confirmed", await siteOrigin());
  return sent.ok ? done("Confirmation email sent.") : fail(sent.error);
}

const WalkIn = z.object({
  session_id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).regex(/^[0-9+()\-\s]*$/, "digits only"),
  level: z.coerce.number().int().min(1).max(3),
  amount: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().min(0).max(1_000_000).nullable()),
  override: z.literal("on").optional(),
});

/** Walk-in at the court: confirmed and checked in, no receipt. Over capacity only when ticked. */
export async function addWalkin(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = WalkIn.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(issues(parsed.error));
  const v = parsed.data;
  const sb = await adminClient();
  const { data: code, error } = await sb.rpc("admin_add_walkin", {
    p_session_id: v.session_id,
    p_name: v.name,
    p_phone: v.phone,
    p_level: v.level,
    p_amount: v.amount,
    p_override: v.override === "on",
  });
  if (error) {
    if (error.message === "SESSION_FULL") return fail("The session is full. Tick “over capacity” to add them anyway.");
    return fail(friendly(error));
  }
  revalidateAll();
  return done(`${v.name} added and checked in (${code as string}).`);
}

// ---------------------------------------------------------------------------
// game queue
// ---------------------------------------------------------------------------

const StartGame = z.object({
  session_id: z.uuid(),
  t1a: z.uuid("pick a player"),
  t1b: z.uuid("pick a player"),
  t2a: z.uuid("pick a player"),
  t2b: z.uuid("pick a player"),
});

export async function startGame(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = StartGame.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Pick four players.");
  const v = parsed.data;
  const sb = await adminClient();
  const { error } = await sb.rpc("admin_start_game", {
    p_session_id: v.session_id,
    p_team1: [v.t1a, v.t1b],
    p_team2: [v.t2a, v.t2b],
  });
  if (error) return fail(friendly(error));
  revalidateAll();
  return done("Game on.");
}

const score = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .pipe(z.number().int().min(0).max(99).nullable());

const FinishGame = z.object({ id: z.uuid(), score1: score, score2: score });

/** Finish a game (or fix the score of a finished one). Scores are optional but come in pairs. */
export async function finishGame(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = FinishGame.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Scores must be whole numbers 0–99.");
  const v = parsed.data;
  const sb = await adminClient();
  const { error } = await sb.rpc("admin_finish_game", { p_game_id: v.id, p_score1: v.score1, p_score2: v.score2 });
  if (error) return fail(friendly(error));
  revalidateAll();
  return done("Game saved.");
}

export async function voidGame(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("Invalid request");
  const sb = await adminClient();
  const { error } = await sb.rpc("admin_void_game", { p_game_id: parsed.data.id });
  if (error) return fail(friendly(error));
  revalidateAll();
  return done("Game voided — it won't count.");
}
