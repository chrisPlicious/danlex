import "server-only";
import nodemailer from "nodemailer";
import { bookingEmail } from "@/lib/booking-email";
import { confirmationEmail } from "@/lib/confirmation-email";
import { bookingWhen, dateTime, eventDate, money } from "@/lib/format";
import { openPlayEmail, type OpenPlayEmailKind } from "@/lib/open-play-email";
import { createServiceClient } from "@/lib/supabase/server";
import { displayName, type Booking, type Registration, type Session, type SessionSignup } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

type Entry = Pick<
  Registration,
  "status" | "confirmation_code" | "player1_email" | "player1_name" | "player2_name" | "team_name"
> & {
  divisions: {
    name: string;
    tournaments: { name: string; event_date: string | null; venue: string | null };
  };
};

/** Emails an entry its confirmation code through Gmail. Reports problems instead of throwing, so a failed email can't undo a registration. */
export async function sendConfirmation(registrationId: string): Promise<Result> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: "Email isn't set up. Add GMAIL_USER and GMAIL_APP_PASSWORD." };

  const { data: entry, error } = await createServiceClient()
    .from("registrations")
    .select(
      "status, confirmation_code, player1_email, player1_name, player2_name, team_name, divisions(name, tournaments(name, event_date, venue))",
    )
    .eq("id", registrationId)
    .maybeSingle<Entry>();
  if (error || !entry) return { ok: false, error: "That entry could not be found." };
  if (entry.status !== "confirmed") return { ok: false, error: "Only confirmed entries get a confirmation email." };

  const { tournaments: tournament, name: divisionName } = entry.divisions;
  const email = confirmationEmail({
    code: entry.confirmation_code,
    playerName: displayName(entry),
    divisionName,
    tournamentName: tournament.name,
    eventDate: eventDate(tournament.event_date),
    venue: tournament.venue,
  });

  return deliver(user, pass, entry.player1_email, email);
}

type BookingRow = Pick<Booking, "status" | "confirmation_code" | "email" | "name" | "starts_at" | "ends_at" | "amount"> & {
  play_types: { name: string };
};

/** Emails a court booking its code, when the customer gave an email. Same Gmail account and failure rules as above. */
export async function sendBookingConfirmation(bookingId: string): Promise<Result> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: "Email isn't set up. Add GMAIL_USER and GMAIL_APP_PASSWORD." };

  const sb = createServiceClient();
  const [{ data: booking, error }, { data: settings }] = await Promise.all([
    sb
      .from("bookings")
      .select("status, confirmation_code, email, name, starts_at, ends_at, amount, play_types(name)")
      .eq("id", bookingId)
      .maybeSingle<BookingRow>(),
    sb.from("court_settings").select("currency").maybeSingle<{ currency: string }>(),
  ]);
  if (error || !booking) return { ok: false, error: "That booking could not be found." };
  if (booking.status !== "confirmed" || !booking.confirmation_code) {
    return { ok: false, error: "Only confirmed bookings get a confirmation email." };
  }
  if (!booking.email) return { ok: false, error: "This booking has no email address." };

  const email = bookingEmail({
    code: booking.confirmation_code,
    name: booking.name,
    playType: booking.play_types.name,
    when: bookingWhen(booking.starts_at, booking.ends_at),
    amount: money(booking.amount, settings?.currency ?? "PHP"),
  });
  return deliver(user, pass, booking.email, email);
}

type SignupRow = Pick<SessionSignup, "code" | "status" | "name" | "email" | "amount" | "hold_token" | "hold_expires_at" | "refund_needed"> & {
  sessions: Pick<Session, "title" | "starts_at" | "ends_at" | "fee">;
};

// the email each kind needs the signup to be in, so a stale send can't contradict the page
const SIGNUP_STATUS_FOR: Record<OpenPlayEmailKind, SessionSignup["status"]> = {
  confirmed: "confirmed",
  waitlisted: "waitlisted",
  offered: "offered",
  late: "expired",
  cancelled: "cancelled",
};

/** Emails an open play player about their spot. `origin` is the site URL for the link. Same failure rules as above. */
export async function sendSignupEmail(signupId: string, kind: OpenPlayEmailKind, origin: string): Promise<Result> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: "Email isn't set up. Add GMAIL_USER and GMAIL_APP_PASSWORD." };

  const sb = createServiceClient();
  const [{ data: s, error }, { data: settings }] = await Promise.all([
    sb
      .from("session_signups")
      .select("code, status, name, email, amount, hold_token, hold_expires_at, refund_needed, sessions(title, starts_at, ends_at, fee)")
      .eq("id", signupId)
      .maybeSingle<SignupRow>(),
    sb.from("court_settings").select("currency").maybeSingle<{ currency: string }>(),
  ]);
  if (error || !s) return { ok: false, error: "That signup could not be found." };
  if (!s.email) return { ok: false, error: "This player has no email address." };
  if (s.status !== SIGNUP_STATUS_FOR[kind]) return { ok: false, error: `The spot is ${s.status} now, so that email no longer applies.` };

  const page = `${origin}/play/s/${s.code}`;
  const email = openPlayEmail({
    kind,
    name: s.name,
    code: s.code,
    session: s.sessions.title,
    when: bookingWhen(s.sessions.starts_at, s.sessions.ends_at),
    amount: money(kind === "confirmed" || kind === "late" ? s.amount : s.sessions.fee, settings?.currency ?? "PHP"),
    url: kind === "offered" && s.hold_token ? `${page}?t=${s.hold_token}` : page,
    payBy: s.hold_expires_at ? dateTime(s.hold_expires_at) : undefined,
    refund: s.refund_needed,
  });
  return deliver(user, pass, s.email, email);
}

/**
 * Emails every waitlist offer nobody has been told about yet. claim_offer_emails marks them first,
 * so overlapping calls (cron tick, admin action, a player cancelling) never send one twice.
 * A failed send is unmarked so the next call retries it while the offer is still open.
 */
export async function sendOfferEmails(origin: string): Promise<{ claimed: number; sent: number; error?: string }> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("claim_offer_emails");
  if (error) return { claimed: 0, sent: 0, error: error.message };

  const offers = (data ?? []) as { id: string; code: string }[];
  let sent = 0;
  for (const offer of offers) {
    const result = await sendSignupEmail(offer.id, "offered", origin);
    if (result.ok) {
      sent++;
      continue;
    }
    console.error(`Open play offer email for ${offer.code} not sent: ${result.error}`);
    // no point retrying every minute when email isn't set up at all
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      await sb.from("session_signups").update({ offer_notified_at: null }).eq("id", offer.id).eq("status", "offered");
    }
  }
  return { claimed: offers.length, sent };
}

async function deliver(
  user: string,
  pass: string,
  to: string,
  email: { subject: string; text: string; html: string },
): Promise<Result> {
  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      // Google displays app passwords in groups of four, so a pasted one often has spaces in it
      auth: { user, pass: pass.replace(/\s/g, "") },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: { name: "Danlex Pickle Court", address: user },
      to,
      ...email,
    });
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "EAUTH") {
      return { ok: false, error: "Gmail refused the login. Check GMAIL_USER and GMAIL_APP_PASSWORD." };
    }
    return { ok: false, error: `Gmail could not send it: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
