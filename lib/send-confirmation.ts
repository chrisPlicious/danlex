import "server-only";
import nodemailer from "nodemailer";
import { bookingEmail } from "@/lib/booking-email";
import { confirmationEmail } from "@/lib/confirmation-email";
import { bookingWhen, eventDate, money } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import { displayName, type Booking, type Registration } from "@/lib/types";

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
