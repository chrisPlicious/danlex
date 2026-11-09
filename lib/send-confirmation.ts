import "server-only";
import nodemailer from "nodemailer";
import { confirmationEmail } from "@/lib/confirmation-email";
import { eventDate } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import { displayName, type Registration } from "@/lib/types";

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
      to: entry.player1_email,
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
