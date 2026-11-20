-- Open play: scheduled sessions players join one by one (Reclub-style), with a waitlist and a
-- one-court game queue the admin runs on the day.
--
-- Restored on 2026-11-20: the original file was never committed. Function bodies, constraints,
-- indexes, policies and grants are copied from the live database (pg_get_functiondef /
-- pg_get_constraintdef / pg_indexes / pg_policies). Already applied in production, so db-apply
-- skips it there.
--
-- How it fits together:
--   * A session (sessions) owns one court booking (bookings.session_id), so rentals can't overlap it.
--   * Players join (join_session): a 15-minute hold while they pay, or the waitlist when full.
--   * They pay by QR and upload proof to payment-proofs/signups/<signup id>/… (confirm_session_signup).
--   * When a spot frees up more than 30 minutes before start, the oldest waitlisted player is offered
--     it for up to 60 minutes (refresh_session). pg_cron runs open_play_tick() every minute, which
--     also pings the app to email new offers (claim_offer_emails).
--   * On the day the admin checks players in and starts 2v2 games, one at a time (session_games).
--   * Every change bumps sessions.version; sessions is in the realtime publication so open pages refetch.
--
-- Offer emails need two Vault secrets (Dashboard → Project Settings → Vault):
--   open_play_tick_url    = https://<site>/api/open-play/tick
--   open_play_tick_secret = the same value as OPEN_PLAY_TICK_SECRET in the app's environment

create extension if not exists pg_cron;
create extension if not exists pg_net;

