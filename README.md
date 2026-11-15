# Danlex Pickle Court

Court rentals by the hour (pick a play type, hold free hours, pay by QR, upload proof) and tournaments:
Singles / Doubles registration with no limit on entries, QR payment with proof upload, live entry counts, and
randomized double-elimination brackets sized from whoever registers (winners + losers bracket, grand final with
reset). Next.js 16 + Supabase.

## Pages

| Route | What |
|---|---|
| `/` | Landing: court rental (play types and rates) and tournament (divisions, format) sections |
| `/book` (`?type=<slug>`) | Play type → day and hours (live availability) → details → 15-minute hold → pay via QR → last 6 digits of reference → upload proof → booked |
| `/book/success/[code]` | Booking code (`DLB-…`) |
| `/register` → `/register/[divisionId]` | Pick division → details → pay via QR → enter last 6 digits of reference → upload proof → entry confirmed |
| `/register/success/[code]` | Confirmation code (`DLX-…`) |
| `/bracket` | Public live bracket per division |
| `/admin` | Dashboard: today on court, refunds to handle, tournament divisions (organisers only) |
| `/admin/bookings` | Bookings by day or upcoming/past, proofs, confirm/cancel, edit, email code, walk-in/phone bookings, delete |
| `/admin/court` | Court hours and booking rules, court payment QR, play types and rates |
| `/admin/registrations` | Review proofs, reject/restore, edit, walk-ins, delete, CSV export |
| `/admin/brackets/[divisionId]` | Draw (random), re-shuffle, swap, publish, score, walkover, undo, courts, live flag |
| `/admin/settings` | Tournament info, payment QR upload, divisions (registration switch, fee, match format, GF reset) |

## Setup

1. **Supabase project** — via Vercel Marketplace (`vercel integration add supabase`) or supabase.com.
2. **Env** — copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key and service-role key
   (`vercel env pull .env.local` does this when using the Vercel integration).
3. **Database** — apply `supabase/migrations/*.sql` then `supabase/seed.sql`
   (`npx supabase db push` on a linked project, or paste into the SQL editor).
4. **Admin account** — set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local`, then `npm run admin:create`.
   There is one admin, and `/admin/login` only asks for the password, so `ADMIN_EMAIL` must also be set wherever
   the site runs. To change the password, update `ADMIN_PASSWORD` and run `npm run admin:create` again.
5. **Confirmation emails** — turn on 2-Step Verification for a Gmail account, create an
   [App Password](https://myaccount.google.com/apppasswords), and set `GMAIL_USER` / `GMAIL_APP_PASSWORD`.
   Entries save normally without them; emails just don't go out. Gmail allows about 500 a day.
   **Admin → Registrations → Resend email** sends one again and shows any error, so it doubles as a setup test.
6. `npm run dev`

The hero logo lives at `public/brand/danlex-logo.webp` (transparent background); replace that file to update it.

## Test data

- `npm run testdata:seed` adds 6 test entrants (`@example.com` emails) to every open division. Pass a count for more: `npm run testdata:seed -- 20`.
- `npm run testdata:clear` removes them, plus any bracket that uses them, and reopens registration.
- `npm run test:integration` runs the database tests against the project in `.env.local` and cleans up after itself.

## How court bookings stay correct

- One court: an exclusion constraint on `bookings` stops live holds and confirmed bookings from overlapping.
- `hold_booking()` (service role only) checks hours, opening times, lead time and tournament days, then holds
  the time for 15 minutes (at most 2 live holds per phone number).
- `confirm_booking()` attaches the proof and confirms. If the hold lapsed and someone else took the time (or it
  already started), the booking is kept as `expired` with a note and shows under **Refund / rebook** in admin.
- Tournament days (a non-draft tournament with an `event_date`) close the court to rentals.
- The public only sees busy intervals (`get_court_busy()`), never names or numbers.
- Customers who give an email get their booking code by email (same Gmail setup as registrations).

## How registration stays correct

Divisions have no entry limit. Registration runs until an organiser unticks it in **Admin → Tournament & divisions**,
or publishes the bracket.

`register_entry()` (Postgres, service role only) locks the division row, re-checks that it's open, then inserts.
`divisions.confirmed_count` is maintained by a trigger.
Publishing closes registration first, then refuses if confirmed entries no longer match the draw, so nobody who paid
after the draw gets left out. Re-shuffle to include them, then publish.
Payment proofs go straight from the browser to a private bucket through a one-time signed upload URL.

## Bracket engine

`lib/bracket/` is a pure TypeScript double-elimination engine (tested with `npm test`):

- N entrants → bracket of the next power of two; byes go to the top seeds and auto-advance.
- A draw can hold up to 256 entrants. Beyond that a bracket needs more than Supabase's default 1,000 rows per read.
- Winners bracket: log2(P) rounds. Losers bracket: 2·(log2(P)−1) rounds, alternating
  "minor" rounds (LB survivors play each other) and "major" rounds (survivors meet players dropping from the WB,
  in reversed order on alternate rounds to avoid quick rematches).
- Grand final: WB champion vs LB champion; if the LB champion wins, a reset match decides it.
- Total matches played: 2N−2, or 2N−1 when the reset is needed.
- Draw: Fisher–Yates shuffle seeded from `crypto.getRandomValues`; the seed is stored with the bracket.
- Editing a result with the same winner keeps everything downstream; changing the winner or undoing clears
  only the results that depended on it (the admin sees which before confirming).
