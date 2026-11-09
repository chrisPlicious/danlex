-- Starter tournament: Singles + Doubles, no limit on entries
with t as (
  insert into public.tournaments (slug, name, venue, currency, status, payment_instructions)
  values (
    'danlex-open',
    'Danlex Open',
    'Danlex Pickle Court',
    'PHP',
    'open',
    'Scan the QR with GCash, Maya or your banking app and pay the exact amount. Screenshot the successful payment — you will upload it in the next step.'
  )
  returning id
)
insert into public.divisions (tournament_id, kind, name, fee, sort_order)
select t.id, d.kind::public.division_kind, d.name, d.fee, d.sort_order
  from t,
       (values ('singles', 'Singles', 500, 0), ('doubles', 'Doubles', 800, 1)) as d (kind, name, fee, sort_order);
