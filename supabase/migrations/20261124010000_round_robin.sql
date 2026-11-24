-- Round robin: every entry in a division plays every other entry once. Its games are stored as
-- matches on side 'RR' with no winner/loser routing, so scoring, undo and realtime work as before.

alter type public.match_side add value if not exists 'RR';

alter table public.divisions
  add column format text not null default 'double_elimination'
  check (format in ('double_elimination', 'round_robin'));
