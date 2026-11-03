# Danlex Pickle Court — Tournament site

Registration (Singles / Doubles), QR payment with proof upload, live slot counters, and randomized
double-elimination brackets (winners + losers bracket, grand final with reset). Next.js 16 + Supabase.

## Pages

| Route | What |
|---|---|
| `/` | Landing, live slot counters per division |
| `/register` → `/register/[divisionId]` | Pick division → details → pay via QR → upload proof → slot confirmed |
| `/register/success/[code]` | Confirmation code |
| `/bracket` | Public live bracket per division |
| `/admin` | Dashboard (organisers only) |
| `/admin/registrations` | Review proofs, reject/restore (frees/takes slot), edit, walk-ins, delete, CSV export |
| `/admin/brackets/[divisionId]` | Draw (random), re-shuffle, swap, publish, score, walkover, undo, courts, live flag |
| `/admin/settings` | Tournament info, payment QR upload, divisions (slot cap, fee, match format, GF reset) |

## Setup

1. **Supabase project** — via Vercel Marketplace (`vercel integration add supabase`) or supabase.com.
2. **Env** — copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key and service-role key
   (`vercel env pull .env.local` does this when using the Vercel integration).
3. **Database** — apply `supabase/migrations/*.sql` then `supabase/seed.sql`
   (`npx supabase db push` on a linked project, or paste into the SQL editor).
4. **Admin account** — set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local`, then `npm run admin:create`.
5. **Logo** — save the logo as `public/brand/danlex-logo.png` (a text wordmark is shown until then).
6. `npm run dev`

Change the slot cap any time in **Admin → Tournament & divisions** (default 6 per division).

## Test data

- `npm run testdata:seed` fills every open division to its slot cap with test entrants (`@example.com` emails).
- `npm run testdata:clear` removes them, plus any bracket that uses them, and reopens registration.
- `npm run test:integration` runs the database tests against the project in `.env.local` and cleans up after itself.

## How slots stay correct

`register_entry()` (Postgres, service role only) locks the division row, re-checks open/full, then inserts.
`divisions.confirmed_count` is maintained by a trigger and guarded by `CHECK (slot_cap >= confirmed_count)`,
so two people can never take the last slot, and an admin restore into a full division is refused.
Payment proofs go straight from the browser to a private bucket through a one-time signed upload URL.

## Bracket engine

`lib/bracket/` is a pure TypeScript double-elimination engine (tested with `npm test`):

- N entrants → bracket of the next power of two; byes go to the top seeds and auto-advance.
- Winners bracket: log2(P) rounds. Losers bracket: 2·(log2(P)−1) rounds, alternating
  "minor" rounds (LB survivors play each other) and "major" rounds (survivors meet players dropping from the WB,
  in reversed order on alternate rounds to avoid quick rematches).
- Grand final: WB champion vs LB champion; if the LB champion wins, a reset match decides it.
- Total matches played: 2N−2, or 2N−1 when the reset is needed.
- Draw: Fisher–Yates shuffle seeded from `crypto.getRandomValues`; the seed is stored with the bracket.
- Editing a result with the same winner keeps everything downstream; changing the winner or undoing clears
  only the results that depended on it (the admin sees which before confirming).