create type public.session_kind as enum ('open_play', 'beginner');
create type public.signup_status as enum ('held', 'confirmed', 'waitlisted', 'offered', 'cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  kind public.session_kind not null default 'open_play',
  title text not null check (length(title) >= 2 and length(title) <= 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity >= 4 and capacity <= 64),
  fee numeric(10, 2) not null check (fee > 0),
  level_note text,
  notes text,
  signups_open boolean not null default true,
  status text not null default 'scheduled' check (status = any (array['scheduled', 'cancelled'])),
  -- bumped on every change to the session, its signups or its games; pages refetch when it moves
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index sessions_starts_idx on public.sessions (starts_at);

create table public.session_signups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  code text not null unique,
  status public.signup_status not null,
  name text not null,
  phone text not null, -- normalize_phone(); '' for walk-ins who gave none
  email text,
  level smallint not null check (level >= 1 and level <= 3),
  hold_token uuid,
  hold_expires_at timestamptz,
  offer_notified_at timestamptz,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  payment_ref text,
  payment_proof_path text,
  source text not null default 'online' check (source = any (array['online', 'admin'])),
  checked_in_at timestamptz,
  queue_paused boolean not null default false,
  refund_needed boolean not null default false,
  refunded_at timestamptz,
  cancelled_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_signups_session_idx on public.session_signups (session_id, status, created_at);
create index session_signups_offers_idx on public.session_signups (status) where (offer_notified_at is null);
-- one live spot (or waitlist place) per phone number per session
create unique index session_signups_one_live_per_phone on public.session_signups (session_id, phone)
  where ((status = any (array['held'::public.signup_status, 'confirmed'::public.signup_status,
    'waitlisted'::public.signup_status, 'offered'::public.signup_status])) and (phone <> ''::text));

create table public.session_games (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  number integer not null,
  status text not null default 'playing' check (status = any (array['playing', 'done', 'void'])),
  team1 uuid[] not null check (cardinality(team1) = 2), -- session_signups ids
  team2 uuid[] not null check (cardinality(team2) = 2),
  score1 smallint check (score1 >= 0 and score1 <= 99),
  score2 smallint check (score2 >= 0 and score2 <= 99),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (session_id, number)
);

-- one court: one game on it at a time
create unique index session_games_one_playing on public.session_games (session_id) where (status = 'playing'::text);

create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();
create trigger session_signups_touch before update on public.session_signups
  for each row execute function public.touch_updated_at();

-- a session blocks the court through its own booking row (no play type, no customer)
alter table public.bookings alter column play_type_id drop not null;
alter table public.bookings add column session_id uuid references public.sessions (id) on delete cascade;
alter table public.bookings add constraint bookings_type_or_session check (num_nonnulls(play_type_id, session_id) = 1);
create unique index bookings_one_per_session on public.bookings (session_id) where (session_id is not null);

-- open play and beginner are sessions now, not hourly rental modes
update public.play_types set active = false where slug in ('beginner', 'open-play');

-- ---------------------------------------------------------------------------
-- row level security: sessions are public; signups and games only through the functions below
-- ---------------------------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.session_signups enable row level security;
alter table public.session_games enable row level security;

create policy "sessions public read" on public.sessions for select using (true);
create policy "session signups admin read" on public.session_signups for select to authenticated using (public.is_admin());
create policy "session games admin read" on public.session_games for select to authenticated using (public.is_admin());

alter publication supabase_realtime add table public.sessions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

-- digits only, +63 / 63 mobile prefix folded to 0
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select case when d ~ '^63[0-9]{10}$' then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function public.new_signup_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  v text;
begin
  loop
    v := 'DLS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.session_signups where code = v);
  end loop;
  return v;
end;
$$;

-- spots taken: confirmed players plus holds and offers that haven't run out
create or replace function public.session_live_count(p_session_id uuid, p_except uuid default null)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.session_signups
  where session_id = p_session_id
    and (p_except is null or id <> p_except)
    and (status = 'confirmed' or (status in ('held', 'offered') and hold_expires_at > now()));
$$;

-- lapse old holds/offers, then offer free spots to the waitlist in join order
create or replace function public.refresh_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  changed integer := 0;
  n integer;
  free integer;
  w record;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found then
    return 0;
  end if;

  update public.session_signups
     set status = 'expired'
   where session_id = s.id and status in ('held', 'offered') and hold_expires_at <= now();
  get diagnostics n = row_count;
  changed := changed + n;

  if s.status = 'scheduled' and now() < s.starts_at - interval '30 minutes' then
    free := s.capacity - public.session_live_count(s.id);
    if free > 0 then
      for w in
        select ss.id from public.session_signups ss
         where ss.session_id = s.id and ss.status = 'waitlisted'
         order by ss.created_at, ss.id
         limit free
         for update
      loop
        update public.session_signups
           set status = 'offered',
               hold_token = gen_random_uuid(),
               hold_expires_at = least(now() + interval '60 minutes', s.starts_at),
               offer_notified_at = null
         where id = w.id;
        changed := changed + 1;
      end loop;
    end if;
  end if;

  if changed > 0 then
    update public.sessions set version = version + 1 where id = s.id;
  end if;
  return changed;
end;
$$;

create or replace function public.refresh_due_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer := 0;
  sid uuid;
begin
  for sid in
    select id from public.sessions
     where status = 'scheduled' and ends_at > now() and starts_at < now() + interval '60 days'
     order by starts_at
  loop
    total := total + public.refresh_session(sid);
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- public reads: counts and first-name-last-initial only, no contact details
-- ---------------------------------------------------------------------------

create or replace function public.get_sessions_public(p_from timestamptz default now(), p_session_id uuid default null)
returns table (
  id uuid, kind public.session_kind, title text, starts_at timestamptz, ends_at timestamptz, capacity integer,
  fee numeric, level_note text, notes text, signups_open boolean, status text, version integer,
  spots_left integer, waitlist integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.kind, s.title, s.starts_at, s.ends_at, s.capacity, s.fee, s.level_note, s.notes, s.signups_open,
         s.status, s.version,
         greatest(s.capacity - public.session_live_count(s.id), 0),
         (select count(*)::int from public.session_signups w where w.session_id = s.id and w.status = 'waitlisted')
  from public.sessions s
  where (p_session_id is not null and s.id = p_session_id)
     or (p_session_id is null and s.status = 'scheduled' and s.ends_at > p_from)
  order by s.starts_at
  limit 60;
$$;

create or replace function public.get_session_queue(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', case
          when position(' ' in trim(p.name)) > 0
            then split_part(trim(p.name), ' ', 1) || ' ' || upper(left(regexp_replace(trim(p.name), '^.*\s', ''), 1)) || '.'
          else trim(p.name) end,
        'level', p.level,
        'checkedInAt', p.checked_in_at,
        'paused', p.queue_paused,
        'lastEndedAt', (
          select max(g.ended_at) from public.session_games g
           where g.session_id = p.session_id and g.status = 'done' and p.id = any (g.team1 || g.team2))
      ) order by p.checked_in_at nulls last, p.created_at)
      from public.session_signups p
      where p.session_id = p_session_id and p.status = 'confirmed'
    ), '[]'::jsonb),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'number', g.number, 'status', g.status, 'team1', g.team1, 'team2', g.team2,
        'score1', g.score1, 'score2', g.score2, 'startedAt', g.started_at, 'endedAt', g.ended_at
      ) order by g.number desc)
      from public.session_games g
      where g.session_id = p_session_id and g.status <> 'void'
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- players (service role only, called from the app's server actions)
-- ---------------------------------------------------------------------------

create or replace function public.join_session(p_session_id uuid, p_name text, p_phone text, p_email text, p_level integer)
returns table (id uuid, code text, status public.signup_status, hold_token uuid, hold_expires_at timestamptz, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.sessions;
  v_phone text := public.normalize_phone(p_phone);
  existing public.session_signups;
  v_id uuid;
  v_status public.signup_status;
begin
  select * into s from public.sessions where sessions.id = p_session_id for update;
  if not found or s.status <> 'scheduled' then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not s.signups_open then
    raise exception 'SIGNUPS_CLOSED';
  end if;
  if now() >= s.starts_at then
    raise exception 'SESSION_STARTED';
  end if;
  if length(v_phone) < 7 then
    raise exception 'BAD_PHONE';
  end if;
  if p_level is null or p_level not between 1 and 3 then
    raise exception 'BAD_LEVEL';
  end if;
  if p_email is null or p_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'BAD_EMAIL';
  end if;

  perform public.refresh_session(s.id);

  select * into existing from public.session_signups ss
   where ss.session_id = s.id and ss.phone = v_phone and ss.status in ('held', 'confirmed', 'waitlisted', 'offered')
   for update;
  if found then
    -- an unpaid hold from the same number (page reloaded, went back): hand it back instead of blocking them
    if existing.status = 'held' and existing.payment_proof_path is null then
      update public.session_signups
         set name = trim(p_name), email = trim(p_email), level = p_level
       where session_signups.id = existing.id;
      return query select existing.id, existing.code, existing.status, existing.hold_token, existing.hold_expires_at,
        existing.amount;
      return;
    end if;
    raise exception 'ALREADY_JOINED';
  end if;

  v_status := case
    when public.session_live_count(s.id) < s.capacity then 'held'::public.signup_status
    else 'waitlisted'::public.signup_status
  end;

  insert into public.session_signups (session_id, code, status, name, phone, email, level, hold_token, hold_expires_at, amount)
  values (
    s.id, public.new_signup_code(), v_status, trim(p_name), v_phone, trim(p_email), p_level,
    gen_random_uuid(),
    case when v_status = 'held' then now() + interval '15 minutes' end,
    s.fee
  )
  returning session_signups.id into v_id;

  update public.sessions set version = version + 1 where sessions.id = s.id;

  return query
    select ss.id, ss.code, ss.status, ss.hold_token, ss.hold_expires_at, ss.amount
    from public.session_signups ss where ss.id = v_id;
end;
$$;

-- attach the uploaded proof: confirmed if the hold/offer is live or a spot is still free, otherwise
-- kept as expired + refund_needed
create or replace function public.confirm_session_signup(
  p_signup_id uuid,
  p_hold_token uuid,
  p_payment_ref text,
  p_payment_proof_path text
)
returns table (id uuid, code text, status public.signup_status)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session uuid;
  s public.sessions;
  r public.session_signups;
  live_hold boolean;
begin
  select ss.session_id into v_session from public.session_signups ss
   where ss.id = p_signup_id and ss.hold_token = p_hold_token;
  if v_session is null then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;
  select * into s from public.sessions where sessions.id = v_session for update;
  select * into r from public.session_signups ss where ss.id = p_signup_id for update;

  if r.status = 'confirmed' or r.payment_proof_path is not null then
    return query select r.id, r.code, r.status;
    return;
  end if;
  if r.status not in ('held', 'offered', 'expired') then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;
  if p_payment_proof_path is null or p_payment_proof_path not like 'signups/' || r.id::text || '/%' then
    raise exception 'PROOF_REQUIRED';
  end if;

  live_hold := r.status in ('held', 'offered') and r.hold_expires_at > now();

  if s.status = 'scheduled'
     and (live_hold or (public.session_live_count(s.id, r.id) < s.capacity and now() < s.ends_at)) then
    update public.session_signups
       set status = 'confirmed', payment_ref = p_payment_ref, payment_proof_path = p_payment_proof_path,
           hold_expires_at = null
     where session_signups.id = r.id;
  else
    update public.session_signups
       set status = 'expired', refund_needed = true, payment_ref = p_payment_ref,
           payment_proof_path = p_payment_proof_path,
           admin_notes = concat_ws(' · ', admin_notes, 'Paid after the spot was gone: refund.')
     where session_signups.id = r.id;
  end if;

  update public.sessions set version = version + 1 where sessions.id = s.id;
  perform public.refresh_session(s.id);

  return query select ss.id, ss.code, ss.status from public.session_signups ss where ss.id = r.id;
end;
$$;

-- "Start over" on an unpaid hold frees the spot straight away
create or replace function public.release_session_hold(p_signup_id uuid, p_hold_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from public.session_signups where id = p_signup_id and hold_token = p_hold_token;
  if v_session is null then
    return;
  end if;
  perform 1 from public.sessions where id = v_session for update;
  update public.session_signups
     set status = 'expired'
   where id = p_signup_id and hold_token = p_hold_token and status = 'held' and payment_proof_path is null;
  if found then
    update public.sessions set version = version + 1 where id = v_session;
    perform public.refresh_session(v_session);
  end if;
end;
$$;

-- self-service cancel with the signup code + the phone number used
create or replace function public.cancel_session_signup(p_code text, p_phone text)
returns table (status public.signup_status, refund_needed boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session uuid;
  s public.sessions;
  r public.session_signups;
begin
  select ss.session_id into v_session from public.session_signups ss where ss.code = p_code;
  if v_session is null then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;
  select * into s from public.sessions where sessions.id = v_session for update;
  select * into r from public.session_signups ss where ss.code = p_code for update;

  if r.phone <> public.normalize_phone(p_phone) then
    raise exception 'PHONE_MISMATCH';
  end if;
  if r.status not in ('held', 'confirmed', 'waitlisted', 'offered') then
    raise exception 'NOT_ACTIVE';
  end if;
  if now() >= s.starts_at then
    raise exception 'SESSION_STARTED';
  end if;

  update public.session_signups
     set status = 'cancelled', cancelled_at = now(), refund_needed = (payment_proof_path is not null)
   where session_signups.id = r.id;
  update public.sessions set version = version + 1 where sessions.id = s.id;
  perform public.refresh_session(s.id);

  return query select ss.status, ss.refund_needed from public.session_signups ss where ss.id = r.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- waitlist offers: cron refreshes every minute and pings the app, which claims and emails new offers
-- ---------------------------------------------------------------------------

create or replace function public.claim_offer_emails()
returns table (id uuid, code text, name text, email text, session_id uuid, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  update public.session_signups ss
     set offer_notified_at = now()
   where ss.id in (
     select o.id from public.session_signups o
      where o.status = 'offered' and o.offer_notified_at is null and o.hold_expires_at > now() and o.email is not null
      for update skip locked
   )
  returning ss.id, ss.code, ss.name, ss.email, ss.session_id, ss.hold_expires_at;
end;
$$;

create or replace function public.open_play_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  perform public.refresh_due_sessions();
  if not exists (
    select 1 from public.session_signups
     where status = 'offered' and offer_notified_at is null and hold_expires_at > now() and email is not null
  ) then
    return;
  end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'open_play_tick_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'open_play_tick_secret';
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('content-type', 'application/json', 'x-tick-secret', v_secret),
        body := '{}'::jsonb
      );
    end if;
  exception
    when others then
      raise notice 'open play tick ping skipped: %', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin (signed-in admin; each function checks is_admin())
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_session(
  p_id uuid,
  p_kind public.session_kind,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
  p_fee numeric,
  p_level_note text,
  p_notes text,
  p_signups_open boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  v_id uuid := p_id;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'BAD_TIME';
  end if;

  -- a rental hold that ran out would otherwise still block the court
  update public.bookings
     set status = 'expired'
   where status = 'held' and hold_expires_at <= now()
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');

  begin
    if v_id is null then
      insert into public.sessions (kind, title, starts_at, ends_at, capacity, fee, level_note, notes, signups_open)
      values (p_kind, trim(p_title), p_starts_at, p_ends_at, p_capacity, p_fee, nullif(trim(p_level_note), ''),
              nullif(trim(p_notes), ''), p_signups_open)
      returning id into v_id;
      insert into public.bookings (session_id, status, starts_at, ends_at, name, phone, amount, source)
      values (v_id, 'confirmed', p_starts_at, p_ends_at, trim(p_title), '', 0, 'admin');
    else
      select * into s from public.sessions where id = v_id for update;
      if not found then
        raise exception 'SESSION_NOT_FOUND';
      end if;
      if s.status = 'cancelled' then
        raise exception 'SESSION_CANCELLED';
      end if;
      -- players paid for the old time: cancel the session and post a new one instead
      if (s.starts_at, s.ends_at) is distinct from (p_starts_at, p_ends_at) and exists (
        select 1 from public.session_signups where session_id = v_id and status = 'confirmed'
      ) then
        raise exception 'TIME_LOCKED';
      end if;
      if p_capacity < public.session_live_count(v_id) then
        raise exception 'CAPACITY_TOO_LOW';
      end if;
      update public.sessions
         set kind = p_kind, title = trim(p_title), starts_at = p_starts_at, ends_at = p_ends_at, capacity = p_capacity,
             fee = p_fee, level_note = nullif(trim(p_level_note), ''), notes = nullif(trim(p_notes), ''),
             signups_open = p_signups_open, version = version + 1
       where id = v_id;
      update public.bookings set starts_at = p_starts_at, ends_at = p_ends_at, name = trim(p_title)
       where session_id = v_id;
    end if;
  exception
    when exclusion_violation then
      raise exception 'COURT_TAKEN';
  end;

  perform public.refresh_session(v_id); -- more capacity offers spots to the waitlist
  return v_id;
end;
$$;

-- returns the ids of the signups it cancelled, so the app can email them
create or replace function public.admin_cancel_session(p_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  perform 1 from public.sessions where id = p_id and status = 'scheduled' for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  update public.sessions set status = 'cancelled', signups_open = false, version = version + 1 where id = p_id;
  update public.bookings set status = 'cancelled' where session_id = p_id;
  update public.session_games set status = 'void', ended_at = now() where session_id = p_id and status = 'playing';

  return query
  update public.session_signups
     set status = 'cancelled', cancelled_at = now(), refund_needed = (payment_proof_path is not null)
   where session_id = p_id and status in ('held', 'confirmed', 'waitlisted', 'offered')
  returning id;
end;
$$;

create or replace function public.admin_delete_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  perform 1 from public.sessions where id = p_id for update;
  if exists (select 1 from public.session_signups where session_id = p_id) then
    raise exception 'HAS_SIGNUPS';
  end if;
  delete from public.sessions where id = p_id; -- its court booking goes with it
end;
$$;

create or replace function public.admin_signup_action(p_signup_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  s public.sessions;
  r public.session_signups;
  on_court boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select session_id into v_session from public.session_signups where id = p_signup_id;
  if v_session is null then
    raise exception 'SIGNUP_NOT_FOUND';
  end if;
  select * into s from public.sessions where id = v_session for update;
  select * into r from public.session_signups where id = p_signup_id for update;
  on_court := exists (
    select 1 from public.session_games
     where session_id = s.id and status = 'playing' and r.id = any (team1 || team2));

  case p_action
    when 'check_in' then
      if r.status <> 'confirmed' then raise exception 'NOT_CONFIRMED'; end if;
      update public.session_signups set checked_in_at = coalesce(checked_in_at, now()), queue_paused = false
       where id = r.id;
    when 'check_out' then
      if on_court then raise exception 'ON_COURT'; end if;
      update public.session_signups set checked_in_at = null where id = r.id;
    when 'pause' then
      update public.session_signups set queue_paused = true where id = r.id;
    when 'resume' then
      update public.session_signups set queue_paused = false where id = r.id;
    when 'cancel' then
      if on_court then raise exception 'ON_COURT'; end if;
      if r.status not in ('held', 'confirmed', 'waitlisted', 'offered') then raise exception 'NOT_ACTIVE'; end if;
      update public.session_signups
         set status = 'cancelled', cancelled_at = now(), checked_in_at = null,
             refund_needed = (payment_proof_path is not null)
       where id = r.id;
    when 'restore' then
      if r.status not in ('cancelled', 'expired') then raise exception 'NOT_ACTIVE'; end if;
      if r.payment_proof_path is null and r.source <> 'admin' then raise exception 'NOT_PAID'; end if;
      if s.status <> 'scheduled' then raise exception 'SESSION_CANCELLED'; end if;
      if public.session_live_count(s.id) >= s.capacity then raise exception 'SESSION_FULL'; end if;
      update public.session_signups
         set status = 'confirmed', cancelled_at = null, refund_needed = false, hold_expires_at = null
       where id = r.id;
    when 'offer' then
      if r.status <> 'waitlisted' then raise exception 'NOT_WAITLISTED'; end if;
      if public.session_live_count(s.id) >= s.capacity then raise exception 'SESSION_FULL'; end if;
      update public.session_signups
         set status = 'offered', hold_token = gen_random_uuid(),
             hold_expires_at = least(now() + interval '60 minutes', greatest(s.starts_at, now() + interval '15 minutes')),
             offer_notified_at = null
       where id = r.id;
    when 'refunded' then
      update public.session_signups set refund_needed = false, refunded_at = now() where id = r.id;
    else
      raise exception 'BAD_ACTION';
  end case;

  update public.sessions set version = version + 1 where id = s.id;
  if p_action = 'cancel' then
    perform public.refresh_session(s.id);
  end if;
end;
$$;

-- walk-in at the court: confirmed and checked in straight away; p_override lets it go over capacity
create or replace function public.admin_add_walkin(
  p_session_id uuid,
  p_name text,
  p_phone text,
  p_level integer,
  p_amount numeric,
  p_override boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  v_code text;
  v_phone text := public.normalize_phone(p_phone);
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if public.session_live_count(s.id) >= s.capacity and not coalesce(p_override, false) then
    raise exception 'SESSION_FULL';
  end if;
  if exists (
    select 1 from public.session_signups
     where session_id = s.id and v_phone <> '' and phone = v_phone and status in ('held', 'confirmed', 'waitlisted', 'offered')
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  v_code := public.new_signup_code();
  insert into public.session_signups (session_id, code, status, name, phone, level, amount, source, checked_in_at)
  values (s.id, v_code, 'confirmed', trim(p_name), v_phone, p_level, coalesce(p_amount, s.fee), 'admin', now());
  update public.sessions set version = version + 1 where id = s.id;
  return v_code;
end;
$$;

-- game queue: 2v2 from four checked-in, unpaused players; one game playing at a time
create or replace function public.admin_start_game(p_session_id uuid, p_team1 uuid[], p_team2 uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_players uuid[] := p_team1 || p_team2;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  perform 1 from public.sessions where id = p_session_id and status = 'scheduled' for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if cardinality(p_team1) <> 2 or cardinality(p_team2) <> 2
     or (select count(distinct x) from unnest(v_players) x) <> 4 then
    raise exception 'BAD_TEAMS';
  end if;
  if exists (select 1 from public.session_games where session_id = p_session_id and status = 'playing') then
    raise exception 'GAME_IN_PROGRESS';
  end if;
  if (
    select count(*) from public.session_signups
     where session_id = p_session_id and id = any (v_players)
       and status = 'confirmed' and checked_in_at is not null and not queue_paused
  ) <> 4 then
    raise exception 'PLAYER_NOT_READY';
  end if;

  insert into public.session_games (session_id, number, team1, team2)
  values (
    p_session_id,
    coalesce((select max(number) from public.session_games where session_id = p_session_id), 0) + 1,
    p_team1, p_team2
  )
  returning id into v_id;
  update public.sessions set version = version + 1 where id = p_session_id;
  return v_id;
end;
$$;

-- finish (or correct the score of) a game; both scores or neither
create or replace function public.admin_finish_game(p_game_id uuid, p_score1 integer, p_score2 integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select session_id into v_session from public.session_games where id = p_game_id;
  if v_session is null then
    raise exception 'GAME_NOT_FOUND';
  end if;
  perform 1 from public.sessions where id = v_session for update;
  if (p_score1 is null) <> (p_score2 is null) then
    raise exception 'BAD_SCORE';
  end if;
  update public.session_games
     set status = 'done', ended_at = coalesce(ended_at, now()), score1 = p_score1, score2 = p_score2
   where id = p_game_id and status in ('playing', 'done');
  update public.sessions set version = version + 1 where id = v_session;
end;
$$;

create or replace function public.admin_void_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select session_id into v_session from public.session_games where id = p_game_id;
  if v_session is null then
    raise exception 'GAME_NOT_FOUND';
  end if;
  perform 1 from public.sessions where id = v_session for update;
  update public.session_games set status = 'void', ended_at = coalesce(ended_at, now()) where id = p_game_id;
  update public.sessions set version = version + 1 where id = v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

revoke all on function public.normalize_phone(text) from public, anon, authenticated;
revoke all on function public.new_signup_code() from public, anon, authenticated;
revoke all on function public.session_live_count(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refresh_session(uuid) from public, anon, authenticated;
revoke all on function public.refresh_due_sessions() from public, anon, authenticated;
revoke all on function public.join_session(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.confirm_session_signup(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_session_hold(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_session_signup(text, text) from public, anon, authenticated;
revoke all on function public.claim_offer_emails() from public, anon, authenticated;
revoke all on function public.open_play_tick() from public, anon, authenticated;
grant execute on function public.normalize_phone(text) to service_role;
grant execute on function public.new_signup_code() to service_role;
grant execute on function public.session_live_count(uuid, uuid) to service_role;
grant execute on function public.refresh_session(uuid) to service_role;
grant execute on function public.refresh_due_sessions() to service_role;
grant execute on function public.join_session(uuid, text, text, text, integer) to service_role;
grant execute on function public.confirm_session_signup(uuid, uuid, text, text) to service_role;
grant execute on function public.release_session_hold(uuid, uuid) to service_role;
grant execute on function public.cancel_session_signup(text, text) to service_role;
grant execute on function public.claim_offer_emails() to service_role;
grant execute on function public.open_play_tick() to service_role;

grant execute on function public.get_sessions_public(timestamptz, uuid) to anon, authenticated, service_role;
grant execute on function public.get_session_queue(uuid) to anon, authenticated, service_role;

revoke all on function public.admin_save_session(uuid, public.session_kind, text, timestamptz, timestamptz, integer, numeric, text, text, boolean) from public, anon;
revoke all on function public.admin_cancel_session(uuid) from public, anon;
revoke all on function public.admin_delete_session(uuid) from public, anon;
revoke all on function public.admin_signup_action(uuid, text) from public, anon;
revoke all on function public.admin_add_walkin(uuid, text, text, integer, numeric, boolean) from public, anon;
revoke all on function public.admin_start_game(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.admin_finish_game(uuid, integer, integer) from public, anon;
revoke all on function public.admin_void_game(uuid) from public, anon;
grant execute on function public.admin_save_session(uuid, public.session_kind, text, timestamptz, timestamptz, integer, numeric, text, text, boolean) to authenticated, service_role;
grant execute on function public.admin_cancel_session(uuid) to authenticated, service_role;
grant execute on function public.admin_delete_session(uuid) to authenticated, service_role;
grant execute on function public.admin_signup_action(uuid, text) to authenticated, service_role;
grant execute on function public.admin_add_walkin(uuid, text, text, integer, numeric, boolean) to authenticated, service_role;
grant execute on function public.admin_start_game(uuid, uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.admin_finish_game(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.admin_void_game(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- every minute: lapse holds, offer freed spots, ping the app to email offers
-- ---------------------------------------------------------------------------

select cron.schedule('danlex-open-play-tick', '* * * * *', 'select public.open_play_tick()');
